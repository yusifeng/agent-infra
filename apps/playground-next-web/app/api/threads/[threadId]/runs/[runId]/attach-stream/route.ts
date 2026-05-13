import type {
  RunDto,
  RunAttachStreamEventDto,
  RunAttachStreamUnavailableReasonDto
} from '@agent-infra/contracts';
import {
  buildRunTextTurnErrorResponse,
  getRouteErrorStatus,
  toRunDto
} from '@agent-infra/durable-chat-server';

import { getPlaygroundRunStreamHub } from '@/lib/playground-run-stream-hub';
import {
  loadAccessibleThread,
  requirePlaygroundUser
} from '@/lib/playground-thread-access';

function encodeAttachSseEvent(payload: RunAttachStreamEventDto) {
  return `event: ${payload.type}\ndata: ${JSON.stringify(payload)}\n\n`;
}

async function writeAttachEvent(
  writer: WritableStreamDefaultWriter<Uint8Array>,
  encoder: TextEncoder,
  payload: RunAttachStreamEventDto,
  state: { closed: boolean }
) {
  if (state.closed) {
    return false;
  }

  try {
    await writer.write(encoder.encode(encodeAttachSseEvent(payload)));
    return true;
  } catch {
    state.closed = true;
    return false;
  }
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ threadId: string; runId: string }> }
) {
  const { getPlaygroundAppServices } = await import('@/lib/playground-app-services');
  const { threadId, runId } = await params;
  const auth = await requirePlaygroundUser(request);
  if (auth.response) {
    return auth.response;
  }

  let services: Awaited<ReturnType<typeof getPlaygroundAppServices>>;
  try {
    services = await getPlaygroundAppServices();
    await loadAccessibleThread(services, threadId, auth.user.id);
  } catch (error) {
    return Response.json(buildRunTextTurnErrorResponse(error, 'failed to attach run stream'), {
      status: getRouteErrorStatus(error)
    });
  }

  const stream = new TransformStream<Uint8Array, Uint8Array>();
  const writer = stream.writable.getWriter();
  const encoder = new TextEncoder();
  const streamState = { closed: false };
  const runStreamHub = getPlaygroundRunStreamHub();
  let writeChain = Promise.resolve<unknown>(undefined);
  let subscription: { unsubscribe(): void } | null = null;
  let closeQueued = false;

  const enqueue = (event: RunAttachStreamEventDto) => {
    writeChain = writeChain.then(() => writeAttachEvent(writer, encoder, event, streamState));
  };

  const close = () => {
    if (closeQueued) {
      return;
    }

    closeQueued = true;
    writeChain = writeChain
      .then(async () => {
        if (!streamState.closed) {
          streamState.closed = true;
          await writer.close();
        }
      })
      .catch(() => undefined);
  };

  const sendUnavailable = (
    reason: RunAttachStreamUnavailableReasonDto,
    input: { run?: RunDto | null; message?: string | null } = {}
  ) => {
    enqueue({
      type: 'run.attach_unavailable',
      runId,
      reason,
      run: input.run,
      message: input.message
    });
    close();
  };

  request.signal.addEventListener(
    'abort',
    () => {
      subscription?.unsubscribe();
      close();
    },
    { once: true }
  );

  void (async () => {
    try {
      const run = await services.repos.runRepo.findById(runId);
      if (!run) {
        sendUnavailable('run_not_found');
        return;
      }

      const runDto = toRunDto(run);
      if (run.threadId !== threadId) {
        try {
          await loadAccessibleThread(services, run.threadId, auth.user.id);
        } catch {
          sendUnavailable('run_not_found');
          return;
        }

        sendUnavailable('thread_run_mismatch', {
          run: runDto,
          message: 'run does not belong to the requested thread'
        });
        return;
      }

      const snapshot = runStreamHub.getSnapshot(runId);
      if (!snapshot) {
        sendUnavailable(run.status === 'queued' || run.status === 'running' ? 'stream_session_gone' : 'run_not_active', {
          run: runDto
        });
        return;
      }

      subscription = runStreamHub.subscribe(runId, {
        send: enqueue,
        close
      });

      if (!subscription) {
        sendUnavailable('stream_session_gone', {
          run: runDto
        });
      }
    } catch {
      sendUnavailable('stream_session_gone');
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
