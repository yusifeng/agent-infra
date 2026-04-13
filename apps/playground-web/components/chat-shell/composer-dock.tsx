'use client';

import type { RuntimePiMetaDto } from '@agent-infra/contracts';
import clsx from 'clsx';
import {
  Blocks,
  ChevronDown,
  CircleStop,
  Eraser,
  GalleryVerticalEnd,
  Globe,
  Mic,
  Send,
  SlidersHorizontal,
  Workflow
} from 'lucide-react';
import type { MutableRefObject, RefObject } from 'react';

import { ProviderMonogram } from './shared';
import { composerMaxWithTW, ui } from './ui';

type ComposerDockProps = {
  activeThreadId: string | null;
  draft: string;
  sending: boolean;
  sendingDisabled: boolean;
  selectedModelKey: string;
  selectedModelOption: RuntimePiMetaDto['modelOptions'][number] | null;
  meta: RuntimePiMetaDto | null;
  showScrollToBottom: boolean;
  textareaRef: RefObject<HTMLTextAreaElement | null>;
  sendAbortControllerRef: MutableRefObject<AbortController | null>;
  onDraftChange: (value: string) => void;
  onSelectedModelKeyChange: (value: string) => void;
  onSend: () => void;
  onStop: () => void;
  onScrollToBottom: () => void;
};

export function ComposerDock({
  activeThreadId,
  draft,
  sending,
  sendingDisabled,
  selectedModelKey,
  selectedModelOption,
  meta,
  showScrollToBottom,
  textareaRef,
  sendAbortControllerRef,
  onDraftChange,
  onSelectedModelKeyChange,
  onSend,
  onStop,
  onScrollToBottom
}: ComposerDockProps) {
  const hasDraftValue = Boolean(draft.trim());

  return (
    <div className={clsx('sticky bottom-0 z-10 px-4 pb-4', ui.composerDock)}>
      <div className={`${composerMaxWithTW} relative mx-auto`}>
        <div
          className={clsx(
            'absolute bottom-[calc(100%+16px)] left-1/2 z-[1] -translate-x-1/2 transition-transform transition-opacity duration-200 ease-out',
            !showScrollToBottom && 'pointer-events-none translate-y-2 scale-[0.8] opacity-0'
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
            if (sendingDisabled) {
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
                    if (!sendingDisabled) {
                      onSend();
                    }
                  }
                }}
                rows={3}
                placeholder={activeThreadId ? 'Send a prompt in this durable thread...' : 'Send the first prompt to create a durable thread...'}
                disabled={!meta?.runtimeConfigured || sending || !selectedModelOption}
                className={clsx('w-full resize-none overflow-y-auto text-sm leading-relaxed', ui.textarea)}
                style={{
                  minHeight: '60px',
                  maxHeight: '200px'
                }}
              />
            </div>

            <div className="flex items-center justify-between px-3 py-1.5">
              <div className="flex min-w-0 items-center gap-1">
                <button type="button" disabled className={clsx('h-9 w-9', ui.actionIcon)}>
                  <Globe className="h-[18px] w-[18px]" />
                </button>
                <button type="button" disabled className={clsx('h-9 w-9', ui.actionIcon)}>
                  <Blocks className="h-[18px] w-[18px]" />
                </button>
                <button type="button" disabled className={clsx('h-9 w-9', ui.actionIcon)}>
                  <SlidersHorizontal className="h-[18px] w-[18px]" />
                </button>
                <label className={ui.composerModelChip}>
                  {selectedModelOption?.provider ? <ProviderMonogram provider={selectedModelOption.provider} /> : null}
                  <div className="relative min-w-0">
                    <select
                      value={selectedModelKey}
                      onChange={(event) => onSelectedModelKeyChange(event.target.value)}
                      disabled={sending || !meta || meta.modelOptions.length === 0}
                      className="max-w-[172px] appearance-none bg-transparent pr-4 text-xs text-slate-500 outline-none"
                    >
                      {meta?.modelOptions.map((option) => (
                        <option key={option.key} value={option.key}>
                          {option.provider} · {option.model}
                        </option>
                      ))}
                    </select>
                    <ChevronDown className="pointer-events-none absolute right-0 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                  </div>
                </label>
                <button type="button" disabled className={clsx('h-9 w-9', ui.actionIcon)}>
                  <Mic className="h-[18px] w-[18px]" />
                </button>
                <button type="button" disabled className={clsx('h-9 w-9', ui.actionIcon)}>
                  <Eraser className="h-[18px] w-[18px]" />
                </button>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled
                  className={ui.composerSecondaryButton}
                  title={activeThreadId ? '保存当前对话（暂未接入）' : '创建话题（暂未接入）'}
                >
                  <GalleryVerticalEnd className="h-4 w-4" />
                </button>
                <button
                  type="submit"
                  disabled={!sending && sendingDisabled}
                  onClick={(event) => {
                    if (sending) {
                      event.preventDefault();
                      sendAbortControllerRef.current?.abort();
                      onStop();
                    }
                  }}
                  className={clsx(
                    ui.composerPrimaryButton,
                    sending ? 'border-rose-200 text-rose-600' : hasDraftValue ? 'border-slate-300 text-sky-600' : 'text-slate-300',
                    !sending && sendingDisabled && 'cursor-not-allowed opacity-60'
                  )}
                  title={sending ? '停止生成' : '发送 (Cmd/Ctrl + Enter)'}
                >
                  {sending ? <CircleStop className="h-4 w-4" /> : <Send className="h-4 w-4" />}
                </button>
              </div>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
