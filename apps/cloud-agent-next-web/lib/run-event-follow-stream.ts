import type { CloudRunEventRecord } from '@agent-infra/cloud-agent-runtime';

import { getCloudRunEventHub } from './run-event-hub';
import { getCloudRunForOwner, listCloudRunEventsForOwner } from './run-store';

export interface RunEventFollowStreamController {
  close(): void;
  send(event: Record<string, unknown>): void;
}

export interface RunEventFollowStreamInput {
  closeOnInactive?: boolean;
  onCloudRunEvent(input: {
    controller: RunEventFollowStreamController;
    event: CloudRunEventRecord;
  }): void | Promise<void>;
  onError?: (input: {
    controller: RunEventFollowStreamController;
    error: unknown;
  }) => void | Promise<void>;
  onInactiveRun?: (input: {
    controller: RunEventFollowStreamController;
  }) => void | Promise<void>;
  onMissingRun?: (input: {
    controller: RunEventFollowStreamController;
  }) => void | Promise<void>;
  onOpen?: (controller: RunEventFollowStreamController) => void | Promise<void>;
  onReplayEnd?: (input: {
    controller: RunEventFollowStreamController;
    lastSeq: number;
    run: unknown;
  }) => void | Promise<void>;
  onReplayStart?: (input: {
    controller: RunEventFollowStreamController;
    run: unknown;
  }) => void | Promise<void>;
  ownerUserId: string;
  request: Request;
  runId: string;
}

export async function streamRunEventFollow(input: RunEventFollowStreamInput): Promise<Response> {
  const onMissingRun = input.onMissingRun;
  const run = await getCloudRunForOwner({
    ownerUserId: input.ownerUserId,
    runId: input.runId
  });
  if (!run) {
    if (onMissingRun) {
      return new Response(
        new ReadableStream<Uint8Array>({
          async start(streamController) {
            const encoder = new TextEncoder();
            let closed = false;
            const controller: RunEventFollowStreamController = {
              close() {
                if (!closed) {
                  closed = true;
                  streamController.close();
                }
              },
              send(event) {
                if (!closed) {
                  streamController.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
                }
              }
            };

            try {
              await onMissingRun({ controller });
            } finally {
              controller.close();
            }
          }
        }),
        {
          headers: ndjsonHeaders()
        }
      );
    }

    return new Response(`${JSON.stringify({ type: 'error', error: 'run not found' })}\n`, {
      headers: ndjsonHeaders(),
      status: 404
    });
  }

  const encoder = new TextEncoder();
  const hub = getCloudRunEventHub();
  const stream = new ReadableStream<Uint8Array>({
    async start(streamController) {
      let replayComplete = false;
      let closed = false;
      let lastSeq = 0;
      let pollTimer: ReturnType<typeof setTimeout> | null = null;
      let subscription: { unsubscribe: () => void } | null = null;
      const pendingLiveEvents: CloudRunEventRecord[] = [];
      const controller: RunEventFollowStreamController = {
        close() {
          close();
        },
        send(event) {
          if (!closed) {
            streamController.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
          }
        }
      };

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
        streamController.close();
      };
      const handleError = async (error: unknown) => {
        if (input.onError) {
          await input.onError({ controller, error });
        } else {
          controller.send({
            type: 'error',
            error: error instanceof Error ? error.message : String(error)
          });
        }
        close();
      };
      const sendCloudEvent = async (event: CloudRunEventRecord) => {
        if (event.seq <= lastSeq) {
          return;
        }

        lastSeq = event.seq;
        await input.onCloudRunEvent({ controller, event });
      };
      const handleMissingRun = async () => {
        if (input.onMissingRun) {
          await input.onMissingRun({ controller });
        } else {
          controller.send({ type: 'error', error: 'run not found' });
        }
        close();
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
            await handleMissingRun();
            return;
          }

          for (const event of result.events) {
            await sendCloudEvent(event);
          }

          if (!isActiveRunStatus(result.run.status)) {
            await input.onInactiveRun?.({ controller });
            if (input.closeOnInactive !== false) {
              close();
            }
            return;
          }
        } catch (error) {
          await handleError(error);
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

          void sendCloudEvent(event).catch(handleError);
        },
        close() {
          void (async () => {
            try {
              await input.onInactiveRun?.({ controller });
              if (input.closeOnInactive !== false) {
                close();
              }
            } catch (error) {
              await handleError(error);
            }
          })();
        }
      });

      input.request.signal.addEventListener('abort', close, { once: true });
      try {
        await input.onOpen?.(controller);
        const result = await listCloudRunEventsForOwner({
          ownerUserId: input.ownerUserId,
          runId: input.runId
        });
        if (!result) {
          await handleMissingRun();
          return;
        }

        await input.onReplayStart?.({ controller, run: result.run });
        for (const event of result.events) {
          await sendCloudEvent(event);
        }
        replayComplete = true;
        for (const event of pendingLiveEvents.sort((left, right) => left.seq - right.seq)) {
          await sendCloudEvent(event);
        }
        pendingLiveEvents.length = 0;
        await input.onReplayEnd?.({ controller, lastSeq, run: result.run });

        if (isActiveRunStatus(result.run.status)) {
          schedulePoll();
        } else {
          await input.onInactiveRun?.({ controller });
          if (input.closeOnInactive !== false) {
            close();
          }
        }
      } catch (error) {
        await handleError(error);
      }
    }
  });

  return new Response(stream, {
    headers: ndjsonHeaders()
  });
}

export function ndjsonHeaders(): HeadersInit {
  return {
    'cache-control': 'no-cache, no-transform',
    'content-type': 'application/x-ndjson; charset=utf-8'
  };
}

function isActiveRunStatus(status: string): boolean {
  return status === 'queued' || status === 'running';
}

function readPollMs(request: Request): number {
  const url = new URL(request.url);
  const value = Number(url.searchParams.get('pollMs'));
  return Number.isFinite(value) && value >= 250 ? value : 1000;
}
