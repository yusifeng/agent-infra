import type {
  RunStreamSnapshotEventDto,
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

import { getPlaygroundRunStreamHub } from '@/lib/playground-run-stream-hub';
import {
  bindRuntimeIfUnset,
  loadAccessibleThread,
  requirePlaygroundUser,
  resolveThreadRuntimeBinding
} from '@/lib/playground-thread-access';

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
  const auth = await requirePlaygroundUser(req);
  if (auth.response) {
    return auth.response;
  }

  let started;
  let services: Awaited<ReturnType<typeof getPlaygroundRuntimeServices>>;
  try {
    services = await getPlaygroundRuntimeServices();
    const { catalogRow } = await loadAccessibleThread(services, threadId, auth.user.id);
    const runtimeBinding = await resolveThreadRuntimeBinding(services, threadId, catalogRow);
    started = await services.app.turns.startText({
      threadId,
      text: turnInput.text,
      provider: runtimeBinding?.provider ?? turnInput.provider,
      model: runtimeBinding?.model ?? turnInput.model,
      thinkingEnabled: turnInput.thinkingEnabled,
      reasoningEffort: turnInput.reasoningEffort
    });
    await bindRuntimeIfUnset(services, threadId, started.runtimeSelection);
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
  let streamVersion = 0;
  const runStreamHub = getPlaygroundRunStreamHub();

  const enqueueSseEvent = (payload: RunStreamEventDto) => {
    writeChain = writeChain.then(() => writeSseEvent(writer, encoder, payload, streamState));
  };

  const publishHubEvent = (payload: RunStreamEventDto) => {
    streamVersion += 1;
    if (payload.type === 'run.state') {
      runStreamHub.publish(runId, { ...payload, version: streamVersion });
      return;
    }

    if (payload.type === 'run.assistant') {
      runStreamHub.publish(runId, { ...payload, version: streamVersion });
      return;
    }

    if (payload.type === 'run.completed') {
      runStreamHub.publish(runId, { ...payload, version: streamVersion });
      return;
    }

    if (payload.type === 'run.failed') {
      runStreamHub.publish(runId, { ...payload, version: streamVersion });
    }
  };

  const runId = started.run.id;
  const readyEvent = buildRunReadyEvent(started);
  const initialSnapshot: RunStreamSnapshotEventDto = {
    type: 'run.snapshot',
    runId,
    run: readyEvent.run,
    version: streamVersion,
    assistant: null
  };
  runStreamHub.cleanup();
  runStreamHub.openSession(initialSnapshot);

  const runtimeInput = {
    threadId,
    runId,
    provider: started.runtimeSelection.provider,
    model: started.runtimeSelection.model,
    thinkingEnabled: turnInput.thinkingEnabled,
    reasoningEffort: turnInput.reasoningEffort
  };

  void (async () => {
    try {
      enqueueSseEvent(readyEvent);

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
            const event = buildRunAssistantEvent(runId, assistantStream);
            enqueueSseEvent(event);
            publishHubEvent(event);
          },
          onPersistedUpdate: (update) => {
            if (update.run) {
              finalRunSnapshot = toRunDto(update.run);
              const stateEvent = buildRunStateEvent(runId, update.run);
              enqueueSseEvent(stateEvent);
              publishHubEvent(stateEvent);

              if (!terminalEventSent && (update.run.status === 'completed' || update.run.status === 'failed')) {
                terminalEventSent = true;
                const terminalEvent = buildRunTerminalEvent(runId, update.run);
                if (terminalEvent) {
                  enqueueSseEvent(terminalEvent);
                  streamVersion += 1;
                  runStreamHub.closeSession(runId, {
                    ...terminalEvent,
                    version: streamVersion
                  });
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
        streamVersion += 1;
        runStreamHub.closeSession(runId, {
          ...failedEvent,
          version: streamVersion
        });
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
