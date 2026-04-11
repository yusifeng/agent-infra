import type {
  RunStreamAssistantEventDto,
  RunStreamCompletedEventDto,
  RunStreamEventDto,
  RunStreamEventRowDto,
  RunStreamFailedEventDto,
  RunStreamReadyEventDto,
  RunStreamStateEventDto,
  RunStreamToolRowDto,
  RunTextTurnRequestDto
} from '@agent-infra/contracts';

import { toMessageDto, toRunDto, toRunEventDto, toToolInvocationDto } from '@/lib/runtime-pi-dto';
import { getRouteErrorMessage, getRouteErrorStatus } from '@/lib/runtime-pi-route-errors';

function encodeSseEvent(payload: RunStreamEventDto) {
  return `event: ${payload.type}\ndata: ${JSON.stringify(payload)}\n\n`;
}

async function writeSseEvent(
  writer: WritableStreamDefaultWriter<Uint8Array>,
  encoder: TextEncoder,
  payload: RunStreamEventDto,
  state: { closed: boolean }
) {
  if (state.closed) {
    return false;
  }

  try {
    await writer.write(encoder.encode(encodeSseEvent(payload)));
    return true;
  } catch {
    state.closed = true;
    return false;
  }
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { getRuntimePiServices } = await import('@/lib/runtime-pi-repo');

  const { id: threadId } = await params;
  const body = (await req.json().catch(() => ({}))) as RunTextTurnRequestDto;

  let started;
  try {
    const { app } = await getRuntimePiServices();
    started = await app.turns.startText({
      threadId,
      text: typeof body.text === 'string' ? body.text : '',
      provider: typeof body.provider === 'string' ? body.provider.trim() : undefined,
      model: typeof body.model === 'string' ? body.model.trim() : undefined
    });
  } catch (error) {
    return Response.json(
      {
        error: getRouteErrorMessage(error, 'runtime-pi stream request failed'),
        run: null,
        messages: []
      },
      { status: getRouteErrorStatus(error) }
    );
  }

  const stream = new TransformStream<Uint8Array, Uint8Array>();
  const writer = stream.writable.getWriter();
  const encoder = new TextEncoder();
  const streamState = { closed: false };

  const runId = started.run.id;
  const services = await getRuntimePiServices();
  const runtimeInput = {
    threadId,
    runId,
    provider: started.runtimeSelection.provider,
    model: started.runtimeSelection.model
  };

  void (async () => {
    try {
      const readyEvent: RunStreamReadyEventDto = {
        type: 'run.ready',
        runId,
        run: toRunDto(started.run) as NonNullable<RunStreamReadyEventDto['run']>,
        userMessage: toMessageDto(started.userMessage)
      };
      await writeSseEvent(writer, encoder, readyEvent, streamState);

      await services.durableRuntime.runTurn(
        {
          runRepo: services.repos.runRepo,
          messageRepo: services.repos.messageRepo,
          toolRepo: services.repos.toolRepo,
          runEventRepo: services.repos.runEventRepo
        },
        runtimeInput,
        {
          onPersistedUpdate: async (update) => {
            const eventRow: RunStreamEventRowDto = {
              type: 'run.event',
              runId,
              event: toRunEventDto(update.runEvent)
            };
            await writeSseEvent(writer, encoder, eventRow, streamState);

            if (update.toolInvocation) {
              const toolRow: RunStreamToolRowDto = {
                type: 'run.tool',
                runId,
                toolInvocation: toToolInvocationDto(update.toolInvocation)
              };
              await writeSseEvent(writer, encoder, toolRow, streamState);
            }

            if (update.assistantStream) {
              const assistantRow: RunStreamAssistantEventDto = {
                type: 'run.assistant',
                runId,
                assistant: update.assistantStream
              };
              await writeSseEvent(writer, encoder, assistantRow, streamState);
            }

            if (update.run) {
              const runState: RunStreamStateEventDto = {
                type: 'run.state',
                runId,
                run: toRunDto(update.run) as NonNullable<RunStreamStateEventDto['run']>
              };
              await writeSseEvent(writer, encoder, runState, streamState);
            }
          }
        }
      );

      const finalRun = await services.repos.runRepo.findById(runId);
      if (finalRun?.status === 'failed') {
        const failedEvent: RunStreamFailedEventDto = {
          type: 'run.failed',
          runId,
          run: toRunDto(finalRun),
          error: finalRun.error ?? 'runtime execution failed'
        };
        await writeSseEvent(writer, encoder, failedEvent, streamState);
      } else if (finalRun) {
        const completedEvent: RunStreamCompletedEventDto = {
          type: 'run.completed',
          runId,
          run: toRunDto(finalRun) as NonNullable<RunStreamCompletedEventDto['run']>
        };
        await writeSseEvent(writer, encoder, completedEvent, streamState);
      }
    } catch (error) {
      const finalRun = await services.repos.runRepo.findById(runId);
      const failedEvent: RunStreamFailedEventDto = {
        type: 'run.failed',
        runId,
        run: toRunDto(finalRun),
        error: getRouteErrorMessage(error, 'runtime-pi stream failed')
      };
      await writeSseEvent(writer, encoder, failedEvent, streamState);
    } finally {
      try {
        if (!streamState.closed) {
          await writer.close();
        }
      } catch {
        streamState.closed = true;
      }
    }
  })();

  return new Response(stream.readable, {
    headers: {
      'cache-control': 'no-cache, no-transform',
      connection: 'keep-alive',
      'content-type': 'text/event-stream; charset=utf-8'
    }
  });
}
