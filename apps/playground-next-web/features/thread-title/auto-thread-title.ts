import type { GenerateTextRuntimeInput, GenerateTextRuntimeResult } from '@agent-infra/app';

import type { PlaygroundAppServices } from '@/lib/playground-base-services';

import { isDefaultThreadTitle } from './default-thread-title';

const MAX_SOURCE_TEXT_LENGTH = 800;
const MAX_GENERATED_TITLE_CJK_CHARS = 12;
const MAX_GENERATED_TITLE_WORDS = 6;
const AUTO_THREAD_TITLE_SYSTEM_PROMPT =
  'Generate a concise chat thread title based on this completed Q&A turn. Focus on the main topic or task, not a full-sentence answer. Return only the title text, without quotes, markdown, or punctuation decoration. Keep it within 12 Chinese characters or 6 English words.';

export type ThreadTitleGenerator = {
  generateTitle(input: { sourceText: string }): Promise<string | null>;
};

type ThreadTitleRuntime = {
  prepare(input: { provider?: string; model?: string }): Promise<{ provider: string; model: string }>;
  generateText(input: GenerateTextRuntimeInput): Promise<GenerateTextRuntimeResult>;
};

const AUTO_THREAD_TITLE_RUNTIME_CANDIDATES = [
  { provider: 'deepseek', model: 'deepseek-v4-flash' },
  { provider: 'openai', model: 'gpt-4o-mini' }
] as const;

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
    .replace(/^["'“”‘’【】\[\]（）()]+|["'“”‘’【】\[\]（）()]+$/g, '')
    .replace(/\s+/g, ' ');

  if (!normalizedTitle || isDefaultThreadTitle(normalizedTitle)) {
    return null;
  }

  if (/[\u3400-\u9fff]/u.test(normalizedTitle)) {
    return normalizedTitle.length > MAX_GENERATED_TITLE_CJK_CHARS
      ? normalizedTitle.slice(0, MAX_GENERATED_TITLE_CJK_CHARS).trim()
      : normalizedTitle;
  }

  const words = normalizedTitle.split(/\s+/u);
  return words.length > MAX_GENERATED_TITLE_WORDS
    ? words.slice(0, MAX_GENERATED_TITLE_WORDS).join(' ')
    : normalizedTitle;
}

export async function maybeAutoTitleThread(args: {
  services: PlaygroundAppServices;
  threadId: string;
  runId: string;
  generator: ThreadTitleGenerator | null;
}): Promise<AutoThreadTitleResult> {
  const { services, threadId, runId, generator } = args;
  if (!generator) {
    return { outcome: 'skipped', reason: 'no_generator' };
  }

  try {
    const initialThread = await services.repos.threadRepo.findById(threadId);
    if (!initialThread) {
      return { outcome: 'skipped', reason: 'thread_unavailable', stage: 'initial_check' };
    }

    if (!isDefaultThreadTitle(initialThread.title)) {
      return { outcome: 'skipped', reason: 'title_no_longer_default', stage: 'initial_check' };
    }

    const messages = await services.repos.messageRepo.listByThread(threadId);
    const run = await services.repos.runRepo.findById(runId);
    const sourceText = extractAutoTitleSourceText(messages, run ? { id: run.id, triggerMessageId: run.triggerMessageId } : null);
    if (!sourceText) {
      return { outcome: 'skipped', reason: 'no_source_text' };
    }

    let generatedTitle: string | null;
    try {
      generatedTitle = normalizeGeneratedThreadTitle(await generator.generateTitle({ sourceText }));
    } catch {
      return { outcome: 'failed', reason: 'provider_request_failed' };
    }

    if (!generatedTitle) {
      return { outcome: 'skipped', reason: 'normalized_title_empty' };
    }

    const latestThread = await services.repos.threadRepo.findById(threadId);
    if (!latestThread) {
      return { outcome: 'skipped', reason: 'thread_unavailable', stage: 'before_writeback' };
    }

    if (!isDefaultThreadTitle(latestThread.title)) {
      return { outcome: 'skipped', reason: 'title_no_longer_default', stage: 'before_writeback' };
    }

    try {
      const renamedThread = await services.app.threads.rename({
        threadId,
        title: generatedTitle
      });
      const persistedTitle = renamedThread.title;

      if (typeof persistedTitle !== 'string') {
        return { outcome: 'failed', reason: 'rename_writeback_failed' };
      }

      return {
        outcome: 'renamed',
        title: persistedTitle,
        updatedAt: renamedThread.updatedAt.toISOString()
      };
    } catch {
      return { outcome: 'failed', reason: 'rename_writeback_failed' };
    }
  } catch {
    return { outcome: 'failed', reason: 'repo_read_failed' };
  }
}

export function createRuntimeThreadTitleGenerator(runtime: ThreadTitleRuntime): ThreadTitleGenerator {
  return {
    async generateTitle({ sourceText }) {
      let lastError: unknown = null;

      for (const candidate of AUTO_THREAD_TITLE_RUNTIME_CANDIDATES) {
        try {
          const runtimeSelection = await runtime.prepare(candidate);
          const result = await runtime.generateText({
            provider: runtimeSelection.provider,
            model: runtimeSelection.model,
            systemPrompt: AUTO_THREAD_TITLE_SYSTEM_PROMPT,
            userPrompt: `Completed Q&A turn:\n${sourceText}`,
            temperature: 0.2,
            maxTokens: 24,
            reasoningEffort: 'off'
          });

          return result.text?.trim() ?? null;
        } catch (error) {
          lastError = error;
        }
      }

      throw lastError ?? new Error('thread title generation runtime is unavailable');
    }
  };
}
