import { afterEach, describe, expect, it } from 'vitest';

import { getPlaygroundMeta } from '../src/playground-meta.js';

const originalDeepseekKey = process.env.DEEPSEEK_API_KEY;
const originalOpenAiKey = process.env.OPENAI_API_KEY;
const originalOpenAiModel = process.env.OPENAI_MODEL;

function restoreEnv() {
  if (originalDeepseekKey === undefined) {
    delete process.env.DEEPSEEK_API_KEY;
  } else {
    process.env.DEEPSEEK_API_KEY = originalDeepseekKey;
  }

  if (originalOpenAiKey === undefined) {
    delete process.env.OPENAI_API_KEY;
  } else {
    process.env.OPENAI_API_KEY = originalOpenAiKey;
  }

  if (originalOpenAiModel === undefined) {
    delete process.env.OPENAI_MODEL;
  } else {
    process.env.OPENAI_MODEL = originalOpenAiModel;
  }
}

describe('getPlaygroundMeta', () => {
  afterEach(() => {
    restoreEnv();
  });

  it('exposes both deepseek flash and pro options when a deepseek key is configured', () => {
    process.env.DEEPSEEK_API_KEY = 'deepseek-key';
    process.env.OPENAI_API_KEY = 'openai-key';
    process.env.OPENAI_MODEL = 'gpt-5.5';

    const meta = getPlaygroundMeta({}, { mode: 'sqlite', connectionString: 'file:test.db' });

    expect(meta.configured).toBe(true);
    expect(meta.defaultModelKey).toBe('deepseek:deepseek-v4-flash');
    expect(meta.modelOptions.map((option) => option.key)).toEqual([
      'deepseek:deepseek-v4-flash',
      'deepseek:deepseek-v4-pro'
    ]);
  });

  it('falls back to non-deepseek options only when deepseek is unavailable', () => {
    delete process.env.DEEPSEEK_API_KEY;
    process.env.OPENAI_API_KEY = 'openai-key';
    process.env.OPENAI_MODEL = 'gpt-5.5';

    const meta = getPlaygroundMeta({}, { mode: 'sqlite', connectionString: 'file:test.db' });

    expect(meta.modelOptions.map((option) => option.key)).toEqual(['openai:gpt-5.5', 'openai:gpt-4o-mini']);
  });
});
