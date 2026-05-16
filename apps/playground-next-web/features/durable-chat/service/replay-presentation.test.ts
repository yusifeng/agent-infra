import { describe, expect, it } from 'vitest';

import type { MessagePartDto } from '@agent-infra/contracts';

import { buildReplayPresentation } from '@/features/durable-chat/service/replay-presentation';
import type { ReplayCursor, ReplaySession, ReplayStep } from '@/features/durable-chat/types/replay';

function createStep(overrides: Partial<ReplayStep> & Pick<ReplayStep, 'id' | 'kind'>): ReplayStep {
  const base = {
    threadId: 'thread-1',
    runId: 'run-1',
    messageId: 'message-1',
    blockId: 'block-1',
    delayMs: 100,
    occurredAt: null
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

  if (overrides.kind === 'tool-part') {
    const partType = typeof overrides.part?.type === 'string' ? overrides.part.type : 'tool-result';
    return {
      ...base,
      part: {
        id: `${partType}-open-1`,
        messageId: 'tool-message-1',
        partIndex: 0,
        type: partType,
        textValue: null,
        jsonValue: {
          toolName: 'openUrl',
          toolCallId: 'call-open-1',
          ...(partType === 'tool-call'
            ? { input: { url: 'https://example.com/character' } }
            : {
                details: {
                  status: 'success',
                  url: 'https://example.com/character',
                  finalUrl: 'https://example.com/character',
                  title: '速水玲香 - 百度百科',
                  siteName: '百度百科',
                  contentQuality: 'good'
                }
              })
        },
        createdAt: '2026-05-08T00:00:00.000Z'
      } satisfies MessagePartDto,
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
    expect(presentation.answerContainers).toHaveLength(1);
    expect(presentation.answerContainers[0]).toMatchObject({
      runId: 'run-1',
      transcriptBlockIds: ['replay-assistant:text-1', 'replay-assistant:summary-1']
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
    expect(presentation.answerContainers).toHaveLength(1);
    expect(presentation.answerContainers[0]?.transcriptBlockIds).toEqual([
      'replay-assistant:text-1',
      'replay-assistant:summary-1',
      'replay-assistant:loading-2'
    ]);
  });

  it('builds replay tool-part blocks for openUrl render', () => {
    const session = createSession([
      createStep({ id: 'open-1', kind: 'tool-part' }),
      createStep({ id: 'done-1', kind: 'done', runId: null, messageId: null, blockId: null, delayMs: 0 })
    ]);

    const presentation = buildReplayPresentation(session, createCursor({ stepIndex: 0, status: 'playing' }));

    expect(presentation.transcriptBlocks).toHaveLength(1);
    expect(presentation.transcriptBlocks[0]).toMatchObject({
      type: 'assistant-turn',
      items: [{ type: 'tool-part' }]
    });
    expect(presentation.answerContainers[0]?.transcriptBlockIds).toEqual(['replay-assistant:open-1']);
  });

  it('hides openUrl call once the matching result is visible', () => {
    const session = createSession([
      createStep({
        id: 'open-call-1',
        kind: 'tool-part',
        part: {
          id: 'tool-call-open-1',
          messageId: 'tool-message-1',
          partIndex: 0,
          type: 'tool-call',
          textValue: null,
          jsonValue: {
            toolName: 'openUrl',
            toolCallId: 'call-open-1',
            input: { url: 'https://example.com/character' }
          },
          createdAt: '2026-05-08T00:00:00.000Z'
        }
      }),
      createStep({ id: 'open-result-1', kind: 'tool-part' }),
      createStep({ id: 'done-1', kind: 'done', runId: null, messageId: null, blockId: null, delayMs: 0 })
    ]);

    const loadingPresentation = buildReplayPresentation(session, createCursor({ stepIndex: 0, status: 'playing' }));
    expect(loadingPresentation.transcriptBlocks.map((block) => block.id)).toEqual([
      'replay-assistant:open-call-1'
    ]);

    const completedPresentation = buildReplayPresentation(session, createCursor({ stepIndex: 1, status: 'playing' }));
    expect(completedPresentation.transcriptBlocks.map((block) => block.id)).toEqual([
      'replay-assistant:open-result-1'
    ]);
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
      canRestart: false,
      canTogglePlayback: true,
      canPrevious: false,
      canNext: false,
      canInspect: true
    });
    expect(idlePresentation.viewState.progressLabel).toBe('0 / 2');
    expect(idlePresentation.viewState).toMatchObject({
      playbackStepIndex: -1,
      playbackReplayBlockId: null,
      inspectedStepIndex: null,
      inspectedReplayBlockId: null,
      currentStepLabel: '等待开始',
      currentStepKind: null,
      totalDurationLabel: '200ms'
    });

    const pausedPresentation = buildReplayPresentation(session, createCursor({ stepIndex: 0, status: 'paused' }));
    expect(pausedPresentation.controlState).toEqual({
      canPlay: false,
      canPause: false,
      canResume: true,
      canRestart: true,
      canTogglePlayback: true,
      canPrevious: false,
      canNext: true,
      canInspect: true
    });
    expect(pausedPresentation.viewState.progressLabel).toBe('1 / 2');
    expect(pausedPresentation.viewState).toMatchObject({
      playbackStepIndex: 0,
      playbackReplayBlockId: 'replay-user:user-1',
      inspectedStepIndex: null,
      inspectedReplayBlockId: null,
      currentStepLabel: '用户提问',
      currentStepKind: 'text'
    });
    expect(pausedPresentation.viewState.progressSegments).toEqual([
      {
        stepIndex: 0,
        rawStepIndex: 0,
        label: '用户提问',
        kind: 'text',
        tone: 'user',
        weight: 1.2 + 2 / 240,
        durationMs: 100,
        durationLabel: '100ms',
        complete: true,
        playbackActive: true,
        inspected: false
      },
      {
        stepIndex: 1,
        rawStepIndex: 1,
        label: 'AI 回答',
        kind: 'text',
        tone: 'answer',
        weight: 1.8 + 2 / 160,
        durationMs: 100,
        durationLabel: '100ms',
        complete: false,
        playbackActive: false,
        inspected: false
      }
    ]);
  });

  it('tracks inspected segment separately from playback progress', () => {
    const session = createSession([
      createStep({ id: 'user-1', kind: 'text', role: 'user', content: '问题', sourceMessageIds: ['user-1'] }),
      createStep({ id: 'assistant-1', kind: 'text', content: '回答' }),
      createStep({ id: 'done-1', kind: 'done', runId: null, messageId: null, blockId: null, delayMs: 0 })
    ]);

    const presentation = buildReplayPresentation(session, createCursor({ stepIndex: 0, status: 'playing' }), 1);

    expect(presentation.viewState).toMatchObject({
      playbackStepIndex: 0,
      playbackReplayBlockId: 'replay-user:user-1',
      inspectedStepIndex: 1,
      inspectedReplayBlockId: 'replay-assistant:assistant-1'
    });
    expect(presentation.viewState.progressSegments.map((segment) => ({
      playbackActive: segment.playbackActive,
      inspected: segment.inspected
    }))).toEqual([
      { playbackActive: true, inspected: false },
      { playbackActive: false, inspected: true }
    ]);
  });

  it('disables controls when the session only has the terminal step', () => {
    const session = createSession([
      createStep({ id: 'done-1', kind: 'done', runId: null, messageId: null, blockId: null, delayMs: 0 })
    ]);

    const presentation = buildReplayPresentation(session, createCursor());

    expect(presentation.controlState).toEqual({
      canPlay: false,
      canPause: false,
      canResume: false,
      canRestart: false,
      canTogglePlayback: false,
      canPrevious: false,
      canNext: false,
      canInspect: false
    });
    expect(presentation.viewState.progressLabel).toBe('0 / 0');
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

  it('uses source timestamps for total and segment duration labels when available', () => {
    const session = createSession([
      createStep({
        id: 'user-1',
        kind: 'text',
        role: 'user',
        content: '问题',
        sourceMessageIds: ['user-1'],
        occurredAt: '2026-05-08T00:00:00.000Z'
      }),
      createStep({
        id: 'assistant-1',
        kind: 'text',
        content: '回答',
        occurredAt: '2026-05-08T00:00:02.500Z'
      }),
      createStep({ id: 'done-1', kind: 'done', runId: null, messageId: null, blockId: null, delayMs: 0 })
    ]);

    const presentation = buildReplayPresentation(session, createCursor({ stepIndex: 0, status: 'paused' }));

    expect(presentation.viewState.totalDurationLabel).toBe('2.5s');
    expect(presentation.viewState.progressSegments.map((segment) => segment.durationLabel)).toEqual(['2.5s', '100ms']);
  });
});
