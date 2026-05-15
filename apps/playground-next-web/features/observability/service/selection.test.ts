import { describe, expect, it } from 'vitest';

import { buildObservabilityQuery, normalizeObservabilityQueryValue, resolveObservabilitySelection } from './selection';

describe('observability selection helpers', () => {
  const items = [{ id: 'thread-a' }, { id: 'thread-b' }];

  it('normalizes blank query values to null', () => {
    expect(normalizeObservabilityQueryValue(' thread-a ')).toBe('thread-a');
    expect(normalizeObservabilityQueryValue('   ')).toBeNull();
    expect(normalizeObservabilityQueryValue(null)).toBeNull();
  });

  it('selects requested ids when they exist', () => {
    expect(resolveObservabilitySelection(items, 'thread-b')).toEqual({
      selectedId: 'thread-b',
      status: 'selected',
      requestedId: 'thread-b'
    });
  });

  it('falls back to the first item when the query is missing', () => {
    expect(resolveObservabilitySelection(items, null)).toEqual({
      selectedId: 'thread-a',
      status: 'fallback',
      requestedId: null
    });
  });

  it('marks stale query values while keeping the page recoverable', () => {
    expect(resolveObservabilitySelection(items, 'missing-thread')).toEqual({
      selectedId: 'thread-a',
      status: 'stale',
      requestedId: 'missing-thread'
    });
  });

  it('preserves requested ids when no selectable items exist', () => {
    expect(resolveObservabilitySelection([], 'missing-thread')).toEqual({
      selectedId: null,
      status: 'empty',
      requestedId: 'missing-thread'
    });
  });

  it('builds stable observability query strings', () => {
    expect(buildObservabilityQuery({ threadId: 'thread-a', runId: 'run-a' })).toBe('?threadId=thread-a&runId=run-a');
    expect(buildObservabilityQuery({ threadId: 'thread-a', runId: null })).toBe('?threadId=thread-a');
    expect(buildObservabilityQuery({ threadId: null, runId: null })).toBe('');
  });
});
