export type ChatViewportMode = 'following' | 'detached' | 'selecting' | 'prepending';

export type ChatViewportMetrics = {
  scrollHeight: number;
  scrollTop: number;
  clientHeight: number;
};

export const CHAT_VIEWPORT_NEAR_BOTTOM_PX = 64;

export function getDistanceToBottom(metrics: ChatViewportMetrics) {
  return Math.max(0, metrics.scrollHeight - metrics.scrollTop - metrics.clientHeight);
}

export function isChatViewportNearBottom(metrics: ChatViewportMetrics) {
  return getDistanceToBottom(metrics) < CHAT_VIEWPORT_NEAR_BOTTOM_PX;
}

export function resolveChatViewportModeFromPosition(metrics: ChatViewportMetrics): ChatViewportMode {
  return isChatViewportNearBottom(metrics) ? 'following' : 'detached';
}

export function shouldAutoFollowViewport(mode: ChatViewportMode) {
  return mode === 'following';
}

export function getUserInitiatedScrollBehavior(prefersReducedMotion: boolean): ScrollBehavior {
  return prefersReducedMotion ? 'auto' : 'smooth';
}
