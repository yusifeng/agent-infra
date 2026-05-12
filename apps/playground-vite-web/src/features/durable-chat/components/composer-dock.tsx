import type { RuntimePiMetaDto } from '@agent-infra/contracts';
import clsx from 'clsx';
import { ArrowUp, Atom, ChevronDown, Globe } from 'lucide-react';
import type { MutableRefObject, RefObject } from 'react';

import { Button, buttonVariants } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { buildComposerState } from '@/features/durable-chat/service/composer-state';
import type { DeepseekModePresentation } from '@/features/durable-chat/service/deepseek-mode-presentation';
import { cn } from '@/lib/utils';

import { ExpertModeIcon, QuickModeIcon } from './mode-icons';
import { PureDeepseek } from './pure-deepseek';
import { composerMaxWithTW, ui } from './ui';

type ComposerDockProps = {
  activeThreadId: string | null;
  draft: string;
  isResponding: boolean;
  sendDisabled: boolean;
  inputLocked: boolean;
  selectedWebSearchEnabled: boolean;
  selectedThinkingEnabled: boolean;
  selectedReasoningEffort: 'high' | 'max';
  selectedModelOption: RuntimePiMetaDto['modelOptions'][number] | null;
  deepseekModePresentation: DeepseekModePresentation;
  onSelectedModelKeyChange: (value: string) => void;
  meta: RuntimePiMetaDto | null;
  showScrollToBottom: boolean;
  centered: boolean;
  textareaRef: RefObject<HTMLTextAreaElement | null>;
  sendAbortControllerRef: MutableRefObject<AbortController | null>;
  onDraftChange: (value: string) => void;
  onSelectedWebSearchEnabledChange: (value: boolean) => void;
  onSelectedThinkingEnabledChange: (value: boolean) => void;
  onSelectedReasoningEffortChange: (value: 'high' | 'max') => void;
  onSend: () => void;
  onStop: () => void;
  onScrollToBottom: () => void;
};

export function ComposerDock({
  activeThreadId,
  draft,
  isResponding,
  sendDisabled,
  inputLocked,
  selectedWebSearchEnabled,
  selectedThinkingEnabled,
  selectedReasoningEffort,
  selectedModelOption,
  deepseekModePresentation,
  onSelectedModelKeyChange,
  meta,
  showScrollToBottom,
  centered,
  textareaRef,
  sendAbortControllerRef,
  onDraftChange,
  onSelectedWebSearchEnabledChange,
  onSelectedThinkingEnabledChange,
  onSelectedReasoningEffortChange,
  onSend,
  onStop,
  onScrollToBottom
}: ComposerDockProps) {
  const composerState = buildComposerState({
    draft,
    isResponding,
    sendDisabled,
    inputLocked,
    selectedThinkingEnabled,
    selectedModelOption,
    meta
  });
  const showDeepseekLanding = centered && (deepseekModePresentation.flashOption || deepseekModePresentation.proOption);
  const centeredTitle =
    deepseekModePresentation.selectedMode === 'expert' ? '使用专家模式开始对话' : '使用快速模式开始对话';
  const centeredPlaceholder =
    deepseekModePresentation.selectedMode === 'expert' ? '给 DeepSeek 专家模式发送消息' : '给 DeepSeek 快速模式发送消息';
  const placeholder = showDeepseekLanding
    ? centeredPlaceholder
    : activeThreadId
      ? '继续这个 durable thread...'
      : centered
        ? '开始一个新对话'
        : '给 durable chat 发送消息';

  return (
    <div
      className={clsx(
        'z-10 px-4',
        centered ? 'pb-6 pt-3' : 'sticky bottom-0 pb-4',
        ui.composerDock
      )}
    >
      <div className={`${composerMaxWithTW} relative mx-auto`}>
        <div
          className={clsx(
            'absolute bottom-[calc(100%+16px)] left-1/2 z-[1] -translate-x-1/2 transition-transform transition-opacity duration-200 ease-out',
            (centered || !showScrollToBottom) && 'pointer-events-none translate-y-2 scale-[0.8] opacity-0'
          )}
        >
          <button
            type="button"
            onClick={onScrollToBottom}
            className={clsx('flex h-[26px] w-[26px] items-center justify-center rounded-full', ui.scrollButton)}
            aria-label="Scroll to bottom"
          >
            <ChevronDown className="h-4 w-4 text-[color:var(--chat-text-secondary)]" />
          </button>
        </div>

        {showDeepseekLanding ? (
          <div className="mb-[38px] flex flex-col items-center px-4 text-center">
            <div className="flex items-center gap-2.5 text-[color:var(--chat-text)]">
              <PureDeepseek className="h-7 w-auto shrink-0" title="DeepSeek" />
              <h2 className="text-[24px] font-semibold leading-none tracking-[-0.03em]">{centeredTitle}</h2>
            </div>
            <div className="mt-[22px] inline-flex items-center rounded-full border border-[color:var(--chat-border)] bg-[var(--chat-surface)] p-0.5 shadow-[0_10px_24px_rgba(15,23,42,0.05)]">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={!deepseekModePresentation.flashOption}
                onClick={() => {
                  if (deepseekModePresentation.flashOption) {
                    onSelectedModelKeyChange(deepseekModePresentation.flashOption.key);
                  }
                }}
                className={cn(
                  'h-9 min-w-[136px] rounded-full px-5 text-[13px] font-semibold shadow-none',
                  deepseekModePresentation.selectedMode === 'quick'
                    ? 'border border-[#b7c7ff] bg-[#eef3ff] text-[#3964fe] hover:bg-[#eef3ff] hover:text-[#3964fe]'
                    : 'border border-transparent text-[#6b7280] hover:bg-transparent hover:text-[#111827]'
                )}
              >
                <QuickModeIcon className="h-4 w-4" selected={deepseekModePresentation.selectedMode === 'quick'} />
                快速模式
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={!deepseekModePresentation.proOption}
                onClick={() => {
                  if (deepseekModePresentation.proOption) {
                    onSelectedModelKeyChange(deepseekModePresentation.proOption.key);
                  }
                }}
                className={cn(
                  'h-9 min-w-[136px] rounded-full px-5 text-[13px] font-semibold shadow-none',
                  deepseekModePresentation.selectedMode === 'expert'
                    ? 'border border-[#b7c7ff] bg-[#eef3ff] text-[#3964fe] hover:bg-[#eef3ff] hover:text-[#3964fe]'
                    : 'border border-transparent text-[#111827] hover:bg-transparent hover:text-[#111827]'
                )}
              >
                <ExpertModeIcon className="h-4 w-4" selected={deepseekModePresentation.selectedMode === 'expert'} />
                专家模式
              </Button>
            </div>
          </div>
        ) : null}

        <form
          className={clsx(
            ui.composerCard,
            centered && 'rounded-[28px] border-[color:color-mix(in_srgb,var(--chat-border)_78%,white)] shadow-[0_24px_64px_rgba(15,23,42,0.08)]'
          )}
          onSubmit={(event) => {
            event.preventDefault();
            if (!sendDisabled) {
              onSend();
            }
          }}
        >
          <div className="flex flex-col">
            <div className="px-4 py-3">
              <textarea
                ref={textareaRef}
                value={draft}
                onChange={(event) => onDraftChange(event.target.value)}
                onKeyDown={(event) => {
                  if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
                    event.preventDefault();
                    if (!sendDisabled) {
                      onSend();
                    }
                  }
                }}
                rows={3}
                placeholder={placeholder}
                disabled={composerState.textareaDisabled}
                className={clsx('w-full resize-none overflow-y-auto text-sm leading-relaxed', ui.textarea)}
                style={{
                  minHeight: '60px',
                  maxHeight: '200px'
                }}
              />
            </div>

            <div className="flex items-center justify-between gap-3 p-3">
              <div className="flex min-w-0 items-center gap-2">
                <button
                  type="button"
                  onClick={() => onSelectedWebSearchEnabledChange(!selectedWebSearchEnabled)}
                  disabled={composerState.searchToggleDisabled}
                  className={cn(
                    buttonVariants({ variant: 'outline', size: 'sm' }),
                    'h-9 shrink-0 rounded-full',
                    selectedWebSearchEnabled
                      ? 'border-[color:var(--chat-reasoning-divider)] bg-[var(--chat-surface-muted)] text-[color:var(--chat-reasoning-accent)] hover:text-[color:var(--chat-reasoning-accent)]'
                      : 'border-[color:var(--chat-border)] bg-[var(--chat-surface)] text-[color:var(--chat-text-secondary)] hover:border-[color:var(--chat-border-strong)] hover:bg-[var(--chat-hover)] hover:text-[color:var(--chat-text-secondary)]'
                  )}
                  aria-pressed={selectedWebSearchEnabled}
                >
                  <Globe className="h-4 w-4" />
                  <span>网页搜索</span>
                </button>

                {composerState.isDeepseekModel ? (
                  <>
                    <button
                      type="button"
                      onClick={() => onSelectedThinkingEnabledChange(!selectedThinkingEnabled)}
                      disabled={composerState.thinkingToggleDisabled}
                      className={cn(
                        buttonVariants({ variant: 'outline', size: 'sm' }),
                        'h-9 shrink-0 rounded-full',
                        selectedThinkingEnabled
                          ? 'border-[color:var(--chat-reasoning-divider)] bg-[var(--chat-surface-muted)] text-[color:var(--chat-reasoning-accent)] hover:text-[color:var(--chat-reasoning-accent)]'
                          : 'border-[color:var(--chat-border)] bg-[var(--chat-surface)] text-[color:var(--chat-text-secondary)] hover:border-[color:var(--chat-border-strong)] hover:bg-[var(--chat-hover)] hover:text-[color:var(--chat-text-secondary)]'
                      )}
                      aria-pressed={selectedThinkingEnabled}
                    >
                      <Atom className="h-4 w-4" />
                      <span>深度思考</span>
                    </button>

                    <Select
                      value={selectedReasoningEffort}
                      onValueChange={(value) => onSelectedReasoningEffortChange(value as 'high' | 'max')}
                      disabled={composerState.reasoningSelectDisabled}
                    >
                      <SelectTrigger
                        className={cn(
                          'h-9 w-[132px] shrink-0 rounded-full px-3',
                          selectedThinkingEnabled
                            ? 'border-[color:var(--chat-reasoning-divider)] bg-[var(--chat-surface-muted)] text-[color:var(--chat-reasoning-accent)] hover:text-[color:var(--chat-reasoning-accent)]'
                            : 'border-[color:var(--chat-border)] bg-[var(--chat-surface)] text-[color:var(--chat-text-tertiary)] opacity-70 hover:text-[color:var(--chat-text-tertiary)]'
                        )}
                        aria-label="思考程度"
                      >
                        <span className="mr-1">思考程度</span>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="high">高</SelectItem>
                        <SelectItem value="max">最高</SelectItem>
                      </SelectContent>
                    </Select>
                  </>
                ) : null}
              </div>

              <div className="flex items-center">
                <button
                  type="submit"
                  disabled={!composerState.canSubmit}
                  onClick={(event) => {
                    if (isResponding) {
                      event.preventDefault();
                      sendAbortControllerRef.current?.abort();
                      onStop();
                    }
                  }}
                  className={clsx(
                    ui.composerPrimaryButton,
                    isResponding
                      ? 'border-transparent bg-[var(--chat-reasoning-accent)] text-white hover:bg-[var(--chat-reasoning-accent)] hover:opacity-95'
                      : composerState.hasDraftValue
                        ? 'border-transparent bg-[var(--chat-reasoning-accent)] text-white hover:bg-[var(--chat-reasoning-accent)] hover:opacity-95'
                        : 'border-transparent bg-[color:color-mix(in_srgb,var(--chat-reasoning-accent)_28%,white)] text-white',
                    !composerState.canSubmit && 'cursor-not-allowed opacity-60'
                  )}
                  title={isResponding ? '停止接收响应' : '发送 (Cmd/Ctrl + Enter)'}
                  aria-label={isResponding ? '停止接收响应' : '发送消息'}
                >
                  {isResponding ? <span aria-hidden="true" className="h-3.5 w-3.5 rounded-[3px] bg-white" /> : <ArrowUp className="h-5 w-5" />}
                </button>
              </div>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
