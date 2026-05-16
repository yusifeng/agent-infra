import type { ReplaySegmentTone, ReplayStep } from '@/features/durable-chat/types/replay';

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

export function getReplaySegmentTone(step: ReplayStep): ReplaySegmentTone {
  if (step.kind === 'text' && step.role === 'user') {
    return 'user';
  }

  if (step.kind === 'text' && step.role === 'assistant' && step.variant === 'text') {
    return 'answer';
  }

  return 'thinking';
}

export function getReplaySegmentWeight(step: ReplayStep) {
  if (step.kind === 'text') {
    const size = step.content.trim().length;

    if (step.role === 'user') {
      return clamp(1.2 + size / 240, 1.2, 2.4);
    }

    if (step.variant === 'reasoning') {
      return clamp(1.4 + size / 180, 1.4, 5);
    }

    return clamp(1.8 + size / 160, 1.8, 8);
  }

  if (step.kind === 'search-summary') {
    return clamp(1 + step.resultCount / 8, 1, 2.2);
  }

  if (step.kind === 'search-loading' || step.kind === 'tool-part') {
    return 0.9;
  }

  return 0;
}
