import { resolveRuntimePiConfigFromEnv } from '@agent-infra/runtime-pi/config';

import { isDefaultThreadTitle } from './default-thread-title.js';
import type { PlaygroundAppServices } from '../../playground-base-services.js';

const OPENAI_BASE_URL = 'https://api.openai.com/v1';
const DEEPSEEK_BASE_URL = 'https://api.deepseek.com/v1';
const MAX_SOURCE_TEXT_LENGTH = 800;

export type ThreadTitleGenerator = {
  generateTitle(input: { sourceText: string }): Promise<string | null>;
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
  log?: {
    error: (payload: Record<string, unknown>, message: string) => void;
  };
}) {
  const { services, threadId, generator, log } = args;
  if (!generator) {
    return;
  }

  const initialThread = await services.repos.threadRepo.findById(threadId);
  if (!initialThread || !isDefaultThreadTitle(initialThread.title)) {
    return;
  }

  const messages = await services.repos.messageRepo.listByThread(threadId);
  const sourceText = extractAutoTitleSourceText(messages);
  if (!sourceText) {
    return;
  }

  try {
    const generatedTitle = normalizeGeneratedThreadTitle(await generator.generateTitle({ sourceText }));
    if (!generatedTitle) {
      return;
    }

    const latestThread = await services.repos.threadRepo.findById(threadId);
    if (!latestThread || !isDefaultThreadTitle(latestThread.title)) {
      return;
    }

    await services.app.threads.rename({
      threadId,
      title: generatedTitle
    });
  } catch (error) {
    log?.error(
      {
        err: error,
        threadId
      },
      'Failed to auto-title thread'
    );
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
}) {
  const response = await fetch(`${input.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${input.apiKey}`,
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      model: input.model,
      temperature: 0.2,
      max_tokens: 24,
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
      ]
    })
  });

  if (!response.ok) {
    throw new Error(`thread auto-title request failed (${response.status})`);
  }

  const payload = (await response.json()) as CompletionResponse;
  return payload.choices?.[0]?.message?.content?.trim() ?? null;
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
            sourceText
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
