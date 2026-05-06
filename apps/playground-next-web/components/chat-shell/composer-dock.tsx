'use client';

import type { RuntimePiMetaDto } from '@agent-infra/contracts';
import clsx from 'clsx';
import {
  Atom,
  ChevronDown,
  CircleStop,
  Send,
} from 'lucide-react';
import type { MutableRefObject, RefObject } from 'react';

import { ProviderMonogram } from './shared';
import { composerMaxWithTW, ui } from './ui';

type ComposerDockProps = {
  activeThreadId: string | null;
  draft: string;
  isResponding: boolean;
  sendDisabled: boolean;
  inputLocked: boolean;
  selectedModelKey: string;
  selectedThinkingEnabled: boolean;
  selectedReasoningEffort: 'high' | 'max';
  selectedModelOption: RuntimePiMetaDto['modelOptions'][number] | null;
  meta: RuntimePiMetaDto | null;
  showScrollToBottom: boolean;
  centered: boolean;
  textareaRef: RefObject<HTMLTextAreaElement | null>;
  sendAbortControllerRef: MutableRefObject<AbortController | null>;
  onDraftChange: (value: string) => void;
  onSelectedModelKeyChange: (value: string) => void;
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
  selectedModelKey,
  selectedThinkingEnabled,
  selectedReasoningEffort,
  selectedModelOption,
  meta,
  showScrollToBottom,
  centered,
  textareaRef,
  sendAbortControllerRef,
  onDraftChange,
  onSelectedModelKeyChange,
  onSelectedThinkingEnabledChange,
  onSelectedReasoningEffortChange,
  onSend,
  onStop,
  onScrollToBottom
}: ComposerDockProps) {
  const hasDraftValue = Boolean(draft.trim());
  const isDeepseekModel = selectedModelOption?.provider === 'deepseek';

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
            <ChevronDown className="h-4 w-4 text-slate-600" />
          </button>
        </div>

        <form
          className={ui.composerCard}
          onSubmit={(event) => {
            event.preventDefault();
            if (sendDisabled) {
              return;
            }

            onSend();
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
                placeholder={activeThreadId ? '继续这个 durable thread...' : '给 durable chat 发送消息'}
                disabled={!meta?.runtimeConfigured || inputLocked || !selectedModelOption}
                className={clsx('w-full resize-none overflow-y-auto text-sm leading-relaxed', ui.textarea)}
                style={{
                  minHeight: '60px',
                  maxHeight: '200px'
                }}
              />
            </div>

            <div className="flex items-center justify-between gap-3 px-3 py-1.5">
              <div className="flex min-w-0 items-center gap-2">
                <label className={ui.composerModelChip}>
                  {selectedModelOption?.provider ? <ProviderMonogram provider={selectedModelOption.provider} /> : null}
                  <div className="relative min-w-0">
                    <select
                      value={selectedModelKey}
                      onChange={(event) => onSelectedModelKeyChange(event.target.value)}
                      disabled={inputLocked || !meta || meta.modelOptions.length === 0}
                      className="max-w-[172px] appearance-none bg-transparent pr-4 text-xs text-[color:var(--chat-text-secondary)] outline-none"
                    >
                      {meta?.modelOptions.map((option) => (
                        <option key={option.key} value={option.key}>
                          {option.provider} · {option.model}
                        </option>
                      ))}
                    </select>
                    <ChevronDown className="pointer-events-none absolute right-0 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[color:var(--chat-icon-muted)]" />
                  </div>
                </label>

                {isDeepseekModel ? (
                  <>
                    <button
                      type="button"
                      onClick={() => onSelectedThinkingEnabledChange(!selectedThinkingEnabled)}
                      disabled={inputLocked || !meta?.runtimeConfigured}
                      className={clsx(
                        ui.composerToggleButton,
                        selectedThinkingEnabled
                          ? 'border-[color:var(--chat-reasoning-divider)] bg-[var(--chat-surface-muted)] text-[color:var(--chat-reasoning-accent)]'
                          : 'border-[color:var(--chat-border)] text-[color:var(--chat-text-secondary)]'
                      )}
                      aria-pressed={selectedThinkingEnabled}
                    >
                      <Atom className="h-4 w-4" />
                      <span>深度思考</span>
                    </button>

                    {selectedThinkingEnabled ? (
                      <label
                        className={clsx(
                          ui.composerToggleButton,
                          'border-[color:var(--chat-reasoning-divider)] bg-[var(--chat-surface-muted)] text-[color:var(--chat-reasoning-accent)]'
                        )}
                      >
                        <span>思考程度</span>
                        <div className="relative min-w-0">
                          <select
                            value={selectedReasoningEffort}
                            onChange={(event) => onSelectedReasoningEffortChange(event.target.value as 'high' | 'max')}
                            disabled={inputLocked || !meta?.runtimeConfigured}
                            className="max-w-[96px] appearance-none bg-transparent pr-4 text-sm text-[color:var(--chat-reasoning-accent)] outline-none"
                          >
                            <option value="high">高</option>
                            <option value="max">最高</option>
                          </select>
                          <ChevronDown className="pointer-events-none absolute right-0 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[color:var(--chat-reasoning-accent)]" />
                        </div>
                      </label>
                    ) : null}
                  </>
                ) : null}
              </div>

              <div className="flex items-center">
                <button
                  type="submit"
                  disabled={!isResponding && sendDisabled}
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
                      ? 'border-[color:var(--destructive)] text-[color:var(--destructive)]'
                      : hasDraftValue
                        ? 'border-[color:var(--chat-border-strong)] text-[color:var(--chat-reasoning-accent)]'
                        : 'text-[color:var(--chat-icon-muted)]',
                    !isResponding && sendDisabled && 'cursor-not-allowed opacity-60'
                  )}
                  title={isResponding ? '停止接收响应' : '发送 (Cmd/Ctrl + Enter)'}
                  aria-label={isResponding ? '停止接收响应' : '发送消息'}
                >
                  {isResponding ? <CircleStop className="h-4 w-4" /> : <Send className="h-4 w-4" />}
                </button>
              </div>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
