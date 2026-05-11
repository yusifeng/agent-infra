import type { PlaygroundAppServices } from '../src/playground-base-services.js';
import { describe, expect, it, vi } from 'vitest';

import { maybeAutoTitleThread } from '../src/features/thread-title/auto-thread-title.js';

function createServices(options?: {
  threadTitles?: Array<string | null>;
  messages?: Array<{ role: string; parts: Array<{ type: string; textValue?: string | null }> }>;
  renameImpl?: (args: { threadId: string; title: string }) => Promise<void>;
}) {
  const threadTitles = [...(options?.threadTitles ?? ['New Thread'])];
  const info = vi.fn();
  const error = vi.fn();
  const rename = vi.fn(options?.renameImpl ?? (async () => {}));

  const services = {
    repos: {
      threadRepo: {
        findById: vi.fn(async () => {
          const nextTitle = threadTitles.shift();
          if (typeof nextTitle === 'undefined') {
            return null;
          }

          return {
            id: 'thread-1',
            title: nextTitle
          };
        })
      },
      messageRepo: {
        listByThread: vi.fn(async () =>
          options?.messages ?? [
            {
              role: 'user',
              parts: [{ type: 'text', textValue: '请帮我排查验证码问题' }]
            }
          ]
        )
      }
    },
    app: {
      threads: {
        rename
      }
    }
  } as unknown as PlaygroundAppServices;

  return {
    services,
    log: { info, error },
    rename
  };
}

describe('maybeAutoTitleThread', () => {
  it('reports no_generator when no title generator is available', async () => {
    const { services, log } = createServices();

    const result = await maybeAutoTitleThread({
      services,
      threadId: 'thread-1',
      generator: null,
      log
    });

    expect(result).toEqual({
      outcome: 'skipped',
      reason: 'no_generator'
    });
    expect(log.info).toHaveBeenCalledWith(
      expect.objectContaining({
        outcome: 'skipped',
        reason: 'no_generator',
        threadId: 'thread-1'
      }),
      'Skipped auto-title thread'
    );
  });

  it('reports no_source_text when the thread has no usable first user text', async () => {
    const { services, log, rename } = createServices({
      messages: [
        {
          role: 'assistant',
          parts: [{ type: 'text', textValue: 'hello' }]
        }
      ]
    });

    const result = await maybeAutoTitleThread({
      services,
      threadId: 'thread-1',
      generator: {
        generateTitle: vi.fn(async () => '不会被调用')
      },
      log
    });

    expect(result).toEqual({
      outcome: 'skipped',
      reason: 'no_source_text'
    });
    expect(rename).not.toHaveBeenCalled();
    expect(log.info).toHaveBeenCalledWith(
      expect.objectContaining({
        outcome: 'skipped',
        reason: 'no_source_text',
        threadId: 'thread-1'
      }),
      'Skipped auto-title thread'
    );
  });

  it('reports normalized_title_empty when the generator returns a default/empty title', async () => {
    const { services, log, rename } = createServices();

    const result = await maybeAutoTitleThread({
      services,
      threadId: 'thread-1',
      generator: {
        generateTitle: vi.fn(async () => 'New Thread')
      },
      log
    });

    expect(result).toEqual({
      outcome: 'skipped',
      reason: 'normalized_title_empty'
    });
    expect(rename).not.toHaveBeenCalled();
    expect(log.info).toHaveBeenCalledWith(
      expect.objectContaining({
        outcome: 'skipped',
        reason: 'normalized_title_empty',
        threadId: 'thread-1'
      }),
      'Skipped auto-title thread'
    );
  });

  it('reports title_no_longer_default before writeback when the user renames during generation', async () => {
    const { services, log, rename } = createServices({
      threadTitles: ['New Thread', '用户手动标题']
    });

    const result = await maybeAutoTitleThread({
      services,
      threadId: 'thread-1',
      generator: {
        generateTitle: vi.fn(async () => '验证码问题排查')
      },
      log
    });

    expect(result).toEqual({
      outcome: 'skipped',
      reason: 'title_no_longer_default',
      stage: 'before_writeback'
    });
    expect(rename).not.toHaveBeenCalled();
    expect(log.info).toHaveBeenCalledWith(
      expect.objectContaining({
        outcome: 'skipped',
        reason: 'title_no_longer_default',
        stage: 'before_writeback',
        threadId: 'thread-1',
        title: '用户手动标题'
      }),
      'Skipped auto-title thread'
    );
  });

  it('reports provider_request_failed when title generation throws', async () => {
    const { services, log, rename } = createServices();

    const result = await maybeAutoTitleThread({
      services,
      threadId: 'thread-1',
      generator: {
        generateTitle: vi.fn(async () => {
          throw new Error('provider down');
        })
      },
      log
    });

    expect(result).toEqual({
      outcome: 'failed',
      reason: 'provider_request_failed'
    });
    expect(rename).not.toHaveBeenCalled();
    expect(log.error).toHaveBeenCalledWith(
      expect.objectContaining({
        outcome: 'failed',
        reason: 'provider_request_failed',
        threadId: 'thread-1',
        err: expect.any(Error)
      }),
      'Failed to auto-title thread'
    );
  });

  it('reports repo_read_failed when repository reads throw before generation starts', async () => {
    const info = vi.fn();
    const error = vi.fn();
    const services = {
      repos: {
        threadRepo: {
          findById: vi.fn(async () => {
            throw new Error('db unavailable');
          })
        },
        messageRepo: {
          listByThread: vi.fn()
        }
      },
      app: {
        threads: {
          rename: vi.fn()
        }
      }
    } as unknown as PlaygroundAppServices;

    const result = await maybeAutoTitleThread({
      services,
      threadId: 'thread-1',
      generator: {
        generateTitle: vi.fn(async () => '不会被调用')
      },
      log: { info, error }
    });

    expect(result).toEqual({
      outcome: 'failed',
      reason: 'repo_read_failed'
    });
    expect(error).toHaveBeenCalledWith(
      expect.objectContaining({
        outcome: 'failed',
        reason: 'repo_read_failed',
        threadId: 'thread-1',
        err: expect.any(Error)
      }),
      'Failed to auto-title thread'
    );
  });

  it('reports rename_writeback_failed when the durable rename operation throws', async () => {
    const { services, log } = createServices({
      threadTitles: ['New Thread', 'New Thread'],
      renameImpl: async () => {
        throw new Error('write failed');
      }
    });

    const result = await maybeAutoTitleThread({
      services,
      threadId: 'thread-1',
      generator: {
        generateTitle: vi.fn(async () => '验证码问题排查')
      },
      log
    });

    expect(result).toEqual({
      outcome: 'failed',
      reason: 'rename_writeback_failed'
    });
    expect(log.error).toHaveBeenCalledWith(
      expect.objectContaining({
        outcome: 'failed',
        reason: 'rename_writeback_failed',
        threadId: 'thread-1',
        title: '验证码问题排查',
        err: expect.any(Error)
      }),
      'Failed to auto-title thread'
    );
  });
});
