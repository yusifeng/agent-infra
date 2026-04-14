import { describe, expect, it } from 'vitest';

import { normalizeRuntimeMetaResponse, normalizeThreadMessagesResponse, normalizeThreadRunsResponse } from './api';
import { normalizeRunStreamEvent } from './run-stream';
import { normalizeStoredRunId } from './storage';

describe('durable-chat schema', () => {
  it('normalizes storage values to non-empty strings only', () => {
    expect(normalizeStoredRunId(' run-1 ')).toBe('run-1');
    expect(normalizeStoredRunId('   ')).toBeNull();
    expect(normalizeStoredRunId(42)).toBeNull();
  });

  it('filters invalid message and run rows from api responses', () => {
    const messages = normalizeThreadMessagesResponse({
      messages: [
        {
          id: 'message-1',
          threadId: 'thread-1',
          runId: null,
          role: 'assistant',
          seq: 1,
          status: 'completed',
          metadata: null,
          createdAt: '2026-01-01T00:00:00.000Z',
          parts: []
        },
        {
          id: 'broken-message'
        }
      ]
    });

    const runs = normalizeThreadRunsResponse({
      runs: [
        {
          id: 'run-1',
          threadId: 'thread-1',
          triggerMessageId: null,
          provider: 'openai',
          model: 'gpt-4o-mini',
          status: 'completed',
          usage: null,
          error: null,
          startedAt: null,
          finishedAt: null,
          createdAt: '2026-01-01T00:00:00.000Z'
        },
        {
          threadId: 'thread-1'
        }
      ]
    });

    expect(messages.messages).toHaveLength(1);
    expect(runs.runs).toHaveLength(1);
  });

  it('normalizes runtime meta arrays and keeps missing fields optional', () => {
    const meta = normalizeRuntimeMetaResponse({
      runtimeConfigured: true,
      modelOptions: [
        {
          key: 'openai:gpt-4o-mini',
          provider: 'openai',
          model: 'gpt-4o-mini',
          label: 'OpenAI',
          description: 'default'
        },
        {
          key: 'broken'
        }
      ]
    });

    expect(meta.runtimeConfigured).toBe(true);
    expect(meta.modelOptions).toHaveLength(1);
    expect(meta.defaultModelKey).toBeUndefined();
  });

  it('rejects malformed run stream events', () => {
    expect(
      normalizeRunStreamEvent({
        type: 'run.ready',
        runId: 'run-1'
      })
    ).toBeNull();

    expect(
      normalizeRunStreamEvent({
        type: 'run.assistant',
        runId: 'run-1',
        assistant: {
          messageId: 'assistant-1',
          eventType: 'text_delta',
          partialText: 'hello',
          partialReasoning: null
        }
      })
    ).toEqual({
      type: 'run.assistant',
      runId: 'run-1',
      assistant: {
        messageId: 'assistant-1',
        eventType: 'text_delta',
        partialText: 'hello',
        partialReasoning: null
      }
    });
  });
});
