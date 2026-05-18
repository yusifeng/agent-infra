import { describe, expect, it } from 'vitest';

import { formatDurationMs, formatShortId, formatTokenCount } from './format';

describe('observability format helpers', () => {
  it('formats short ids without expanding layout width', () => {
    expect(formatShortId('run_01JZ9N41TH5MZ47Z50D2KQZPVE')).toBe('run_01JZ9N41...');
    expect(formatShortId('run_short')).toBe('run_short');
    expect(formatShortId(null)).toBe('-');
  });

  it('formats durations without emitting impossible seconds', () => {
    expect(formatDurationMs(420)).toBe('420ms');
    expect(formatDurationMs(1250)).toBe('1.3s');
    expect(formatDurationMs(119_600)).toBe('2m 0s');
    expect(formatDurationMs(null)).toBe('-');
  });

  it('formats token totals from common usage field names', () => {
    expect(formatTokenCount({ totalTokens: 21542 })).toBe('21,542');
    expect(formatTokenCount({ total_tokens: 10059 })).toBe('10,059');
    expect(formatTokenCount({ schemaVersion: 1, tokens: { input: 12, output: 8, total: 20 } })).toBe('20');
    expect(formatTokenCount(null)).toBe('-');
  });
});
