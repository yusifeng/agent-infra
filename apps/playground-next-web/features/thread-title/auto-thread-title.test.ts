import { describe, expect, it } from 'vitest';

import { normalizeGeneratedThreadTitle } from './auto-thread-title';

describe('normalizeGeneratedThreadTitle', () => {
  it('shortens long Chinese generated titles without punctuation decoration', () => {
    expect(normalizeGeneratedThreadTitle('【金田一少年事件簿与名侦探柯南的客观比较】')).toBe('金田一少年事件簿与名侦探');
  });

  it('keeps concise English titles intact', () => {
    expect(normalizeGeneratedThreadTitle('Generated Thread Title')).toBe('Generated Thread Title');
  });
});
