import type { RunTextTurnRequestDto, RunTextTurnResponseDto, ThreadRunsResponseDto } from '@agent-infra/contracts';

import { toMessageDto, toRunDto } from '@/lib/api-dto';
import { getRouteErrorMessage, getRouteErrorStatus } from '@/lib/api-route-errors';

const DEFAULT_LIMIT = 8;
const MAX_LIMIT = 20;

function parseLimit(value: string | null) {
  if (!value) {
    return DEFAULT_LIMIT;
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_LIMIT;
  }

  return Math.min(parsed, MAX_LIMIT);
}

export async function GET(req: Request, { params }: { params: Promise<{ threadId: string }> }) {
  const { getPlaygroundReadServices } = await import('@/lib/playground-read-services');
  const { threadId } = await params;
  const url = new URL(req.url);
  const limit = parseLimit(url.searchParams.get('limit'));

  try {
    const { app } = await getPlaygroundReadServices();
    const runs = await app.runs.listByThread({ threadId, limit });
    const response: ThreadRunsResponseDto = {
      runs: runs.map((run) => toRunDto(run)).filter((run): run is NonNullable<typeof run> => run !== null)
    };

    return Response.json(response);
  } catch (error) {
    const response: ThreadRunsResponseDto = {
      runs: [],
      error: getRouteErrorMessage(error, 'failed to load thread runs')
    };

    return Response.json(response, { status: getRouteErrorStatus(error) });
  }
}

export async function POST(req: Request, { params }: { params: Promise<{ threadId: string }> }) {
  const { getPlaygroundRuntimeServices } = await import('@/lib/playground-services');
  const { threadId } = await params;
  const body = (await req.json().catch(() => ({}))) as RunTextTurnRequestDto;

  try {
    const { app } = await getPlaygroundRuntimeServices();
    const result = await app.turns.runText({
      threadId,
      text: typeof body.text === 'string' ? body.text : '',
      provider: typeof body.provider === 'string' ? body.provider.trim() : undefined,
      model: typeof body.model === 'string' ? body.model.trim() : undefined
    });

    const response: RunTextTurnResponseDto = {
      run: toRunDto(result.run),
      messages: result.messages.map(toMessageDto),
      debug: result.debug,
      error: result.executionError
    };

    return Response.json(response);
  } catch (error) {
    const response: RunTextTurnResponseDto = {
      error: getRouteErrorMessage(error, 'failed to run thread turn'),
      run: null,
      messages: []
    };
    return Response.json(response, { status: getRouteErrorStatus(error) });
  }
}
