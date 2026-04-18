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

export async function GET(req: Request, { params }: { params: Promise<{ threadId: string }> }) {
  const { getPlaygroundAppServices } = await import('@/lib/playground-app-services');
  const { threadId } = await params;
  const url = new URL(req.url);
  const limit = parseThreadRunsLimit(url.searchParams.get('limit'));

  try {
    const { app } = await getPlaygroundAppServices();
    const runs = await app.runs.listByThread({ threadId, limit });
    return Response.json(buildThreadRunsResponse(runs));
  } catch (error) {
    return Response.json(buildThreadRunsErrorResponse(error, 'failed to load thread runs'), {
      status: getRouteErrorStatus(error)
    });
  }
}

export async function POST(req: Request, { params }: { params: Promise<{ threadId: string }> }) {
  const { getPlaygroundRuntimeServices } = await import('@/lib/playground-services');
  const { threadId } = await params;
  const input = parseRunTextTurnInput((await req.json().catch(() => ({}))) as RunTextTurnRequestDto);

  try {
    const { app } = await getPlaygroundRuntimeServices();
    const result = await app.turns.runText({
      threadId,
      text: input.text,
      provider: input.provider,
      model: input.model
    });

    return Response.json(buildRunTextTurnResponse(result));
  } catch (error) {
    return Response.json(buildRunTextTurnErrorResponse(error, 'failed to run thread turn'), {
      status: getRouteErrorStatus(error)
    });
  }
}
