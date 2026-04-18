import type {
  RunStreamEventDto,
  RunStreamFailedEventDto,
  RunTextTurnRequestDto
} from '@agent-infra/contracts';

import {
  buildRunAssistantEvent,
  buildRunReadyEvent,
  buildRunStateEvent,
  buildRunTerminalEvent,
  buildRunTextTurnErrorResponse,
  encodeSseEvent,
  getRouteErrorMessage,
  getRouteErrorStatus,
  parseRunTextTurnInput,
  toRunDto
} from '@agent-infra/durable-chat-server';

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
  const turnInput = parseRunTextTurnInput((await req.json().catch(() => ({}))) as RunTextTurnRequestDto);

  let started;
  try {
    const { app } = await getPlaygroundRuntimeServices();
    started = await app.turns.startText({
      threadId,
      text: turnInput.text,
      provider: turnInput.provider,
      model: turnInput.model
    });
  } catch (error) {
    return Response.json(buildRunTextTurnErrorResponse(error, 'failed to stream thread turn'), {
      status: getRouteErrorStatus(error)
    });
  }

  const stream = new TransformStream<Uint8Array, Uint8Array>();
  const writer = stream.writable.getWriter();
  const encoder = new TextEncoder();
  const streamState = { closed: false };
  let writeChain = Promise.resolve<unknown>(undefined);
  let finalRunSnapshot: RunStreamFailedEventDto['run'] = null;
  let terminalEventSent = false;

  const enqueueSseEvent = (payload: RunStreamEventDto) => {
    writeChain = writeChain.then(() => writeSseEvent(writer, encoder, payload, streamState));
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
      enqueueSseEvent(buildRunReadyEvent(started));

      await services.durableRuntime.runTurn(
        {
          runRepo: services.repos.runRepo,
          messageRepo: services.repos.messageRepo,
          toolRepo: services.repos.toolRepo,
          runEventRepo: services.repos.runEventRepo
        },
        runtimeInput,
        {
          onLiveAssistantUpdate: (assistantStream) => {
            enqueueSseEvent(buildRunAssistantEvent(runId, assistantStream));
          },
          onPersistedUpdate: (update) => {
            if (update.run) {
              finalRunSnapshot = toRunDto(update.run);
              enqueueSseEvent(buildRunStateEvent(runId, update.run));

              if (!terminalEventSent && (update.run.status === 'completed' || update.run.status === 'failed')) {
                terminalEventSent = true;
                const terminalEvent = buildRunTerminalEvent(runId, update.run);
                if (terminalEvent) {
                  enqueueSseEvent(terminalEvent);
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
        enqueueSseEvent(failedEvent);
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
