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
  | { outcome: 'renamed'; title: string; updatedAt: string };

type AutoThreadTitleLogger = {
  info?: (payload: Record<string, unknown>, message: string) => void;
  error?: (payload: Record<string, unknown>, message: string) => void;
};

type AutoTitleSourceMessage = {
  id?: string;
  runId?: string | null;
  role: string;
  parts: Array<{ type: string; textValue?: string | null }>;
};

function extractMessageText(message: AutoTitleSourceMessage | null | undefined) {
  if (!message) {
    return '';
  }

  return message.parts
    .filter((part) => part.type === 'text' && typeof part.textValue === 'string')
    .map((part) => part.textValue?.trim() ?? '')
    .filter(Boolean)
    .join('\n')
    .trim();
}

export function extractAutoTitleSourceText(
  messages: AutoTitleSourceMessage[],
  run?: { id: string; triggerMessageId?: string | null } | null
) {
  if (!run) {
    const firstUserMessage = messages.find((message) => message.role === 'user');
    const fallbackSourceText = extractMessageText(firstUserMessage);
    return fallbackSourceText.length > MAX_SOURCE_TEXT_LENGTH
      ? fallbackSourceText.slice(0, MAX_SOURCE_TEXT_LENGTH).trim()
      : fallbackSourceText;
  }

  const triggerUserMessage =
    messages.find((message) => message.id === run.triggerMessageId) ??
    messages.find((message) => message.role === 'user');
  const userText = extractMessageText(triggerUserMessage);
  const assistantText = messages
    .filter((message) => message.role === 'assistant' && message.runId === run.id)
    .map((message) => extractMessageText(message))
    .filter(Boolean)
    .join('\n')
    .trim();

  const sourceText = [
    userText ? `User question:\n${userText}` : '',
    assistantText ? `Assistant answer:\n${assistantText}` : ''
  ]
    .filter(Boolean)
    .join('\n\n')
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
  runId: string;
  generator: ThreadTitleGenerator | null;
  log?: AutoThreadTitleLogger;
}): Promise<AutoThreadTitleResult> {
  const { services, threadId, runId, generator, log } = args;
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
    const run = await services.repos.runRepo.findById(runId);
    const sourceText = extractAutoTitleSourceText(messages, run ? { id: run.id, triggerMessageId: run.triggerMessageId } : null);
    if (!sourceText) {
      log?.info?.(
        {
          outcome: 'skipped',
          reason: 'no_source_text',
          threadId,
          runId
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
      const renamedThread = await services.app.threads.rename({
        threadId,
        title: generatedTitle
      });
      const persistedTitle = renamedThread.title;

      if (typeof persistedTitle !== 'string') {
        log?.error?.(
          {
            outcome: 'failed',
            reason: 'rename_writeback_failed',
            threadId,
            persistedTitle
          },
          'Auto-title rename returned a non-string persisted title'
        );
        return { outcome: 'failed', reason: 'rename_writeback_failed' };
      }

      log?.info?.(
        {
          outcome: 'renamed',
          threadId,
          title: persistedTitle
        },
        'Auto-titled thread'
      );
      return {
        outcome: 'renamed',
        title: persistedTitle,
        updatedAt: renamedThread.updatedAt.toISOString()
      };
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
          'Generate a concise chat thread title based on this completed Q&A turn. Focus on the main topic or task, not a full-sentence answer. Return only the title text, without quotes, markdown, or punctuation decoration.'
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
