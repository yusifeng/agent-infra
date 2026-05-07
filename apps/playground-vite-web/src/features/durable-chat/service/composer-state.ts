import type { RuntimePiMetaDto } from '@agent-infra/contracts';

type SelectedModelOption = RuntimePiMetaDto['modelOptions'][number] | null;

type BuildComposerStateArgs = {
  draft: string;
  isResponding: boolean;
  sendDisabled: boolean;
  inputLocked: boolean;
  selectedThinkingEnabled: boolean;
  selectedModelOption: SelectedModelOption;
  meta: RuntimePiMetaDto | null;
};

export type ComposerState = {
  hasDraftValue: boolean;
  isDeepseekModel: boolean;
  searchToggleDisabled: boolean;
  thinkingToggleDisabled: boolean;
  reasoningSelectDisabled: boolean;
  textareaDisabled: boolean;
  canSubmit: boolean;
};

export function buildComposerState(args: BuildComposerStateArgs): ComposerState {
  const { draft, isResponding, sendDisabled, inputLocked, selectedThinkingEnabled, selectedModelOption, meta } = args;
  const runtimeReady = Boolean(meta?.runtimeConfigured);
  const hasSelectedModel = Boolean(selectedModelOption);
  const hasDraftValue = Boolean(draft.trim());
  const isDeepseekModel = selectedModelOption?.provider === 'deepseek';
  const searchToggleDisabled = inputLocked || !runtimeReady || !hasSelectedModel;
  const thinkingToggleDisabled = inputLocked || !runtimeReady;
  const reasoningSelectDisabled = thinkingToggleDisabled || !selectedThinkingEnabled;
  const textareaDisabled = !runtimeReady || inputLocked || !hasSelectedModel;
  const canSubmit = isResponding || !sendDisabled;

  return {
    hasDraftValue,
    isDeepseekModel,
    searchToggleDisabled,
    thinkingToggleDisabled,
    reasoningSelectDisabled,
    textareaDisabled,
    canSubmit
  };
}
