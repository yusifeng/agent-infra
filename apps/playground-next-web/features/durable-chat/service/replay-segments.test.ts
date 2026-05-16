import { describe, expect, it } from 'vitest';

import { getReplaySegmentTone, getReplaySegmentWeight } from '@/features/durable-chat/service/replay-segments';
import type { ReplayStep } from '@/features/durable-chat/types/replay';

function createTextStep(overrides: Partial<Extract<ReplayStep, { kind: 'text' }>> = {}): Extract<ReplayStep, { kind: 'text' }> {
  return {
    id: 'text-1',
    kind: 'text',
    threadId: 'thread-1',
    runId: 'run-1',
    messageId: 'message-1',
    blockId: 'block-1',
    delayMs: 100,
    occurredAt: null,
    role: 'assistant',
    variant: 'text',
    content: 'answer',
    sourceMessageIds: ['message-1'],
    ...overrides
  };
}

function createSearchLoadingStep(): Extract<ReplayStep, { kind: 'search-loading' }> {
  return {
    id: 'search-1',
    kind: 'search-loading',
    threadId: 'thread-1',
    runId: 'run-1',
    messageId: 'message-1',
    blockId: 'block-1',
    delayMs: 100,
    occurredAt: null,
    toolCallIds: ['call-1'],
    query: 'query',
    sourceNames: []
  };
}

function createSearchSummaryStep(resultCount: number): Extract<ReplayStep, { kind: 'search-summary' }> {
  return {
    id: 'summary-1',
    kind: 'search-summary',
    threadId: 'thread-1',
    runId: 'run-1',
    messageId: 'message-1',
    blockId: 'block-1',
    delayMs: 100,
    occurredAt: null,
    toolCallIds: ['call-1'],
    query: 'query',
    resultCount,
    sourceNames: [],
    sources: []
  };
}

describe('replay segment helpers', () => {
  it('maps replay steps to semantic tones', () => {
    expect(getReplaySegmentTone(createTextStep({ role: 'user' }))).toBe('user');
    expect(getReplaySegmentTone(createTextStep({ role: 'assistant', variant: 'reasoning' }))).toBe('thinking');
    expect(getReplaySegmentTone(createTextStep({ role: 'assistant', variant: 'text' }))).toBe('answer');
    expect(getReplaySegmentTone(createSearchLoadingStep())).toBe('thinking');
  });

  it('weights answer text more strongly while clamping extremes', () => {
    const shortUser = getReplaySegmentWeight(createTextStep({ role: 'user', content: 'hi' }));
    const longUser = getReplaySegmentWeight(createTextStep({ role: 'user', content: 'x'.repeat(1000) }));
    const longAnswer = getReplaySegmentWeight(createTextStep({ role: 'assistant', variant: 'text', content: 'x'.repeat(2000) }));

    expect(shortUser).toBeGreaterThanOrEqual(1.2);
    expect(shortUser).toBeLessThan(1.3);
    expect(longUser).toBe(2.4);
    expect(longAnswer).toBe(8);
    expect(longAnswer).toBeGreaterThan(longUser);
  });

  it('keeps tool-like events compact and grows search summaries modestly', () => {
    expect(getReplaySegmentWeight(createSearchLoadingStep())).toBe(0.9);
    expect(getReplaySegmentWeight(createSearchSummaryStep(0))).toBe(1);
    expect(getReplaySegmentWeight(createSearchSummaryStep(100))).toBe(2.2);
  });
});
