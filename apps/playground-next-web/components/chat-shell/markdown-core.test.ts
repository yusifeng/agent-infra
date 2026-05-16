import { describe, expect, it } from 'vitest';

import { highlightCodeBlocks, stabilizeHighlightedCodeBlock, wrapFallbackCodeBlocks } from './markdown-core';
import { SHIKI_THEME } from './markdown-theme';

describe('markdown code block rendering', () => {
  it('wraps fallback code blocks with the stable code block chrome', () => {
    const html = '<p>Before</p><pre><code class="language-json">{&quot;ok&quot;:true}</code></pre>';

    const wrapped = wrapFallbackCodeBlocks(html);

    expect(wrapped).toContain('data-component="markdown-code"');
    expect(wrapped).toContain('data-code-theme="stable-dark"');
    expect(wrapped).toContain('data-copy-code');
    expect(wrapped).toContain('<pre><code class="language-json">{&quot;ok&quot;:true}</code></pre>');
  });

  it('uses the fallback wrapper when syntax highlighting is unavailable', async () => {
    const html = '<pre><code>plain</code></pre>';

    const highlighted = await highlightCodeBlocks(html, async () => {
      throw new Error('shiki unavailable');
    });

    expect(highlighted).toContain('data-component="markdown-code"');
    expect(highlighted).toContain('data-code-theme="stable-dark"');
    expect(highlighted).toContain('data-copy-code');
    expect(highlighted).toContain('<pre><code>plain</code></pre>');
  });

  it('uses a dark syntax theme to match the streaming fallback block', () => {
    expect(SHIKI_THEME).toBe('github-dark');
  });

  it('strips Shiki pre background styles so the app wrapper keeps a stable dark theme', async () => {
    const html = '<pre><code class="language-ts">const value = 1;</code></pre>';

    const highlighted = await highlightCodeBlocks(html, async () => ({
      highlighter: {
        codeToHtml: () =>
          '<pre class="shiki github-dark" style="background-color:#fff;color:#000"><code><span style="color:#79c0ff">const</span> value = 1;</code></pre>',
        getLoadedLanguages: () => ['ts'],
        loadLanguage: async () => undefined
      },
      ensureLanguageLoaded: async () => undefined,
      normalizeLanguage: () => 'ts'
    }));

    expect(highlighted).toContain('data-component="markdown-code"');
    expect(highlighted).toContain('<pre class="shiki github-dark" data-code-theme="stable-dark">');
    expect(highlighted).not.toContain('background-color:#fff');
    expect(highlighted).toContain('style="color:#79c0ff"');
  });

  it('normalizes highlighted pre elements without touching token span styles', () => {
    const highlighted = stabilizeHighlightedCodeBlock(
      '<pre class="shiki" style="background-color:#fff"><code><span style="color:#79c0ff">x</span></code></pre>'
    );

    expect(highlighted).toContain('<pre class="shiki" data-code-theme="stable-dark">');
    expect(highlighted).not.toContain('background-color:#fff');
    expect(highlighted).toContain('style="color:#79c0ff"');
  });
});
