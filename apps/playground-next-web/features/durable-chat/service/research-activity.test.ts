import { describe, expect, it } from 'vitest';

import type { MessagePartDto } from '@agent-infra/contracts';

import {
  buildLiveResearchTimelineRows,
  buildLiveResearchStatusLabelViewModel,
  buildResearchActivityViewModel,
  buildResearchSummaryLabelViewModel,
  buildResearchTimelineRowsFromActivity
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
              status: 'success',
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

    expect(buildResearchTimelineRowsFromActivity(activity)).toEqual([
      {
        kind: 'search',
        id: 'search:completed:call-search-1',
        state: 'completed',
        label: '搜索到 10 个网页',
        sources: [{ sourceName: '百度百科', hostname: 'baike.baidu.com' }],
        searchToolCallIds: ['call-search-1']
      },
      {
        kind: 'browse',
        id: 'browse:completed:call-open-1',
        state: 'completed',
        label: '浏览 1 个页面',
        pages: [
          {
            title: '速水玲香 - 人物条目',
            url: 'https://example.com/character',
            hostname: 'example.com',
            sourceName: 'Example Wiki'
          }
        ]
      }
    ]);
  });

  it('does not build a user-visible summary from policy-only entries', () => {
    const items: AssistantTurnItem[] = [
      {
        type: 'tool-part',
        id: 'tool-result-policy-only',
        part: createPart({
          id: 'tool-result-policy-only',
          type: 'tool-result',
          jsonValue: {
            toolName: 'searchWeb',
            toolCallId: 'call-search-2',
            details: {
              status: 'blocked_by_policy',
              reason: 'duplicate_query',
              message: 'Search results are already available. Open a selected page instead of starting another search.',
              allowedNextTools: ['openUrl']
            }
          }
        })
      }
    ];

    const activity = buildResearchActivityViewModel(items);
    const summary = buildResearchSummaryLabelViewModel(activity);

    expect(activity.policyEntries).toHaveLength(1);
    expect(summary).toBeNull();
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

  it('keeps a completed live label visible after search/open tool phases settle', () => {
    const status = buildLiveResearchStatusLabelViewModel([
      {
        toolCallId: 'call-search-1',
        toolName: 'searchWeb',
        phase: 'completed',
        input: { query: '速水玲香 金田一少年事件簿' }
      },
      {
        toolCallId: 'call-open-1',
        toolName: 'openUrl',
        phase: 'completed',
        input: { url: 'https://example.com/character' }
      }
    ]);

    expect(status).toEqual({
      isSearching: false,
      text: '已完成搜索 · 已浏览 1 个页面',
      searchToolCallIds: ['call-search-1']
    });
  });

  it('builds separate live timeline rows without exposing completed-search fallback text', () => {
    const rows = buildLiveResearchTimelineRows(
      [
        {
          toolCallId: 'call-search-1',
          toolName: 'searchWeb',
          phase: 'completed',
          input: { query: '速水玲香 金田一少年事件簿' }
        },
        {
          toolCallId: 'call-open-1',
          toolName: 'openUrl',
          phase: 'completed',
          input: { url: 'https://example.com/character' }
        }
      ],
      {
        runId: 'run-1',
        toolCallIds: ['call-search-1'],
        provider: 'test',
        resultCount: 10,
        sourceNames: ['Example Wiki'],
        sections: [
          {
            toolCallId: 'call-search-1',
            query: '速水玲香 金田一少年事件簿',
            resultCount: 10,
            results: [
              {
                rank: 1,
                title: '速水玲香 - 人物条目',
                url: 'https://example.com/character',
                snippet: '人物介绍',
                sourceName: 'Example Wiki',
                hostname: 'example.com'
              }
            ]
          }
        ]
      }
    );

    expect(rows).toEqual([
      {
        kind: 'search',
        id: 'live-search:completed:call-search-1',
        state: 'completed',
        label: '搜索到 10 个网页',
        sources: [{ sourceName: 'Example Wiki', hostname: 'example.com' }],
        searchToolCallIds: ['call-search-1']
      },
      {
        kind: 'browse',
        id: 'live-browse:completed:call-open-1',
        state: 'completed',
        label: '浏览 1 个页面',
        pages: [
          {
            title: 'example.com',
            url: 'https://example.com/character',
            hostname: 'example.com',
            sourceName: 'example.com'
          }
        ]
      }
    ]);
    expect(rows.map((row) => row.label)).not.toContain('已完成搜索');
  });

  it('omits live completed search rows until result counts are available', () => {
    const rows = buildLiveResearchTimelineRows([
      {
        toolCallId: 'call-search-1',
        toolName: 'searchWeb',
        phase: 'completed',
        input: { query: '速水玲香 金田一少年事件簿' }
      }
    ]);

    expect(rows).toEqual([]);
  });

  it('keeps running and completed persisted timeline rows visible in mixed states', () => {
    const items: AssistantTurnItem[] = [
      {
        type: 'search-status',
        id: 'search-status-1',
        status: {
          runId: 'run-1',
          entries: [{ toolCallId: 'call-search-pending', query: 'pending query' }]
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
              query: 'completed query',
              resultCount: 10,
              sourceNames: ['Example Wiki'],
              sources: [{ sourceName: 'Example Wiki', hostname: 'example.com' }]
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
            toolCallId: 'call-open-pending',
            input: { url: 'https://example.com/pending' }
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
              status: 'success',
              url: 'https://example.com/done',
              finalUrl: 'https://example.com/done',
              title: 'Completed Page',
              siteName: 'Example Wiki',
              contentQuality: 'good'
            }
          }
        })
      }
    ];

    const rows = buildResearchTimelineRowsFromActivity(buildResearchActivityViewModel(items));

    expect(rows.map((row) => row.label)).toEqual([
      '正在搜索网页',
      '搜索到 10 个网页',
      '正在浏览页面',
      '浏览 1 个页面'
    ]);

    expect(buildResearchTimelineRowsFromActivity(buildResearchActivityViewModel(items), { includePending: false }).map((row) => row.label)).toEqual([
      '搜索到 10 个网页',
      '浏览 1 个页面'
    ]);
  });

  it('keeps running and completed live timeline rows visible in mixed states', () => {
    const rows = buildLiveResearchTimelineRows(
      [
        {
          toolCallId: 'call-search-pending',
          toolName: 'searchWeb',
          phase: 'start',
          input: { query: 'pending query' }
        },
        {
          toolCallId: 'call-search-1',
          toolName: 'searchWeb',
          phase: 'completed',
          input: { query: 'completed query' }
        },
        {
          toolCallId: 'call-open-pending',
          toolName: 'openUrl',
          phase: 'start',
          input: { url: 'https://example.com/pending' }
        },
        {
          toolCallId: 'call-open-1',
          toolName: 'openUrl',
          phase: 'completed',
          input: { url: 'https://example.com/done' }
        }
      ],
      {
        runId: 'run-1',
        toolCallIds: ['call-search-1'],
        provider: 'test',
        resultCount: 10,
        sourceNames: ['Example Wiki'],
        sections: [
          {
            toolCallId: 'call-search-1',
            query: 'completed query',
            resultCount: 10,
            results: [
              {
                rank: 1,
                title: 'Completed Page',
                url: 'https://example.com/done',
                snippet: 'Done',
                sourceName: 'Example Wiki',
                hostname: 'example.com'
              }
            ]
          }
        ]
      }
    );

    expect(rows.map((row) => row.label)).toEqual([
      '正在搜索网页',
      '搜索到 10 个网页',
      '正在浏览页面',
      '浏览 1 个页面'
    ]);
  });

  it('does not expose non-http browse URLs as page preview links', () => {
    const items: AssistantTurnItem[] = [
      {
        type: 'tool-part',
        id: 'tool-result-open-unsafe',
        part: createPart({
          id: 'tool-result-open-unsafe',
          type: 'tool-result',
          jsonValue: {
            toolName: 'openUrl',
            toolCallId: 'call-open-unsafe',
            details: {
              status: 'success',
              url: 'javascript:alert(1)',
              finalUrl: 'javascript:alert(1)',
              title: 'Unsafe Page',
              siteName: 'Unsafe',
              contentQuality: 'good'
            }
          }
        })
      }
    ];

    const rows = buildResearchTimelineRowsFromActivity(buildResearchActivityViewModel(items));

    expect(rows).toMatchObject([
      {
        kind: 'browse',
        label: '浏览 1 个页面',
        pages: []
      }
    ]);
  });

  it('keeps pending entries internal when a matching summary arrives without exposing a persisted status label', () => {
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

    expect(activity.pendingEntries).toHaveLength(0);
    expect(buildResearchSummaryLabelViewModel(activity)?.text).toBe('搜索到 10 个网页');
    expect(buildResearchTimelineRowsFromActivity(activity).map((row) => row.label)).toEqual(['搜索到 10 个网页']);
  });
});
