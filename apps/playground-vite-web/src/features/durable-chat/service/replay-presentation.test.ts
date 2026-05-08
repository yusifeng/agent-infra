import { describe, expect, it } from 'vitest';

import { buildReplayPresentation } from '@/features/durable-chat/service/replay-presentation';
import type { ReplayCursor, ReplaySession, ReplayStep } from '@/features/durable-chat/types/replay';

function createStep(overrides: Partial<ReplayStep> & Pick<ReplayStep, 'id' | 'kind'>): ReplayStep {
  const base = {
    threadId: 'thread-1',
    runId: 'run-1',
    messageId: 'message-1',
    blockId: 'block-1',
    delayMs: 100
  };

  if (overrides.kind === 'text') {
    return {
      ...base,
      role: 'assistant',
      variant: 'text',
      content: 'hello',
      sourceMessageIds: ['message-1'],
      ...overrides
    };
  }

  if (overrides.kind === 'search-loading') {
    return {
      ...base,
      toolCallIds: ['call-1'],
      query: 'Claude latest news',
      sourceNames: [],
      ...overrides
    };
  }

  if (overrides.kind === 'search-summary') {
    return {
      ...base,
      toolCallIds: ['call-1'],
      query: 'Claude latest news',
      resultCount: 10,
      sourceNames: ['The Verge'],
      sources: [{ sourceName: 'The Verge', hostname: 'theverge.com' }],
      ...overrides
    };
  }

  return {
    ...base,
    ...overrides
  };
}

function createSession(steps: ReplayStep[]): ReplaySession {
  return {
    id: `replay:${steps.map((step) => step.id).join('|')}`,
    threadId: 'thread-1',
    mode: 'thread',
    steps,
    initialTranscriptBlocks: [],
    startedAt: null
  };
}

function createCursor(overrides: Partial<ReplayCursor> = {}): ReplayCursor {
  return {
    stepIndex: -1,
    status: 'idle',
    startedAtMs: null,
    lastAdvancedAtMs: null,
    ...overrides
  };
}

describe('buildReplayPresentation', () => {
  it('builds transcript blocks from visible replay steps only', () => {
    const session = createSession([
      createStep({ id: 'text-1', kind: 'text', content: '第一段' }),
      createStep({ id: 'loading-1', kind: 'search-loading' }),
      createStep({ id: 'summary-1', kind: 'search-summary' }),
      createStep({ id: 'done-1', kind: 'done', runId: null, messageId: null, blockId: null, delayMs: 0 })
    ]);

    const presentation = buildReplayPresentation(session, createCursor({ stepIndex: 2, status: 'playing' }));

    expect(presentation.transcriptBlocks.map((block) => block.type)).toEqual([
      'assistant-turn',
      'assistant-turn'
    ]);
    expect(presentation.transcriptBlocks[0]).toMatchObject({
      type: 'assistant-turn',
      items: [{ type: 'text' }]
    });
    expect(presentation.transcriptBlocks[1]).toMatchObject({
      type: 'assistant-turn',
      items: [{ type: 'search-summary' }]
    });
  });

  it('hides completed search loading nodes once the matching summary is visible', () => {
    const session = createSession([
      createStep({ id: 'text-1', kind: 'text', content: '第一段' }),
      createStep({ id: 'loading-1', kind: 'search-loading', toolCallIds: ['call-1'], query: 'query 1' }),
      createStep({ id: 'summary-1', kind: 'search-summary', toolCallIds: ['call-1'], query: 'query 1' }),
      createStep({ id: 'loading-2', kind: 'search-loading', toolCallIds: ['call-2'], query: 'query 2' }),
      createStep({ id: 'done-1', kind: 'done', runId: null, messageId: null, blockId: null, delayMs: 0 })
    ]);

    const presentation = buildReplayPresentation(session, createCursor({ stepIndex: 3, status: 'playing' }));

    expect(presentation.transcriptBlocks).toHaveLength(3);
    expect(presentation.transcriptBlocks[0]).toMatchObject({
      type: 'assistant-turn',
      items: [{ type: 'text' }]
    });
    expect(presentation.transcriptBlocks[1]).toMatchObject({
      type: 'assistant-turn',
      items: [{ type: 'search-summary' }]
    });
    expect(presentation.transcriptBlocks[2]).toMatchObject({
      type: 'assistant-turn',
      items: [{ type: 'search-status' }]
    });
  });

  it('derives control state and progress from the cursor', () => {
    const session = createSession([
      createStep({ id: 'user-1', kind: 'text', role: 'user', content: '问题', sourceMessageIds: ['user-1'] }),
      createStep({ id: 'assistant-1', kind: 'text', content: '回答' }),
      createStep({ id: 'done-1', kind: 'done', runId: null, messageId: null, blockId: null, delayMs: 0 })
    ]);

    const idlePresentation = buildReplayPresentation(session, createCursor());
    expect(idlePresentation.controlState).toEqual({
      canPlay: true,
      canPause: false,
      canResume: false,
      canRestart: false
    });
    expect(idlePresentation.viewState.progressLabel).toBe('0 / 2');

    const pausedPresentation = buildReplayPresentation(session, createCursor({ stepIndex: 0, status: 'paused' }));
    expect(pausedPresentation.controlState).toEqual({
      canPlay: false,
      canPause: false,
      canResume: true,
      canRestart: true
    });
    expect(pausedPresentation.viewState.progressLabel).toBe('1 / 2');
  });

  it('keeps replay progress aligned with consumed steps after hiding completed search loading nodes', () => {
    const session = createSession([
      createStep({ id: 'text-1', kind: 'text', content: '第一段' }),
      createStep({ id: 'loading-1', kind: 'search-loading', toolCallIds: ['call-1'], query: 'query 1' }),
      createStep({ id: 'summary-1', kind: 'search-summary', toolCallIds: ['call-1'], query: 'query 1' }),
      createStep({ id: 'done-1', kind: 'done', runId: null, messageId: null, blockId: null, delayMs: 0 })
    ]);

    const completedPresentation = buildReplayPresentation(session, createCursor({ stepIndex: 2, status: 'completed' }));

    expect(completedPresentation.viewState.currentStepIndex).toBe(3);
    expect(completedPresentation.viewState.progressLabel).toBe('3 / 3');
  });
});
