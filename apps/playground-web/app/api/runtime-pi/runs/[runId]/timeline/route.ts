import type { RunTimelineResponseDto } from '@agent-infra/contracts';

import { toRunDto, toRunEventDto, toToolInvocationDto } from '@/lib/runtime-pi-dto';
import { getRouteErrorMessage, getRouteErrorStatus } from '@/lib/runtime-pi-route-errors';

export async function GET(_req: Request, { params }: { params: Promise<{ runId: string }> }) {
  const { dbReady, runtimePiApp } = await import('@/lib/runtime-pi-repo');
  await dbReady;
  const { runId } = await params;

  try {
    const timeline = await runtimePiApp.runs.getTimeline({ runId });
    const response: RunTimelineResponseDto = {
      run: toRunDto(timeline.run),
      runEvents: timeline.runEvents.map(toRunEventDto),
      toolInvocations: timeline.toolInvocations.map(toToolInvocationDto)
    };

    return Response.json(response);
  } catch (error) {
    const response: RunTimelineResponseDto = {
      run: null,
      runEvents: [],
      toolInvocations: [],
      error: getRouteErrorMessage(error, 'failed to load run timeline')
    };

    return Response.json(response, { status: getRouteErrorStatus(error) });
  }
}
