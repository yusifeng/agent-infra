import { describe, expect, it } from 'vitest';

import { highlightCodeBlocks, wrapFallbackCodeBlocks } from './markdown-core';
import { SHIKI_THEME } from './markdown-theme';

describe('markdown code block rendering', () => {
  it('wraps fallback code blocks with the stable code block chrome', () => {
    const html = '<p>Before</p><pre><code class="language-json">{&quot;ok&quot;:true}</code></pre>';

    const wrapped = wrapFallbackCodeBlocks(html);

    expect(wrapped).toContain('data-component="markdown-code"');
    expect(wrapped).toContain('data-copy-code');
    expect(wrapped).toContain('<pre><code class="language-json">{&quot;ok&quot;:true}</code></pre>');
  });

  it('uses the fallback wrapper when syntax highlighting is unavailable', async () => {
    const html = '<pre><code>plain</code></pre>';

    const highlighted = await highlightCodeBlocks(html, async () => {
      throw new Error('shiki unavailable');
    });

    expect(highlighted).toContain('data-component="markdown-code"');
    expect(highlighted).toContain('data-copy-code');
    expect(highlighted).toContain('<pre><code>plain</code></pre>');
  });

  it('uses a dark syntax theme to match the streaming fallback block', () => {
    expect(SHIKI_THEME).toBe('github-dark');
  });
});
