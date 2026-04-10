import type { RunTextTurnRequestDto, RunTextTurnResponseDto } from '@agent-infra/contracts';

import { toMessageDto, toRunDto } from '@/lib/runtime-pi-dto';
import { getRouteErrorMessage, getRouteErrorStatus } from '@/lib/runtime-pi-route-errors';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { getRuntimePiServices } = await import('@/lib/runtime-pi-repo');
  const { id: threadId } = await params;
  const body = (await req.json().catch(() => ({}))) as RunTextTurnRequestDto;

  try {
    const { app } = await getRuntimePiServices();
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
      error: getRouteErrorMessage(error, 'runtime-pi request failed'),
      run: null,
      messages: []
    };
    return Response.json(response, { status: getRouteErrorStatus(error) });
  }
}
