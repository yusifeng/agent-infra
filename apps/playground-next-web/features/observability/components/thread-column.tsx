import type { PlaygroundThreadDto } from '@/features/durable-chat/repo/chat-api';
import type { ObservabilitySelectionResult } from '@/features/observability/service/selection';
import { cn } from '@/lib/utils';
import { Pin } from 'lucide-react';

type ThreadColumnProps = {
  threads: PlaygroundThreadDto[];
  loading: boolean;
  error: string | null;
  selectedThreadId: string | null;
  selection: ObservabilitySelectionResult;
  onSelectThread: (threadId: string) => void;
};

function ThreadStatusBadge({ status }: { status: PlaygroundThreadDto['status'] }) {
  if (status === 'active') {
    return null;
  }

  return (
    <span
      className={cn(
        'rounded-md px-2 py-0.5 text-xs font-medium',
        'bg-[var(--chat-status-idle-bg)] text-[var(--chat-status-idle-text)]'
      )}
    >
      {status}
    </span>
  );
}

export function ThreadColumn({ threads, loading, error, selectedThreadId, selection, onSelectThread }: ThreadColumnProps) {
  return (
    <section className="flex min-h-0 flex-col border-r border-[color:var(--chat-border)] bg-[var(--chat-surface)]">
      <div className="flex h-14 shrink-0 items-center justify-between border-b border-[color:var(--chat-border)] px-4">
        <div>
          <h2 className="text-sm font-semibold text-[var(--chat-text)]">Threads</h2>
          <p className="text-xs text-[var(--chat-muted)]">{loading ? 'Loading' : `${threads.length} total`}</p>
        </div>
        {selection.status === 'stale' ? <span className="text-xs text-[var(--chat-warning-text)]">Query reset</span> : null}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-2">
        {error ? <div className="rounded-lg bg-[var(--chat-error-bg)] px-3 py-2 text-sm text-[var(--chat-error-text)]">{error}</div> : null}
        {!error && loading ? <div className="px-2 py-8 text-center text-sm text-[var(--chat-muted)]">Loading threads</div> : null}
        {!error && !loading && threads.length === 0 ? <div className="px-2 py-8 text-center text-sm text-[var(--chat-muted)]">No threads</div> : null}
        <div className="flex flex-col">
          {threads.map((thread) => {
            const selected = thread.id === selectedThreadId;
            return (
              <button
                key={thread.id}
                type="button"
                onClick={() => onSelectThread(thread.id)}
                className={cn(
                  'group flex h-10 w-full items-center justify-between rounded-[12px] px-3 text-left transition',
                  selected ? 'bg-[var(--chat-brand-accent-soft)] text-[var(--chat-text)]' : 'text-[var(--chat-text)] hover:bg-[var(--chat-hover)]'
                )}
              >
                <span className="min-w-0 flex-1 truncate text-sm leading-[1.2]" title={thread.title ?? 'Untitled thread'}>
                  {thread.title ?? 'Untitled thread'}
                </span>
                <span className="ml-2 flex shrink-0 items-center gap-1 opacity-80">
                  {thread.pinned ? <Pin className="size-3.5 text-[var(--chat-accent)]" /> : null}
                  <ThreadStatusBadge status={thread.status} />
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}
