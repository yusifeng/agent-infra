import type { RunDto, RunStreamSnapshotEventDto } from '@agent-infra/contracts';
import { describe, expect, it } from 'vitest';

import { resolveAttachSnapshotChatPhase } from '@/features/durable-chat/runtime/use-attach-stream-orchestration';

function createRun(): RunDto {
  return {
    id: 'run-1',
    threadId: 'thread-1',
    triggerMessageId: null,
    provider: 'deepseek',
    model: 'deepseek-v4-flash',
    status: 'running',
    usage: null,
    error: null,
    startedAt: null,
    finishedAt: null,
    createdAt: '2026-01-01T00:00:00.000Z'
  };
}

function createSnapshot(overrides: Partial<RunStreamSnapshotEventDto> = {}): RunStreamSnapshotEventDto {
  return {
    type: 'run.snapshot',
    runId: 'run-1',
    run: createRun(),
    version: 1,
    assistant: null,
    ...overrides
  };
}

describe('attach stream orchestration helpers', () => {
  it('keeps pre-token snapshots in the thinking phase', () => {
    expect(resolveAttachSnapshotChatPhase(createSnapshot({ assistant: null }))).toBe('thinking');
  });

  it('uses streaming once a snapshot has assistant output', () => {
    expect(
      resolveAttachSnapshotChatPhase(
        createSnapshot({
          assistant: {
            liveDraftId: 'run:run-1',
            messageId: 'assistant-1',
            text: 'Hello',
            reasoning: null,
            activeTools: [],
            eventType: 'streaming',
            segments: []
          }
        })
      )
    ).toBe('streaming');
  });
});
