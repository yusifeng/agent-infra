import { resolveRuntimePiConfigFromEnv } from '@agent-infra/runtime-pi/config';

import { isDefaultThreadTitle } from './default-thread-title.js';
import type { PlaygroundAppServices } from '../../playground-base-services.js';

const OPENAI_BASE_URL = 'https://api.openai.com/v1';
const DEEPSEEK_BASE_URL = 'https://api.deepseek.com/v1';
const MAX_SOURCE_TEXT_LENGTH = 800;

export type ThreadTitleGenerator = {
  generateTitle(input: { sourceText: string }): Promise<string | null>;
};

export type AutoThreadTitleResult =
  | { outcome: 'skipped'; reason: 'no_generator' }
  | { outcome: 'skipped'; reason: 'thread_unavailable'; stage: 'initial_check' | 'before_writeback' }
  | { outcome: 'skipped'; reason: 'title_no_longer_default'; stage: 'initial_check' | 'before_writeback' }
  | { outcome: 'skipped'; reason: 'no_source_text' }
  | { outcome: 'skipped'; reason: 'normalized_title_empty' }
  | { outcome: 'failed'; reason: 'repo_read_failed' }
  | { outcome: 'failed'; reason: 'provider_request_failed' }
  | { outcome: 'failed'; reason: 'rename_writeback_failed' }
  | { outcome: 'renamed'; title: string };

type AutoThreadTitleLogger = {
  info?: (payload: Record<string, unknown>, message: string) => void;
  error?: (payload: Record<string, unknown>, message: string) => void;
};

export function extractAutoTitleSourceText(
  messages: Array<{ role: string; parts: Array<{ type: string; textValue?: string | null }> }>
) {
  const firstUserMessage = messages.find((message) => message.role === 'user');
  if (!firstUserMessage) {
    return '';
  }

  const sourceText = firstUserMessage.parts
    .filter((part) => part.type === 'text' && typeof part.textValue === 'string')
    .map((part) => part.textValue?.trim() ?? '')
    .filter(Boolean)
    .join('\n')
    .trim();

  return sourceText.length > MAX_SOURCE_TEXT_LENGTH ? sourceText.slice(0, MAX_SOURCE_TEXT_LENGTH).trim() : sourceText;
}

export function normalizeGeneratedThreadTitle(title: string | null | undefined) {
  if (!title) {
    return null;
  }

  const normalizedTitle = title
    .trim()
    .replace(/^["'“”‘’]+|["'“”‘’]+$/g, '')
    .replace(/\s+/g, ' ');

  if (!normalizedTitle || isDefaultThreadTitle(normalizedTitle)) {
    return null;
  }

  return normalizedTitle;
}

export async function maybeAutoTitleThread(args: {
  services: PlaygroundAppServices;
  threadId: string;
  generator: ThreadTitleGenerator | null;
  log?: AutoThreadTitleLogger;
}): Promise<AutoThreadTitleResult> {
  const { services, threadId, generator, log } = args;
  if (!generator) {
    log?.info?.(
      {
        outcome: 'skipped',
        reason: 'no_generator',
        threadId
      },
      'Skipped auto-title thread'
    );
    return { outcome: 'skipped', reason: 'no_generator' };
  }

  try {
    const initialThread = await services.repos.threadRepo.findById(threadId);
    if (!initialThread) {
      log?.info?.(
        {
          outcome: 'skipped',
          reason: 'thread_unavailable',
          stage: 'initial_check',
          threadId
        },
        'Skipped auto-title thread'
      );
      return { outcome: 'skipped', reason: 'thread_unavailable', stage: 'initial_check' };
    }
    if (!isDefaultThreadTitle(initialThread.title)) {
      log?.info?.(
        {
          outcome: 'skipped',
          reason: 'title_no_longer_default',
          stage: 'initial_check',
          threadId,
          title: initialThread.title
        },
        'Skipped auto-title thread'
      );
      return { outcome: 'skipped', reason: 'title_no_longer_default', stage: 'initial_check' };
    }

    const messages = await services.repos.messageRepo.listByThread(threadId);
    const sourceText = extractAutoTitleSourceText(messages);
    if (!sourceText) {
      log?.info?.(
        {
          outcome: 'skipped',
          reason: 'no_source_text',
          threadId
        },
        'Skipped auto-title thread'
      );
      return { outcome: 'skipped', reason: 'no_source_text' };
    }

    let generatedTitle: string | null;
    try {
      generatedTitle = normalizeGeneratedThreadTitle(await generator.generateTitle({ sourceText }));
    } catch (error) {
      log?.error?.(
        {
          outcome: 'failed',
          reason: 'provider_request_failed',
          err: error,
          threadId
        },
        'Failed to auto-title thread'
      );
      return { outcome: 'failed', reason: 'provider_request_failed' };
    }

    if (!generatedTitle) {
      log?.info?.(
        {
          outcome: 'skipped',
          reason: 'normalized_title_empty',
          threadId
        },
        'Skipped auto-title thread'
      );
      return { outcome: 'skipped', reason: 'normalized_title_empty' };
    }

    const latestThread = await services.repos.threadRepo.findById(threadId);
    if (!latestThread) {
      log?.info?.(
        {
          outcome: 'skipped',
          reason: 'thread_unavailable',
          stage: 'before_writeback',
          threadId
        },
        'Skipped auto-title thread'
      );
      return { outcome: 'skipped', reason: 'thread_unavailable', stage: 'before_writeback' };
    }
    if (!isDefaultThreadTitle(latestThread.title)) {
      log?.info?.(
        {
          outcome: 'skipped',
          reason: 'title_no_longer_default',
          stage: 'before_writeback',
          threadId,
          title: latestThread.title
        },
        'Skipped auto-title thread'
      );
      return { outcome: 'skipped', reason: 'title_no_longer_default', stage: 'before_writeback' };
    }

    try {
      await services.app.threads.rename({
        threadId,
        title: generatedTitle
      });
    } catch (error) {
      log?.error?.(
        {
          outcome: 'failed',
          reason: 'rename_writeback_failed',
          err: error,
          threadId,
          title: generatedTitle
        },
        'Failed to auto-title thread'
      );
      return { outcome: 'failed', reason: 'rename_writeback_failed' };
    }

    log?.info?.(
      {
        outcome: 'renamed',
        threadId,
        title: generatedTitle
      },
      'Auto-titled thread'
    );
    return { outcome: 'renamed', title: generatedTitle };
  } catch (error) {
    log?.error?.(
      {
        outcome: 'failed',
        reason: 'repo_read_failed',
        err: error,
        threadId
      },
      'Failed to auto-title thread'
    );
    return { outcome: 'failed', reason: 'repo_read_failed' };
  }
}

type CompletionResponse = {
  choices?: Array<{
    message?: {
      content?: string | null;
    };
  }>;
};

async function requestChatCompletion(input: {
  baseUrl: string;
  apiKey: string;
  model: string;
  sourceText: string;
  disableThinking?: boolean;
}) {
  const payload = {
    model: input.model,
    temperature: 0.2,
    max_tokens: 48,
    messages: [
      {
        role: 'system',
        content:
          'Generate a concise chat thread title from the user request. Return only the title text, without quotes, markdown, or punctuation decoration.'
      },
      {
        role: 'user',
        content: `User request:\n${input.sourceText}`
      }
    ],
    ...(input.disableThinking
      ? {
          thinking: {
            type: 'disabled'
          }
        }
      : {})
  };

  const response = await fetch(`${input.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${input.apiKey}`,
      'content-type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    throw new Error(`thread auto-title request failed (${response.status})`);
  }

  const completion = (await response.json()) as CompletionResponse;
  return completion.choices?.[0]?.message?.content?.trim() ?? null;
}

export function createEnvThreadTitleGenerator(): ThreadTitleGenerator | null {
  try {
    let config;
    try {
      config = resolveRuntimePiConfigFromEnv({
        provider: 'deepseek',
        model: 'deepseek-v4-flash'
      });
    } catch {
      config = resolveRuntimePiConfigFromEnv({
        provider: 'openai',
        model: 'gpt-4o-mini'
      });
    }

    if (config.provider === 'deepseek') {
      return {
        async generateTitle({ sourceText }) {
          return requestChatCompletion({
            baseUrl: DEEPSEEK_BASE_URL,
            apiKey: config.apiKey,
            model: config.model,
            sourceText,
            disableThinking: true
          });
        }
      };
    }

    return {
      async generateTitle({ sourceText }) {
        return requestChatCompletion({
          baseUrl: OPENAI_BASE_URL,
          apiKey: config.apiKey,
          model: config.model,
          sourceText
        });
      }
    };
  } catch {
    return null;
  }
}
