import type { SharedThreadSnapshotDto } from '@agent-infra/contracts';
import { describe, expect, it } from 'vitest';

import {
  adaptSharedMessagesToThreadMessages,
  buildSharedSearchPanelData,
  buildSharedSnapshotPresentation,
  createSharedSnapshotThreadId
} from '@/features/durable-chat/service/shared-snapshot-presentation';

function createSnapshot(): SharedThreadSnapshotDto {
  return {
    payloadFormat: 'messages_v1',
    payloadVersion: 1,
    title: 'Shared Claude thread',
    messages: [
      {
        id: 'shared-message-1',
        runId: null,
        role: 'user',
        seq: 1,
        createdAt: '2026-05-09T00:00:00.000Z',
        parts: [
          {
            id: 'shared-part-1-1',
            messageId: 'shared-message-1',
            partIndex: 0,
            type: 'text',
            textValue: '帮我看 Claude 最新新闻',
            jsonValue: null,
            createdAt: '2026-05-09T00:00:00.000Z'
          }
        ]
      },
      {
        id: 'shared-message-2',
        runId: 'shared-run-1',
        role: 'assistant',
        seq: 2,
        createdAt: '2026-05-09T00:00:01.000Z',
        parts: [
          {
            id: 'shared-part-2-1',
            messageId: 'shared-message-2',
            partIndex: 0,
            type: 'text',
            textValue: '好的，我来帮你搜索一下。',
            jsonValue: null,
            createdAt: '2026-05-09T00:00:01.000Z'
          },
          {
            id: 'shared-part-2-2',
            messageId: 'shared-message-2',
            partIndex: 1,
            type: 'tool-call',
            textValue: null,
            jsonValue: {
              toolName: 'searchWeb',
              toolCallId: 'shared-tool-call-1',
              input: {
                query: 'Claude latest news'
              }
            },
            createdAt: '2026-05-09T00:00:01.500Z'
          }
        ]
      },
      {
        id: 'shared-message-3',
        runId: 'shared-run-1',
        role: 'tool',
        seq: 3,
        createdAt: '2026-05-09T00:00:02.000Z',
        parts: [
          {
            id: 'shared-part-3-1',
            messageId: 'shared-message-3',
            partIndex: 0,
            type: 'tool-result',
            textValue: null,
            jsonValue: {
              toolName: 'searchWeb',
              toolCallId: 'shared-tool-call-1',
              content: [{ type: 'text', text: 'Found relevant results.' }],
              details: {
                query: 'Claude latest news',
                resultCount: 8,
                sourceNames: ['Anthropic', 'The Verge'],
                sources: [
                  { sourceName: 'Anthropic', hostname: 'anthropic.com' },
                  { sourceName: 'The Verge', hostname: 'theverge.com' }
                ]
              },
              isError: false
            },
            createdAt: '2026-05-09T00:00:02.000Z'
          }
        ]
      },
      {
        id: 'shared-message-4',
        runId: 'shared-run-1',
        role: 'assistant',
        seq: 4,
        createdAt: '2026-05-09T00:00:03.000Z',
        parts: [
          {
            id: 'shared-part-4-1',
            messageId: 'shared-message-4',
            partIndex: 0,
            type: 'text',
            textValue: '下面是整理后的总结。',
            jsonValue: null,
            createdAt: '2026-05-09T00:00:03.000Z'
          }
        ]
      }
    ],
    searchBundles: {
      'shared-tool-call-1': {
        runId: 'shared-run-1',
        toolCallId: 'shared-tool-call-1',
        toolName: 'searchWeb',
        status: 'completed',
        input: { query: 'Claude latest news' },
        output: {
          artifact: {
            provider: 'tavily',
            query: 'Claude latest news',
            resultCount: 8,
            retrievedAt: '2026-05-09T00:00:02.000Z',
            results: [
              {
                rank: 1,
                title: 'Anthropic Claude News',
                url: 'https://www.anthropic.com/news',
                snippet: 'Latest Claude updates',
                sourceName: 'Anthropic',
                hostname: 'anthropic.com'
              },
              {
                rank: 2,
                title: 'The Verge on Claude',
                url: 'https://www.theverge.com/claude',
                snippet: 'Coverage of Claude news',
                sourceName: 'The Verge',
                hostname: 'theverge.com'
              }
            ]
          }
        },
        error: null,
        startedAt: '2026-05-09T00:00:01.500Z',
        finishedAt: '2026-05-09T00:00:02.000Z'
      }
    }
  };
}

describe('shared snapshot presentation', () => {
  it('adapts shared messages into completed thread messages with a synthetic thread id', () => {
    const messages = adaptSharedMessagesToThreadMessages({
      publicId: 'public-1',
      messages: createSnapshot().messages
    });

    expect(messages.map((message) => message.threadId)).toEqual([
      createSharedSnapshotThreadId('public-1'),
      createSharedSnapshotThreadId('public-1'),
      createSharedSnapshotThreadId('public-1'),
      createSharedSnapshotThreadId('public-1')
    ]);
    expect(messages[1]).toMatchObject({
      id: 'shared-message-2',
      runId: 'shared-run-1',
      status: 'completed'
    });
  });

  it('projects a shared snapshot into transcript blocks and answer containers', () => {
    const presentation = buildSharedSnapshotPresentation({
      publicId: 'public-1',
      snapshot: createSnapshot()
    });

    expect(presentation.transcriptBlocks.map((block) => block.type)).toEqual([
      'user-message',
      'assistant-turn',
      'assistant-turn'
    ]);
    expect(presentation.transcriptBlocks[1]).toMatchObject({
      type: 'assistant-turn',
      runId: 'shared-run-1'
    });
    if (presentation.transcriptBlocks[1]?.type !== 'assistant-turn') {
      throw new Error('expected assistant-turn block');
    }
    expect(presentation.transcriptBlocks[1].items.map((item) => item.type)).toEqual([
      'text',
      'search-summary'
    ]);
    expect(presentation.answerContainers).toHaveLength(1);
    expect(presentation.answerContainers[0]?.transcriptBlockIds).toEqual([
      'assistant-turn:shared-run-1:2',
      'assistant-turn:shared-run-1:4'
    ]);
  });

  it('builds search panel data from share-local bundles', () => {
    const presentation = buildSharedSnapshotPresentation({
      publicId: 'public-1',
      snapshot: createSnapshot()
    });

    const panelData = buildSharedSearchPanelData({
      publicId: 'public-1',
      runId: 'shared-run-1',
      toolCallIds: ['shared-tool-call-1'],
      searchBundles: presentation.searchBundles
    });

    expect(panelData).toMatchObject({
      runId: 'shared-run-1',
      toolCallIds: ['shared-tool-call-1'],
      provider: 'tavily',
      resultCount: 8,
      sourceNames: ['Anthropic', 'The Verge']
    });
    expect(panelData?.sections[0]).toMatchObject({
      toolCallId: 'shared-tool-call-1',
      query: 'Claude latest news',
      resultCount: 8
    });
  });

  it('returns null for search panel requests that do not match a run-local bundle set', () => {
    const presentation = buildSharedSnapshotPresentation({
      publicId: 'public-1',
      snapshot: createSnapshot()
    });

    expect(
      buildSharedSearchPanelData({
        publicId: 'public-1',
        runId: 'shared-run-2',
        toolCallIds: ['shared-tool-call-1'],
        searchBundles: presentation.searchBundles
      })
    ).toBeNull();
  });
});
