import { describe, expect, it } from 'vitest';

import {
  normalizeRunTraceResponse,
  normalizeRunTimelineResponse,
  normalizeRuntimeMetaResponse,
  normalizeThreadMessagesResponse,
  normalizeThreadRunsResponse
} from '../src/schema/api';
import { normalizeRunAttachStreamEvent, normalizeRunStreamEvent } from '../src/schema/run-stream';
import { normalizeStoredRunId } from '../src/schema/storage';

describe('durable-chat-client schema', () => {
  it('normalizes storage values to non-empty strings only', () => {
    expect(normalizeStoredRunId(' run-1 ')).toBe('run-1');
    expect(normalizeStoredRunId('   ')).toBeNull();
    expect(normalizeStoredRunId(42)).toBeNull();
  });

  it('filters invalid message and run rows from api responses', () => {
    const usage = {
      schemaVersion: 1,
      normalizationStatus: 'complete',
      tokens: {
        input: 12,
        output: 8,
        total: 20
      },
      rawProviderUsage: {
        assistantMessages: [{ input: 12, output: 8, totalTokens: 20 }]
      }
    };
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
      ],
      pageInfo: {
        hasOlder: true,
        hasNewer: false,
        startCursor: 'cursor-1',
        endCursor: 'cursor-2'
      },
      activeRun: {
        id: 'run-active',
        threadId: 'thread-1',
        triggerMessageId: null,
        provider: 'openai',
        model: 'gpt-4o-mini',
        status: 'running',
        usage,
        error: null,
        startedAt: null,
        finishedAt: null,
        createdAt: '2026-01-01T00:00:00.000Z'
      }
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
          usage,
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
    expect(messages.pageInfo).toEqual({
      hasOlder: true,
      hasNewer: false,
      startCursor: 'cursor-1',
      endCursor: 'cursor-2'
    });
    expect(messages.activeRun?.id).toBe('run-active');
    expect(messages.activeRun?.usage).toEqual(usage);
    expect(runs.runs).toHaveLength(1);
    expect(runs.runs[0]?.usage).toEqual(usage);
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

  it('normalizes run timeline projection while preserving raw events', () => {
    const timeline = normalizeRunTimelineResponse({
      run: {
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
      runEvents: [
        {
          id: 'event-1',
          threadId: 'thread-1',
          runId: 'run-1',
          seq: 1,
          type: 'agent_start',
          payload: { provider: 'openai' },
          createdAt: '2026-01-01T00:00:00.000Z'
        }
      ],
      toolInvocations: [],
      projection: {
        schemaVersion: 1,
        items: [
          {
            kind: 'run_lifecycle',
            phase: 'started',
            runEventId: 'event-1',
            seq: 1
          },
          {
            kind: 'unknown_event',
            type: 'custom_event',
            runEventId: 'event-2',
            seq: 2
          },
          {
            kind: 'run_lifecycle',
            phase: 'cancelled',
            runEventId: 'event-cancelled',
            seq: 3
          },
          {
            kind: 'tool_invocation',
            phase: 'started',
            toolCallId: 'call-1',
            toolName: 'searchWeb',
            toolInvocationId: null,
            runEventId: 'event-3',
            seq: 4
          },
          {
            kind: 'broken'
          }
        ]
      }
    });

    expect(timeline.runEvents).toHaveLength(1);
    expect(timeline.projection).toEqual({
      schemaVersion: 1,
      items: [
        {
          kind: 'run_lifecycle',
          phase: 'started',
          runEventId: 'event-1',
          seq: 1
        },
        {
          kind: 'unknown_event',
          type: 'custom_event',
          runEventId: 'event-2',
          seq: 2
        },
        {
          kind: 'run_lifecycle',
          phase: 'cancelled',
          runEventId: 'event-cancelled',
          seq: 3
        },
        {
          kind: 'tool_invocation',
          phase: 'started',
          toolCallId: 'call-1',
          toolName: 'searchWeb',
          toolInvocationId: null,
          runEventId: 'event-3',
          seq: 4
        }
      ]
    });
  });

  it('normalizes run trace projections and filters invalid span details safely', () => {
    const trace = normalizeRunTraceResponse({
      run: {
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
      projection: {
        schemaVersion: 1,
        traceId: 'run-1',
        rootSpanId: 'span:run:run-1',
        appId: 'playground-runtime-pi',
        threadId: 'thread-1',
        runId: 'run-1',
        status: 'completed',
        startedAt: null,
        finishedAt: null,
        durationMs: null,
        spans: [
          {
            schemaVersion: 1,
            id: 'span:run:run-1',
            traceId: 'run-1',
            parentSpanId: null,
            kind: 'agent',
            name: 'agent',
            status: 'completed',
            appId: 'playground-runtime-pi',
            threadId: 'thread-1',
            runId: 'run-1',
            order: 0,
            startedAt: null,
            finishedAt: null,
            durationMs: null,
            provider: 'openai',
            model: 'gpt-4o-mini',
            usageRef: { source: 'run.usage', runId: 'run-1' },
            tool: null,
            error: null,
            sourceRefs: [{ type: 'run', id: 'run-1' }],
            metadata: { promptKey: 'support-v1' }
          },
          {
            schemaVersion: 1,
            id: 'span:event:event-unknown',
            traceId: 'run-1',
            parentSpanId: 'span:run:run-1',
            kind: 'unknown_event',
            name: 'custom_event',
            status: 'unknown',
            appId: 'playground-runtime-pi',
            threadId: 'thread-1',
            runId: 'run-1',
            order: 1,
            startedAt: '2026-01-01T00:00:01.000Z',
            finishedAt: '2026-01-01T00:00:01.000Z',
            durationMs: 0,
            provider: null,
            model: null,
            usageRef: null,
            tool: {
              toolInvocationId: null,
              toolCallId: 'call-1',
              toolName: 'searchWeb'
            },
            error: { message: 'ignored by unknown span consumers' },
            sourceRefs: [
              { type: 'run_event', id: 'event-unknown', seq: 2, eventType: 'custom_event' },
              { type: 'broken_source' }
            ],
            metadata: null
          },
          {
            id: 'broken-span'
          }
        ],
        diagnostics: {
          unknownEventCount: 1,
          orphanEventCount: 0,
          warnings: [
            {
              code: 'unknown_event',
              message: 'unknown run event type: custom_event',
              sourceRefs: [
                { type: 'run_event', id: 'event-unknown', seq: 2, eventType: 'custom_event' },
                { type: 'broken_source' }
              ]
            },
            {
              code: 'future_code',
              message: 'not yet known',
              sourceRefs: []
            }
          ]
        }
      }
    });

    expect(trace.run?.id).toBe('run-1');
    expect(trace.projection).toEqual({
      schemaVersion: 1,
      traceId: 'run-1',
      rootSpanId: 'span:run:run-1',
      appId: 'playground-runtime-pi',
      threadId: 'thread-1',
      runId: 'run-1',
      status: 'completed',
      startedAt: null,
      finishedAt: null,
      durationMs: null,
      spans: [
        {
          schemaVersion: 1,
          id: 'span:run:run-1',
          traceId: 'run-1',
          parentSpanId: null,
          kind: 'agent',
          name: 'agent',
          status: 'completed',
          appId: 'playground-runtime-pi',
          threadId: 'thread-1',
          runId: 'run-1',
          order: 0,
          startedAt: null,
          finishedAt: null,
          durationMs: null,
          provider: 'openai',
          model: 'gpt-4o-mini',
          usageRef: { source: 'run.usage', runId: 'run-1' },
          tool: null,
          error: null,
          sourceRefs: [{ type: 'run', id: 'run-1' }],
          metadata: { promptKey: 'support-v1' }
        },
        {
          schemaVersion: 1,
          id: 'span:event:event-unknown',
          traceId: 'run-1',
          parentSpanId: 'span:run:run-1',
          kind: 'unknown_event',
          name: 'custom_event',
          status: 'unknown',
          appId: 'playground-runtime-pi',
          threadId: 'thread-1',
          runId: 'run-1',
          order: 1,
          startedAt: '2026-01-01T00:00:01.000Z',
          finishedAt: '2026-01-01T00:00:01.000Z',
          durationMs: 0,
          provider: null,
          model: null,
          usageRef: null,
          tool: {
            toolInvocationId: null,
            toolCallId: 'call-1',
            toolName: 'searchWeb'
          },
          error: { message: 'ignored by unknown span consumers' },
          sourceRefs: [{ type: 'run_event', id: 'event-unknown', seq: 2, eventType: 'custom_event' }],
          metadata: null
        }
      ],
      diagnostics: {
        unknownEventCount: 1,
        orphanEventCount: 0,
        warnings: [
          {
            code: 'unknown_event',
            message: 'unknown run event type: custom_event',
            sourceRefs: [{ type: 'run_event', id: 'event-unknown', seq: 2, eventType: 'custom_event' }]
          }
        ]
      }
    });
  });

  it('normalizes invalid run trace projections to null', () => {
    const run = {
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
    };

    expect(
      normalizeRunTraceResponse({
        run,
        projection: {
          schemaVersion: 2,
          spans: []
        }
      }).projection
    ).toBeNull();

    expect(
      normalizeRunTraceResponse({
        run,
        projection: {
          schemaVersion: 1,
          traceId: 'run-1',
          rootSpanId: 'span:run:missing',
          appId: 'playground-runtime-pi',
          threadId: 'thread-1',
          runId: 'run-1',
          status: 'completed',
          startedAt: null,
          finishedAt: null,
          durationMs: null,
          spans: [
            {
              schemaVersion: 1,
              id: 'span:run:run-1',
              traceId: 'run-1',
              parentSpanId: null,
              kind: 'agent',
              name: 'agent',
              status: 'completed',
              appId: 'playground-runtime-pi',
              threadId: 'thread-1',
              runId: 'run-1',
              order: 0,
              startedAt: null,
              finishedAt: null,
              durationMs: null,
              sourceRefs: [{ type: 'run', id: 'run-1' }]
            }
          ],
          diagnostics: {
            unknownEventCount: 0,
            orphanEventCount: 0,
            warnings: []
          }
        }
      }).projection
    ).toBeNull();
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
          kind: 'assistant_delta',
          textDelta: 'hello'
        }
      })
    ).toEqual({
      type: 'run.assistant',
      runId: 'run-1',
      assistant: {
        messageId: 'assistant-1',
        kind: 'assistant_delta',
        textDelta: 'hello'
      }
    });

    expect(
      normalizeRunStreamEvent({
        type: 'run.assistant',
        runId: 'run-1',
        assistant: {
          messageId: 'assistant-1',
          kind: 'assistant_replace',
          textSnapshot: 'hello world'
        }
      })
    ).toEqual({
      type: 'run.assistant',
      runId: 'run-1',
      assistant: {
        messageId: 'assistant-1',
        kind: 'assistant_replace',
        textSnapshot: 'hello world'
      }
    });

    expect(
      normalizeRunStreamEvent({
        type: 'run.assistant',
        runId: 'run-1',
        assistant: {
          messageId: 'assistant-1',
          kind: 'tool_event',
          toolCallId: 'call-1',
          toolName: 'searchWeb',
          phase: 'unexpected'
        }
      })
    ).toBeNull();
  });

  it('normalizes attach stream snapshot and versioned events', () => {
    const run = {
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
    };

    expect(
      normalizeRunAttachStreamEvent({
        type: 'run.snapshot',
        runId: 'run-1',
        run,
        version: 3,
        assistant: {
          liveDraftId: 'assistant-1',
          messageId: 'assistant-1',
          text: 'hello',
          reasoning: null,
          activeTools: [],
          eventType: 'streaming',
          segments: [
            {
              id: 'segment-1',
              messageId: 'assistant-1',
              text: 'hello',
              reasoning: null,
              tools: [],
              eventType: 'streaming'
            }
          ]
        }
      })
    ).toMatchObject({
      type: 'run.snapshot',
      runId: 'run-1',
      version: 3,
      assistant: {
        liveDraftId: 'assistant-1',
        text: 'hello'
      }
    });

    expect(
      normalizeRunAttachStreamEvent({
        type: 'run.assistant',
        runId: 'run-1',
        version: 4,
        assistant: {
          messageId: 'assistant-1',
          kind: 'assistant_delta',
          textDelta: ' world'
        }
      })
    ).toEqual({
      type: 'run.assistant',
      runId: 'run-1',
      version: 4,
      assistant: {
        messageId: 'assistant-1',
        kind: 'assistant_delta',
        textDelta: ' world'
      }
    });

    expect(
      normalizeRunAttachStreamEvent({
        type: 'run.assistant',
        runId: 'run-1',
        assistant: {
          messageId: 'assistant-1',
          kind: 'assistant_delta',
          textDelta: 'missing version'
        }
      })
    ).toBeNull();
  });

  it('normalizes attach stream unavailable reasons', () => {
    expect(
      normalizeRunAttachStreamEvent({
        type: 'run.attach_unavailable',
        runId: 'run-1',
        reason: 'stream_session_gone',
        message: 'session expired'
      })
    ).toEqual({
      type: 'run.attach_unavailable',
      runId: 'run-1',
      reason: 'stream_session_gone',
      run: undefined,
      message: 'session expired'
    });

    expect(
      normalizeRunAttachStreamEvent({
        type: 'run.attach_unavailable',
        runId: 'run-1',
        reason: 'unknown'
      })
    ).toBeNull();

    expect(
      normalizeRunAttachStreamEvent({
        type: 'run.attach_unavailable',
        runId: 'run-1',
        reason: 'stream_session_gone',
        run: { id: 'run-1' }
      })
    ).toBeNull();

    expect(
      normalizeRunAttachStreamEvent({
        type: 'run.attach_unavailable',
        runId: 'run-1',
        reason: 'stream_session_gone',
        message: 42
      })
    ).toBeNull();
  });
});
