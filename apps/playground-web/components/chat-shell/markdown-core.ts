import { Marked, type Tokens } from 'marked';

import { SHIKI_THEME, type MarkdownShikiRuntime } from './markdown-shiki-runtime';

export const CODE_BLOCK_PATTERN = '<pre><code(?:\\s+class="language-([^"]*)")?>([\\s\\S]*?)<\\/code><\\/pre>';

const markedParser = new Marked({
  gfm: true,
  breaks: true
});

markedParser.use({
  renderer: {
    html(token: Tokens.HTML | Tokens.Tag) {
      return escapeHtml(token.text);
    }
  }
});

export function escapeHtml(input: string) {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function decodeHtmlEntities(input: string) {
  return input
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, '\'');
}

export function parseMarkdown(text: string) {
  const parsed = markedParser.parse(text);
  return typeof parsed === 'string' ? parsed : '';
}

export function wrapCodeBlock(codeHtml: string) {
  return `<div data-component="markdown-code">${codeHtml}<button type="button" data-copy-code aria-label="Copy code" title="Copy code">Copy</button></div>`;
}

export async function highlightCodeBlocks(
  html: string,
  getShikiRuntime: () => Promise<MarkdownShikiRuntime>
): Promise<string> {
  const codeBlockRegex = new RegExp(CODE_BLOCK_PATTERN, 'g');
  const matches = [...html.matchAll(codeBlockRegex)];

  if (matches.length === 0) {
    return html;
  }

  let runtime: MarkdownShikiRuntime;
  try {
    runtime = await getShikiRuntime();
  } catch {
    return html.replace(new RegExp(CODE_BLOCK_PATTERN, 'g'), (full) => wrapCodeBlock(full));
  }

  let result = '';
  let cursor = 0;

  for (const match of matches) {
    const full = match[0];
    const language = runtime.normalizeLanguage(match[1]);
    const escapedCode = match[2] ?? '';
    const index = match.index ?? 0;

    result += html.slice(cursor, index);

    const code = decodeHtmlEntities(escapedCode);
    let highlighted = '';

    try {
      await runtime.ensureLanguageLoaded(language);
      highlighted = runtime.highlighter.codeToHtml(code, { lang: language, theme: SHIKI_THEME });
    } catch {
      highlighted = `<pre><code>${escapedCode}</code></pre>`;
    }

    result += wrapCodeBlock(highlighted);
    cursor = index + full.length;
  }

  result += html.slice(cursor);
  return result;
}
