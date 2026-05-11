import { fireEvent, render, screen, within } from '@testing-library/react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createRef, type ComponentProps } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { ComposerDock } from './composer-dock';
import type { RuntimePiMetaDto } from '@agent-infra/contracts';
import { buildDeepseekModePresentation } from '@/features/durable-chat/service/deepseek-mode-presentation';

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
  const deepseekModePresentation =
    overrides.deepseekModePresentation ??
    buildDeepseekModePresentation({
      modelOptions: meta.modelOptions,
      selectedModelKey: selectedModelOption?.key ?? ''
    });

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
      deepseekModePresentation={deepseekModePresentation}
      onSelectedModelKeyChange={overrides.onSelectedModelKeyChange ?? vi.fn()}
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

  it('renders the centered deepseek landing shell and routes mode clicks through model keys', () => {
    const meta: RuntimePiMetaDto = {
      ...createMeta(),
      modelOptions: [
        {
          key: 'deepseek:deepseek-v4-flash',
          provider: 'deepseek',
          model: 'deepseek-v4-flash',
          label: 'DeepSeek Flash',
          description: 'Fast mode'
        },
        {
          key: 'deepseek:deepseek-v4-pro',
          provider: 'deepseek',
          model: 'deepseek-v4-pro',
          label: 'DeepSeek Pro',
          description: 'Expert mode'
        }
      ],
      defaultModelKey: 'deepseek:deepseek-v4-flash',
      runtimeProvider: 'deepseek',
      runtimeModel: 'deepseek-v4-flash'
    };
    const onSelectedModelKeyChange = vi.fn();

    render(
      <ComposerDock
        activeThreadId={null}
        draft=""
        isResponding={false}
        sendDisabled
        inputLocked={false}
        selectedWebSearchEnabled={false}
        selectedThinkingEnabled={false}
        selectedReasoningEffort="high"
        selectedModelOption={meta.modelOptions[0]!}
        deepseekModePresentation={buildDeepseekModePresentation({
          modelOptions: meta.modelOptions,
          selectedModelKey: meta.modelOptions[0]!.key
        })}
        onSelectedModelKeyChange={onSelectedModelKeyChange}
        meta={meta}
        showScrollToBottom={false}
        centered
        textareaRef={createRef<HTMLTextAreaElement>()}
        sendAbortControllerRef={{ current: new AbortController() }}
        onDraftChange={vi.fn()}
        onSelectedWebSearchEnabledChange={vi.fn()}
        onSelectedThinkingEnabledChange={vi.fn()}
        onSelectedReasoningEffortChange={vi.fn()}
        onSend={vi.fn()}
        onStop={vi.fn()}
        onScrollToBottom={vi.fn()}
      />
    );

    expect(screen.getByRole('img', { name: 'DeepSeek' })).toBeTruthy();
    expect(screen.getByText('使用快速模式开始对话')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: '专家模式' }));
    expect(onSelectedModelKeyChange).toHaveBeenCalledWith('deepseek:deepseek-v4-pro');
  });

  it('falls back to a generic centered composer when deepseek modes are unavailable', () => {
    const meta: RuntimePiMetaDto = {
      ...createMeta(),
      runtimeProvider: 'openai',
      runtimeModel: 'gpt-5.5',
      defaultModelKey: 'openai:gpt-5.5',
      modelOptions: [
        {
          key: 'openai:gpt-5.5',
          provider: 'openai',
          model: 'gpt-5.5',
          label: 'OpenAI',
          description: 'Fallback mode'
        }
      ]
    };

    const view = render(
      <ComposerDock
        activeThreadId={null}
        draft=""
        isResponding={false}
        sendDisabled
        inputLocked={false}
        selectedWebSearchEnabled={false}
        selectedThinkingEnabled={false}
        selectedReasoningEffort="high"
        selectedModelOption={meta.modelOptions[0]!}
        deepseekModePresentation={buildDeepseekModePresentation({
          modelOptions: meta.modelOptions,
          selectedModelKey: meta.modelOptions[0]!.key
        })}
        onSelectedModelKeyChange={vi.fn()}
        meta={meta}
        showScrollToBottom={false}
        centered
        textareaRef={createRef<HTMLTextAreaElement>()}
        sendAbortControllerRef={{ current: new AbortController() }}
        onDraftChange={vi.fn()}
        onSelectedWebSearchEnabledChange={vi.fn()}
        onSelectedThinkingEnabledChange={vi.fn()}
        onSelectedReasoningEffortChange={vi.fn()}
        onSend={vi.fn()}
        onStop={vi.fn()}
        onScrollToBottom={vi.fn()}
      />
    );

    const containerQueries = within(view.container);

    expect(containerQueries.queryByText('使用快速模式开始对话')).toBeNull();
    expect(containerQueries.queryByText('使用专家模式开始对话')).toBeNull();
    expect(containerQueries.queryByRole('button', { name: '快速模式' })).toBeNull();
    expect(containerQueries.queryByRole('button', { name: '专家模式' })).toBeNull();
    expect(containerQueries.getByPlaceholderText('开始一个新对话')).toBeTruthy();
  });
});
