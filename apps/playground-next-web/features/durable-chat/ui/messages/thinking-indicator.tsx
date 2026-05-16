'use client';

import { memo } from 'react';

export const ThinkingIndicator = memo(function ThinkingIndicator() {
  return (
    <div className="w-[90%] max-w-screen px-4">
      <div className="flex items-center gap-2.5 py-1.5">
        <span className="h-2 w-2 rounded-full bg-[color:var(--chat-text-tertiary)]" aria-hidden="true" />
        <span className="chat-shimmer-text text-sm font-medium tracking-[0.01em]">Thinking...</span>
      </div>
    </div>
  );
});
