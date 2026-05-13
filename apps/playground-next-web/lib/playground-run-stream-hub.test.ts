import { describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';

import type { RunDto, RunStreamSnapshotEventDto } from '@agent-infra/contracts';

import { getPlaygroundRunStreamHub } from './playground-run-stream-hub';

function createRun(runId: string): RunDto {
  return {
    id: runId,
    threadId: 'thread-1',
    triggerMessageId: null,
    provider: 'openai',
    model: 'gpt-4o-mini',
    status: 'running',
    usage: null,
    error: null,
    startedAt: null,
    finishedAt: null,
    createdAt: '2026-01-01T00:00:00.000Z'
  };
}

function createSnapshot(runId: string): RunStreamSnapshotEventDto {
  return {
    type: 'run.snapshot',
    runId,
    run: createRun(runId),
    version: 0,
    assistant: null
  };
}

describe('playground run stream hub singleton', () => {
  it('keeps process-local sessions available across imports', () => {
    const runId = `run-${randomUUID()}`;
    const first = getPlaygroundRunStreamHub();
    const second = getPlaygroundRunStreamHub();

    first.openSession(createSnapshot(runId));

    expect(second.getSnapshot(runId)?.runId).toBe(runId);
  });
});
