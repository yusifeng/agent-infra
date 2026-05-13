'use client';

import clsx from 'clsx';
import { Pause, Play, RotateCcw } from 'lucide-react';

import type { ReplayControlState, ReplayViewState } from '@/features/durable-chat/types/replay';
import { composerMaxWithTW, ui } from './ui';

type ReplayControlBarProps = {
  controlState: ReplayControlState;
  viewState: ReplayViewState;
  onPlay: () => void;
  onPause: () => void;
  onResume: () => void;
  onRestart: () => void;
};

function ReplayControlButton({
  label,
  disabled,
  onClick,
  icon
}: {
  label: string;
  disabled: boolean;
  onClick: () => void;
  icon: React.ReactNode;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={clsx(
        'inline-flex h-9 items-center gap-2 rounded-lg border px-3 text-sm transition',
        disabled
          ? 'cursor-not-allowed border-[color:var(--chat-border)] text-[color:var(--chat-text-tertiary)] opacity-60'
          : 'border-[color:var(--chat-border)] bg-[var(--chat-surface)] text-[color:var(--chat-text-secondary)] hover:border-[color:var(--chat-border-strong)] hover:text-[color:var(--chat-text)]'
      )}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}

export function ReplayControlBar({
  controlState,
  viewState,
  onPlay,
  onPause,
  onResume,
  onRestart
}: ReplayControlBarProps) {
  return (
    <div className={clsx('sticky bottom-0 z-10 border-t border-[color:var(--chat-border)] px-4 py-3', ui.composerDock)}>
      <div className={clsx(`${composerMaxWithTW} mx-auto flex items-center justify-between gap-4 rounded-xl px-4 py-3`, ui.composerCard)}>
        <div className="min-w-0">
          <div className="text-sm font-medium text-[color:var(--chat-text)]">对话重放</div>
          <div className="text-xs text-[color:var(--chat-text-secondary)]">
            {viewState.progressLabel} · {viewState.status}
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <ReplayControlButton
            disabled={!controlState.canPlay}
            icon={<Play className="h-4 w-4" />}
            label="播放"
            onClick={onPlay}
          />
          <ReplayControlButton
            disabled={!controlState.canPause}
            icon={<Pause className="h-4 w-4" />}
            label="暂停"
            onClick={onPause}
          />
          <ReplayControlButton
            disabled={!controlState.canResume}
            icon={<Play className="h-4 w-4" />}
            label="继续"
            onClick={onResume}
          />
          <ReplayControlButton
            disabled={!controlState.canRestart}
            icon={<RotateCcw className="h-4 w-4" />}
            label="重播"
            onClick={onRestart}
          />
        </div>
      </div>
    </div>
  );
}
