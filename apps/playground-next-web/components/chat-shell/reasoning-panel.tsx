import clsx from 'clsx';
import { Atom, ChevronDown, ChevronRight } from 'lucide-react';
import { memo, useEffect, useRef, useState } from 'react';

import { MarkdownRenderer } from './markdown-renderer';

const reasoningMarkdownClassName = 'text-sm leading-7 text-[color:var(--chat-reasoning-text)]';

export const ReasoningPanel = memo(function ReasoningPanel({
  content,
  thinking = false
}: {
  content: string;
  thinking?: boolean;
}) {
  const [manualExpanded, setManualExpanded] = useState(thinking);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const expanded = thinking || manualExpanded;

  useEffect(() => {
    if (!thinking || !expanded) {
      return;
    }

    const element = contentRef.current;
    if (!element) {
      return;
    }

    const distanceToBottom = element.scrollHeight - element.scrollTop - element.clientHeight;
    if (distanceToBottom < 120) {
      window.requestAnimationFrame(() => {
        element.scrollTop = element.scrollHeight;
      });
    }
  }, [content, thinking, expanded]);

  return (
    <div className="overflow-hidden" data-reasoning-panel="true">
      <button
        type="button"
        onClick={() => {
          if (!thinking) {
            setManualExpanded((current) => !current);
          }
        }}
        className="flex w-full items-center justify-between gap-3 py-1 text-left"
        aria-expanded={expanded}
      >
        <div className="flex min-w-0 items-center gap-2.5">
          <Atom className={clsx('h-4 w-4 text-[color:var(--chat-reasoning-accent)]', thinking && 'animate-pulse')} />
          <span
            className={clsx(
              'truncate text-sm font-medium',
              thinking ? 'chat-reasoning-shimmer-text' : 'text-[color:var(--chat-reasoning-text)]'
            )}
          >
            {thinking ? '思考中...' : '已思考'}
          </span>
        </div>
        {expanded ? (
          <ChevronDown className="h-4 w-4 text-[color:var(--chat-icon-muted)]" />
        ) : (
          <ChevronRight className="h-4 w-4 text-[color:var(--chat-icon-muted)]" />
        )}
      </button>

      {expanded ? (
        <div ref={contentRef} className="mt-2 max-h-80 overflow-y-auto border-l border-[color:var(--chat-reasoning-divider)] pl-4">
          {content ? (
            <MarkdownRenderer
              className={reasoningMarkdownClassName}
              plainTextClassName={reasoningMarkdownClassName}
              text={content}
            />
          ) : (
            <div className="text-sm italic leading-7 text-[color:var(--chat-reasoning-text)]">思考中...</div>
          )}
        </div>
      ) : null}
    </div>
  );
});
