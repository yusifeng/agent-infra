import { NextResponse } from 'next/server';
import type { CloudRunEventRecord } from '@agent-infra/cloud-agent-runtime';

import { requireRouteUser } from '@/lib/route-auth';
import { getCloudRunEventHub } from '@/lib/run-event-hub';
import { getCloudRunForOwner, listCloudRunEventsForOwner } from '@/lib/run-store';

export const runtime = 'nodejs';

type RouteContext = {
  params: Promise<{
    runId: string;
  }>;
};

export async function GET(request: Request, context: RouteContext) {
  const auth = requireRouteUser(request);
  if (auth.response || !auth.user) {
    return auth.response;
  }

  const { runId } = await context.params;
  const url = new URL(request.url);
  if (url.searchParams.get('stream') === 'true' || url.searchParams.get('follow') === 'true') {
    return streamRunEvents({
      ownerUserId: auth.user.id,
      request,
      runId
    });
  }

  const result = await listCloudRunEventsForOwner({
    ownerUserId: auth.user.id,
    runId
  });
  if (!result) {
    return NextResponse.json({ error: 'run not found' }, { status: 404 });
  }

  return NextResponse.json(result);
}

async function streamRunEvents(input: {
  ownerUserId: string;
  request: Request;
  runId: string;
}) {
  const run = await getCloudRunForOwner({
    ownerUserId: input.ownerUserId,
    runId: input.runId
  });
  if (!run) {
    return NextResponse.json({ error: 'run not found' }, { status: 404 });
  }

  const encoder = new TextEncoder();
  const hub = getCloudRunEventHub();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let replayComplete = false;
      let closed = false;
      let lastSeq = 0;
      let pollTimer: ReturnType<typeof setTimeout> | null = null;
      let subscription: { unsubscribe: () => void } | null = null;
      const pendingLiveEvents: CloudRunEventRecord[] = [];

      const close = () => {
        if (closed) {
          return;
        }

        closed = true;
        if (pollTimer) {
          clearTimeout(pollTimer);
          pollTimer = null;
        }
        subscription?.unsubscribe();
        controller.close();
      };
      const send = (event: Record<string, unknown>) => {
        if (!closed) {
          controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
        }
      };
      const sendCloudEvent = (event: CloudRunEventRecord) => {
        if (event.seq <= lastSeq) {
          return;
        }

        lastSeq = event.seq;
        send({
          type: 'cloud_run_event',
          event
        });
      };
      const pollDb = async () => {
        if (closed) {
          return;
        }

        try {
          const result = await listCloudRunEventsForOwner({
            ownerUserId: input.ownerUserId,
            runId: input.runId
          });
          if (!result) {
            send({ type: 'error', error: 'run not found' });
            close();
            return;
          }

          for (const event of result.events) {
            sendCloudEvent(event);
          }

          if (!isActiveRunStatus(result.run.status)) {
            close();
            return;
          }
        } catch (error) {
          send({
            type: 'error',
            error: error instanceof Error ? error.message : String(error)
          });
          close();
          return;
        }

        schedulePoll();
      };
      const schedulePoll = () => {
        if (!closed) {
          pollTimer = setTimeout(() => void pollDb(), readPollMs(input.request));
        }
      };
      subscription = hub.subscribe(input.runId, {
        send(event) {
          if (!replayComplete) {
            pendingLiveEvents.push(event);
            return;
          }

          sendCloudEvent(event);
        },
        close() {
          close();
        }
      });

      input.request.signal.addEventListener('abort', close, { once: true });

      try {
        const result = await listCloudRunEventsForOwner({
          ownerUserId: input.ownerUserId,
          runId: input.runId
        });
        if (!result) {
          send({ type: 'error', error: 'run not found' });
          close();
          return;
        }

        send({
          type: 'run_event_replay_start',
          run: result.run
        });
        for (const event of result.events) {
          sendCloudEvent(event);
        }
        replayComplete = true;
        for (const event of pendingLiveEvents.sort((left, right) => left.seq - right.seq)) {
          sendCloudEvent(event);
        }
        pendingLiveEvents.length = 0;
        send({
          type: 'run_event_replay_end',
          run: result.run,
          lastSeq
        });

        if (isActiveRunStatus(result.run.status)) {
          schedulePoll();
        } else {
          close();
        }
      } catch (error) {
        send({
          type: 'error',
          error: error instanceof Error ? error.message : String(error)
        });
        close();
      }
    }
  });

  return new Response(stream, {
    headers: {
      'cache-control': 'no-cache, no-transform',
      'content-type': 'application/x-ndjson; charset=utf-8'
    }
  });
}

function isActiveRunStatus(status: string): boolean {
  return status === 'queued' || status === 'running';
}

function readPollMs(request: Request): number {
  const url = new URL(request.url);
  const value = Number(url.searchParams.get('pollMs'));
  return Number.isFinite(value) && value >= 250 ? value : 1000;
}
