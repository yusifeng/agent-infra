import { describe, expect, it } from 'vitest';

import { getDefaultThreadTitle, isDefaultThreadTitle } from '../src/features/thread-title/default-thread-title.js';

describe('default thread title rules', () => {
  it('treats null, blank, and the placeholder title as default', () => {
    expect(isDefaultThreadTitle(null)).toBe(true);
    expect(isDefaultThreadTitle(undefined)).toBe(true);
    expect(isDefaultThreadTitle('')).toBe(true);
    expect(isDefaultThreadTitle('   ')).toBe(true);
    expect(isDefaultThreadTitle(getDefaultThreadTitle())).toBe(true);
    expect(isDefaultThreadTitle(`  ${getDefaultThreadTitle()}  `)).toBe(true);
  });

  it('treats non-placeholder titles as non-default', () => {
    expect(isDefaultThreadTitle('Integration Thread')).toBe(false);
    expect(isDefaultThreadTitle('验证码问题')).toBe(false);
  });
});
