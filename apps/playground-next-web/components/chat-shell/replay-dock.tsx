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
  onSeekToStep: (stepIndex: number) => void;
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
            ? 'border-[color:var(--chat-text)] bg-[var(--chat-text)] text-[color:var(--chat-surface)] hover:opacity-90'
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

export function ReplayDock({
  controlState,
  viewState,
  onTogglePlayback,
  onPreviousStep,
  onNextStep,
  onSeekToStep,
  onRestart
}: ReplayDockProps) {
  const primaryControl = getPrimaryPlaybackControl(viewState);

  return (
    <div className={clsx('sticky bottom-0 z-10 px-4 pb-4', ui.composerDock)}>
      <div className={`${composerMaxWithTW} relative mx-auto`}>
        <div className={clsx(ui.composerCard, 'flex flex-col gap-4 px-5 py-4')}>
          <div className="flex items-center justify-between gap-5">
            <div className="min-w-0">
              <div className="text-base font-semibold text-[color:var(--chat-text)]">对话重放</div>
              <div className="mt-1 truncate text-sm text-[color:var(--chat-text-secondary)]">
                {viewState.progressLabel} · {viewState.currentStepLabel} · {viewState.status}
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

          <div className="flex h-5 items-center gap-1.5" aria-label="重放进度">
            {viewState.progressSegments.length > 0 ? (
              viewState.progressSegments.map((segment) => (
                <button
                  key={segment.rawStepIndex}
                  type="button"
                  disabled={!controlState.canSeek}
                  onClick={() => onSeekToStep(segment.stepIndex)}
                  className={clsx(
                    'h-2 min-w-6 flex-1 rounded-full transition',
                    segment.complete
                      ? 'bg-[color:var(--chat-text)]'
                      : 'bg-[color:var(--chat-border)] hover:bg-[color:var(--chat-border-strong)]',
                    segment.active && 'ring-2 ring-[color:var(--chat-text)] ring-offset-2 ring-offset-[color:var(--chat-surface)]',
                    !controlState.canSeek && 'cursor-not-allowed opacity-60'
                  )}
                  aria-label={`跳到第 ${segment.stepIndex + 1} 段：${segment.label}`}
                  aria-current={segment.active ? 'step' : undefined}
                />
              ))
            ) : (
              <div className="h-2 flex-1 rounded-full bg-[color:var(--chat-border)]" />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
