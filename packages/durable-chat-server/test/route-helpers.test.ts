import { describe, expect, it } from 'vitest';

import { InvalidTurnTextError } from '@agent-infra/app';

import { toRunDto } from '../src/api-dto';
import {
  buildCaptureDatasetExampleResponse,
  buildDatasetExamplesResponse,
  buildDatasetResponse,
  buildDatasetsResponse,
  buildRunTextTurnResponse,
  buildRunTraceErrorResponse,
  buildRunTraceResponse,
  buildRunTimelineResponse,
  buildRunReadyEvent,
  buildRunTerminalEvent,
  buildThreadMessagesResponse,
  buildThreadRunsResponse,
  buildThreadsResponse,
  decodeThreadMessageCursor,
  encodeSseEvent,
  parseCreateThreadTitle,
  parseCaptureDatasetExampleFromRunInput,
  parseCreateDatasetInput,
  parseRenameThreadTitle,
  parseUpdateDatasetExampleExpectedOutputInput,
  parseThreadMessagesQuery,
  parseThreadRunsLimit,
  parseRunTextTurnInput
} from '../src/chat-route-helpers';
import { getRouteErrorMessage, getRouteErrorStatus, InvalidRouteBodyError } from '../src/route-errors';

describe('durable chat server route helpers', () => {
  it('maps app errors to route status codes and messages', () => {
    const error = new InvalidTurnTextError();

    expect(getRouteErrorStatus(error)).toBe(400);
    expect(getRouteErrorMessage(error, 'fallback')).toBe(error.message);
    expect(getRouteErrorStatus(new InvalidRouteBodyError('bad body'))).toBe(400);
    expect(getRouteErrorStatus(new Error('boom'))).toBe(500);
    expect(getRouteErrorMessage(null, 'fallback')).toBe('fallback');
  });

  it('serializes nullable runs into dto shapes', () => {
    const usage = {
      schemaVersion: 1,
      normalizationStatus: 'complete',
      tokens: {
        input: 5,
        output: 7,
        total: 12
      },
      rawProviderUsage: {
        assistantMessages: [{ input: 5, output: 7, totalTokens: 12 }]
      }
    };

    expect(toRunDto(null)).toBeNull();

    expect(
      toRunDto({
        id: 'run-1',
        threadId: 'thread-1',
        triggerMessageId: null,
        provider: 'deepseek',
        model: 'deepseek-v4-flash',
        status: 'completed',
        usage,
        error: null,
        startedAt: new Date('2026-01-01T00:00:00.000Z'),
        finishedAt: new Date('2026-01-01T00:00:01.000Z'),
        createdAt: new Date('2026-01-01T00:00:00.000Z')
      })
    ).toEqual({
      id: 'run-1',
      threadId: 'thread-1',
      triggerMessageId: null,
      provider: 'deepseek',
      model: 'deepseek-v4-flash',
      status: 'completed',
      usage,
      error: null,
      startedAt: '2026-01-01T00:00:00.000Z',
      finishedAt: '2026-01-01T00:00:01.000Z',
      createdAt: '2026-01-01T00:00:00.000Z'
    });
  });

  it('normalizes thread and turn request inputs', () => {
    expect(parseCreateThreadTitle({ title: '  Demo thread  ' })).toBe('Demo thread');
    expect(parseCreateThreadTitle({ title: '   ' })).toBe('New Thread');
    expect(parseCreateThreadTitle(null)).toBe('New Thread');
    expect(parseRenameThreadTitle({ title: '  Demo thread  ' })).toBe('Demo thread');
    expect(parseRenameThreadTitle({ title: '   ' })).toBe('');
    expect(parseRenameThreadTitle(null)).toBe('');

    expect(
      parseRunTextTurnInput({
        text: 'hello',
        provider: ' deepseek ',
        model: ' deepseek-v4-flash ',
        thinkingEnabled: true,
        reasoningEffort: 'max',
        webSearchEnabled: true
      })
    ).toEqual({
      text: 'hello',
      provider: 'deepseek',
      model: 'deepseek-v4-flash',
      thinkingEnabled: true,
      reasoningEffort: 'max',
      webSearchEnabled: true
    });
    expect(parseRunTextTurnInput(null)).toEqual({
      text: '',
      provider: undefined,
      model: undefined,
      thinkingEnabled: undefined,
      reasoningEffort: undefined,
      webSearchEnabled: undefined
    });

    expect(parseThreadRunsLimit(null)).toBe(8);
    expect(parseThreadRunsLimit('0')).toBe(8);
    expect(parseThreadRunsLimit('2')).toBe(2);
    expect(parseThreadRunsLimit('50')).toBe(20);
  });

  it('parses and serializes dataset route payloads', () => {
    const createdAt = new Date('2026-01-01T00:00:00.000Z');
    const updatedAt = new Date('2026-01-01T00:05:00.000Z');
    const dataset = {
      id: 'dataset-1',
      appId: 'app-1',
      name: 'Regression',
      description: null,
      visibility: 'private' as const,
      metadata: { team: 'infra' },
      createdByActorId: 'actor-1',
      createdAt,
      updatedAt
    };
    const example = {
      id: 'example-1',
      datasetId: dataset.id,
      sourceRunId: 'run-1',
      sourceThreadId: 'thread-1',
      triggerMessageId: 'message-1',
      inputJson: { schemaVersion: 1, kind: 'chat_turn' },
      baselineOutputJson: null,
      expectedOutputJson: { rubric: 'ok' },
      metadataJson: { capture: { kind: 'normal_example' } },
      contextSnapshotJson: { status: 'completed' },
      toolInvocationsSnapshotJson: { toolInvocations: [] },
      createdByActorId: 'actor-1',
      createdAt,
      updatedAt
    };

    expect(parseCreateDatasetInput({ name: '  Regression  ', visibility: 'app', metadata: { team: 'infra' } })).toEqual({
      name: 'Regression',
      description: undefined,
      visibility: 'app',
      metadata: { team: 'infra' }
    });
    expect(
      parseCaptureDatasetExampleFromRunInput({
        sourceRunId: ' run-1 ',
        expectedOutputJson: { rubric: 'ok' },
        omitToolInvocations: true,
        toolInvocationOmissionReason: ' policy '
      })
    ).toEqual({
      sourceRunId: 'run-1',
      expectedOutputJson: { rubric: 'ok' },
      omitToolInvocations: true,
      toolInvocationOmissionReason: 'policy'
    });
    expect(parseCaptureDatasetExampleFromRunInput({ sourceRunId: 'run-1', expectedOutputJson: null })).toEqual({
      sourceRunId: 'run-1',
      expectedOutputJson: null,
      metadataJson: undefined,
      omitToolInvocations: undefined,
      toolInvocationOmissionReason: undefined
    });
    expect(() => parseCaptureDatasetExampleFromRunInput({ sourceRunId: 'run-1', expectedOutputJson: 'bad' })).toThrow(
      InvalidRouteBodyError
    );
    expect(parseUpdateDatasetExampleExpectedOutputInput({ expectedOutputJson: { rubric: 'ok' } })).toEqual({
      expectedOutputJson: { rubric: 'ok' }
    });
    expect(parseUpdateDatasetExampleExpectedOutputInput({ expectedOutputJson: null, metadataJson: null })).toEqual({
      expectedOutputJson: null,
      metadataJson: null
    });
    expect(() => parseUpdateDatasetExampleExpectedOutputInput({ expectedOutputJson: 'bad' })).toThrow(InvalidRouteBodyError);
    expect(buildDatasetsResponse([dataset])).toMatchObject({ datasets: [{ id: dataset.id, createdAt: createdAt.toISOString() }] });
    expect(buildDatasetResponse(dataset)).toMatchObject({ dataset: { id: dataset.id } });
    expect(buildDatasetExamplesResponse([example])).toMatchObject({ examples: [{ id: example.id, inputJson: example.inputJson }] });
    expect(buildCaptureDatasetExampleResponse({ dataset, example })).toMatchObject({
      dataset: { id: dataset.id },
      example: { id: example.id, expectedOutputJson: { rubric: 'ok' } }
    });
  });

  it('builds thread and message dto responses', () => {
    expect(
      buildThreadsResponse([
        {
          id: 'thread-1',
          appId: 'playground-runtime-pi',
          userId: null,
          title: 'Demo thread',
          status: 'active',
          metadata: { source: 'demo' },
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
          updatedAt: new Date('2026-01-01T00:00:00.000Z'),
          archivedAt: null
        }
      ])
    ).toEqual({
      threads: [
        {
          id: 'thread-1',
          appId: 'playground-runtime-pi',
          userId: null,
          title: 'Demo thread',
          status: 'active',
          metadata: { source: 'demo' },
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
          archivedAt: null
        }
      ]
    });

    expect(
      buildThreadMessagesResponse({
        messages: [
          {
            id: 'message-1',
            threadId: 'thread-1',
            runId: null,
            role: 'user',
            seq: 1,
            status: 'completed',
            metadata: null,
            createdAt: new Date('2026-01-01T00:00:00.000Z'),
            parts: [
              {
                id: 'part-1',
                messageId: 'message-1',
                partIndex: 0,
                type: 'text',
                textValue: 'hello',
                jsonValue: null,
                createdAt: new Date('2026-01-01T00:00:00.000Z')
              }
            ]
          }
        ],
        pageInfo: {
          hasOlder: false,
          hasNewer: true,
          startSeq: 1,
          endSeq: 1
        }
      })
    ).toEqual({
      messages: [
        {
          id: 'message-1',
          threadId: 'thread-1',
          runId: null,
          role: 'user',
          seq: 1,
          status: 'completed',
          metadata: null,
          createdAt: '2026-01-01T00:00:00.000Z',
          parts: [
            {
              id: 'part-1',
              messageId: 'message-1',
              partIndex: 0,
              type: 'text',
              textValue: 'hello',
              jsonValue: null,
              createdAt: '2026-01-01T00:00:00.000Z'
            }
          ]
        }
      ],
      pageInfo: {
        hasOlder: false,
        hasNewer: true,
        startCursor: expect.any(String),
        endCursor: expect.any(String)
      },
      activeRun: null
    });

    expect(
      buildThreadRunsResponse([
        {
          id: 'run-1',
          threadId: 'thread-1',
          triggerMessageId: null,
          provider: 'deepseek',
          model: 'deepseek-v4-flash',
          status: 'completed',
          usage: null,
          error: null,
          startedAt: new Date('2026-01-01T00:00:00.000Z'),
          finishedAt: new Date('2026-01-01T00:00:01.000Z'),
          createdAt: new Date('2026-01-01T00:00:00.000Z')
        }
      ])
    ).toEqual({
      runs: [
        {
          id: 'run-1',
          threadId: 'thread-1',
          triggerMessageId: null,
          provider: 'deepseek',
          model: 'deepseek-v4-flash',
          status: 'completed',
          usage: null,
          error: null,
          startedAt: '2026-01-01T00:00:00.000Z',
          finishedAt: '2026-01-01T00:00:01.000Z',
          createdAt: '2026-01-01T00:00:00.000Z'
        }
      ]
    });
  });

  it('parses thread message pagination params and validates opaque cursors', () => {
    const parsed = parseThreadMessagesQuery(new URLSearchParams('limit=50&before=cursor-a'));
    expect(parsed).toEqual({
      limit: 50,
      before: 'cursor-a',
      after: undefined
    });

    expect(parseThreadMessagesQuery(new URLSearchParams('before=cursor-a'))).toEqual({
      limit: 40,
      before: 'cursor-a',
      after: undefined
    });

    const response = buildThreadMessagesResponse({
      messages: [
        {
          id: 'message-2',
          threadId: 'thread-1',
          runId: null,
          role: 'assistant',
          seq: 2,
          status: 'completed',
          metadata: null,
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
          parts: []
        },
        {
          id: 'message-3',
          threadId: 'thread-1',
          runId: null,
          role: 'assistant',
          seq: 3,
          status: 'completed',
          metadata: null,
          createdAt: new Date('2026-01-01T00:00:01.000Z'),
          parts: []
        }
      ],
      pageInfo: {
        hasOlder: true,
        hasNewer: false,
        startSeq: 2,
        endSeq: 3
      },
      activeRun: {
        id: 'run-active',
        threadId: 'thread-1',
        triggerMessageId: null,
        provider: 'deepseek',
        model: 'deepseek-v4-flash',
        status: 'running',
        usage: null,
        error: null,
        startedAt: null,
        finishedAt: null,
        createdAt: new Date('2026-01-01T00:00:02.000Z')
      }
    });

    expect(decodeThreadMessageCursor(response.pageInfo?.startCursor ?? '', 'thread-1')).toBe(2);
    expect(() => decodeThreadMessageCursor(response.pageInfo?.startCursor ?? '', 'thread-2')).toThrow('invalid thread message cursor');
    expect(response.activeRun?.status).toBe('running');
  });

  it('serializes answer candidate hydration fields on thread messages', () => {
    const response = buildThreadMessagesResponse({
      messages: [],
      activeRun: {
        id: 'stale-run',
        threadId: 'thread-1',
        triggerMessageId: 'message-1',
        provider: 'deepseek',
        model: 'deepseek-v4-flash',
        status: 'running',
        usage: null,
        error: null,
        startedAt: null,
        finishedAt: null,
        createdAt: new Date('2026-01-01T00:00:01.000Z')
      },
      activeRuns: [
        {
          id: 'run-2',
          threadId: 'thread-1',
          triggerMessageId: 'message-1',
          provider: 'deepseek',
          model: 'deepseek-v4-flash',
          status: 'running',
          usage: null,
          error: null,
          startedAt: null,
          finishedAt: null,
          createdAt: new Date('2026-01-01T00:00:02.000Z')
        }
      ],
      answerCandidates: [
        {
          id: 'candidate-1',
          threadId: 'thread-1',
          triggerMessageId: 'message-1',
          runId: 'run-2',
          ordinal: 1,
          kind: 'alternative',
          createdAt: new Date('2026-01-01T00:00:02.000Z')
        }
      ],
      answerSelections: [
        {
          threadId: 'thread-1',
          triggerMessageId: 'message-1',
          selectedRunId: 'run-2',
          source: 'user',
          selectedByUserId: 'user-1',
          createdAt: new Date('2026-01-01T00:00:03.000Z'),
          updatedAt: new Date('2026-01-01T00:00:03.000Z')
        }
      ],
      runFeedback: [
        {
          id: 'feedback-1',
          threadId: 'thread-1',
          triggerMessageId: 'message-1',
          runId: 'run-2',
          feedbackActorId: 'user-1',
          value: 'thumbs_up',
          createdAt: new Date('2026-01-01T00:00:04.000Z'),
          updatedAt: new Date('2026-01-01T00:00:04.000Z')
        }
      ]
    });

    expect(response.activeRun?.id).toBe('run-2');
    expect(response.activeRuns).toMatchObject([{ id: 'run-2' }]);
    expect(response.answerCandidates).toMatchObject([{ runId: 'run-2', ordinal: 1, kind: 'alternative' }]);
    expect(response.answerSelections).toMatchObject([{ selectedRunId: 'run-2', source: 'user' }]);
    expect(response.runFeedback).toMatchObject([{ runId: 'run-2', value: 'thumbs_up' }]);
  });

  it('builds run stream events and encodes sse frames', () => {
    const readyEvent = buildRunReadyEvent({
      run: {
        id: 'run-1',
        threadId: 'thread-1',
        triggerMessageId: 'message-1',
        provider: 'deepseek',
        model: 'deepseek-v4-flash',
        status: 'queued',
        usage: null,
        error: null,
        startedAt: null,
        finishedAt: null,
        createdAt: new Date('2026-01-01T00:00:00.000Z')
      },
      userMessage: {
        id: 'message-1',
        threadId: 'thread-1',
        runId: null,
        role: 'user',
        seq: 1,
        status: 'completed',
        metadata: null,
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        parts: [
          {
            id: 'part-1',
            messageId: 'message-1',
            partIndex: 0,
            type: 'text',
            textValue: 'hello',
            jsonValue: null,
            createdAt: new Date('2026-01-01T00:00:00.000Z')
          }
        ]
      },
      runtimeSelection: {
        provider: 'deepseek',
        model: 'deepseek-v4-flash'
      }
    });

    expect(readyEvent).toMatchObject({
      type: 'run.ready',
      runId: 'run-1'
    });
    expect(encodeSseEvent(readyEvent)).toContain('event: run.ready');

    expect(
      buildRunTerminalEvent('run-1', {
        id: 'run-1',
        threadId: 'thread-1',
        triggerMessageId: 'message-1',
        provider: 'deepseek',
        model: 'deepseek-v4-flash',
        status: 'completed',
        usage: null,
        error: null,
        startedAt: new Date('2026-01-01T00:00:00.000Z'),
        finishedAt: new Date('2026-01-01T00:00:01.000Z'),
        createdAt: new Date('2026-01-01T00:00:00.000Z')
      })
    ).toMatchObject({
      type: 'run.completed',
      runId: 'run-1'
    });

    expect(
      buildRunTerminalEvent('run-1', {
        id: 'run-1',
        threadId: 'thread-1',
        triggerMessageId: 'message-1',
        provider: 'deepseek',
        model: 'deepseek-v4-flash',
        status: 'failed',
        usage: null,
        error: 'boom',
        startedAt: new Date('2026-01-01T00:00:00.000Z'),
        finishedAt: new Date('2026-01-01T00:00:01.000Z'),
        createdAt: new Date('2026-01-01T00:00:00.000Z')
      })
    ).toMatchObject({
      type: 'run.failed',
      runId: 'run-1',
      error: 'boom'
    });
  });

  it('builds run and timeline response dto payloads', () => {
    expect(
      buildRunTextTurnResponse({
        run: {
          id: 'run-1',
          threadId: 'thread-1',
          triggerMessageId: 'message-1',
          provider: 'deepseek',
          model: 'deepseek-v4-flash',
          status: 'completed',
          usage: null,
          error: null,
          startedAt: new Date('2026-01-01T00:00:00.000Z'),
          finishedAt: new Date('2026-01-01T00:00:01.000Z'),
          createdAt: new Date('2026-01-01T00:00:00.000Z')
        },
        messages: [
          {
            id: 'message-1',
            threadId: 'thread-1',
            runId: 'run-1',
            role: 'assistant',
            seq: 2,
            status: 'completed',
            metadata: null,
            createdAt: new Date('2026-01-01T00:00:01.000Z'),
            parts: [
              {
                id: 'part-1',
                messageId: 'message-1',
                partIndex: 0,
                type: 'text',
                textValue: 'ok',
                jsonValue: null,
                createdAt: new Date('2026-01-01T00:00:01.000Z')
              }
            ]
          }
        ],
        debug: {
          runEventCount: 1,
          toolInvocationCount: 0
        },
        executionError: undefined
      })
    ).toEqual({
      run: {
        id: 'run-1',
        threadId: 'thread-1',
        triggerMessageId: 'message-1',
        provider: 'deepseek',
        model: 'deepseek-v4-flash',
        status: 'completed',
        usage: null,
        error: null,
        startedAt: '2026-01-01T00:00:00.000Z',
        finishedAt: '2026-01-01T00:00:01.000Z',
        createdAt: '2026-01-01T00:00:00.000Z'
      },
      messages: [
        {
          id: 'message-1',
          threadId: 'thread-1',
          runId: 'run-1',
          role: 'assistant',
          seq: 2,
          status: 'completed',
          metadata: null,
          createdAt: '2026-01-01T00:00:01.000Z',
          parts: [
            {
              id: 'part-1',
              messageId: 'message-1',
              partIndex: 0,
              type: 'text',
              textValue: 'ok',
              jsonValue: null,
              createdAt: '2026-01-01T00:00:01.000Z'
            }
          ]
        }
      ],
      debug: {
        runEventCount: 1,
        toolInvocationCount: 0
      },
      error: undefined
    });

    expect(
      buildRunTimelineResponse({
        run: {
          id: 'run-1',
          threadId: 'thread-1',
          triggerMessageId: 'message-1',
          provider: 'deepseek',
          model: 'deepseek-v4-flash',
          status: 'completed',
          usage: null,
          error: null,
          startedAt: new Date('2026-01-01T00:00:00.000Z'),
          finishedAt: new Date('2026-01-01T00:00:01.000Z'),
          createdAt: new Date('2026-01-01T00:00:00.000Z')
        },
        runEvents: [
          {
            id: 'event-1',
            threadId: 'thread-1',
            runId: 'run-1',
            seq: 1,
            type: 'agent_start',
            payload: { model: 'deepseek-v4-flash' },
            createdAt: new Date('2026-01-01T00:00:00.000Z')
          }
        ],
        toolInvocations: [
          {
            id: 'tool-1',
            threadId: 'thread-1',
            runId: 'run-1',
            messageId: 'message-1',
            toolName: 'echo',
            toolCallId: 'call-1',
            status: 'completed',
            input: { text: 'ok' },
            output: { text: 'ok' },
            error: null,
            startedAt: new Date('2026-01-01T00:00:00.000Z'),
            finishedAt: new Date('2026-01-01T00:00:01.000Z'),
            createdAt: new Date('2026-01-01T00:00:00.000Z')
          }
        ],
        projection: {
          schemaVersion: 1,
          items: [
            {
              kind: 'run_lifecycle',
              phase: 'started',
              runEventId: 'event-1',
              seq: 1
            }
          ]
        }
      })
    ).toEqual({
      run: {
        id: 'run-1',
        threadId: 'thread-1',
        triggerMessageId: 'message-1',
        provider: 'deepseek',
        model: 'deepseek-v4-flash',
        status: 'completed',
        usage: null,
        error: null,
        startedAt: '2026-01-01T00:00:00.000Z',
        finishedAt: '2026-01-01T00:00:01.000Z',
        createdAt: '2026-01-01T00:00:00.000Z'
      },
      runEvents: [
        {
          id: 'event-1',
          threadId: 'thread-1',
          runId: 'run-1',
          seq: 1,
          type: 'agent_start',
          payload: { model: 'deepseek-v4-flash' },
          createdAt: '2026-01-01T00:00:00.000Z'
        }
      ],
      toolInvocations: [
        {
          id: 'tool-1',
          threadId: 'thread-1',
          runId: 'run-1',
          messageId: 'message-1',
          toolName: 'echo',
          toolCallId: 'call-1',
          status: 'completed',
          input: { text: 'ok' },
          output: { text: 'ok' },
          error: null,
          startedAt: '2026-01-01T00:00:00.000Z',
          finishedAt: '2026-01-01T00:00:01.000Z',
          createdAt: '2026-01-01T00:00:00.000Z'
        }
      ],
      projection: {
        schemaVersion: 1,
        items: [
          {
            kind: 'run_lifecycle',
            phase: 'started',
            runEventId: 'event-1',
            seq: 1
          }
        ]
      }
    });
  });

  it('serializes run trace responses without rebuilding projection data', () => {
    expect(
      buildRunTraceResponse({
        run: {
          id: 'run-1',
          threadId: 'thread-1',
          triggerMessageId: 'message-1',
          provider: 'deepseek',
          model: 'deepseek-v4-flash',
          status: 'completed',
          usage: null,
          error: null,
          startedAt: new Date('2026-01-01T00:00:00.000Z'),
          finishedAt: new Date('2026-01-01T00:00:01.000Z'),
          createdAt: new Date('2026-01-01T00:00:00.000Z')
        },
        projection: {
          schemaVersion: 1,
          traceId: 'run-1',
          rootSpanId: 'span:run:run-1',
          appId: 'playground-runtime-pi',
          threadId: 'thread-1',
          runId: 'run-1',
          status: 'completed',
          startedAt: '2026-01-01T00:00:00.000Z',
          finishedAt: '2026-01-01T00:00:01.000Z',
          durationMs: 1000,
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
              startedAt: '2026-01-01T00:00:00.000Z',
              finishedAt: '2026-01-01T00:00:01.000Z',
              durationMs: 1000,
              provider: 'deepseek',
              model: 'deepseek-v4-flash',
              usageRef: null,
              tool: null,
              error: null,
              sourceRefs: [{ type: 'run', id: 'run-1' }],
              metadata: null
            }
          ],
          diagnostics: {
            unknownEventCount: 0,
            orphanEventCount: 0,
            warnings: []
          }
        }
      })
    ).toEqual({
      run: {
        id: 'run-1',
        threadId: 'thread-1',
        triggerMessageId: 'message-1',
        provider: 'deepseek',
        model: 'deepseek-v4-flash',
        status: 'completed',
        usage: null,
        error: null,
        startedAt: '2026-01-01T00:00:00.000Z',
        finishedAt: '2026-01-01T00:00:01.000Z',
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
        startedAt: '2026-01-01T00:00:00.000Z',
        finishedAt: '2026-01-01T00:00:01.000Z',
        durationMs: 1000,
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
            startedAt: '2026-01-01T00:00:00.000Z',
            finishedAt: '2026-01-01T00:00:01.000Z',
            durationMs: 1000,
            provider: 'deepseek',
            model: 'deepseek-v4-flash',
            usageRef: null,
            tool: null,
            error: null,
            sourceRefs: [{ type: 'run', id: 'run-1' }],
            metadata: null
          }
        ],
        diagnostics: {
          unknownEventCount: 0,
          orphanEventCount: 0,
          warnings: []
        }
      }
    });

    expect(buildRunTraceErrorResponse(new InvalidTurnTextError(), 'fallback')).toEqual({
      run: null,
      projection: null,
      error: 'text is required'
    });
  });
});
