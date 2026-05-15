import type { PlaygroundThreadDto } from '@/features/durable-chat/repo/chat-api';
import type { ObservabilitySelectionResult } from '@/features/observability/service/selection';
import { cn } from '@/lib/utils';
import { Archive, Pin, Workflow } from 'lucide-react';

import { formatDateTime, formatShortId } from '../service/format';

type ThreadColumnProps = {
  threads: PlaygroundThreadDto[];
  loading: boolean;
  error: string | null;
  selectedThreadId: string | null;
  selection: ObservabilitySelectionResult;
  onSelectThread: (threadId: string) => void;
};

function ThreadStatusBadge({ status }: { status: PlaygroundThreadDto['status'] }) {
  return (
    <span
      className={cn(
        'rounded-md px-2 py-0.5 text-xs font-medium',
        status === 'archived'
          ? 'bg-[var(--chat-status-idle-bg)] text-[var(--chat-status-idle-text)]'
          : 'bg-[var(--chat-status-success-bg)] text-[var(--chat-status-success-text)]'
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
      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {error ? <div className="rounded-lg bg-[var(--chat-error-bg)] px-3 py-2 text-sm text-[var(--chat-error-text)]">{error}</div> : null}
        {!error && loading ? <div className="px-2 py-8 text-center text-sm text-[var(--chat-muted)]">Loading threads</div> : null}
        {!error && !loading && threads.length === 0 ? <div className="px-2 py-8 text-center text-sm text-[var(--chat-muted)]">No threads</div> : null}
        <div className="flex flex-col gap-2">
          {threads.map((thread) => {
            const selected = thread.id === selectedThreadId;
            return (
              <button
                key={thread.id}
                type="button"
                onClick={() => onSelectThread(thread.id)}
                className={cn(
                  'w-full rounded-lg border px-3 py-3 text-left transition hover:bg-[var(--chat-hover)]',
                  selected
                    ? 'border-[color:var(--chat-brand-accent-border)] bg-[var(--chat-brand-accent-soft)]'
                    : 'border-[color:var(--chat-border)] bg-[var(--chat-surface)]'
                )}
              >
                <div className="flex items-start gap-2">
                  <div className="mt-0.5 text-[var(--chat-icon-muted)]">
                    {thread.pinned ? <Pin className="size-4 text-[var(--chat-accent)]" /> : <Workflow className="size-4" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <div className="line-clamp-2 text-sm font-medium text-[var(--chat-text)]">{thread.title ?? 'Untitled thread'}</div>
                      <ThreadStatusBadge status={thread.status} />
                    </div>
                    <div className="mt-2 flex min-w-0 flex-col gap-1 text-xs text-[var(--chat-muted)]">
                      <span className="truncate">appId {thread.appId}</span>
                      <span className="truncate">
                        {(thread.runtimeProvider ?? 'provider unknown')} / {(thread.runtimeModel ?? 'model unknown')}
                      </span>
                      <span className="truncate">Updated {formatDateTime(thread.updatedAt)}</span>
                      <span className="truncate font-mono">{formatShortId(thread.id, 14)}</span>
                      {thread.status === 'archived' ? (
                        <span className="inline-flex items-center gap-1 text-[var(--chat-muted)]">
                          <Archive className="size-3" />
                          Archived
                        </span>
                      ) : null}
                    </div>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}
