import type { ChatViewportMetrics } from '@/features/durable-chat/service/chat-viewport-state';

export function getChatViewportMetrics(viewport: HTMLElement): ChatViewportMetrics {
  return {
    scrollHeight: viewport.scrollHeight,
    scrollTop: viewport.scrollTop,
    clientHeight: viewport.clientHeight
  };
}

export function selectionIntersectsChatViewport(viewport: HTMLElement) {
  const selection = document.getSelection();
  if (!selection || selection.isCollapsed || selection.rangeCount === 0) {
    return false;
  }

  for (let index = 0; index < selection.rangeCount; index += 1) {
    const range = selection.getRangeAt(index);
    try {
      if (range.intersectsNode(viewport)) {
        return true;
      }
    } catch {
      // Detached selection ranges can throw while React replaces message DOM.
    }
  }

  return false;
}
