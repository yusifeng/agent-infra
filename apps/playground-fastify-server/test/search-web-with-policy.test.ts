import { describe, expect, it, vi } from 'vitest';

import type { WebSearchProvider } from '../src/search/provider.js';
import { createRunSearchPlannerState } from '../src/tools/search-planner.js';
import { createPolicyAwareSearchWebTool, evaluateSearchWebPolicy, resolveSearchPlannerMode } from '../src/tools/search-web-with-policy.js';

function createProvider(): WebSearchProvider {
  return {
    search: vi.fn().mockResolvedValue({
      query: '速水玲香 金田一少年事件簿',
      provider: 'tavily',
      answer: null,
      retrievedAt: '2026-05-11T00:00:00.000Z',
      results: [
        {
          rank: 1,
          title: '速水玲香 - 百科',
          url: 'https://example.com/wiki/hayami',
          snippet: '《金田一少年之事件簿》中的角色。',
          sourceName: 'example',
          hostname: 'example.com',
          publishedAt: '2026-05-11'
        },
        {
          rank: 2,
          title: '速水玲香 - Fandom',
          url: 'https://fandom.example/hayami',
          snippet: '角色介绍。',
          sourceName: 'fandom',
          hostname: 'fandom.example',
          publishedAt: '2026-05-11'
        }
      ]
    })
  };
}

describe('searchWeb policy gate', () => {
  it('maps deepseek model ids to planner modes', () => {
    expect(resolveSearchPlannerMode('deepseek-v4-pro')).toBe('expert');
    expect(resolveSearchPlannerMode('deepseek-v4-flash')).toBe('quick');
    expect(resolveSearchPlannerMode('gpt-4o-mini')).toBe('quick');
  });

  it('allows the first search and updates planner state with candidates', async () => {
    const provider = createProvider();
    const state = createRunSearchPlannerState('quick');
    const tool = createPolicyAwareSearchWebTool({
      provider,
      plannerState: state
    });

    const result = await tool.execute('tool-call-1', {
      query: '速水玲香 金田一少年事件簿'
    });

    expect(provider.search).toHaveBeenCalledTimes(1);
    expect(result.details).toMatchObject({
      kind: 'web-search-summary',
      query: '速水玲香 金田一少年事件簿',
      resultCount: 2
    });
    expect(state.searchCalls).toBe(1);
    expect(state.latestSearchResults).toHaveLength(2);
    expect(state.phase).toBe('browse');
  });

  it('blocks duplicate queries with a structured policy result', async () => {
    const provider = createProvider();
    const state = createRunSearchPlannerState('expert');
    state.normalizedQueries = ['速水玲香 金田一'];
    const tool = createPolicyAwareSearchWebTool({
      provider,
      plannerState: state
    });

    const result = await tool.execute('tool-call-1', {
      query: ' "速水玲香" 金田一 角色 详细 '
    });

    expect(provider.search).not.toHaveBeenCalled();
    expect(result.details).toMatchObject({
      status: 'blocked_by_policy',
      reason: 'duplicate_query',
      allowedNextTools: []
    });
    expect(state.consecutivePolicyBlocks).toBe(1);
  });

  it('redirects a follow-up search toward openUrl once results already exist', async () => {
    const provider = createProvider();
    const state = createRunSearchPlannerState('expert');
    state.searchCalls = 1;
    state.latestSearchResults = [
      {
        url: 'https://example.com/wiki/hayami',
        title: '速水玲香 - 百科',
        snippet: '《金田一少年之事件簿》中的角色。',
        domain: 'example.com'
      }
    ];
    state.phase = 'browse';
    const tool = createPolicyAwareSearchWebTool({
      provider,
      plannerState: state
    });

    const result = await tool.execute('tool-call-1', {
      query: '速水玲香 登场事件'
    });

    expect(provider.search).not.toHaveBeenCalled();
    expect(result.details).toMatchObject({
      status: 'redirected_by_policy',
      suggestedToolCall: {
        name: 'openUrl',
        args: {
          url: 'https://example.com/wiki/hayami'
        }
      }
    });
    expect(state.consecutivePolicyBlocks).toBe(1);
  });

  it('blocks search when the remaining search budget is exhausted and there are no candidates to browse', async () => {
    const provider = createProvider();
    const state = createRunSearchPlannerState('quick');
    state.searchCalls = 1;
    const tool = createPolicyAwareSearchWebTool({
      provider,
      plannerState: state
    });

    const result = await tool.execute('tool-call-1', {
      query: '速水玲香 绑架事件'
    });

    expect(provider.search).not.toHaveBeenCalled();
    expect(result.details).toMatchObject({
      status: 'blocked_by_policy',
      reason: 'search_budget_exceeded'
    });
  });

  it('drives the phase to answer after repeated policy blocks', () => {
    const state = createRunSearchPlannerState('quick');
    state.consecutivePolicyBlocks = 2;

    const decision = evaluateSearchWebPolicy({
      state,
      query: '速水玲香 金田一'
    });

    expect(decision).toMatchObject({
      action: 'block',
      reason: 'phase_disallows_search'
    });
    expect(state.phase).toBe('answer');
  });
});
