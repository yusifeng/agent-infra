import { describe, expect, it } from 'vitest';

import {
  applyRunAssistantEventToLiveDraft,
  createEmptyLiveDraft,
  liveDraftFromRunSnapshot,
  resolveAssistantStreamChatPhase
} from '../src/runtime/live-assistant-draft';

describe('live assistant draft runtime helpers', () => {
  it('applies assistant deltas and replaces through the shared helper', () => {
    const draft = applyRunAssistantEventToLiveDraft(null, {
      type: 'run.assistant',
      runId: 'run-1',
      assistant: {
        messageId: 'assistant-1',
        kind: 'assistant_delta',
        textDelta: 'hello'
      }
    });

    expect(draft.partialText).toBe('hello');
    expect(draft.eventType).toBe('streaming');

    const replaced = applyRunAssistantEventToLiveDraft(draft, {
      type: 'run.assistant',
      runId: 'run-1',
      assistant: {
        messageId: 'assistant-1',
        kind: 'assistant_replace',
        textSnapshot: 'authoritative'
      }
    });

    expect(replaced.partialText).toBe('authoritative');
    expect(replaced.segments).toHaveLength(1);
  });

  it('replaces the live draft from an attach snapshot', () => {
    const existing = createEmptyLiveDraft('run-1', 'assistant-1');
    const snapshotDraft = liveDraftFromRunSnapshot({
      type: 'run.snapshot',
      runId: 'run-1',
      version: 4,
      run: {
        id: 'run-1',
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
      },
      assistant: {
        liveDraftId: 'assistant-1',
        messageId: 'assistant-1',
        text: 'abcdefg',
        reasoning: null,
        activeTools: [],
        eventType: 'streaming',
        segments: [
          {
            id: 'segment-1',
            messageId: 'assistant-1',
            text: 'abcdefg',
            reasoning: null,
            tools: [],
            eventType: 'streaming'
          }
        ]
      }
    });

    expect(existing.partialText).toBe('');
    expect(snapshotDraft?.partialText).toBe('abcdefg');
    expect(snapshotDraft?.segments).toEqual([
      expect.objectContaining({
        id: 'segment-1',
        text: 'abcdefg'
      })
    ]);
  });

  it('uses a run-derived temporary message id when snapshot messageId is missing', () => {
    const draft = liveDraftFromRunSnapshot({
      type: 'run.snapshot',
      runId: 'run-1',
      version: 1,
      run: {
        id: 'run-1',
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
      },
      assistant: {
        liveDraftId: 'run:run-1',
        messageId: null,
        text: 'partial',
        reasoning: null,
        activeTools: [],
        eventType: 'streaming',
        segments: []
      }
    });

    expect(draft?.messageId).toBe('run:run-1');
    expect(draft?.partialText).toBe('partial');
  });

  it('resolves chat phase for assistant event kinds', () => {
    expect(
      resolveAssistantStreamChatPhase({
        type: 'run.assistant',
        runId: 'run-1',
        assistant: {
          messageId: 'assistant-1',
          kind: 'thinking_delta',
          thinkingDelta: 'reasoning'
        }
      })
    ).toBe('thinking');

    expect(
      resolveAssistantStreamChatPhase({
        type: 'run.assistant',
        runId: 'run-1',
        assistant: {
          messageId: 'assistant-1',
          kind: 'assistant_delta',
          textDelta: 'text'
        }
      })
    ).toBe('streaming');
  });
});
