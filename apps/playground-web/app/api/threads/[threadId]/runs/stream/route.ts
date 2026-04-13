import type {
  RunStreamAssistantEventDto,
  RunStreamCompletedEventDto,
  RunStreamEventDto,
  RunStreamFailedEventDto,
  RunStreamReadyEventDto,
  RunStreamStateEventDto,
  RunTextTurnRequestDto
} from '@agent-infra/contracts';

import { toMessageDto, toRunDto } from '@/lib/api-dto';
import { getRouteErrorMessage, getRouteErrorStatus } from '@/lib/api-route-errors';

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

export async function POST(req: Request, { params }: { params: Promise<{ threadId: string }> }) {
  const { getPlaygroundRuntimeServices } = await import('@/lib/playground-services');

  const { threadId } = await params;
  const body = (await req.json().catch(() => ({}))) as RunTextTurnRequestDto;

  let started;
  try {
    const { app } = await getPlaygroundRuntimeServices();
    started = await app.turns.startText({
      threadId,
      text: typeof body.text === 'string' ? body.text : '',
      provider: typeof body.provider === 'string' ? body.provider.trim() : undefined,
      model: typeof body.model === 'string' ? body.model.trim() : undefined
    });
  } catch (error) {
    return Response.json(
      {
        error: getRouteErrorMessage(error, 'failed to stream thread turn'),
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
  let writeChain = Promise.resolve<unknown>(undefined);
  let finalRunSnapshot: RunStreamCompletedEventDto['run'] | RunStreamFailedEventDto['run'] = null;
  let terminalEventSent = false;

  const queueSseEvent = (payload: RunStreamEventDto) => {
    writeChain = writeChain.then(() => writeSseEvent(writer, encoder, payload, streamState));
    return writeChain;
  };

  const runId = started.run.id;
  const services = await getPlaygroundRuntimeServices();
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
      await queueSseEvent(readyEvent);

      await services.durableRuntime.runTurn(
        {
          runRepo: services.repos.runRepo,
          messageRepo: services.repos.messageRepo,
          toolRepo: services.repos.toolRepo,
          runEventRepo: services.repos.runEventRepo
        },
        runtimeInput,
        {
          onLiveAssistantUpdate: async (assistantStream) => {
            const assistantRow: RunStreamAssistantEventDto = {
              type: 'run.assistant',
              runId,
              assistant: assistantStream
            };
            await queueSseEvent(assistantRow);
          },
          onPersistedUpdate: async (update) => {
            if (update.run) {
              finalRunSnapshot = toRunDto(update.run);
              const runState: RunStreamStateEventDto = {
                type: 'run.state',
                runId,
                run: toRunDto(update.run) as NonNullable<RunStreamStateEventDto['run']>
              };
              await queueSseEvent(runState);

              if (!terminalEventSent && (update.run.status === 'completed' || update.run.status === 'failed')) {
                terminalEventSent = true;

                if (update.run.status === 'failed') {
                  const failedEvent: RunStreamFailedEventDto = {
                    type: 'run.failed',
                    runId,
                    run: finalRunSnapshot,
                    error: update.run.error ?? 'runtime execution failed'
                  };
                  await queueSseEvent(failedEvent);
                } else {
                  const completedEvent: RunStreamCompletedEventDto = {
                    type: 'run.completed',
                    runId,
                    run: finalRunSnapshot as NonNullable<RunStreamCompletedEventDto['run']>
                  };
                  await queueSseEvent(completedEvent);
                }
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
        await queueSseEvent(failedEvent);
      }
    } finally {
      try {
        await writeChain;
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
