import { renderToStaticMarkup } from 'react-dom/server';
import { createRef, type ComponentProps } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { ComposerDock } from './composer-dock';
import type { RuntimePiMetaDto } from '@agent-infra/contracts';

function createMeta(runtimeConfigured = true): RuntimePiMetaDto {
  return {
    dbMode: 'sqlite',
    dbConnection: 'local',
    runtimeConfigured,
    runtimeProvider: 'deepseek',
    runtimeModel: 'deepseek-v4-flash',
    defaultModelKey: 'deepseek-v4-flash',
    modelOptions: [
      {
        key: 'deepseek-v4-flash',
        provider: 'deepseek',
        model: 'deepseek-v4-flash',
        label: 'DeepSeek',
        description: 'DeepSeek model'
      },
      {
        key: 'openai-gpt',
        provider: 'openai',
        model: 'gpt-5.5',
        label: 'OpenAI',
        description: 'OpenAI model'
      }
    ],
    runtimeConfigError: null
  };
}

function renderComposer(overrides: Partial<ComponentProps<typeof ComposerDock>> = {}) {
  const meta = overrides.meta ?? createMeta();
  const selectedModelOption = overrides.selectedModelOption ?? meta.modelOptions[0] ?? null;

  return renderToStaticMarkup(
    <ComposerDock
      activeThreadId={null}
      draft={overrides.draft ?? ''}
      isResponding={overrides.isResponding ?? false}
      sendDisabled={overrides.sendDisabled ?? true}
      inputLocked={overrides.inputLocked ?? false}
      selectedWebSearchEnabled={overrides.selectedWebSearchEnabled ?? false}
      selectedThinkingEnabled={overrides.selectedThinkingEnabled ?? false}
      selectedReasoningEffort={overrides.selectedReasoningEffort ?? 'high'}
      selectedModelOption={selectedModelOption}
      meta={meta}
      showScrollToBottom={overrides.showScrollToBottom ?? false}
      centered={overrides.centered ?? false}
      textareaRef={createRef<HTMLTextAreaElement>()}
      sendAbortControllerRef={{ current: new AbortController() }}
      onDraftChange={overrides.onDraftChange ?? vi.fn()}
      onSelectedWebSearchEnabledChange={overrides.onSelectedWebSearchEnabledChange ?? vi.fn()}
      onSelectedThinkingEnabledChange={overrides.onSelectedThinkingEnabledChange ?? vi.fn()}
      onSelectedReasoningEffortChange={overrides.onSelectedReasoningEffortChange ?? vi.fn()}
      onSend={overrides.onSend ?? vi.fn()}
      onStop={overrides.onStop ?? vi.fn()}
      onScrollToBottom={overrides.onScrollToBottom ?? vi.fn()}
    />
  );
}

describe('ComposerDock', () => {
  it('disables textarea and search toggle when runtime is unavailable', () => {
    const markup = renderComposer({
      meta: createMeta(false),
      selectedModelOption: null,
      sendDisabled: false
    });

    expect(markup).toMatch(/<textarea[^>]*disabled=""/);
    expect(markup).toMatch(/<button[^>]*disabled=""[^>]*aria-pressed="false"[^>]*>[\s\S]*?<span>网页搜索<\/span><\/button>/);
  });

  it('shows deepseek thinking controls and enables submit when draft is ready', () => {
    const markup = renderComposer({
      draft: 'hello world',
      sendDisabled: false,
      selectedWebSearchEnabled: true,
      selectedThinkingEnabled: true
    });

    expect(markup).toContain('网页搜索');
    expect(markup).toContain('深度思考');
    expect(markup).toContain('思考程度');
    expect(markup).toContain('aria-pressed="true"');
    expect(markup).toContain('aria-label="发送消息"');
    expect(markup).not.toMatch(/<button[^>]*disabled=""[^>]*aria-label="发送消息"/);
  });

  it('hides deepseek-only thinking controls for non-deepseek models', () => {
    const meta = createMeta();
    const markup = renderComposer({
      meta,
      selectedModelOption: meta.modelOptions[1]
    });

    expect(markup).toContain('网页搜索');
    expect(markup).not.toContain('深度思考');
    expect(markup).not.toContain('思考程度');
  });
});
