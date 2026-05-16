import type { RuntimePiMetaDto } from '@agent-infra/contracts';
import clsx from 'clsx';
import { ArrowUp, Atom, ChevronDown, Globe } from 'lucide-react';
import { memo, type MutableRefObject, type RefObject } from 'react';

import { Button, buttonVariants } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { buildComposerState } from '@/features/durable-chat/service/composer-state';
import type { DeepseekModePresentation } from '@/features/durable-chat/service/deepseek-mode-presentation';
import { cn } from '@/lib/utils';

import { ExpertModeIcon, QuickModeIcon } from './mode-icons';
import { PureDeepseek } from './pure-deepseek';
import { composerMaxWithTW, ui } from './ui';

type ComposerDockProps = {
  draft: string;
  isResponding: boolean;
  sendDisabled: boolean;
  inputLocked: boolean;
  selectedWebSearchEnabled: boolean;
  selectedThinkingEnabled: boolean;
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
  onSend: () => void;
  onStop: () => void;
  onScrollToBottom: () => void;
};

export const ComposerDock = memo(function ComposerDock({
  draft,
  isResponding,
  sendDisabled,
  inputLocked,
  selectedWebSearchEnabled,
  selectedThinkingEnabled,
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
  const showDeepseekLanding = centered && deepseekModePresentation.selectedMode !== null;
  const centeredTitle =
    deepseekModePresentation.selectedMode === 'expert' ? '使用专家模式开始对话' : '使用快速模式开始对话';
  const placeholder = '给 DeepSeek 发送消息';
  const modeToggleClassName = (active: boolean) =>
    cn(
      buttonVariants({ variant: 'outline', size: 'sm' }),
      'h-9 shrink-0 rounded-full',
      active
        ? 'border-[color:var(--chat-reasoning-divider)] bg-[var(--chat-surface-muted)] text-[color:var(--chat-reasoning-accent)] hover:text-[color:var(--chat-reasoning-accent)]'
        : 'border-[color:var(--chat-border)] bg-[var(--chat-surface)] text-[color:var(--chat-text-secondary)] hover:border-[color:var(--chat-border-strong)] hover:bg-[var(--chat-hover)] hover:text-[color:var(--chat-text-secondary)]'
    );

  return (
    <div
      className={clsx(
        'z-10 px-4',
        centered ? 'pb-6 pt-3' : 'sticky bottom-0 pb-0',
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
              <PureDeepseek className="h-7 w-auto shrink-0 text-[color:var(--chat-brand-accent)]" title="DeepSeek" />
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
                    ? 'border border-[color:var(--chat-mode-active-border)] bg-[var(--chat-mode-active-bg)] text-[color:var(--chat-mode-active-text)] hover:bg-[var(--chat-mode-active-bg)] hover:text-[color:var(--chat-mode-active-text)]'
                    : 'border border-transparent text-[color:var(--chat-mode-inactive-text)] hover:bg-transparent hover:text-[color:var(--chat-mode-inactive-strong-text)]'
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
                    ? 'border border-[color:var(--chat-mode-active-border)] bg-[var(--chat-mode-active-bg)] text-[color:var(--chat-mode-active-text)] hover:bg-[var(--chat-mode-active-bg)] hover:text-[color:var(--chat-mode-active-text)]'
                    : 'border border-transparent text-[color:var(--chat-mode-inactive-strong-text)] hover:bg-transparent hover:text-[color:var(--chat-mode-inactive-strong-text)]'
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
            centered && 'border-[color:color-mix(in_srgb,var(--chat-border)_78%,white)] shadow-[0_24px_64px_rgba(15,23,42,0.08)]'
          )}
          onSubmit={(event) => {
            event.preventDefault();
            if (!sendDisabled) {
              onSend();
            }
          }}
        >
          <div className="relative h-full">
            <div className="px-4 py-3 pb-[52px]">
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

            <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-3 p-3">
              <div className="flex min-w-0 items-center gap-2">
                {composerState.isDeepseekModel ? (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        onClick={() => onSelectedThinkingEnabledChange(!selectedThinkingEnabled)}
                        disabled={composerState.thinkingToggleDisabled}
                        className={modeToggleClassName(selectedThinkingEnabled)}
                        aria-pressed={selectedThinkingEnabled}
                      >
                        <Atom className="h-4 w-4" />
                        <span>深度思考</span>
                      </button>
                    </TooltipTrigger>
                    <TooltipContent
                      hideArrow
                      side="top"
                      sideOffset={8}
                      className="rounded-[12px] bg-[#2b2b2b] px-3 py-1.5 text-[13px] leading-5 text-white"
                    >
                      先思考后回答，解决推理问题
                    </TooltipContent>
                  </Tooltip>
                ) : null}

                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      onClick={() => onSelectedWebSearchEnabledChange(!selectedWebSearchEnabled)}
                      disabled={composerState.searchToggleDisabled}
                      className={modeToggleClassName(selectedWebSearchEnabled)}
                      aria-pressed={selectedWebSearchEnabled}
                    >
                      <Globe className="h-4 w-4" />
                      <span>智能搜索</span>
                    </button>
                  </TooltipTrigger>
                  <TooltipContent
                    hideArrow
                    side="top"
                    sideOffset={8}
                    className="rounded-[12px] bg-[#2b2b2b] px-3 py-1.5 text-[13px] leading-5 text-white"
                  >
                    按需搜索网页
                  </TooltipContent>
                </Tooltip>
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
      {!centered ? (
        <div className="flex h-7 items-center justify-center text-[11px] leading-none text-[color:var(--chat-text-tertiary)]">
          内容由 AI 生成，请仔细甄别
        </div>
      ) : null}
    </div>
  );
});
