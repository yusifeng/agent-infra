import type { AgentInfraApp, StartTextTurnResult } from '@agent-infra/app';
import type { RunStreamEventDto, RunStreamFailedEventDto, RuntimePiMetaDto } from '@agent-infra/contracts';
import type { AgentInfraRepositoryBundle } from '@agent-infra/db';
import {
  buildCreateThreadErrorResponse,
  buildCreateThreadResponse,
  buildRunAssistantEvent,
  buildRunReadyEvent,
  buildRunStateEvent,
  buildRunTerminalEvent,
  buildRunTextTurnErrorResponse,
  buildRuntimeMetaResponse,
  buildThreadMessagesErrorResponse,
  buildThreadMessagesResponse,
  buildThreadsErrorResponse,
  buildThreadsResponse,
  buildUnavailableRuntimeMetaResponse,
  encodeSseEvent,
  getRouteErrorMessage,
  getRouteErrorStatus,
  parseCreateThreadTitle,
  parseRunTextTurnInput,
  toRunDto
} from '@agent-infra/durable-chat-server';
import type { RuntimePiRuntime } from '@agent-infra/runtime-pi/types';
import type { FastifyInstance } from 'fastify';

import { APP_ID } from '../constants.js';
import { getPlaygroundAppServices, getPlaygroundAppServicesState } from '../playground-app-services.js';
import { getPlaygroundBaseServicesState } from '../playground-base-services.js';
import { getPlaygroundDbInfo, getPlaygroundMeta } from '../playground-meta.js';
import { getPlaygroundRuntimeServices, getPlaygroundRuntimeServicesState } from '../playground-services.js';

type ChatAppServices = {
  app: AgentInfraApp;
};

type ChatRuntimeServices = ChatAppServices & {
  repos: AgentInfraRepositoryBundle;
  durableRuntime: RuntimePiRuntime;
};

type ChatRouteMeta = ReturnType<typeof getPlaygroundMeta>;

export type ChatRouteDependencies = {
  getAppServices?: () => Promise<ChatAppServices>;
  getRuntimeServices?: () => Promise<ChatRuntimeServices>;
  getRuntimeMeta?: () => ChatRouteMeta;
};

function buildUnavailableMetaFallback(): ChatRouteMeta {
  return {
    configured: false,
    provider: 'deepseek',
    model: 'deepseek-chat',
    defaultModelKey: null,
    modelOptions: [],
    configError: null,
    dbInfo: {
      mode: 'unavailable',
      connectionString: 'unavailable'
    }
  };
}

function writeSseEvent(
  reply: { raw: NodeJS.WritableStream & { destroyed?: boolean; writableEnded?: boolean } },
  payload: RunStreamEventDto,
  state: { closed: boolean }
) {
  if (state.closed || reply.raw.destroyed || reply.raw.writableEnded) {
    return false;
  }

  try {
    reply.raw.write(encodeSseEvent(payload));
    return true;
  } catch {
    state.closed = true;
    return false;
  }
}

function describeServiceState(state: { initialized: boolean; initializing: boolean; lastInitDurationMs: number | null }) {
  return state.initialized ? 'warm' : state.initializing ? 'warming' : 'cold';
}

export async function registerChatRoutes(app: FastifyInstance, dependencies: ChatRouteDependencies = {}) {
  const getAppServices = dependencies.getAppServices ?? getPlaygroundAppServices;
  const getRuntimeServices = dependencies.getRuntimeServices ?? getPlaygroundRuntimeServices;
  const getRuntimeMeta = dependencies.getRuntimeMeta ?? (() => getPlaygroundMeta({}, getPlaygroundDbInfo()));

  app.get('/api/meta', async (request, reply) => {
    try {
      const runtime = request.requestTiming.measureSync('meta.resolve', () => getRuntimeMeta());

      const response: RuntimePiMetaDto = buildRuntimeMetaResponse({
        dbMode: runtime.dbInfo.mode,
        dbConnection: runtime.dbInfo.connectionString,
        runtimeConfigured: runtime.configured,
        runtimeProvider: runtime.provider,
        runtimeModel: runtime.model,
        defaultModelKey: runtime.defaultModelKey,
        modelOptions: runtime.modelOptions,
        runtimeConfigError: runtime.configError
      });

      return reply.send(response);
    } catch (error) {
      const runtime = request.requestTiming.measureSync('meta.unavailable_fallback', () => buildUnavailableMetaFallback());

      const response: RuntimePiMetaDto = buildUnavailableRuntimeMetaResponse(
        {
          dbMode: runtime.dbInfo.mode,
          dbConnection: runtime.dbInfo.connectionString,
          runtimeProvider: runtime.provider,
          runtimeModel: runtime.model,
          defaultModelKey: runtime.defaultModelKey,
          modelOptions: runtime.modelOptions
        },
        error,
        runtime.configError ?? 'Failed to initialize playground services'
      );

      return reply.code(503).send(response);
    }
  });

  app.get('/api/threads', async (request, reply) => {
    try {
      request.requestTiming.annotate('base_services_state', describeServiceState(getPlaygroundBaseServicesState()));
      request.requestTiming.annotate('app_services_state', describeServiceState(getPlaygroundAppServicesState()));
      const { app: services } = await request.requestTiming.measureAsync('services.app', () => getAppServices());
      const threads = await request.requestTiming.measureAsync('threads.list', () => services.threads.list({ appId: APP_ID }));

      return reply.send(buildThreadsResponse(threads));
    } catch (error) {
      return reply.code(getRouteErrorStatus(error)).send(buildThreadsErrorResponse(error, 'failed to list threads'));
    }
  });

  app.post('/api/threads', async (request, reply) => {
    const title = parseCreateThreadTitle(request.body);

    try {
      request.requestTiming.annotate('base_services_state', describeServiceState(getPlaygroundBaseServicesState()));
      request.requestTiming.annotate('app_services_state', describeServiceState(getPlaygroundAppServicesState()));
      const { app: services } = await request.requestTiming.measureAsync('services.app', () => getAppServices());
      const thread = await request.requestTiming.measureAsync('threads.create', () =>
        services.threads.create({
          appId: APP_ID,
          title,
          metadata: {
            source: 'playground-vite-web',
            runtime: 'pi'
          }
        })
      );

      return reply.send(buildCreateThreadResponse(thread));
    } catch (error) {
      return reply.code(getRouteErrorStatus(error)).send(buildCreateThreadErrorResponse(error, 'failed to create thread'));
    }
  });

  app.get<{ Params: { threadId: string } }>('/api/threads/:threadId/messages', async (request, reply) => {
    try {
      request.requestTiming.annotate('base_services_state', describeServiceState(getPlaygroundBaseServicesState()));
      request.requestTiming.annotate('app_services_state', describeServiceState(getPlaygroundAppServicesState()));
      const { app: services } = await request.requestTiming.measureAsync('services.app', () => getAppServices());
      const messages = await request.requestTiming.measureAsync('messages.get', () =>
        services.threads.getMessages({ threadId: request.params.threadId })
      );

      return reply.send(buildThreadMessagesResponse(messages));
    } catch (error) {
      return reply.code(getRouteErrorStatus(error)).send(buildThreadMessagesErrorResponse(error, 'failed to load thread messages'));
    }
  });

  app.post('/api/threads/:threadId/runs/stream', async (request, reply) => {
    const turnInput = parseRunTextTurnInput(request.body);
    let started: StartTextTurnResult;
    let runtimeServices: ChatRuntimeServices;

    try {
      request.requestTiming.annotate('base_services_state', describeServiceState(getPlaygroundBaseServicesState()));
      request.requestTiming.annotate('runtime_services_state', describeServiceState(getPlaygroundRuntimeServicesState()));
      runtimeServices = await request.requestTiming.measureAsync('services.runtime', () => getRuntimeServices());
      started = await request.requestTiming.measureAsync('turns.start_text', () =>
        runtimeServices.app.turns.startText({
          threadId: (request.params as { threadId: string }).threadId,
          text: turnInput.text,
          provider: turnInput.provider,
          model: turnInput.model
        })
      );
    } catch (error) {
      return reply.code(getRouteErrorStatus(error)).send(buildRunTextTurnErrorResponse(error, 'failed to stream thread turn'));
    }

    const threadId = (request.params as { threadId: string }).threadId;
    const runId = started.run.id;
    const runtimeInput = {
      threadId,
      runId,
      provider: started.runtimeSelection.provider,
      model: started.runtimeSelection.model
    };
    const streamState = { closed: false };
    let finalRunSnapshot: RunStreamFailedEventDto['run'] = null;
    let terminalEventSent = false;

    reply.hijack();
    reply.raw.setHeader('x-request-id', request.id);
    reply.raw.setHeader('server-timing', request.requestTiming.formatServerTiming({ includeTotal: false }));
    reply.raw.setHeader('cache-control', 'no-cache, no-transform');
    reply.raw.setHeader('connection', 'keep-alive');
    reply.raw.setHeader('content-type', 'text/event-stream; charset=utf-8');
    reply.raw.flushHeaders?.();

    reply.raw.on('close', () => {
      streamState.closed = true;
    });

    try {
      writeSseEvent(reply, buildRunReadyEvent(started), streamState);

      await request.requestTiming.measureAsync('runtime.run_turn', () =>
        runtimeServices.durableRuntime.runTurn(
          {
            runRepo: runtimeServices.repos.runRepo,
            messageRepo: runtimeServices.repos.messageRepo,
            toolRepo: runtimeServices.repos.toolRepo,
            runEventRepo: runtimeServices.repos.runEventRepo
          },
          runtimeInput,
          {
            onLiveAssistantUpdate: (assistantStream) => {
              writeSseEvent(reply, buildRunAssistantEvent(runId, assistantStream), streamState);
            },
            onPersistedUpdate: (update) => {
              if (!update.run) {
                return;
              }

              finalRunSnapshot = toRunDto(update.run);
              writeSseEvent(reply, buildRunStateEvent(runId, update.run), streamState);

              if (!terminalEventSent) {
                const terminalEvent = buildRunTerminalEvent(runId, update.run);
                if (terminalEvent) {
                  terminalEventSent = true;
                  writeSseEvent(reply, terminalEvent, streamState);
                }
              }
            }
          }
        )
      );
    } catch (error) {
      if (!terminalEventSent) {
        terminalEventSent = true;
        writeSseEvent(
          reply,
          {
            type: 'run.failed',
            runId,
            run: finalRunSnapshot,
            error: getRouteErrorMessage(error, 'thread stream failed')
          },
          streamState
        );
      }
    } finally {
      if (!streamState.closed && !reply.raw.destroyed && !reply.raw.writableEnded) {
        reply.raw.end();
      }
      request.requestTiming.complete(app.log, request, reply);
    }

    return reply;
  });
}
