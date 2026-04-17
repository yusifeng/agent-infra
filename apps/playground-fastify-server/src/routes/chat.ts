import type {
  CreateThreadRequestDto,
  CreateThreadResponseDto,
  RunStreamAssistantEventDto,
  RunStreamCompletedEventDto,
  RunStreamEventDto,
  RunStreamFailedEventDto,
  RunStreamReadyEventDto,
  RunStreamStateEventDto,
  RunTextTurnRequestDto,
  RuntimePiMetaDto,
  ThreadMessagesResponseDto,
  ThreadsResponseDto
} from '@agent-infra/contracts';
import {
  getRouteErrorMessage,
  getRouteErrorStatus,
  toMessageDto,
  toRuntimeMetaDto,
  toRunDto,
  toThreadDto
} from '@agent-infra/durable-chat-server';
import type { FastifyInstance } from 'fastify';

import { APP_ID } from '../constants.js';
import { getPlaygroundAppServices } from '../playground-app-services.js';
import { getPlaygroundDbInfo, getPlaygroundMeta } from '../playground-meta.js';
import { getPlaygroundRuntimeServices } from '../playground-services.js';

function encodeSseEvent(payload: RunStreamEventDto) {
  return `event: ${payload.type}\ndata: ${JSON.stringify(payload)}\n\n`;
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

export async function registerChatRoutes(app: FastifyInstance) {
  app.get('/api/meta', async (_request, reply) => {
    try {
      const runtime = getPlaygroundMeta({}, getPlaygroundDbInfo());

      const response: RuntimePiMetaDto = toRuntimeMetaDto({
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

      const response: RuntimePiMetaDto = toRuntimeMetaDto({
        dbMode: runtime.dbInfo.mode,
        dbConnection: runtime.dbInfo.connectionString,
        runtimeConfigured: false,
        runtimeProvider: runtime.provider,
        runtimeModel: runtime.model,
        defaultModelKey: runtime.defaultModelKey,
        modelOptions: runtime.modelOptions,
        runtimeConfigError: error instanceof Error ? error.message : runtime.configError ?? 'Failed to initialize playground services'
      });

      return reply.code(503).send(response);
    }
  });

  app.get('/api/threads', async (_request, reply) => {
    try {
      const { app: services } = await getPlaygroundAppServices();
      const threads = await services.threads.list({ appId: APP_ID });
      const response: ThreadsResponseDto = {
        threads: threads.map(toThreadDto)
      };

      return reply.send(response);
    } catch (error) {
      return reply.code(getRouteErrorStatus(error)).send({
        threads: [],
        error: getRouteErrorMessage(error, 'failed to list threads')
      } satisfies ThreadsResponseDto);
    }
  });

  app.post<{ Body: CreateThreadRequestDto }>('/api/threads', async (request, reply) => {
    const title =
      typeof request.body?.title === 'string' && request.body.title.trim()
        ? request.body.title.trim()
        : 'New Thread';

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

      return reply.send({
        thread: toThreadDto(thread)
      } satisfies CreateThreadResponseDto);
    } catch (error) {
      return reply.code(getRouteErrorStatus(error)).send({
        error: getRouteErrorMessage(error, 'failed to create thread')
      } satisfies CreateThreadResponseDto);
    }
  });

  app.get<{ Params: { threadId: string } }>('/api/threads/:threadId/messages', async (request, reply) => {
    try {
      const { app: services } = await getPlaygroundAppServices();
      const messages = await services.threads.getMessages({ threadId: request.params.threadId });

      return reply.send({
        messages: messages.map(toMessageDto)
      } satisfies ThreadMessagesResponseDto);
    } catch (error) {
      return reply.code(getRouteErrorStatus(error)).send({
        error: getRouteErrorMessage(error, 'failed to load thread messages')
      } satisfies ThreadMessagesResponseDto);
    }
  });

  app.post<{ Body: RunTextTurnRequestDto; Params: { threadId: string } }>(
    '/api/threads/:threadId/runs/stream',
    async (request, reply) => {
      let started;

      try {
        const { app: services } = await getPlaygroundRuntimeServices();
        started = await services.turns.startText({
          threadId: request.params.threadId,
          text: typeof request.body?.text === 'string' ? request.body.text : '',
          provider: typeof request.body?.provider === 'string' ? request.body.provider.trim() : undefined,
          model: typeof request.body?.model === 'string' ? request.body.model.trim() : undefined
        });
      } catch (error) {
        return reply.code(getRouteErrorStatus(error)).send({
          error: getRouteErrorMessage(error, 'failed to stream thread turn'),
          run: null,
          messages: []
        });
      }

      const runId = started.run.id;
      const services = await getPlaygroundRuntimeServices();
      const runtimeInput = {
        threadId: request.params.threadId,
        runId,
        provider: started.runtimeSelection.provider,
        model: started.runtimeSelection.model
      };
      const streamState = { closed: false };
      let finalRunSnapshot: RunStreamCompletedEventDto['run'] | RunStreamFailedEventDto['run'] = null;
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
        const readyEvent: RunStreamReadyEventDto = {
          type: 'run.ready',
          runId,
          run: toRunDto(started.run) as NonNullable<RunStreamReadyEventDto['run']>,
          userMessage: toMessageDto(started.userMessage)
        };
        writeSseEvent(reply, readyEvent, streamState);

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
              const assistantEvent: RunStreamAssistantEventDto = {
                type: 'run.assistant',
                runId,
                assistant: assistantStream
              };
              writeSseEvent(reply, assistantEvent, streamState);
            },
            onPersistedUpdate: (update) => {
              if (!update.run) {
                return;
              }

              finalRunSnapshot = toRunDto(update.run);
              const runStateEvent: RunStreamStateEventDto = {
                type: 'run.state',
                runId,
                run: toRunDto(update.run) as NonNullable<RunStreamStateEventDto['run']>
              };
              writeSseEvent(reply, runStateEvent, streamState);

              if (!terminalEventSent && (update.run.status === 'completed' || update.run.status === 'failed')) {
                terminalEventSent = true;

                if (update.run.status === 'failed') {
                  const failedEvent: RunStreamFailedEventDto = {
                    type: 'run.failed',
                    runId,
                    run: finalRunSnapshot,
                    error: update.run.error ?? 'runtime execution failed'
                  };
                  writeSseEvent(reply, failedEvent, streamState);
                } else {
                  const completedEvent: RunStreamCompletedEventDto = {
                    type: 'run.completed',
                    runId,
                    run: finalRunSnapshot as NonNullable<RunStreamCompletedEventDto['run']>
                  };
                  writeSseEvent(reply, completedEvent, streamState);
                }
              }
            }
          }
        );
      } catch (error) {
        if (!terminalEventSent) {
          const failedEvent: RunStreamFailedEventDto = {
            type: 'run.failed',
            runId,
            run: finalRunSnapshot,
            error: getRouteErrorMessage(error, 'thread stream failed')
          };
          terminalEventSent = true;
          writeSseEvent(reply, failedEvent, streamState);
        }
      } finally {
        if (!streamState.closed && !reply.raw.destroyed && !reply.raw.writableEnded) {
          reply.raw.end();
        }
      }

      return reply;
    }
  );
}
