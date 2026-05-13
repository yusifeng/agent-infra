import { describe, expect, it } from 'vitest';

import { buildAuthHref, resolveSafeNextPath, type SearchParamReader } from './auth-url';

function params(input: Record<string, string | null>): SearchParamReader {
  return {
    get(name: string) {
      return input[name] ?? null;
    }
  };
}

describe('auth url helpers', () => {
  it('falls back to /new when next is missing or unsafe', () => {
    expect(resolveSafeNextPath(params({}))).toBe('/new');
    expect(resolveSafeNextPath(params({ next: 'https://example.com' }))).toBe('/new');
    expect(resolveSafeNextPath(params({ next: '//example.com/path' }))).toBe('/new');
  });

  it('preserves safe relative next paths', () => {
    expect(resolveSafeNextPath(params({ next: '/chat/thread-1?tab=latest' }))).toBe('/chat/thread-1?tab=latest');
  });

  it('builds auth links with next and explicit extra params only', () => {
    expect(buildAuthHref('/login', params({ next: '/new', reset: '1' }))).toBe('/login?next=%2Fnew');
    expect(buildAuthHref('/login', params({ next: '/new' }), { reset: '1' })).toBe('/login?next=%2Fnew&reset=1');
  });
});
