import { describe, expect, it } from 'vitest';

import { decodeRouteThreadId, resolveChatRouteThreadId } from './chat-route-selection';

describe('chat route selection', () => {
  it('resolves chat route thread ids without requiring the page subtree to own the shell', () => {
    expect(resolveChatRouteThreadId('/chat/thread-1')).toBe('thread-1');
    expect(resolveChatRouteThreadId('/chat/thread%201')).toBe('thread 1');
    expect(resolveChatRouteThreadId('/new')).toBeNull();
    expect(resolveChatRouteThreadId('/replay/thread-1')).toBeNull();
  });

  it('keeps malformed encoded thread ids usable', () => {
    expect(decodeRouteThreadId('%E0%A4%A')).toBe('%E0%A4%A');
  });
});
