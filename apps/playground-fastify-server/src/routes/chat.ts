import type { RunStreamEventDto, RunStreamFailedEventDto, RuntimePiMetaDto } from '@agent-infra/contracts';
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
import type { FastifyInstance } from 'fastify';

import { APP_ID } from '../constants.js';
import { getPlaygroundAppServices } from '../playground-app-services.js';
import { getPlaygroundDbInfo, getPlaygroundMeta } from '../playground-meta.js';
import { getPlaygroundRuntimeServices } from '../playground-services.js';

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

export async function registerChatRoutes(app: FastifyInstance) {
  app.get('/api/meta', async (_request, reply) => {
    try {
      const runtime = getPlaygroundMeta({}, getPlaygroundDbInfo());

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
      const runtime = getPlaygroundMeta({}, { mode: 'unavailable', connectionString: 'unavailable' });

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

  app.get('/api/threads', async (_request, reply) => {
    try {
      const { app: services } = await getPlaygroundAppServices();
      const threads = await services.threads.list({ appId: APP_ID });

      return reply.send(buildThreadsResponse(threads));
    } catch (error) {
      return reply.code(getRouteErrorStatus(error)).send(buildThreadsErrorResponse(error, 'failed to list threads'));
    }
  });

  app.post('/api/threads', async (request, reply) => {
    const title = parseCreateThreadTitle(request.body);

    try {
      const { app: services } = await getPlaygroundAppServices();
      const thread = await services.threads.create({
        appId: APP_ID,
        title,
        metadata: {
          source: 'playground-vite-web',
          runtime: 'pi'
        }
      });

      return reply.send(buildCreateThreadResponse(thread));
    } catch (error) {
      return reply.code(getRouteErrorStatus(error)).send(buildCreateThreadErrorResponse(error, 'failed to create thread'));
    }
  });

  app.get<{ Params: { threadId: string } }>('/api/threads/:threadId/messages', async (request, reply) => {
    try {
      const { app: services } = await getPlaygroundAppServices();
      const messages = await services.threads.getMessages({ threadId: request.params.threadId });

      return reply.send(buildThreadMessagesResponse(messages));
    } catch (error) {
      return reply.code(getRouteErrorStatus(error)).send(buildThreadMessagesErrorResponse(error, 'failed to load thread messages'));
    }
  });

  app.post('/api/threads/:threadId/runs/stream', async (request, reply) => {
    const turnInput = parseRunTextTurnInput(request.body);
    let started;

    try {
      const { app: services } = await getPlaygroundRuntimeServices();
      started = await services.turns.startText({
        threadId: (request.params as { threadId: string }).threadId,
        text: turnInput.text,
        provider: turnInput.provider,
        model: turnInput.model
      });
    } catch (error) {
      return reply.code(getRouteErrorStatus(error)).send(buildRunTextTurnErrorResponse(error, 'failed to stream thread turn'));
    }

    const threadId = (request.params as { threadId: string }).threadId;
    const runId = started.run.id;
    const services = await getPlaygroundRuntimeServices();
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
    reply.raw.setHeader('cache-control', 'no-cache, no-transform');
    reply.raw.setHeader('connection', 'keep-alive');
    reply.raw.setHeader('content-type', 'text/event-stream; charset=utf-8');
    reply.raw.flushHeaders?.();

    reply.raw.on('close', () => {
      streamState.closed = true;
    });

    try {
      writeSseEvent(reply, buildRunReadyEvent(started), streamState);

      await services.durableRuntime.runTurn(
        {
          runRepo: services.repos.runRepo,
          messageRepo: services.repos.messageRepo,
          toolRepo: services.repos.toolRepo,
          runEventRepo: services.repos.runEventRepo
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
    }

    return reply;
  });
}
