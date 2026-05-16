'use client';

import clsx from 'clsx';
import { ChevronsRight, ChevronLeft, ChevronRight, Info, Pause, Play, RotateCcw } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger
} from '@/components/ui/popover';
import type { ReplayControlState, ReplayViewState } from '@/features/durable-chat/types/replay';
import { composerMaxWithTW, ui } from './ui';

type ReplayDockProps = {
  controlState: ReplayControlState;
  viewState: ReplayViewState;
  onTogglePlayback: () => void;
  onPreviousStep: () => void;
  onNextStep: () => void;
  onInspectStep: (stepIndex: number) => void;
  onFinishReplay: () => void;
  onRestart: () => void;
};

const replayToneLegendItems: Array<{
  label: string;
  tone: ReplayViewState['progressSegments'][number]['tone'];
}> = [
  {
    label: '用户提问',
    tone: 'user'
  },
  {
    label: '思考',
    tone: 'thinking'
  },
  {
    label: 'AI 回答',
    tone: 'answer'
  }
];

function ReplayDockButton({
  label,
  disabled,
  onClick,
  icon,
  variant = 'secondary'
}: {
  label: string;
  disabled: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  variant?: 'primary' | 'secondary' | 'icon';
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={clsx(
        'inline-flex h-10 items-center justify-center gap-2 rounded-full border text-sm font-medium transition',
        variant === 'icon' ? 'w-10 px-0' : 'px-4',
        disabled
          ? 'cursor-not-allowed border-[color:var(--chat-border)] text-[color:var(--chat-text-tertiary)] opacity-60'
          : variant === 'primary'
            ? 'border-transparent bg-[var(--chat-reasoning-accent)] text-white hover:bg-[var(--chat-reasoning-accent)] hover:opacity-95'
          : 'border-[color:var(--chat-border)] bg-[var(--chat-surface)] text-[color:var(--chat-text-secondary)] hover:border-[color:var(--chat-border-strong)] hover:text-[color:var(--chat-text)]'
      )}
      aria-label={variant === 'icon' ? label : undefined}
    >
      {icon}
      {variant === 'icon' ? <span className="sr-only">{label}</span> : <span>{label}</span>}
    </button>
  );
}

function getPrimaryPlaybackControl(viewState: ReplayViewState) {
  if (viewState.status === 'playing') {
    return {
      label: '暂停',
      icon: <Pause className="h-4 w-4" />
    };
  }

  if (viewState.status === 'completed') {
    return {
      label: '重播',
      icon: <RotateCcw className="h-4 w-4" />
    };
  }

  return {
    label: viewState.status === 'paused' ? '继续' : '播放',
    icon: <Play className="h-4 w-4" />
  };
}

function getSegmentToneClass(tone: ReplayViewState['progressSegments'][number]['tone']) {
  if (tone === 'user') {
    return 'bg-[color:color-mix(in_srgb,var(--chat-text)_52%,white)] hover:bg-[color:color-mix(in_srgb,var(--chat-text)_64%,white)]';
  }

  if (tone === 'thinking') {
    return 'bg-[color:color-mix(in_srgb,var(--chat-reasoning-accent)_24%,white)] hover:bg-[color:color-mix(in_srgb,var(--chat-reasoning-accent)_34%,white)]';
  }

  return 'bg-[var(--chat-reasoning-accent)] hover:bg-[color:color-mix(in_srgb,var(--chat-reasoning-accent)_82%,black)]';
}

export function ReplayDock({
  controlState,
  viewState,
  onTogglePlayback,
  onPreviousStep,
  onNextStep,
  onInspectStep,
  onFinishReplay,
  onRestart
}: ReplayDockProps) {
  const primaryControl = getPrimaryPlaybackControl(viewState);

  return (
    <div className={clsx('sticky bottom-0 z-10 px-4 pb-0', ui.composerDock)}>
      <div className={`${composerMaxWithTW} relative mx-auto`}>
        <div className={clsx(ui.composerCard, 'flex flex-col justify-between px-5 py-4')}>
          <div className="flex h-6 translate-y-1 items-center gap-1.5" aria-label="重放进度">
            {viewState.progressSegments.length > 0 ? (
              viewState.progressSegments.map((segment) => (
                <button
                  key={segment.rawStepIndex}
                  type="button"
                  disabled={!controlState.canInspect}
                  onClick={() => onInspectStep(segment.stepIndex)}
                  style={{ flexGrow: segment.weight }}
                  className={clsx(
                    'relative flex min-w-4 items-center rounded-full py-2 transition',
                    !controlState.canInspect && 'cursor-not-allowed opacity-60'
                  )}
                  aria-label={`跳到第 ${segment.stepIndex + 1} 段：${segment.label}`}
                  aria-current={segment.playbackActive ? 'step' : undefined}
                  data-replay-segment-tone={segment.tone}
                  data-replay-segment-complete={segment.complete ? 'true' : undefined}
                  data-replay-segment-playback-active={segment.playbackActive ? 'true' : undefined}
                  data-replay-segment-inspected={segment.inspected ? 'true' : undefined}
                  title={`第 ${segment.stepIndex + 1} 段 · ${segment.label} · ${segment.durationLabel}`}
                >
                  <span
                    className={clsx(
                      'h-2 w-full rounded-full transition',
                      getSegmentToneClass(segment.tone),
                      segment.playbackActive &&
                        'ring-2 ring-[color:var(--chat-reasoning-accent)] ring-offset-2 ring-offset-[color:var(--chat-surface)]',
                      segment.inspected && 'outline outline-2 outline-offset-2 outline-[color:var(--chat-text-secondary)]'
                    )}
                  />
                </button>
              ))
            ) : (
              <div className="h-2 flex-1 rounded-full bg-[color:var(--chat-border)]" />
            )}
          </div>

          <div className="flex items-center justify-between gap-5">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <div className="text-base font-semibold text-[color:var(--chat-text)]">对话重放</div>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      type="button"
                      variant="ghost"
                      aria-label="查看重放进度颜色说明"
                      className="h-5 w-5 rounded-full p-0 text-[color:var(--chat-text-tertiary)] hover:text-[color:var(--chat-text)] [&_svg]:size-3.5"
                    >
                      <Info data-icon="inline-start" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent
                    align="start"
                    className="w-44 border border-[color:var(--chat-border)] bg-[var(--chat-surface)] text-[color:var(--chat-text)] shadow-xl"
                  >
                    <PopoverHeader>
                      <PopoverTitle>进度颜色</PopoverTitle>
                    </PopoverHeader>
                    <div className="flex flex-col gap-2">
                      {replayToneLegendItems.map((item) => (
                        <div key={item.tone} className="flex items-center gap-3">
                          <span className={clsx('mt-1 h-2.5 w-9 shrink-0 rounded-full', getSegmentToneClass(item.tone))} />
                          <span className="text-sm font-medium text-[color:var(--chat-text)]">{item.label}</span>
                        </div>
                      ))}
                    </div>
                  </PopoverContent>
                </Popover>
              </div>
              <div className="mt-1 truncate text-sm text-[color:var(--chat-text-secondary)]">
                {viewState.progressLabel} · {viewState.currentStepLabel} · 总时长 {viewState.totalDurationLabel}
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-2">
              <ReplayDockButton
                disabled={!controlState.canPrevious}
                icon={<ChevronLeft className="h-4 w-4" />}
                label="上一段"
                onClick={onPreviousStep}
                variant="icon"
              />
              <ReplayDockButton
                disabled={!controlState.canTogglePlayback}
                icon={primaryControl.icon}
                label={primaryControl.label}
                onClick={onTogglePlayback}
                variant="primary"
              />
              <ReplayDockButton
                disabled={!controlState.canNext}
                icon={<ChevronRight className="h-4 w-4" />}
                label="下一段"
                onClick={onNextStep}
                variant="icon"
              />
              <ReplayDockButton
                disabled={!controlState.canFinish}
                icon={<ChevronsRight className="h-4 w-4" />}
                label="完成"
                onClick={onFinishReplay}
              />
              <ReplayDockButton
                disabled={!controlState.canRestart}
                icon={<RotateCcw className="h-4 w-4" />}
                label="重置"
                onClick={onRestart}
              />
            </div>
          </div>
        </div>
      </div>
      <div className="flex h-7 items-center justify-center text-[11px] leading-none text-[color:var(--chat-text-tertiary)]">
        内容由 AI 生成，请仔细甄别
      </div>
    </div>
  );
}
