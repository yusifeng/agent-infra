import { describe, expect, it } from 'vitest';

import type { MessagePartDto } from '@agent-infra/contracts';

import {
  buildLiveResearchStatusLabelViewModel,
  buildResearchActivityViewModel,
  buildResearchStatusLabelViewModel,
  buildResearchSummaryLabelViewModel
} from '@/features/durable-chat/service/research-activity';
import type { AssistantTurnItem } from '@/features/durable-chat/types/transcript-blocks';

function createPart(overrides: Partial<MessagePartDto> & Pick<MessagePartDto, 'id' | 'type'>): MessagePartDto {
  return {
    id: overrides.id,
    messageId: overrides.messageId ?? 'message-1',
    partIndex: overrides.partIndex ?? 0,
    type: overrides.type,
    textValue: overrides.textValue ?? null,
    jsonValue: overrides.jsonValue ?? null,
    createdAt: overrides.createdAt ?? '2026-05-11T00:00:00.000Z'
  };
}

describe('research-activity', () => {
  it('aggregates search, browse, and policy entries while filtering research tool parts from visible items', () => {
    const items: AssistantTurnItem[] = [
      {
        type: 'text',
        id: 'text-1',
        cacheKey: 'text-1',
        part: createPart({ id: 'text-1', type: 'text', textValue: '让我看看。' })
      },
      {
        type: 'search-summary',
        id: 'search-summary-1',
        summary: {
          runId: 'run-1',
          entries: [
            {
              toolCallId: 'call-search-1',
              query: '速水玲香 金田一少年事件簿',
              resultCount: 10,
              sourceNames: ['百度百科'],
              sources: [{ sourceName: '百度百科', hostname: 'baike.baidu.com' }]
            }
          ]
        }
      },
      {
        type: 'tool-part',
        id: 'tool-call-open-1',
        part: createPart({
          id: 'tool-call-open-1',
          type: 'tool-call',
          jsonValue: {
            toolName: 'openUrl',
            toolCallId: 'call-open-1',
            input: { url: 'https://example.com/character' }
          }
        })
      },
      {
        type: 'tool-part',
        id: 'tool-result-open-1',
        part: createPart({
          id: 'tool-result-open-1',
          type: 'tool-result',
          jsonValue: {
            toolName: 'openUrl',
            toolCallId: 'call-open-1',
            details: {
              url: 'https://example.com/character',
              finalUrl: 'https://example.com/character',
              title: '速水玲香 - 人物条目',
              siteName: 'Example Wiki',
              contentText: '人物介绍',
              contentQuality: 'good'
            }
          }
        })
      },
      {
        type: 'tool-part',
        id: 'tool-result-policy-1',
        part: createPart({
          id: 'tool-result-policy-1',
          type: 'tool-result',
          jsonValue: {
            toolName: 'searchWeb',
            toolCallId: 'call-search-2',
            details: {
              status: 'blocked_by_policy',
              reason: 'duplicate_query',
              message: 'This search query is too similar to one that already ran in the current run.',
              allowedNextTools: ['openUrl']
            }
          }
        })
      }
    ];

    const activity = buildResearchActivityViewModel(items);
    const summary = buildResearchSummaryLabelViewModel(activity);

    expect(activity.visibleItems.map((item) => item.id)).toEqual(['text-1']);
    expect(activity.searchToolCallIds).toEqual(['call-search-1']);
    expect(activity.openedPages).toHaveLength(1);
    expect(activity.policyEntries).toHaveLength(1);
    expect(summary?.text).toBe('搜索到 10 个网页 · 浏览 1 个页面');
    expect(summary?.detailQueries).toEqual(['速水玲香 金田一少年事件簿']);
    expect(summary?.detailPages[0]).toMatchObject({
      sourceName: 'Example Wiki',
      title: '速水玲香 - 人物条目'
    });
  });

  it('builds a live research status summary across search and browse tools', () => {
    const status = buildLiveResearchStatusLabelViewModel([
      {
        toolCallId: 'call-search-1',
        toolName: 'searchWeb',
        phase: 'start',
        input: { query: '速水玲香 金田一少年事件簿' }
      },
      {
        toolCallId: 'call-open-1',
        toolName: 'openUrl',
        phase: 'start',
        input: { url: 'https://example.com/character' }
      }
    ]);

    expect(status).toEqual({
      isSearching: true,
      text: '正在搜索网页 · 正在浏览 1 个页面'
    });
  });

  it('clears pending search entries when a matching summary arrives', () => {
    const items: AssistantTurnItem[] = [
      {
        type: 'search-status',
        id: 'search-status-1',
        status: {
          runId: 'run-1',
          entries: [{ toolCallId: 'call-search-1', query: '速水玲香 金田一少年事件簿' }]
        }
      },
      {
        type: 'search-summary',
        id: 'search-summary-1',
        summary: {
          runId: 'run-1',
          entries: [
            {
              toolCallId: 'call-search-1',
              query: '速水玲香 金田一少年事件簿',
              resultCount: 10,
              sourceNames: ['百度百科'],
              sources: [{ sourceName: '百度百科', hostname: 'baike.baidu.com' }]
            }
          ]
        }
      }
    ];

    const activity = buildResearchActivityViewModel(items);
    const status = buildResearchStatusLabelViewModel(activity);

    expect(activity.pendingEntries).toHaveLength(0);
    expect(status).toBeNull();
  });
});
