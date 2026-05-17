import type {
  RunStreamSnapshotEventDto,
  RunStreamEventDto,
  RunStreamFailedEventDto,
  RunStreamReadyEventDto,
  RunTextTurnRequestDto
} from '@agent-infra/contracts';
import type {
  CanonicalThreadMessagesResult,
  StartTextCandidatesResult,
  StartTextTurnResult
} from '@agent-infra/app';

import {
  buildRunAssistantEvent,
  buildRunReadyEvent,
  buildRunStateEvent,
  buildRunTerminalEvent,
  buildRunTextTurnErrorResponse,
  getRouteErrorMessage,
  getRouteErrorStatus,
  parseRunTextTurnInput,
  toRunDto
} from '@agent-infra/durable-chat-server';

import {
  createRuntimeThreadTitleGenerator,
  maybeAutoTitleThread
} from '@/features/thread-title/auto-thread-title';
import { withThreadRunStartLock } from '@/lib/playground-run-start-lock';
import { getPlaygroundRunStreamHub } from '@/lib/playground-run-stream-hub';
import {
  bindRuntimeIfUnset,
  loadAccessibleThread,
  requirePlaygroundUser,
  resolveThreadRuntimeBinding
} from '@/lib/playground-thread-access';

type ThreadTitleUpdatedEventDto = {
  type: 'thread.title_updated';
  threadId: string;
  title: string;
  updatedAt: string;
};

type StreamWritableEventDto = RunStreamEventDto | ThreadTitleUpdatedEventDto;

type StartedStreamRun = {
  candidate?: StartTextCandidatesResult['candidates'][number]['candidate'];
  historyMessages?: CanonicalThreadMessagesResult['messages'];
  run: StartTextTurnResult['run'];
  runtimeSelection: StartTextTurnResult['runtimeSelection'];
  userMessage: StartTextTurnResult['userMessage'];
};

type StartedStreamTurn = {
  runs: StartedStreamRun[];
  runtimeSelection: StartTextTurnResult['runtimeSelection'];
};

type RunStreamState = {
  finalRunCompleted: boolean;
  finalRunSnapshot: RunStreamFailedEventDto['run'];
  streamVersion: number;
  terminalEventSent: boolean;
};

function isDualAnswerRequested(input: ReturnType<typeof parseRunTextTurnInput>) {
  return input.answerMode === 'dual' || input.candidateCount === 2;
}

function isDualAnswerFeatureEnabled() {
  const value = process.env.PLAYGROUND_DUAL_ANSWER_ENABLED?.trim().toLowerCase();
  return value === '1' || value === 'true' || value === 'yes';
}

function buildThreadTitleUpdatedEvent(input: {
  threadId: string;
  title: string;
  updatedAt: string;
}): ThreadTitleUpdatedEventDto {
  return {
    type: 'thread.title_updated',
    threadId: input.threadId,
    title: input.title,
    updatedAt: input.updatedAt
  };
}

function buildStartedRunReadyEvent(started: StartedStreamRun): RunStreamReadyEventDto {
  const event = buildRunReadyEvent({
    run: started.run,
    userMessage: started.userMessage,
    runtimeSelection: started.runtimeSelection
  });

  if (started.candidate) {
    event.triggerMessageId = started.candidate.triggerMessageId;
    event.candidateId = started.candidate.id;
    event.ordinal = started.candidate.ordinal;
    event.kind = started.candidate.kind;
  }

  return event;
}

function encodeStreamSseEvent(payload: StreamWritableEventDto) {
  return `event: ${payload.type}\ndata: ${JSON.stringify(payload)}\n\n`;
}

async function writeSseEvent(
  writer: WritableStreamDefaultWriter<Uint8Array>,
  encoder: TextEncoder,
  payload: StreamWritableEventDto,
  state: { closed: boolean }
) {
  if (state.closed) {
    return false;
  }

  try {
    await writer.write(encoder.encode(encodeStreamSseEvent(payload)));
    return true;
  } catch {
    state.closed = true;
    return false;
  }
}

export async function POST(req: Request, { params }: { params: Promise<{ threadId: string }> }) {
  const { getPlaygroundRuntimeServices, isPlaygroundWebSearchConfigured } = await import('@/lib/playground-services');

  const { threadId } = await params;
  const turnInput = parseRunTextTurnInput((await req.json().catch(() => ({}))) as RunTextTurnRequestDto);
  const auth = await requirePlaygroundUser(req);
  if (auth.response) {
    return auth.response;
  }

  const dualAnswerRequested = isDualAnswerRequested(turnInput);
  if (dualAnswerRequested && !isDualAnswerFeatureEnabled()) {
    return Response.json(
      buildRunTextTurnErrorResponse(
        new Error('Dual-answer streaming is disabled.'),
        'failed to stream thread turn'
      ),
      { status: 403 }
    );
  }

  let started: StartedStreamTurn;
  let services: Awaited<ReturnType<typeof getPlaygroundRuntimeServices>>;
  try {
    if (turnInput.webSearchEnabled && !isPlaygroundWebSearchConfigured()) {
      return Response.json(
        buildRunTextTurnErrorResponse(
          new Error('Web search is unavailable because TAVILY_API_KEY is not configured.'),
          'failed to stream thread turn'
        ),
        { status: 503 }
      );
    }

    services = await getPlaygroundRuntimeServices();
    started = await withThreadRunStartLock(threadId, async () => {
      const { catalogRow } = await loadAccessibleThread(services, threadId, auth.user.id);
      const runtimeBinding = await resolveThreadRuntimeBinding(services, threadId, catalogRow);
      const turnStartInput = {
        threadId,
        text: turnInput.text,
        provider: runtimeBinding?.provider ?? turnInput.provider,
        model: runtimeBinding?.model ?? turnInput.model,
        thinkingEnabled: turnInput.thinkingEnabled,
        reasoningEffort: turnInput.reasoningEffort,
        webSearchEnabled: turnInput.webSearchEnabled
      };

      if (dualAnswerRequested) {
        const queued = await services.app.turns.startTextCandidates({
          ...turnStartInput,
          candidateCount: 2
        });
        let canonicalHistory: CanonicalThreadMessagesResult = {
          messages: [queued.userMessage],
          canonicalRunIds: [],
          diagnostics: []
        };
        try {
          canonicalHistory = await services.app.threads.getCanonicalMessages({
            threadId,
            cutoffMessageId: queued.triggerMessageId
          });
        } catch (error) {
          console.warn('failed to load canonical history after successful startTextCandidates', {
            error,
            threadId,
            triggerMessageId: queued.triggerMessageId,
            runIds: queued.candidates.map((item) => item.run.id)
          });
        }

        try {
          await bindRuntimeIfUnset(services, threadId, queued.runtimeSelection);
        } catch (error) {
          console.warn('failed to persist thread runtime binding after successful startTextCandidates', {
            error,
            threadId,
            runIds: queued.candidates.map((item) => item.run.id)
          });
        }

        return {
          runtimeSelection: queued.runtimeSelection,
          runs: queued.candidates.map((item) => ({
            candidate: item.candidate,
            historyMessages: canonicalHistory.messages,
            run: item.run,
            runtimeSelection: queued.runtimeSelection,
            userMessage: queued.userMessage
          }))
        };
      }

      const queued = await services.app.turns.startText(turnStartInput);

      try {
        await bindRuntimeIfUnset(services, threadId, queued.runtimeSelection);
      } catch (error) {
        console.warn('failed to persist thread runtime binding after successful startText', {
          error,
          threadId,
          runId: queued.run.id
        });
      }

      return {
        runtimeSelection: queued.runtimeSelection,
        runs: [
          {
            run: queued.run,
            runtimeSelection: queued.runtimeSelection,
            userMessage: queued.userMessage
          }
        ]
      };
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
  const runStreamHub = getPlaygroundRunStreamHub();
  const runStates = new Map<string, RunStreamState>();

  req.signal.addEventListener(
    'abort',
    () => {
      streamState.closed = true;
      void writer.abort().catch(() => undefined);
    },
    { once: true }
  );

  const enqueueSseEvent = (payload: StreamWritableEventDto) => {
    writeChain = writeChain.then(() => writeSseEvent(writer, encoder, payload, streamState));
  };

  const getRunState = (runId: string) => {
    let state = runStates.get(runId);
    if (!state) {
      state = {
        finalRunCompleted: false,
        finalRunSnapshot: null,
        streamVersion: 0,
        terminalEventSent: false
      };
      runStates.set(runId, state);
    }
    return state;
  };

  const publishHubEvent = (runId: string, payload: RunStreamEventDto) => {
    const state = getRunState(runId);
    state.streamVersion += 1;
    if (payload.type === 'run.state') {
      runStreamHub.publish(runId, { ...payload, version: state.streamVersion });
      return;
    }

    if (payload.type === 'run.assistant') {
      runStreamHub.publish(runId, { ...payload, version: state.streamVersion });
      return;
    }

    if (payload.type === 'run.completed') {
      runStreamHub.publish(runId, { ...payload, version: state.streamVersion });
      return;
    }

    if (payload.type === 'run.failed') {
      runStreamHub.publish(runId, { ...payload, version: state.streamVersion });
    }
  };

  runStreamHub.cleanup();
  const readyEvents = started.runs.map((startedRun) => {
    const readyEvent = buildStartedRunReadyEvent(startedRun);
    const initialSnapshot: RunStreamSnapshotEventDto = {
      type: 'run.snapshot',
      runId: startedRun.run.id,
      run: readyEvent.run,
      version: getRunState(startedRun.run.id).streamVersion,
      assistant: null
    };
    runStreamHub.openSession(initialSnapshot);
    return readyEvent;
  });

  const executeRun = async (startedRun: StartedStreamRun) => {
    const runId = startedRun.run.id;
    const state = getRunState(runId);
    const runtimeInput = {
      threadId,
      runId,
      provider: startedRun.runtimeSelection.provider,
      model: startedRun.runtimeSelection.model,
      thinkingEnabled: turnInput.thinkingEnabled,
      reasoningEffort: turnInput.reasoningEffort,
      webSearchEnabled: turnInput.webSearchEnabled,
      historyMessages: startedRun.historyMessages
    };

    try {
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
            publishHubEvent(runId, event);
          },
          onPersistedUpdate: (update) => {
            if (update.run) {
              state.finalRunSnapshot = toRunDto(update.run);
              state.finalRunCompleted = update.run.status === 'completed';
              const stateEvent = buildRunStateEvent(runId, update.run);
              enqueueSseEvent(stateEvent);
              publishHubEvent(runId, stateEvent);

              if (!state.terminalEventSent && (update.run.status === 'completed' || update.run.status === 'failed')) {
                state.terminalEventSent = true;
                const terminalEvent = buildRunTerminalEvent(runId, update.run);
                if (terminalEvent) {
                  enqueueSseEvent(terminalEvent);
                  state.streamVersion += 1;
                  runStreamHub.closeSession(runId, {
                    ...terminalEvent,
                    version: state.streamVersion
                  });
                }
              }
            }
          }
        }
      );
    } catch (error) {
      if (!state.terminalEventSent) {
        const failedEvent: RunStreamFailedEventDto = {
          type: 'run.failed',
          runId,
          run: state.finalRunSnapshot,
          error: getRouteErrorMessage(error, 'thread stream failed')
        };
        state.terminalEventSent = true;
        enqueueSseEvent(failedEvent);
        state.streamVersion += 1;
        runStreamHub.closeSession(runId, {
          ...failedEvent,
          version: state.streamVersion
        });
      }
    }
  };

  void (async () => {
    try {
      for (const event of readyEvents) {
        enqueueSseEvent(event);
      }

      await Promise.all(started.runs.map((startedRun) => executeRun(startedRun)));

      const completedRun = started.runs.find((startedRun) => getRunState(startedRun.run.id).finalRunCompleted);
      if (completedRun) {
        const autoTitleResult = await maybeAutoTitleThread({
          services,
          threadId,
          runId: completedRun.run.id,
          generator: createRuntimeThreadTitleGenerator(services.durableRuntime)
        });

        if (autoTitleResult.outcome === 'renamed') {
          enqueueSseEvent(buildThreadTitleUpdatedEvent({
            threadId,
            title: autoTitleResult.title,
            updatedAt: autoTitleResult.updatedAt
          }));
        }
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
