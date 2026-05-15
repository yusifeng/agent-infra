import type { PublicChatShareResult, StartTextTurnResult } from '@agent-infra/app';
import { ChatShareNotFoundError, RunNotFoundError } from '@agent-infra/app';
import type {
  RunAttachStreamUnavailableReasonDto,
  RunAttachStreamEventDto,
  RunAttachStreamUnavailableEventDto,
  RunStreamFailedEventDto,
  RunStreamSnapshotEventDto,
  RuntimePiMetaDto
} from '@agent-infra/contracts';
import type { AgentInfraRepositoryBundle } from '@agent-infra/db';
import {
  buildCreateThreadShareErrorResponse,
  buildCreateThreadShareResponse,
  buildPublicChatShareErrorResponse,
  buildPublicChatShareResponse,
  buildRevokeChatShareErrorResponse,
  buildRevokeChatShareResponse,
  buildRunAssistantEvent,
  buildRunReadyEvent,
  buildRunTraceErrorResponse,
  buildRunTraceResponse,
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
  buildUnavailableRuntimeMetaResponse,
  getRouteErrorMessage,
  getRouteErrorStatus,
  InMemoryRunStreamHub,
  parseCreateThreadTitle,
  parseRenameThreadTitle,
  parseThreadRunsLimit,
  parseRunTextTurnInput,
  type RunStreamHub,
  type RunStreamHubSubscription,
  toRunDto
} from '@agent-infra/durable-chat-server';
import type { RuntimePiRuntime } from '@agent-infra/runtime-pi/types';
import type { FastifyInstance, FastifyReply } from 'fastify';

import { APP_ID } from '../constants.js';
import type { PlaygroundAuthConfig } from '../features/auth/service/auth-config.js';
import { getPlaygroundAppServices, getPlaygroundAppServicesState } from '../playground-app-services.js';
import { getPlaygroundBaseServicesState, type PlaygroundAppServices } from '../playground-base-services.js';
import { projectPlaygroundThreadDto, projectPlaygroundThreadList } from '../features/thread-catalog/service/project-playground-thread-dto.js';
import { PlaygroundThreadCatalogService } from '../features/thread-catalog/service/thread-catalog-service.js';
import {
  createRuntimeThreadTitleGenerator,
  maybeAutoTitleThread,
  type ThreadTitleGenerator
} from '../features/thread-title/auto-thread-title.js';
import { getPlaygroundMeta, toPlaygroundDbInfo } from '../playground-meta.js';
import {
  getPlaygroundRuntimeServices,
  getPlaygroundRuntimeServicesState,
  isPlaygroundWebSearchConfigured
} from '../playground-services.js';
import {
  buildThreadTitleUpdatedEvent,
  encodePlaygroundSseEvent,
  type PlaygroundStreamEventDto
} from '../features/chat-stream/playground-stream-events.js';

type ChatAppServices = PlaygroundAppServices;

type ChatRuntimeServices = ChatAppServices & {
  repos: AgentInfraRepositoryBundle;
  durableRuntime: RuntimePiRuntime;
};

type ChatRouteMeta = ReturnType<typeof getPlaygroundMeta>;
type MaybePromise<T> = T | Promise<T>;
const threadRunStartLocks = new Map<string, Promise<void>>();

export type ChatRouteDependencies = {
  authConfig?: PlaygroundAuthConfig;
  getAppServices?: () => Promise<ChatAppServices>;
  getRuntimeServices?: () => Promise<ChatRuntimeServices>;
  getRuntimeMeta?: () => MaybePromise<ChatRouteMeta>;
  runStreamHub?: RunStreamHub;
  threadTitleGenerator?: ThreadTitleGenerator | null;
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

async function withThreadRunStartLock<T>(threadId: string, work: () => Promise<T>) {
  const previous = threadRunStartLocks.get(threadId) ?? Promise.resolve();
  let releaseCurrentLock!: () => void;
  const current = new Promise<void>((resolve) => {
    releaseCurrentLock = resolve;
  });
  const chained = previous.then(() => current);
  threadRunStartLocks.set(threadId, chained);
  await previous;

  try {
    return await work();
  } finally {
    releaseCurrentLock();
    if (threadRunStartLocks.get(threadId) === chained) {
      threadRunStartLocks.delete(threadId);
    }
  }
}

function writeSseEvent(
  reply: { raw: NodeJS.WritableStream & { destroyed?: boolean; writableEnded?: boolean } },
  payload: PlaygroundStreamEventDto,
  state: { closed: boolean }
) {
  if (state.closed || reply.raw.destroyed || reply.raw.writableEnded) {
    return false;
  }

  try {
    reply.raw.write(encodePlaygroundSseEvent(payload));
    return true;
  } catch {
    state.closed = true;
    return false;
  }
}

function describeServiceState(state: { initialized: boolean; initializing: boolean; lastInitDurationMs: number | null }) {
  return state.initialized ? 'warm' : state.initializing ? 'warming' : 'cold';
}

function requireAuthenticatedCurrentUser(
  request: { currentUser: { id: string } | null },
  reply: { code: (statusCode: number) => { send: (payload: Record<string, unknown>) => unknown } }
) {
  if (request.currentUser) {
    return request.currentUser;
  }

  reply.code(401).send({
    error: 'UNAUTHORIZED'
  });
  return null;
}

function isValidSiteIconHostname(hostname: string) {
  return /^[a-z0-9.-]+$/i.test(hostname) && hostname.includes('.') && !hostname.includes('..');
}

function asJsonRecord(value: unknown) {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function isPolicyToolResultPart(part: { type: string; jsonValue?: Record<string, unknown> | null }) {
  if (part.type !== 'tool-result') {
    return false;
  }

  const details = asJsonRecord(part.jsonValue?.details);
  return details?.status === 'blocked_by_policy' || details?.status === 'redirected_by_policy';
}

function readToolCallId(part: { jsonValue?: Record<string, unknown> | null }) {
  return typeof part.jsonValue?.toolCallId === 'string' ? part.jsonValue.toolCallId : null;
}

function sanitizeMessagesForUi<TMessage extends { parts: TPart[] }, TPart extends { type: string; jsonValue?: Record<string, unknown> | null }>(
  messages: TMessage[]
) {
  const blockedToolCallIds = new Set(
    messages
      .flatMap((message) => message.parts)
      .filter((part) => isPolicyToolResultPart(part))
      .map((part) => readToolCallId(part))
      .filter((toolCallId): toolCallId is string => Boolean(toolCallId))
  );

  if (blockedToolCallIds.size === 0) {
    return messages;
  }

  return messages.flatMap((message) => {
    const parts = message.parts.filter((part) => {
      const toolCallId = readToolCallId(part);
      if (!toolCallId || !blockedToolCallIds.has(toolCallId)) {
        return true;
      }

      return part.type !== 'tool-call' && part.type !== 'tool-result';
    });

    if (parts.length === 0) {
      return [];
    }

    return [{ ...message, parts }];
  });
}

function sanitizePublicShareForUi(result: PublicChatShareResult): PublicChatShareResult {
  return {
    ...result,
    snapshot: {
      ...result.snapshot,
      messages: sanitizeMessagesForUi(result.snapshot.messages)
    }
  };
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
  const runStreamHub = dependencies.runStreamHub ?? new InMemoryRunStreamHub();
  const getRuntimeMeta =
    dependencies.getRuntimeMeta ??
    (async () => {
      const services = await getAppServices();
      return getPlaygroundMeta({}, toPlaygroundDbInfo(services.dbInfo));
    });

  function createThreadCatalogService(services: ChatAppServices) {
    return new PlaygroundThreadCatalogService(services.dbConfig);
  }

  async function loadAccessibleThread(services: ChatAppServices, threadId: string, currentUserId: string) {
    const catalogService = createThreadCatalogService(services);
    return catalogService.loadAccessibleThread(threadId, currentUserId, () => services.repos.threadRepo.findById(threadId));
  }

  async function loadAccessibleRun(services: ChatAppServices, runId: string, currentUserId: string) {
    const run = await services.repos.runRepo.findById(runId);
    if (!run) {
      throw new RunNotFoundError(runId);
    }

    const threadAccess = await loadAccessibleThread(services, run.threadId, currentUserId);
    return {
      run,
      ...threadAccess
    };
  }

  function setSseHeaders(reply: FastifyReply, requestId: string, serverTiming: string) {
    reply.hijack();
    reply.raw.setHeader('x-request-id', requestId);
    reply.raw.setHeader('server-timing', serverTiming);
    reply.raw.setHeader('cache-control', 'no-cache, no-transform');
    reply.raw.setHeader('connection', 'keep-alive');
    reply.raw.setHeader('content-type', 'text/event-stream; charset=utf-8');
    reply.raw.flushHeaders?.();
  }

  function buildInitialRunSnapshot(started: StartTextTurnResult, readyEvent = buildRunReadyEvent(started)): RunStreamSnapshotEventDto {
    return {
      type: 'run.snapshot',
      runId: started.run.id,
      run: readyEvent.run,
      version: 0,
      assistant: null
    };
  }

  async function loadAccessibleShare(services: ChatAppServices, publicId: string, currentUserId: string) {
    const share = await services.repos.chatShareRepo.findByPublicId(publicId);
    if (!share) {
      throw new ChatShareNotFoundError(publicId);
    }

    const threadAccess = await loadAccessibleThread(services, share.sourceThreadId, currentUserId);
    return {
      share,
      ...threadAccess
    };
  }

  app.get('/api/meta', async (request, reply) => {
    try {
      const runtime = await request.requestTiming.measureAsync('meta.resolve', () => Promise.resolve(getRuntimeMeta()));

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
    const currentUser = requireAuthenticatedCurrentUser(request, reply);
    if (!currentUser) {
      return;
    }

    try {
      request.requestTiming.annotate('base_services_state', describeServiceState(getPlaygroundBaseServicesState()));
      request.requestTiming.annotate('app_services_state', describeServiceState(getPlaygroundAppServicesState()));
      const services = await request.requestTiming.measureAsync('services.app', () => getAppServices());
      const catalogService = createThreadCatalogService(services);
      const [catalogRows, threads] = await Promise.all([
        request.requestTiming.measureAsync('catalog.list', () => catalogService.listVisibleCatalogRows(currentUser.id)),
        request.requestTiming.measureAsync('threads.list', () => services.app.threads.list({ appId: APP_ID }))
      ]);

      return reply.send({
        threads: projectPlaygroundThreadList(threads, catalogRows)
      });
    } catch (error) {
      return reply.code(getRouteErrorStatus(error)).send({
        threads: [],
        error: getRouteErrorMessage(error, 'failed to list threads')
      });
    }
  });

  app.post('/api/threads', async (request, reply) => {
    const title = parseCreateThreadTitle(request.body);
    const currentUser = requireAuthenticatedCurrentUser(request, reply);
    if (!currentUser) {
      return;
    }

    try {
      request.requestTiming.annotate('base_services_state', describeServiceState(getPlaygroundBaseServicesState()));
      request.requestTiming.annotate('app_services_state', describeServiceState(getPlaygroundAppServicesState()));
      const services = await request.requestTiming.measureAsync('services.app', () => getAppServices());
      const catalogService = createThreadCatalogService(services);
      const { thread, catalogRow } = await request.requestTiming.measureAsync('threads.create', () =>
        catalogService.createThreadWithCatalog({
          ownerUserId: currentUser.id,
          title,
          metadata: {
            source: 'playground-vite-web',
            runtime: 'pi'
          }
        })
      );

      return reply.send({
        thread: projectPlaygroundThreadDto(thread, catalogRow)
      });
    } catch (error) {
      return reply.code(getRouteErrorStatus(error)).send({
        error: getRouteErrorMessage(error, 'failed to create thread')
      });
    }
  });

  app.get<{ Params: { threadId: string } }>('/api/threads/:threadId', async (request, reply) => {
    const currentUser = requireAuthenticatedCurrentUser(request, reply);
    if (!currentUser) {
      return;
    }

    try {
      request.requestTiming.annotate('base_services_state', describeServiceState(getPlaygroundBaseServicesState()));
      request.requestTiming.annotate('app_services_state', describeServiceState(getPlaygroundAppServicesState()));
      const services = await request.requestTiming.measureAsync('services.app', () => getAppServices());
      const { thread, catalogRow } = await request.requestTiming.measureAsync('threads_get', () =>
        loadAccessibleThread(services, request.params.threadId, currentUser.id)
      );

      return reply.send({
        thread: projectPlaygroundThreadDto(thread, catalogRow)
      });
    } catch (error) {
      return reply.code(getRouteErrorStatus(error)).send({
        error: getRouteErrorMessage(error, 'failed to load thread')
      });
    }
  });

  app.patch<{ Params: { threadId: string } }>('/api/threads/:threadId', async (request, reply) => {
    const title = parseRenameThreadTitle(request.body);
    const currentUser = requireAuthenticatedCurrentUser(request, reply);
    if (!currentUser) {
      return;
    }

    try {
      request.requestTiming.annotate('base_services_state', describeServiceState(getPlaygroundBaseServicesState()));
      request.requestTiming.annotate('app_services_state', describeServiceState(getPlaygroundAppServicesState()));
      const services = await request.requestTiming.measureAsync('services.app', () => getAppServices());
      const { catalogRow } = await request.requestTiming.measureAsync('catalog.load', () =>
        loadAccessibleThread(services, request.params.threadId, currentUser.id)
      );
      const thread = await request.requestTiming.measureAsync('threads.rename', () =>
        services.app.threads.rename({
          threadId: request.params.threadId,
          title
        })
      );

      return reply.send({
        thread: projectPlaygroundThreadDto(thread, catalogRow)
      });
    } catch (error) {
      return reply.code(getRouteErrorStatus(error)).send({
        error: getRouteErrorMessage(error, 'failed to rename thread')
      });
    }
  });

  app.post<{ Params: { threadId: string } }>('/api/threads/:threadId/archive', async (request, reply) => {
    const currentUser = requireAuthenticatedCurrentUser(request, reply);
    if (!currentUser) {
      return;
    }

    try {
      request.requestTiming.annotate('base_services_state', describeServiceState(getPlaygroundBaseServicesState()));
      request.requestTiming.annotate('app_services_state', describeServiceState(getPlaygroundAppServicesState()));
      const services = await request.requestTiming.measureAsync('services.app', () => getAppServices());
      await request.requestTiming.measureAsync('catalog.load', () =>
        loadAccessibleThread(services, request.params.threadId, currentUser.id)
      );
      const catalogService = createThreadCatalogService(services);
      const thread = await request.requestTiming.measureAsync('threads.archive', () =>
        services.app.threads.archive({
          threadId: request.params.threadId
        })
      );
      const catalogRow = await request.requestTiming.measureAsync('catalog.clear_pin_after_archive', () =>
        catalogService.unpinThread(thread.id, new Date())
      );

      return reply.send({
        thread: projectPlaygroundThreadDto(thread, catalogRow)
      });
    } catch (error) {
      return reply.code(getRouteErrorStatus(error)).send({
        error: getRouteErrorMessage(error, 'failed to archive thread')
      });
    }
  });

  app.post<{ Params: { threadId: string } }>('/api/threads/:threadId/pin', async (request, reply) => {
    const currentUser = requireAuthenticatedCurrentUser(request, reply);
    if (!currentUser) {
      return;
    }

    try {
      request.requestTiming.annotate('base_services_state', describeServiceState(getPlaygroundBaseServicesState()));
      request.requestTiming.annotate('app_services_state', describeServiceState(getPlaygroundAppServicesState()));
      const services = await request.requestTiming.measureAsync('services.app', () => getAppServices());
      const catalogService = createThreadCatalogService(services);
      const { thread } = await request.requestTiming.measureAsync('catalog.load', () =>
        loadAccessibleThread(services, request.params.threadId, currentUser.id)
      );
      const catalogRow = await request.requestTiming.measureAsync('catalog.pin', () =>
        catalogService.pinThread(thread, new Date())
      );

      return reply.send({
        thread: projectPlaygroundThreadDto(thread, catalogRow)
      });
    } catch (error) {
      return reply.code(getRouteErrorStatus(error)).send({
        error: getRouteErrorMessage(error, 'failed to pin thread')
      });
    }
  });

  app.delete<{ Params: { threadId: string } }>('/api/threads/:threadId/pin', async (request, reply) => {
    const currentUser = requireAuthenticatedCurrentUser(request, reply);
    if (!currentUser) {
      return;
    }

    try {
      request.requestTiming.annotate('base_services_state', describeServiceState(getPlaygroundBaseServicesState()));
      request.requestTiming.annotate('app_services_state', describeServiceState(getPlaygroundAppServicesState()));
      const services = await request.requestTiming.measureAsync('services.app', () => getAppServices());
      const catalogService = createThreadCatalogService(services);
      const { thread } = await request.requestTiming.measureAsync('catalog.load', () =>
        loadAccessibleThread(services, request.params.threadId, currentUser.id)
      );
      const catalogRow = await request.requestTiming.measureAsync('catalog.unpin', () =>
        catalogService.unpinThread(thread.id, new Date())
      );

      return reply.send({
        thread: projectPlaygroundThreadDto(thread, catalogRow)
      });
    } catch (error) {
      return reply.code(getRouteErrorStatus(error)).send({
        error: getRouteErrorMessage(error, 'failed to unpin thread')
      });
    }
  });

  app.get<{ Params: { threadId: string } }>('/api/threads/:threadId/messages', async (request, reply) => {
    const currentUser = requireAuthenticatedCurrentUser(request, reply);
    if (!currentUser) {
      return;
    }

    try {
      request.requestTiming.annotate('base_services_state', describeServiceState(getPlaygroundBaseServicesState()));
      request.requestTiming.annotate('app_services_state', describeServiceState(getPlaygroundAppServicesState()));
      const services = await request.requestTiming.measureAsync('services.app', () => getAppServices());
      await request.requestTiming.measureAsync('catalog.load', () =>
        loadAccessibleThread(services, request.params.threadId, currentUser.id)
      );
      const [messages, activeRun] = await Promise.all([
        request.requestTiming.measureAsync('messages.get', () => services.app.threads.getMessages({ threadId: request.params.threadId })),
        request.requestTiming.measureAsync('runs.active', () => services.app.runs.getActiveByThread({ threadId: request.params.threadId }))
      ]);

      return reply.send(buildThreadMessagesResponse({ messages: sanitizeMessagesForUi(messages), activeRun }));
    } catch (error) {
      return reply.code(getRouteErrorStatus(error)).send(buildThreadMessagesErrorResponse(error, 'failed to load thread messages'));
    }
  });

  app.post<{ Params: { threadId: string } }>('/api/threads/:threadId/shares', async (request, reply) => {
    const currentUser = requireAuthenticatedCurrentUser(request, reply);
    if (!currentUser) {
      return;
    }

    try {
      request.requestTiming.annotate('base_services_state', describeServiceState(getPlaygroundBaseServicesState()));
      request.requestTiming.annotate('app_services_state', describeServiceState(getPlaygroundAppServicesState()));
      const services = await request.requestTiming.measureAsync('services.app', () => getAppServices());
      await request.requestTiming.measureAsync('catalog.load', () =>
        loadAccessibleThread(services, request.params.threadId, currentUser.id)
      );
      const share = await request.requestTiming.measureAsync('shares.create', () =>
        services.app.shares.createThreadSnapshot({ threadId: request.params.threadId })
      );

      return reply.send(buildCreateThreadShareResponse(share));
    } catch (error) {
      return reply
        .code(getRouteErrorStatus(error))
        .send(buildCreateThreadShareErrorResponse(error, 'failed to create thread share'));
    }
  });

  app.get<{ Params: { threadId: string } }>('/api/threads/:threadId/shares/current', async (request, reply) => {
    const currentUser = requireAuthenticatedCurrentUser(request, reply);
    if (!currentUser) {
      return;
    }

    try {
      request.requestTiming.annotate('base_services_state', describeServiceState(getPlaygroundBaseServicesState()));
      request.requestTiming.annotate('app_services_state', describeServiceState(getPlaygroundAppServicesState()));
      const services = await request.requestTiming.measureAsync('services.app', () => getAppServices());
      await request.requestTiming.measureAsync('catalog.load', () =>
        loadAccessibleThread(services, request.params.threadId, currentUser.id)
      );
      const share = await request.requestTiming.measureAsync('shares.current', () =>
        services.app.shares.getCurrentByThread({ threadId: request.params.threadId })
      );

      return reply.send(buildThreadShareStateResponse(share));
    } catch (error) {
      return reply
        .code(getRouteErrorStatus(error))
        .send(buildThreadShareStateErrorResponse(error, 'failed to load current thread share'));
    }
  });

  app.get<{ Params: { threadId: string }; Querystring: { limit?: string } }>('/api/threads/:threadId/runs', async (request, reply) => {
    const currentUser = requireAuthenticatedCurrentUser(request, reply);
    if (!currentUser) {
      return;
    }

    try {
      request.requestTiming.annotate('base_services_state', describeServiceState(getPlaygroundBaseServicesState()));
      request.requestTiming.annotate('app_services_state', describeServiceState(getPlaygroundAppServicesState()));
      const services = await request.requestTiming.measureAsync('services.app', () => getAppServices());
      await request.requestTiming.measureAsync('catalog.load', () =>
        loadAccessibleThread(services, request.params.threadId, currentUser.id)
      );
      const runs = await request.requestTiming.measureAsync('runs.list', () =>
        services.app.runs.listByThread({
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
    const currentUser = requireAuthenticatedCurrentUser(request, reply);
    if (!currentUser) {
      return;
    }

    try {
      request.requestTiming.annotate('base_services_state', describeServiceState(getPlaygroundBaseServicesState()));
      request.requestTiming.annotate('app_services_state', describeServiceState(getPlaygroundAppServicesState()));
      const services = await request.requestTiming.measureAsync('services.app', () => getAppServices());
      await request.requestTiming.measureAsync('catalog.load_for_run_timeline', () =>
        loadAccessibleRun(services, request.params.runId, currentUser.id)
      );
      const timeline = await request.requestTiming.measureAsync('runs.timeline', () =>
        services.app.runs.getTimeline({ runId: request.params.runId })
      );

      return reply.send(buildRunTimelineResponse(timeline));
    } catch (error) {
      return reply.code(getRouteErrorStatus(error)).send(buildRunTimelineErrorResponse(error, 'failed to load run timeline'));
    }
  });

  app.get<{ Params: { runId: string } }>('/api/runs/:runId/trace', async (request, reply) => {
    const currentUser = requireAuthenticatedCurrentUser(request, reply);
    if (!currentUser) {
      return;
    }

    try {
      request.requestTiming.annotate('base_services_state', describeServiceState(getPlaygroundBaseServicesState()));
      request.requestTiming.annotate('app_services_state', describeServiceState(getPlaygroundAppServicesState()));
      const services = await request.requestTiming.measureAsync('services.app', () => getAppServices());
      await request.requestTiming.measureAsync('catalog.load_for_run_trace', () =>
        loadAccessibleRun(services, request.params.runId, currentUser.id)
      );
      const trace = await request.requestTiming.measureAsync('runs.trace', () =>
        services.app.runs.getTrace({ runId: request.params.runId })
      );

      return reply.send(buildRunTraceResponse(trace));
    } catch (error) {
      return reply.code(getRouteErrorStatus(error)).send(buildRunTraceErrorResponse(error, 'failed to load run trace'));
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

      return reply.send(buildPublicChatShareResponse(sanitizePublicShareForUi(share)));
    } catch (error) {
      return reply.code(getRouteErrorStatus(error)).send(buildPublicChatShareErrorResponse(error, 'failed to load public share'));
    }
  });

  app.post<{ Params: { publicId: string } }>('/api/shares/:publicId/revoke', async (request, reply) => {
    const currentUser = requireAuthenticatedCurrentUser(request, reply);
    if (!currentUser) {
      return;
    }

    try {
      request.requestTiming.annotate('base_services_state', describeServiceState(getPlaygroundBaseServicesState()));
      request.requestTiming.annotate('app_services_state', describeServiceState(getPlaygroundAppServicesState()));
      const services = await request.requestTiming.measureAsync('services.app', () => getAppServices());
      await request.requestTiming.measureAsync('catalog.load_for_share_revoke', () =>
        loadAccessibleShare(services, request.params.publicId, currentUser.id)
      );
      const share = await request.requestTiming.measureAsync('shares.revoke', () =>
        services.app.shares.revoke({ publicId: request.params.publicId })
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
    const currentUser = requireAuthenticatedCurrentUser(request, reply);
    if (!currentUser) {
      return;
    }

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
      const threadId = (request.params as { threadId: string }).threadId;

      started = await withThreadRunStartLock(threadId, async () => {
        const threadCatalogService = createThreadCatalogService(runtimeServices);
        const { catalogRow } = await request.requestTiming.measureAsync('catalog.load', () =>
          loadAccessibleThread(runtimeServices, threadId, currentUser.id)
        );

        let effectiveRuntimeBinding: { provider: string; model: string } | null = null;
        if (catalogRow.runtimeProvider && catalogRow.runtimeModel) {
          effectiveRuntimeBinding = {
            provider: catalogRow.runtimeProvider,
            model: catalogRow.runtimeModel
          };
        } else {
          const latestRun = await request.requestTiming.measureAsync('runs.latest_for_runtime_binding', () =>
            runtimeServices.repos.runRepo.listByThread(threadId, { limit: 1 })
          );
          const latestBoundRun = latestRun[0] ?? null;

          if (latestBoundRun?.provider && latestBoundRun.model) {
            effectiveRuntimeBinding = {
              provider: latestBoundRun.provider,
              model: latestBoundRun.model
            };
          }
        }

        if (effectiveRuntimeBinding) {
          request.requestTiming.annotate(
            'thread_runtime_binding',
            `${effectiveRuntimeBinding.provider}:${effectiveRuntimeBinding.model}`
          );
        }

        const queued = await request.requestTiming.measureAsync('turns.start_text', () =>
          runtimeServices.app.turns.startText({
            threadId,
            text: turnInput.text,
            provider: effectiveRuntimeBinding?.provider ?? turnInput.provider,
            model: effectiveRuntimeBinding?.model ?? turnInput.model,
            thinkingEnabled: turnInput.thinkingEnabled,
            reasoningEffort: turnInput.reasoningEffort,
            webSearchEnabled: turnInput.webSearchEnabled
          })
        );

        try {
          await request.requestTiming.measureAsync('catalog.bind_runtime_if_unset', () =>
            threadCatalogService.bindRuntimeIfUnset(
              threadId,
              queued.runtimeSelection.provider,
              queued.runtimeSelection.model,
              new Date()
            )
          );
        } catch (bindingError) {
          app.log.warn(
            {
              err: bindingError,
              threadId,
              runId: queued.run.id
            },
            'failed to persist thread runtime binding after successful startText'
          );
        }

        return queued;
      });
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
    let finalRunCompleted = false;
    let terminalEventSent = false;
    let streamVersion = 0;

    setSseHeaders(reply, request.id, request.requestTiming.formatServerTiming({ includeTotal: false }));

    reply.raw.on('close', () => {
      streamState.closed = true;
    });

    try {
      const readyEvent = buildRunReadyEvent(started);
      runStreamHub.openSession(buildInitialRunSnapshot(started, readyEvent));
      writeSseEvent(reply, readyEvent, streamState);

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
              const assistantEvent = buildRunAssistantEvent(runId, assistantStream);
              streamVersion += 1;
              runStreamHub.publish(runId, {
                ...assistantEvent,
                version: streamVersion
              });
              writeSseEvent(reply, assistantEvent, streamState);
            },
            onPersistedUpdate: (update) => {
              if (!update.run) {
                return;
              }

              finalRunSnapshot = toRunDto(update.run);
              finalRunCompleted = update.run.status === 'completed';
              const stateEvent = buildRunStateEvent(runId, update.run);
              streamVersion += 1;
              runStreamHub.publish(runId, {
                ...stateEvent,
                version: streamVersion
              });
              writeSseEvent(reply, stateEvent, streamState);

              if (!terminalEventSent) {
                const terminalEvent = buildRunTerminalEvent(runId, update.run);
                if (terminalEvent) {
                  terminalEventSent = true;
                  streamVersion += 1;
                  runStreamHub.closeSession(runId, {
                    ...terminalEvent,
                    version: streamVersion
                  });
                  writeSseEvent(reply, terminalEvent, streamState);
                }
              }
            }
          }
        )
      );

      if (finalRunCompleted) {
        const threadTitleGenerator =
          Object.prototype.hasOwnProperty.call(dependencies, 'threadTitleGenerator')
            ? dependencies.threadTitleGenerator ?? null
            : createRuntimeThreadTitleGenerator(runtimeServices.durableRuntime);

        const autoTitleResult = await maybeAutoTitleThread({
          services: runtimeServices,
          threadId,
          runId,
          generator: threadTitleGenerator,
          log: app.log
        });

        if (autoTitleResult.outcome === 'renamed') {
          writeSseEvent(
            reply,
            buildThreadTitleUpdatedEvent({
              threadId,
              title: autoTitleResult.title,
              updatedAt: autoTitleResult.updatedAt
            }),
            streamState
          );
        }
      }
    } catch (error) {
      if (!terminalEventSent) {
        terminalEventSent = true;
        const failedEvent = {
          type: 'run.failed' as const,
          runId,
          run: finalRunSnapshot,
          error: getRouteErrorMessage(error, 'thread stream failed')
        };
        streamVersion += 1;
        runStreamHub.closeSession(runId, {
          ...failedEvent,
          version: streamVersion
        });
        writeSseEvent(reply, failedEvent, streamState);
      }
    } finally {
      if (!streamState.closed && !reply.raw.destroyed && !reply.raw.writableEnded) {
        reply.raw.end();
      }
      request.requestTiming.complete(app.log, request, reply);
    }

    return reply;
  });

  app.get<{ Params: { threadId: string; runId: string } }>(
    '/api/threads/:threadId/runs/:runId/attach-stream',
    async (request, reply) => {
      const currentUser = requireAuthenticatedCurrentUser(request, reply);
      if (!currentUser) {
        return;
      }

      const { threadId, runId } = request.params;
      let services: ChatAppServices;

      try {
        request.requestTiming.annotate('base_services_state', describeServiceState(getPlaygroundBaseServicesState()));
        request.requestTiming.annotate('app_services_state', describeServiceState(getPlaygroundAppServicesState()));
        services = await request.requestTiming.measureAsync('services.app', () => getAppServices());
        await request.requestTiming.measureAsync('catalog.load_for_attach', () =>
          loadAccessibleThread(services, threadId, currentUser.id)
        );
      } catch (error) {
        return reply.code(getRouteErrorStatus(error)).send(buildRunTextTurnErrorResponse(error, 'failed to attach run stream'));
      }

      const streamState = { closed: false };
      let subscription: RunStreamHubSubscription | null = null;
      let timingCompleted = false;

      const completeTiming = () => {
        if (!timingCompleted) {
          timingCompleted = true;
          request.requestTiming.complete(app.log, request, reply);
        }
      };

      const closeReply = () => {
        if (!streamState.closed && !reply.raw.destroyed && !reply.raw.writableEnded) {
          reply.raw.end();
        }
        completeTiming();
      };

      const sendUnavailable = (
        reason: RunAttachStreamUnavailableReasonDto,
        input: { run?: RunAttachStreamUnavailableEventDto['run']; message?: string } = {}
      ) => {
        const event: RunAttachStreamUnavailableEventDto = {
          type: 'run.attach_unavailable',
          runId,
          reason,
          run: input.run,
          message: input.message
        };
        writeSseEvent(reply, event, streamState);
        closeReply();
      };

      setSseHeaders(reply, request.id, request.requestTiming.formatServerTiming({ includeTotal: false }));
      reply.raw.on('close', () => {
        streamState.closed = true;
        subscription?.unsubscribe();
        completeTiming();
      });

      try {
        const run = await request.requestTiming.measureAsync('runs.load_for_attach', () =>
          services.repos.runRepo.findById(runId)
        );
        if (!run) {
          sendUnavailable('run_not_found');
          return reply;
        }

        const runDto = toRunDto(run);
        if (run.threadId !== threadId) {
          try {
            await request.requestTiming.measureAsync('catalog.load_for_attach_run_thread', () =>
              loadAccessibleThread(services, run.threadId, currentUser.id)
            );
          } catch {
            sendUnavailable('run_not_found');
            return reply;
          }

          sendUnavailable('thread_run_mismatch', {
            run: runDto,
            message: 'run does not belong to the requested thread'
          });
          return reply;
        }

        const snapshot = runStreamHub.getSnapshot(runId);
        if (!snapshot) {
          sendUnavailable(run.status === 'queued' || run.status === 'running' ? 'stream_session_gone' : 'run_not_active', {
            run: runDto
          });
          return reply;
        }

        subscription = runStreamHub.subscribe(runId, {
          send(event: RunAttachStreamEventDto) {
            writeSseEvent(reply, event, streamState);
          },
          close() {
            closeReply();
          }
        });

        if (!subscription) {
          sendUnavailable('stream_session_gone', {
            run: runDto
          });
        }
      } catch (error) {
        sendUnavailable('stream_session_gone', {
          message: getRouteErrorMessage(error, 'failed to attach run stream')
        });
      }

      return reply;
    }
  );
}
