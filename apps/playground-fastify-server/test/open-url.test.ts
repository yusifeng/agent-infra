import { afterEach, describe, expect, it, vi } from 'vitest';

import { createRunSearchPlannerState } from '../src/tools/search-planner.js';
import { createOpenUrlTool } from '../src/tools/open-url.js';

describe('createOpenUrlTool', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('opens a page, extracts readable text, and updates browse budget state', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        url: 'https://example.com/wiki/hayami',
        text: async () => `
          <html>
            <head>
              <title>速水玲香 - 百科</title>
              <meta property="og:site_name" content="Example Wiki" />
            </head>
            <body>
              <article>
                <p>速水玲香是《金田一少年之事件簿》中的角色。</p>
                <p>她是作品中的人气偶像，也是重要剧情人物。</p>
              </article>
            </body>
          </html>
        `
      })
    );

    const state = createRunSearchPlannerState('expert');
    state.phase = 'browse';
    state.latestSearchResults = [
      {
        url: 'https://example.com/wiki/hayami',
        title: '速水玲香 - 百科',
        snippet: '角色介绍。',
        domain: 'example.com'
      }
    ];
    const tool = createOpenUrlTool({
      plannerState: state
    });

    const result = await tool.execute('tool-call-1', {
      url: 'https://example.com/wiki/hayami'
    });

    expect(result.details).toMatchObject({
      kind: 'open-url-summary',
      title: '速水玲香 - 百科',
      siteName: 'Example Wiki'
    });
    expect(result.artifact).toMatchObject({
      kind: 'open-url-content',
      url: 'https://example.com/wiki/hayami'
    });
    expect(state.openUrlCalls).toBe(1);
    expect(state.openedUrls).toContain('https://example.com/wiki/hayami');
    expect(state.openedDomains).toContain('example.com');
  });

  it('blocks duplicate domains in the same run', async () => {
    const state = createRunSearchPlannerState('expert');
    state.phase = 'browse';
    state.latestSearchResults = [
      {
        url: 'https://example.com/wiki/hayami',
        title: '速水玲香 - 百科',
        snippet: '角色介绍。',
        domain: 'example.com'
      }
    ];
    state.openedDomains = ['example.com'];
    const tool = createOpenUrlTool({
      plannerState: state
    });

    const result = await tool.execute('tool-call-1', {
      url: 'https://example.com/wiki/hayami-2'
    });

    expect(result.details).toMatchObject({
      status: 'blocked_by_policy',
      reason: 'duplicate_open_domain'
    });
  });

  it('blocks page opens once browse budget is exhausted', async () => {
    const state = createRunSearchPlannerState('quick');
    state.phase = 'browse';
    state.latestSearchResults = [
      {
        url: 'https://example.com/wiki/hayami',
        title: '速水玲香 - 百科',
        snippet: '角色介绍。',
        domain: 'example.com'
      }
    ];
    state.openUrlCalls = 2;
    const tool = createOpenUrlTool({
      plannerState: state
    });

    const result = await tool.execute('tool-call-1', {
      url: 'https://example.com/wiki/hayami'
    });

    expect(result.details).toMatchObject({
      status: 'blocked_by_policy',
      reason: 'open_url_budget_exceeded'
    });
  });

  it('returns failed content quality when the page cannot be fetched cleanly', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 503,
        url: 'https://example.com/down',
        text: async () => ''
      })
    );

    const state = createRunSearchPlannerState('expert');
    state.phase = 'browse';
    state.latestSearchResults = [
      {
        url: 'https://example.com/down',
        title: 'Temporary failure',
        snippet: 'Unavailable',
        domain: 'example.com'
      }
    ];
    const tool = createOpenUrlTool({
      plannerState: state
    });

    const result = await tool.execute('tool-call-1', {
      url: 'https://example.com/down'
    });

    expect(result.artifact).toMatchObject({
      kind: 'open-url-content',
      contentQuality: 'failed'
    });
    expect(state.openUrlCalls).toBe(1);
  });

  it('stores opened page identity from the final redirected URL', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        url: 'https://www.example.com/wiki/hayami',
        text: async () => `
          <html>
            <head><title>速水玲香 - 百科</title></head>
            <body><p>正文。</p></body>
          </html>
        `
      })
    );

    const state = createRunSearchPlannerState('expert');
    state.phase = 'browse';
    state.latestSearchResults = [
      {
        url: 'http://example.com/wiki/hayami',
        title: '速水玲香 - 百科',
        snippet: '角色介绍。',
        domain: 'example.com'
      }
    ];
    const tool = createOpenUrlTool({
      plannerState: state
    });

    await tool.execute('tool-call-1', {
      url: 'http://example.com/wiki/hayami'
    });

    expect(state.openedUrls).toContain('https://www.example.com/wiki/hayami');
    expect(state.openedDomains).toContain('www.example.com');
  });
});
