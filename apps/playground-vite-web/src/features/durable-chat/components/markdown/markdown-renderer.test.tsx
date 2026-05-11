import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { MarkdownRenderer } from './markdown-renderer';
import {
  prepareMarkdownRender,
  renderHighlightedMarkdown,
  scheduleLowPriorityMarkdownTask,
  touchMarkdownCache
} from './markdown-service';

vi.mock('./markdown-service', () => ({
  prepareMarkdownRender: vi.fn(),
  renderHighlightedMarkdown: vi.fn(),
  scheduleLowPriorityMarkdownTask: vi.fn(),
  touchMarkdownCache: vi.fn()
}));

vi.mock('@/features/durable-chat/repo/browser-clipboard', () => ({
  writeClipboardText: vi.fn()
}));

const prepareMarkdownRenderMock = vi.mocked(prepareMarkdownRender);
const renderHighlightedMarkdownMock = vi.mocked(renderHighlightedMarkdown);
const scheduleLowPriorityMarkdownTaskMock = vi.mocked(scheduleLowPriorityMarkdownTask);
const touchMarkdownCacheMock = vi.mocked(touchMarkdownCache);

describe('MarkdownRenderer', () => {
  it('skips async code highlighting while animateBlocks is disabled', async () => {
    prepareMarkdownRenderMock.mockReturnValue({
      key: 'markdown-key',
      hash: 'markdown-hash',
      cached: null,
      rawHtml: '<pre><code>const answer = 42;</code></pre>',
      safeBaseHtml: '<pre><code>const answer = 42;</code></pre>',
      initialHtml: '<pre><code>const answer = 42;</code></pre>',
      hasCodeBlocks: true
    });
    scheduleLowPriorityMarkdownTaskMock.mockImplementation((run) => {
      queueMicrotask(run);
      return () => {};
    });
    renderHighlightedMarkdownMock.mockResolvedValue('<div data-component="markdown-code"><pre><code>highlighted</code></pre></div>');

    render(<MarkdownRenderer animateBlocks={false} text={'```ts\nconst answer = 42;\n```'} />);

    await waitFor(() => {
      expect(screen.getByText('const answer = 42;')).toBeTruthy();
    });

    expect(renderHighlightedMarkdownMock).not.toHaveBeenCalled();
    expect(scheduleLowPriorityMarkdownTaskMock).not.toHaveBeenCalled();
    expect(touchMarkdownCacheMock).not.toHaveBeenCalled();
  });
});
