import type { AgentInfraApp, StartTextTurnResult } from '@agent-infra/app';
import type { RunStreamEventDto, RunStreamFailedEventDto, RuntimePiMetaDto } from '@agent-infra/contracts';
import type { AgentInfraRepositoryBundle } from '@agent-infra/db';
import {
  buildCreateThreadShareErrorResponse,
  buildCreateThreadShareResponse,
  buildPublicChatShareErrorResponse,
  buildPublicChatShareResponse,
  buildRevokeChatShareErrorResponse,
  buildRevokeChatShareResponse,
  buildCreateThreadErrorResponse,
  buildCreateThreadResponse,
  buildRunAssistantEvent,
  buildRunReadyEvent,
  buildRunTimelineErrorResponse,
  buildRunTimelineResponse,
  buildRunStateEvent,
  buildRunTerminalEvent,
  buildRunTextTurnErrorResponse,
  buildRuntimeMetaResponse,
  buildThreadMessagesErrorResponse,
  buildThreadMessagesResponse,
  buildThreadShareStateErrorResponse,
  buildThreadShareStateResponse,
  buildThreadRunsErrorResponse,
  buildThreadRunsResponse,
  buildThreadsErrorResponse,
  buildThreadsResponse,
  buildUnavailableRuntimeMetaResponse,
  encodeSseEvent,
  getRouteErrorMessage,
  getRouteErrorStatus,
  parseCreateThreadTitle,
  parseThreadRunsLimit,
  parseRunTextTurnInput,
  toRunDto
} from '@agent-infra/durable-chat-server';
import type { RuntimePiRuntime } from '@agent-infra/runtime-pi/types';
import type { FastifyInstance, FastifyReply } from 'fastify';

import { APP_ID } from '../constants.js';
import { getPlaygroundAppServices, getPlaygroundAppServicesState } from '../playground-app-services.js';
import { getPlaygroundBaseServicesState } from '../playground-base-services.js';
import { getPlaygroundDbInfo, getPlaygroundMeta } from '../playground-meta.js';
import {
  getPlaygroundRuntimeServices,
  getPlaygroundRuntimeServicesState,
  isPlaygroundWebSearchConfigured
} from '../playground-services.js';

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
    model: 'deepseek-v4-flash',
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

function isValidSiteIconHostname(hostname: string) {
  return /^[a-z0-9.-]+$/i.test(hostname) && hostname.includes('.') && !hostname.includes('..');
}

function buildFallbackSiteIconSvg(hostname: string) {
  const label = hostname.replace(/^www\./, '').slice(0, 1).toUpperCase() || '?';
  const escapedLabel = label.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">
  <rect width="64" height="64" rx="16" fill="#eef2ff"/>
  <text x="32" y="38" text-anchor="middle" font-family="Inter, Arial, sans-serif" font-size="28" font-weight="700" fill="#4f46e5">${escapedLabel}</text>
</svg>`;
}

async function sendSiteIcon(reply: FastifyReply, hostname: string) {
  const googleUrl = `https://www.google.com/s2/favicons?sz=64&domain=${encodeURIComponent(hostname)}`;
  const timeoutSignal = AbortSignal.timeout(2000);

  try {
    const response = await fetch(googleUrl, {
      signal: timeoutSignal
    });
    if (response.ok) {
      const arrayBuffer = await response.arrayBuffer();
      const contentType = response.headers.get('content-type') || 'image/png';
      reply.header('cache-control', 'public, max-age=86400');
      reply.type(contentType);
      return reply.send(Buffer.from(arrayBuffer));
    }
  } catch {
    // fall through to svg fallback
  }

  reply.header('cache-control', 'public, max-age=3600');
  reply.type('image/svg+xml');
  return reply.send(buildFallbackSiteIconSvg(hostname));
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

  app.get<{ Params: { hostname: string } }>('/site-icons/:hostname', async (request, reply) => {
    const hostname = request.params.hostname.trim().toLowerCase();
    if (!isValidSiteIconHostname(hostname)) {
      return reply.code(400).type('text/plain').send('Invalid hostname');
    }

    return sendSiteIcon(reply, hostname);
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
      const [messages, activeRun] = await Promise.all([
        request.requestTiming.measureAsync('messages.get', () => services.threads.getMessages({ threadId: request.params.threadId })),
        request.requestTiming.measureAsync('runs.active', () => services.runs.getActiveByThread({ threadId: request.params.threadId }))
      ]);

      return reply.send(buildThreadMessagesResponse({ messages, activeRun }));
    } catch (error) {
      return reply.code(getRouteErrorStatus(error)).send(buildThreadMessagesErrorResponse(error, 'failed to load thread messages'));
    }
  });

  app.post<{ Params: { threadId: string } }>('/api/threads/:threadId/shares', async (request, reply) => {
    try {
      request.requestTiming.annotate('base_services_state', describeServiceState(getPlaygroundBaseServicesState()));
      request.requestTiming.annotate('app_services_state', describeServiceState(getPlaygroundAppServicesState()));
      const { app: services } = await request.requestTiming.measureAsync('services.app', () => getAppServices());
      const share = await request.requestTiming.measureAsync('shares.create', () =>
        services.shares.createThreadSnapshot({ threadId: request.params.threadId })
      );

      return reply.send(buildCreateThreadShareResponse(share));
    } catch (error) {
      return reply
        .code(getRouteErrorStatus(error))
        .send(buildCreateThreadShareErrorResponse(error, 'failed to create thread share'));
    }
  });

  app.get<{ Params: { threadId: string } }>('/api/threads/:threadId/shares/current', async (request, reply) => {
    try {
      request.requestTiming.annotate('base_services_state', describeServiceState(getPlaygroundBaseServicesState()));
      request.requestTiming.annotate('app_services_state', describeServiceState(getPlaygroundAppServicesState()));
      const { app: services } = await request.requestTiming.measureAsync('services.app', () => getAppServices());
      const share = await request.requestTiming.measureAsync('shares.current', () =>
        services.shares.getCurrentByThread({ threadId: request.params.threadId })
      );

      return reply.send(buildThreadShareStateResponse(share));
    } catch (error) {
      return reply
        .code(getRouteErrorStatus(error))
        .send(buildThreadShareStateErrorResponse(error, 'failed to load current thread share'));
    }
  });

  app.get<{ Params: { threadId: string }; Querystring: { limit?: string } }>('/api/threads/:threadId/runs', async (request, reply) => {
    try {
      request.requestTiming.annotate('base_services_state', describeServiceState(getPlaygroundBaseServicesState()));
      request.requestTiming.annotate('app_services_state', describeServiceState(getPlaygroundAppServicesState()));
      const { app: services } = await request.requestTiming.measureAsync('services.app', () => getAppServices());
      const runs = await request.requestTiming.measureAsync('runs.list', () =>
        services.runs.listByThread({
          threadId: request.params.threadId,
          limit: parseThreadRunsLimit(request.query.limit ?? null)
        })
      );

      return reply.send(buildThreadRunsResponse(runs));
    } catch (error) {
      return reply.code(getRouteErrorStatus(error)).send(buildThreadRunsErrorResponse(error, 'failed to load thread runs'));
    }
  });

  app.get<{ Params: { runId: string } }>('/api/runs/:runId/timeline', async (request, reply) => {
    try {
      request.requestTiming.annotate('base_services_state', describeServiceState(getPlaygroundBaseServicesState()));
      request.requestTiming.annotate('app_services_state', describeServiceState(getPlaygroundAppServicesState()));
      const { app: services } = await request.requestTiming.measureAsync('services.app', () => getAppServices());
      const timeline = await request.requestTiming.measureAsync('runs.timeline', () =>
        services.runs.getTimeline({ runId: request.params.runId })
      );

      return reply.send(buildRunTimelineResponse(timeline));
    } catch (error) {
      return reply.code(getRouteErrorStatus(error)).send(buildRunTimelineErrorResponse(error, 'failed to load run timeline'));
    }
  });

  app.get<{ Params: { publicId: string } }>('/api/shares/:publicId', async (request, reply) => {
    try {
      request.requestTiming.annotate('base_services_state', describeServiceState(getPlaygroundBaseServicesState()));
      request.requestTiming.annotate('app_services_state', describeServiceState(getPlaygroundAppServicesState()));
      const { app: services } = await request.requestTiming.measureAsync('services.app', () => getAppServices());
      const share = await request.requestTiming.measureAsync('shares.public', () =>
        services.shares.getPublic({ publicId: request.params.publicId })
      );

      return reply.send(buildPublicChatShareResponse(share));
    } catch (error) {
      return reply.code(getRouteErrorStatus(error)).send(buildPublicChatShareErrorResponse(error, 'failed to load public share'));
    }
  });

  app.post<{ Params: { publicId: string } }>('/api/shares/:publicId/revoke', async (request, reply) => {
    try {
      request.requestTiming.annotate('base_services_state', describeServiceState(getPlaygroundBaseServicesState()));
      request.requestTiming.annotate('app_services_state', describeServiceState(getPlaygroundAppServicesState()));
      const { app: services } = await request.requestTiming.measureAsync('services.app', () => getAppServices());
      const share = await request.requestTiming.measureAsync('shares.revoke', () =>
        services.shares.revoke({ publicId: request.params.publicId })
      );

      return reply.send(buildRevokeChatShareResponse(share));
    } catch (error) {
      return reply.code(getRouteErrorStatus(error)).send(buildRevokeChatShareErrorResponse(error, 'failed to revoke share'));
    }
  });

  app.post('/api/threads/:threadId/runs/stream', async (request, reply) => {
    const turnInput = parseRunTextTurnInput(request.body);
    let started: StartTextTurnResult;
    let runtimeServices: ChatRuntimeServices;

    try {
      if (turnInput.webSearchEnabled && !isPlaygroundWebSearchConfigured()) {
        return reply.code(503).send(
          buildRunTextTurnErrorResponse(
            new Error('Web search is unavailable because TAVILY_API_KEY is not configured.'),
            'failed to stream thread turn'
          )
        );
      }

      request.requestTiming.annotate('base_services_state', describeServiceState(getPlaygroundBaseServicesState()));
      request.requestTiming.annotate('runtime_services_state', describeServiceState(getPlaygroundRuntimeServicesState()));
      runtimeServices = await request.requestTiming.measureAsync('services.runtime', () => getRuntimeServices());
      started = await request.requestTiming.measureAsync('turns.start_text', () =>
        runtimeServices.app.turns.startText({
          threadId: (request.params as { threadId: string }).threadId,
          text: turnInput.text,
          provider: turnInput.provider,
          model: turnInput.model,
          thinkingEnabled: turnInput.thinkingEnabled,
          reasoningEffort: turnInput.reasoningEffort,
          webSearchEnabled: turnInput.webSearchEnabled
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
      model: started.runtimeSelection.model,
      thinkingEnabled: turnInput.thinkingEnabled,
      reasoningEffort: turnInput.reasoningEffort,
      webSearchEnabled: turnInput.webSearchEnabled
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
