import { describe, expect, it } from 'vitest';

import type { RunAttachStreamEventDto, RunDto, RunStreamSnapshotEventDto } from '@agent-infra/contracts';

import { InMemoryRunStreamHub, type RunStreamHubSubscriber } from '../src/run-stream-hub';

function createRun(status: RunDto['status'] = 'running'): RunDto {
  return {
    id: 'run-1',
    threadId: 'thread-1',
    triggerMessageId: null,
    provider: 'openai',
    model: 'gpt-4o-mini',
    status,
    usage: null,
    error: null,
    startedAt: null,
    finishedAt: status === 'running' ? null : '2026-01-01T00:00:01.000Z',
    createdAt: '2026-01-01T00:00:00.000Z'
  };
}

function createSnapshot(version = 0): RunStreamSnapshotEventDto {
  return {
    type: 'run.snapshot',
    runId: 'run-1',
    run: createRun(),
    version,
    assistant: null
  };
}

function createSubscriber(events: RunAttachStreamEventDto[], closed?: { value: boolean }): RunStreamHubSubscriber {
  return {
    send(event) {
      events.push(event);
    },
    close() {
      if (closed) {
        closed.value = true;
      }
    }
  };
}

describe('in-memory run stream hub', () => {
  it('sends snapshot first and updates snapshot from assistant deltas', () => {
    const hub = new InMemoryRunStreamHub();
    const events: RunAttachStreamEventDto[] = [];
    hub.openSession(createSnapshot());

    hub.subscribe('run-1', createSubscriber(events));
    expect(events.map((event) => event.type)).toEqual(['run.snapshot']);

    expect(
      hub.publish('run-1', {
        type: 'run.assistant',
        runId: 'run-1',
        version: 1,
        assistant: {
          messageId: 'assistant-1',
          kind: 'assistant_delta',
          textDelta: 'hello'
        }
      })
    ).toBe(true);

    expect(events.map((event) => event.type)).toEqual(['run.snapshot', 'run.assistant']);
    expect(hub.getSnapshot('run-1')?.assistant).toMatchObject({
      liveDraftId: 'assistant-1',
      messageId: 'assistant-1',
      text: 'hello',
      eventType: 'streaming',
      segments: [
        {
          messageId: 'assistant-1',
          text: 'hello',
          eventType: 'streaming'
        }
      ]
    });
  });

  it('keeps snapshot replacement authoritative and ignores stale versions', () => {
    const hub = new InMemoryRunStreamHub();
    hub.openSession(createSnapshot());

    expect(
      hub.publish('run-1', {
        type: 'run.assistant',
        runId: 'run-1',
        version: 1,
        assistant: {
          messageId: 'assistant-1',
          kind: 'assistant_replace',
          textSnapshot: 'authoritative'
        }
      })
    ).toBe(true);

    expect(
      hub.publish('run-1', {
        type: 'run.assistant',
        runId: 'run-1',
        version: 1,
        assistant: {
          messageId: 'assistant-1',
          kind: 'assistant_delta',
          textDelta: ' stale'
        }
      })
    ).toBe(false);

    const snapshot = hub.getSnapshot('run-1');
    expect(snapshot?.version).toBe(1);
    expect(snapshot?.assistant?.text).toBe('authoritative');
  });

  it('isolates stored snapshots from caller mutations', () => {
    const hub = new InMemoryRunStreamHub();
    const sourceSnapshot = createSnapshot();
    sourceSnapshot.run.status = 'queued';

    hub.openSession(sourceSnapshot);
    sourceSnapshot.run.status = 'failed';

    const storedSnapshot = hub.getSnapshot('run-1');
    expect(storedSnapshot?.run.status).toBe('queued');

    if (storedSnapshot) {
      storedSnapshot.run.status = 'completed';
    }

    expect(hub.getSnapshot('run-1')?.run.status).toBe('queued');
  });

  it('isolates stored tool inputs from caller mutations', () => {
    const hub = new InMemoryRunStreamHub();
    const input = { query: 'before', nested: { limit: 5 } };
    hub.openSession(createSnapshot());

    hub.publish('run-1', {
      type: 'run.assistant',
      runId: 'run-1',
      version: 1,
      assistant: {
        messageId: 'assistant-1',
        kind: 'tool_event',
        toolCallId: 'tool-1',
        toolName: 'searchWeb',
        phase: 'start',
        input
      }
    });

    input.query = 'after';
    input.nested.limit = 10;

    const storedSnapshot = hub.getSnapshot('run-1');
    expect(storedSnapshot?.assistant?.activeTools[0]?.input).toEqual({
      query: 'before',
      nested: { limit: 5 }
    });

    const returnedInput = storedSnapshot?.assistant?.activeTools[0]?.input as
      | { query: string; nested: { limit: number } }
      | undefined;
    if (returnedInput) {
      returnedInput.query = 'mutated';
      returnedInput.nested.limit = 99;
    }

    expect(hub.getSnapshot('run-1')?.assistant?.activeTools[0]?.input).toEqual({
      query: 'before',
      nested: { limit: 5 }
    });
  });

  it('does not lose events published while snapshot is being sent', () => {
    const hub = new InMemoryRunStreamHub();
    const events: RunAttachStreamEventDto[] = [];
    hub.openSession(createSnapshot());

    hub.subscribe('run-1', {
      send(event) {
        events.push(event);
        if (event.type === 'run.snapshot') {
          hub.publish('run-1', {
            type: 'run.assistant',
            runId: 'run-1',
            version: 1,
            assistant: {
              messageId: 'assistant-1',
              kind: 'assistant_delta',
              textDelta: 'during attach'
            }
          });
        }
      }
    });

    expect(events.map((event) => event.type)).toEqual(['run.snapshot', 'run.assistant']);
    expect(hub.getSnapshot('run-1')?.assistant?.text).toBe('during attach');
  });

  it('unsubscribes one subscriber without closing the session', () => {
    const hub = new InMemoryRunStreamHub();
    const firstEvents: RunAttachStreamEventDto[] = [];
    const secondEvents: RunAttachStreamEventDto[] = [];
    hub.openSession(createSnapshot());

    const first = hub.subscribe('run-1', createSubscriber(firstEvents));
    hub.subscribe('run-1', createSubscriber(secondEvents));
    first?.unsubscribe();

    hub.publish('run-1', {
      type: 'run.assistant',
      runId: 'run-1',
      version: 1,
      assistant: {
        messageId: 'assistant-1',
        kind: 'assistant_delta',
        textDelta: 'hello'
      }
    });

    expect(firstEvents.map((event) => event.type)).toEqual(['run.snapshot']);
    expect(secondEvents.map((event) => event.type)).toEqual(['run.snapshot', 'run.assistant']);
    expect(hub.getSnapshot('run-1')?.assistant?.text).toBe('hello');
  });

  it('retains terminal snapshots briefly and removes them after retention', () => {
    let nowMs = 0;
    const hub = new InMemoryRunStreamHub({
      now: () => nowMs,
      closedSessionRetentionMs: 100
    });
    const events: RunAttachStreamEventDto[] = [];
    const closed = { value: false };
    hub.openSession(createSnapshot());
    hub.subscribe('run-1', createSubscriber(events, closed));

    expect(
      hub.closeSession('run-1', {
        type: 'run.completed',
        runId: 'run-1',
        run: createRun('completed'),
        version: 1
      })
    ).toBe(true);

    expect(events.map((event) => event.type)).toEqual(['run.snapshot', 'run.completed']);
    expect(closed.value).toBe(true);
    expect(hub.getSnapshot('run-1')?.run.status).toBe('completed');

    const lateEvents: RunAttachStreamEventDto[] = [];
    const lateClosed = { value: false };
    hub.subscribe('run-1', createSubscriber(lateEvents, lateClosed));
    expect(lateEvents.map((event) => event.type)).toEqual(['run.snapshot']);
    expect(lateClosed.value).toBe(true);

    nowMs = 100;
    expect(hub.cleanup()).toBe(1);
    expect(hub.getSnapshot('run-1')).toBeNull();
  });

  it('cleans up expired running sessions', () => {
    let nowMs = 0;
    const hub = new InMemoryRunStreamHub({
      now: () => nowMs,
      runningSessionMaxAgeMs: 100
    });
    const closed = { value: false };
    hub.openSession(createSnapshot());
    hub.subscribe('run-1', createSubscriber([], closed));

    nowMs = 100;

    expect(hub.cleanup()).toBe(1);
    expect(closed.value).toBe(true);
    expect(hub.getSnapshot('run-1')).toBeNull();
  });
});
