import type { RunTimelineResponseDto } from '@agent-infra/contracts';

import { toRunDto, toRunEventDto, toToolInvocationDto } from '@/lib/api-dto';
import { getRouteErrorMessage, getRouteErrorStatus } from '@/lib/api-route-errors';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { getPlaygroundReadServices } = await import('@/lib/playground-read-services');
  const { id: runId } = await params;

  try {
    const { app } = await getPlaygroundReadServices();
    const timeline = await app.runs.getTimeline({ runId });
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
