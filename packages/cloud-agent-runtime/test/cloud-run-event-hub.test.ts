import { describe, expect, it } from 'vitest';

import { InMemoryCloudRunEventHub, type CloudRunEventRecord } from '../src/cloud-run-event-hub';

const event: CloudRunEventRecord = {
  id: 'event-1',
  threadId: 'thread-1',
  runId: 'run-1',
  seq: 1,
  type: 'agent_message_delta',
  payload: {
    schemaVersion: 1,
    type: 'agent_message_delta',
    delta: 'hello'
  },
  createdAt: '2026-01-01T00:00:00.000Z'
};

describe('InMemoryCloudRunEventHub', () => {
  it('publishes events to active subscribers and closes a run', () => {
    const hub = new InMemoryCloudRunEventHub();
    const received: CloudRunEventRecord[] = [];
    let closed = false;

    const subscription = hub.subscribe('run-1', {
      send(next) {
        received.push(next);
      },
      close() {
        closed = true;
      }
    });

    expect(hub.publish(event)).toBe(true);
    expect(received).toEqual([event]);
    expect(hub.closeRun('run-1')).toBe(true);
    expect(closed).toBe(true);
    expect(hub.publish({ ...event, id: 'event-2', seq: 2 })).toBe(false);

    subscription.unsubscribe();
  });

  it('removes unsubscribed listeners without closing the run', () => {
    const hub = new InMemoryCloudRunEventHub();
    const received: CloudRunEventRecord[] = [];
    const subscription = hub.subscribe('run-1', {
      send(next) {
        received.push(next);
      }
    });

    subscription.unsubscribe();

    expect(hub.publish(event)).toBe(false);
    expect(received).toEqual([]);
  });
});
