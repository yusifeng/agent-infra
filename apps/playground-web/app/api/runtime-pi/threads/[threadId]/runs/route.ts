import type { ThreadRunsResponseDto } from '@agent-infra/contracts';

import { toRunDto } from '@/lib/runtime-pi-dto';
import { getRouteErrorMessage, getRouteErrorStatus } from '@/lib/runtime-pi-route-errors';

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
  const { getRuntimePiServices } = await import('@/lib/runtime-pi-repo');
  const { threadId } = await params;
  const url = new URL(req.url);
  const limit = parseLimit(url.searchParams.get('limit'));

  try {
    const { app } = await getRuntimePiServices();
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
