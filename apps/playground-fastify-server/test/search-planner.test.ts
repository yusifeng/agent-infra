import { describe, expect, it } from 'vitest';

import {
  createBlockedPolicyToolResult,
  createRedirectedPolicyToolResult,
  createRunSearchPlannerState,
  deriveSearchPhase,
  getRemainingBudget,
  getSearchPlannerBudget,
  normalizeSearchQuery,
  type RunSearchPlannerState
} from '../src/tools/search-planner.js';

function createState(overrides: Partial<RunSearchPlannerState> = {}): RunSearchPlannerState {
  return {
    ...createRunSearchPlannerState('quick'),
    ...overrides
  };
}

describe('search planner definitions', () => {
  it('returns mode budgets for quick and expert modes', () => {
    expect(getSearchPlannerBudget('quick')).toEqual({
      maxSearchCalls: 1,
      maxOpenUrlCalls: 2
    });
    expect(getSearchPlannerBudget('expert')).toEqual({
      maxSearchCalls: 2,
      maxOpenUrlCalls: 3
    });
  });

  it('normalizes queries by removing weak modifiers and quote noise', () => {
    expect(normalizeSearchQuery('  "速水玲香"   金田一  角色 详细 ')).toBe('速水玲香 金田一');
    expect(normalizeSearchQuery('速水玲香 人物介绍')).toBe('速水玲香');
  });

  it('derives search phase before any search happens', () => {
    expect(deriveSearchPhase(createState())).toBe('search');
  });

  it('derives browse phase once search results exist and openUrl budget remains', () => {
    expect(
      deriveSearchPhase(
        createState({
          searchCalls: 1,
          latestSearchResults: [
            {
              url: 'https://example.com/1',
              title: 'Example',
              snippet: 'Snippet',
              domain: 'example.com'
            }
          ]
        })
      )
    ).toBe('browse');
  });

  it('derives answer phase when search budget is exhausted and no browse candidates remain', () => {
    expect(
      deriveSearchPhase(
        createState({
          searchCalls: 1,
          latestSearchResults: [],
          openUrlCalls: 2
        })
      )
    ).toBe('answer');
  });

  it('derives answer phase after repeated policy blocks', () => {
    expect(
      deriveSearchPhase(
        createState({
          consecutivePolicyBlocks: 2
        })
      )
    ).toBe('answer');
  });

  it('builds blocked policy results with remaining budget', () => {
    const state = createState({
      searchCalls: 1
    });

    expect(
      createBlockedPolicyToolResult({
        state,
        reason: 'search_budget_exceeded',
        message: 'Search budget reached.',
        allowedNextTools: ['openUrl']
      })
    ).toEqual({
      status: 'blocked_by_policy',
      reason: 'search_budget_exceeded',
      message: 'Search budget reached.',
      allowedNextTools: ['openUrl'],
      remainingBudget: {
        searchWeb: 0,
        openUrl: 2
      }
    });
  });

  it('builds redirected policy results with remaining budget', () => {
    const state = createState({
      searchCalls: 1,
      latestSearchResults: [
        {
          url: 'https://example.com/1',
          title: 'Example',
          snippet: 'Snippet',
          domain: 'example.com'
        }
      ]
    });

    expect(
      createRedirectedPolicyToolResult({
        state,
        message: 'Browse a selected page instead of issuing another search.',
        suggestedToolCall: {
          name: 'openUrl',
          args: { url: 'https://example.com/1' }
        }
      })
    ).toEqual({
      status: 'redirected_by_policy',
      message: 'Browse a selected page instead of issuing another search.',
      suggestedToolCall: {
        name: 'openUrl',
        args: { url: 'https://example.com/1' }
      },
      remainingBudget: {
        searchWeb: 0,
        openUrl: 2
      }
    });
  });

  it('computes remaining budget from state counters', () => {
    expect(
      getRemainingBudget(
        createState({
          mode: 'expert',
          searchCalls: 1,
          openUrlCalls: 2
        })
      )
    ).toEqual({
      searchWeb: 1,
      openUrl: 1
    });
  });
});
