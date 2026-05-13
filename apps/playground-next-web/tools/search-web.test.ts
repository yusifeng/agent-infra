import { describe, expect, it } from 'vitest';

import { resolveSearchPlannerMode } from './search-web-with-policy';
import { normalizeSearchRequest } from './search-web';

describe('playground web search tools', () => {
  it('normalizes search requests within provider bounds', () => {
    expect(
      normalizeSearchRequest({
        query: '  agent infra  ',
        maxResults: 99,
        topic: 'news',
        searchDepth: 'advanced'
      })
    ).toEqual({
      query: 'agent infra',
      maxResults: 10,
      topic: 'news',
      searchDepth: 'advanced'
    });
  });

  it('uses expert search mode for DeepSeek pro model', () => {
    expect(resolveSearchPlannerMode('deepseek-v4-pro')).toBe('expert');
    expect(resolveSearchPlannerMode('gpt-4o-mini')).toBe('quick');
  });
});
