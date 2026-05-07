import { describe, expect, it, vi } from 'vitest';

import { writeClipboardText } from './browser-clipboard';

describe('writeClipboardText', () => {
  it('returns false when the trimmed text is empty', async () => {
    const clipboard = { writeText: vi.fn() };

    await expect(writeClipboardText('   ', { clipboard })).resolves.toBe(false);
    expect(clipboard.writeText).not.toHaveBeenCalled();
  });

  it('returns false when no clipboard is available', async () => {
    await expect(writeClipboardText('hello', { clipboard: null })).resolves.toBe(false);
  });

  it('writes normalized text to the clipboard', async () => {
    const clipboard = { writeText: vi.fn().mockResolvedValue(undefined) };

    await expect(writeClipboardText('  hello world  ', { clipboard })).resolves.toBe(true);
    expect(clipboard.writeText).toHaveBeenCalledWith('hello world');
  });

  it('preserves surrounding whitespace when trim is disabled', async () => {
    const clipboard = { writeText: vi.fn().mockResolvedValue(undefined) };

    await expect(writeClipboardText('  code();\n', { trim: false, clipboard })).resolves.toBe(true);
    expect(clipboard.writeText).toHaveBeenCalledWith('  code();\n');
  });
});
