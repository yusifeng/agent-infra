import type { RunTextTurnRequestDto } from '@agent-infra/contracts';

import {
  buildRunTextTurnErrorResponse,
  buildRunTextTurnResponse,
  buildThreadRunsErrorResponse,
  buildThreadRunsResponse,
  getRouteErrorStatus,
  parseRunTextTurnInput,
  parseThreadRunsLimit
} from '@agent-infra/durable-chat-server';

import {
  bindRuntimeIfUnset,
  loadAccessibleThread,
  requirePlaygroundUser,
  resolveThreadRuntimeBinding
} from '@/lib/playground-thread-access';

export async function GET(req: Request, { params }: { params: Promise<{ threadId: string }> }) {
  const { getPlaygroundAppServices } = await import('@/lib/playground-app-services');
  const { threadId } = await params;
  const url = new URL(req.url);
  const limit = parseThreadRunsLimit(url.searchParams.get('limit'));
  const auth = await requirePlaygroundUser(req);
  if (auth.response) {
    return auth.response;
  }

  try {
    const services = await getPlaygroundAppServices();
    const { app } = services;
    await loadAccessibleThread(services, threadId, auth.user.id);
    const runs = await app.runs.listByThread({ threadId, limit });
    return Response.json(buildThreadRunsResponse(runs));
  } catch (error) {
    return Response.json(buildThreadRunsErrorResponse(error, 'failed to load thread runs'), {
      status: getRouteErrorStatus(error)
    });
  }
}

export async function POST(req: Request, { params }: { params: Promise<{ threadId: string }> }) {
  const { getPlaygroundRuntimeServices, isPlaygroundWebSearchConfigured } = await import('@/lib/playground-services');
  const { threadId } = await params;
  const input = parseRunTextTurnInput((await req.json().catch(() => ({}))) as RunTextTurnRequestDto);
  const auth = await requirePlaygroundUser(req);
  if (auth.response) {
    return auth.response;
  }

  try {
    if (input.webSearchEnabled && !isPlaygroundWebSearchConfigured()) {
      return Response.json(
        buildRunTextTurnErrorResponse(
          new Error('Web search is unavailable because TAVILY_API_KEY is not configured.'),
          'failed to run thread turn'
        ),
        { status: 503 }
      );
    }

    const services = await getPlaygroundRuntimeServices();
    const { app } = services;
    const { catalogRow } = await loadAccessibleThread(services, threadId, auth.user.id);
    const runtimeBinding = await resolveThreadRuntimeBinding(services, threadId, catalogRow);
    const result = await app.turns.runText({
      threadId,
      text: input.text,
      provider: runtimeBinding?.provider ?? input.provider,
      model: runtimeBinding?.model ?? input.model,
      thinkingEnabled: input.thinkingEnabled,
      reasoningEffort: input.reasoningEffort,
      webSearchEnabled: input.webSearchEnabled
    });
    try {
      await bindRuntimeIfUnset(services, threadId, {
        provider: result.run.provider,
        model: result.run.model
      });
    } catch (error) {
      console.warn('failed to persist thread runtime binding after successful runText', {
        error,
        threadId,
        runId: result.run.id
      });
    }

    return Response.json(buildRunTextTurnResponse(result));
  } catch (error) {
    return Response.json(buildRunTextTurnErrorResponse(error, 'failed to run thread turn'), {
      status: getRouteErrorStatus(error)
    });
  }
}
