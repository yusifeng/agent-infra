'use client';

import clsx from 'clsx';
import { ChevronLeft, ChevronRight, Pause, Play, RotateCcw } from 'lucide-react';

import type { ReplayControlState, ReplayViewState } from '@/features/durable-chat/types/replay';
import { composerMaxWithTW, ui } from './ui';

type ReplayDockProps = {
  controlState: ReplayControlState;
  viewState: ReplayViewState;
  onTogglePlayback: () => void;
  onPreviousStep: () => void;
  onNextStep: () => void;
  onInspectStep: (stepIndex: number) => void;
  onRestart: () => void;
};

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

function getSegmentToneClass(tone: ReplayViewState['progressSegments'][number]['tone'], complete: boolean) {
  if (tone === 'user') {
    return complete
      ? 'bg-[color:color-mix(in_srgb,var(--chat-text-secondary)_62%,white)]'
      : 'bg-[color:color-mix(in_srgb,var(--chat-text-secondary)_18%,white)] hover:bg-[color:color-mix(in_srgb,var(--chat-text-secondary)_28%,white)]';
  }

  if (tone === 'thinking') {
    return complete
      ? 'bg-[color:color-mix(in_srgb,var(--chat-reasoning-accent)_46%,white)]'
      : 'bg-[color:color-mix(in_srgb,var(--chat-reasoning-accent)_14%,white)] hover:bg-[color:color-mix(in_srgb,var(--chat-reasoning-accent)_22%,white)]';
  }

  return complete
    ? 'bg-[color:var(--chat-reasoning-accent)]'
    : 'bg-[color:color-mix(in_srgb,var(--chat-reasoning-accent)_20%,white)] hover:bg-[color:color-mix(in_srgb,var(--chat-reasoning-accent)_30%,white)]';
}

export function ReplayDock({
  controlState,
  viewState,
  onTogglePlayback,
  onPreviousStep,
  onNextStep,
  onInspectStep,
  onRestart
}: ReplayDockProps) {
  const primaryControl = getPrimaryPlaybackControl(viewState);

  return (
    <div className={clsx('sticky bottom-0 z-10 px-4 pb-0', ui.composerDock)}>
      <div className={`${composerMaxWithTW} relative mx-auto`}>
        <div className={clsx(ui.composerCard, 'flex flex-col justify-between px-5 py-4')}>
          <div className="flex h-4 translate-y-1 items-center gap-1.5" aria-label="重放进度">
            {viewState.progressSegments.length > 0 ? (
              viewState.progressSegments.map((segment) => (
                <button
                  key={segment.rawStepIndex}
                  type="button"
                  disabled={!controlState.canInspect}
                  onClick={() => onInspectStep(segment.stepIndex)}
                  style={{ flexGrow: segment.weight }}
                  className={clsx(
                    'h-1.5 min-w-4 rounded-full transition',
                    getSegmentToneClass(segment.tone, segment.complete),
                    segment.playbackActive &&
                      'ring-2 ring-[color:var(--chat-reasoning-accent)] ring-offset-2 ring-offset-[color:var(--chat-surface)]',
                    segment.inspected && 'outline outline-2 outline-offset-2 outline-[color:var(--chat-text-secondary)]',
                    !controlState.canInspect && 'cursor-not-allowed opacity-60'
                  )}
                  aria-label={`跳到第 ${segment.stepIndex + 1} 段：${segment.label}`}
                  aria-current={segment.playbackActive ? 'step' : undefined}
                  data-replay-segment-tone={segment.tone}
                  data-replay-segment-playback-active={segment.playbackActive ? 'true' : undefined}
                  data-replay-segment-inspected={segment.inspected ? 'true' : undefined}
                  title={`第 ${segment.stepIndex + 1} 段 · ${segment.label} · ${segment.durationLabel}`}
                />
              ))
            ) : (
              <div className="h-1.5 flex-1 rounded-full bg-[color:var(--chat-border)]" />
            )}
          </div>

          <div className="flex items-center justify-between gap-5">
            <div className="min-w-0">
              <div className="text-base font-semibold text-[color:var(--chat-text)]">对话重放</div>
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
