import { describe, expect, it } from 'vitest';

import {
  CHAT_VIEWPORT_NEAR_BOTTOM_PX,
  getDistanceToBottom,
  getUserInitiatedScrollBehavior,
  isChatViewportNearBottom,
  resolveChatViewportModeFromPosition,
  shouldAutoFollowViewport
} from './chat-viewport-state';

describe('chat viewport state', () => {
  it('treats only a tight bottom threshold as following', () => {
    expect(
      isChatViewportNearBottom({
        scrollHeight: 1000,
        scrollTop: 1000 - 500 - (CHAT_VIEWPORT_NEAR_BOTTOM_PX - 1),
        clientHeight: 500
      })
    ).toBe(true);
    expect(
      isChatViewportNearBottom({
        scrollHeight: 1000,
        scrollTop: 1000 - 500 - CHAT_VIEWPORT_NEAR_BOTTOM_PX,
        clientHeight: 500
      })
    ).toBe(false);
  });

  it('resolves following and detached modes from viewport position', () => {
    expect(
      resolveChatViewportModeFromPosition({
        scrollHeight: 1200,
        scrollTop: 1140,
        clientHeight: 100
      })
    ).toBe('following');
    expect(
      resolveChatViewportModeFromPosition({
        scrollHeight: 1200,
        scrollTop: 900,
        clientHeight: 100
      })
    ).toBe('detached');
  });

  it('only auto-follows in following mode', () => {
    expect(shouldAutoFollowViewport('following')).toBe(true);
    expect(shouldAutoFollowViewport('detached')).toBe(false);
    expect(shouldAutoFollowViewport('selecting')).toBe(false);
    expect(shouldAutoFollowViewport('prepending')).toBe(false);
  });

  it('preserves prepend position by applying the height delta', () => {
    const before = { scrollHeight: 800, scrollTop: 160, clientHeight: 400 };
    const after = { scrollHeight: 1100, scrollTop: 160, clientHeight: 400 };

    expect(before.scrollTop + (after.scrollHeight - before.scrollHeight)).toBe(460);
    expect(getDistanceToBottom(after)).toBe(540);
  });

  it('uses reduced-motion preference for user initiated smooth scrolling', () => {
    expect(getUserInitiatedScrollBehavior(false)).toBe('smooth');
    expect(getUserInitiatedScrollBehavior(true)).toBe('auto');
  });
});
