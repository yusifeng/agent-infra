'use client';

import clsx from 'clsx';
import { Pause, Play, RotateCcw, SkipForward } from 'lucide-react';

import { IconButton } from './shared';
import { ui } from './ui';

type ReplayStatus = 'idle' | 'playing' | 'paused' | 'completed';

type ReplayControlBarProps = {
  currentStep: number;
  totalSteps: number;
  status: ReplayStatus;
  onPause: () => void;
  onPlay: () => void;
  onRestart: () => void;
  onResume: () => void;
  onStepForward: () => void;
};

export function ReplayControlBar({
  currentStep,
  totalSteps,
  status,
  onPause,
  onPlay,
  onRestart,
  onResume,
  onStepForward
}: ReplayControlBarProps) {
  const progress = totalSteps === 0 ? 0 : Math.min(Math.max(currentStep + 1, 0), totalSteps);

  return (
    <div className="shrink-0 border-t border-slate-200 bg-white/90 px-4 py-3 backdrop-blur">
      <div className={clsx('mx-auto flex max-w-[840px] items-center justify-between gap-3 rounded-lg border border-slate-200 px-3 py-2', ui.secondarySurface)}>
        <div className="min-w-0 text-sm text-slate-600">
          <span className="font-medium text-slate-900">{progress}</span>
          <span className="text-slate-400"> / </span>
          <span>{totalSteps}</span>
        </div>
        <div className="flex items-center gap-1">
          <IconButton icon={RotateCcw} onClick={onRestart} title="重新播放" disabled={totalSteps === 0} />
          {status === 'playing' ? (
            <IconButton icon={Pause} onClick={onPause} title="暂停" disabled={totalSteps === 0} />
          ) : (
            <IconButton
              icon={Play}
              onClick={status === 'paused' ? onResume : onPlay}
              title={status === 'paused' ? '继续' : '播放'}
              disabled={totalSteps === 0 || status === 'completed'}
            />
          )}
          <IconButton icon={SkipForward} onClick={onStepForward} title="下一步" disabled={totalSteps === 0 || status === 'completed'} />
        </div>
      </div>
    </div>
  );
}
