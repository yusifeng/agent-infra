import type { ReplayStepKind, ReplayTextStep } from '@/features/durable-chat/types/replay';

export function getReplayTextDelayMs(step: Pick<ReplayTextStep, 'role' | 'variant' | 'content'>) {
  const trimmedLength = step.content.trim().length;
  const baseDelay = step.role === 'user' ? 180 : step.variant === 'reasoning' ? 280 : 240;
  const lengthBonus = Math.min(Math.floor(trimmedLength / 48) * 40, 200);

  return baseDelay + lengthBonus;
}

export function getReplayNodeDelayMs(kind: Exclude<ReplayStepKind, 'text'>, options?: { resultCount?: number }) {
  if (kind === 'search-loading') {
    const resultCount = options?.resultCount ?? 0;
    return 700 + Math.min(resultCount * 20, 300);
  }

  if (kind === 'search-summary') {
    return 180;
  }

  return 0;
}
