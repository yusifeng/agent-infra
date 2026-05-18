import type { RunDto, ThreadRunListItemDto } from '@agent-infra/contracts';

import type { PlaygroundThreadDto } from '@/features/durable-chat/repo/chat-api';
import type { ObservabilitySelectionResult } from '@/features/observability/service/selection';
import { cn } from '@/lib/utils';

type RunColumnProps = {
  items: ThreadRunListItemDto[];
  loading: boolean;
  error: string | null;
  selectedRunId: string | null;
  selectedThread: PlaygroundThreadDto | null;
  selection: ObservabilitySelectionResult;
  onSelectRun: (runId: string) => void;
};

function runStatusClass(status: RunDto['status']) {
  if (status === 'completed') {
    return 'bg-[var(--chat-status-success-bg)] text-[var(--chat-status-success-text)]';
  }
  if (status === 'failed') {
    return 'bg-[var(--chat-status-danger-bg)] text-[var(--chat-status-danger-text)]';
  }
  if (status === 'running') {
    return 'bg-[var(--chat-status-running-bg)] text-[var(--chat-status-running-text)]';
  }
  return 'bg-[var(--chat-status-idle-bg)] text-[var(--chat-status-idle-text)]';
}

function RunStatusBadge({ status }: { status: RunDto['status'] }) {
  if (status === 'completed') {
    return null;
  }

  return <span className={cn('rounded-md px-2 py-0.5 text-xs font-medium', runStatusClass(status))}>{status}</span>;
}

function formatRunListLabel(item: ThreadRunListItemDto, index: number) {
  const preview = item.triggerMessage?.preview?.trim();
  if (preview) {
    return preview;
  }
  if (item.triggerMessage) {
    return `Turn ${item.triggerMessage.seq}`;
  }

  return `Missing trigger message ${index + 1}`;
}

export function RunColumn({ items, loading, error, selectedRunId, selectedThread, selection, onSelectRun }: RunColumnProps) {
  return (
    <section className="flex min-h-0 flex-col border-r border-[color:var(--chat-border)] bg-[var(--chat-surface)]">
      <div className="flex h-14 shrink-0 items-center justify-between border-b border-[color:var(--chat-border)] px-4">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-[var(--chat-text)]">Runs</h2>
          <p className="truncate text-xs text-[var(--chat-muted)]">{selectedThread ? `${items.length} total` : 'No thread selected'}</p>
        </div>
        {selection.status === 'stale' ? <span className="text-xs text-[var(--chat-warning-text)]">Query reset</span> : null}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-2">
        {error ? <div className="rounded-lg bg-[var(--chat-error-bg)] px-3 py-2 text-sm text-[var(--chat-error-text)]">{error}</div> : null}
        {!error && loading ? <div className="px-2 py-8 text-center text-sm text-[var(--chat-muted)]">Loading runs</div> : null}
        {!error && !loading && selectedThread && items.length === 0 ? (
          <div className="px-2 py-8 text-center text-sm text-[var(--chat-muted)]">No runs</div>
        ) : null}
        {!error && !loading && !selectedThread ? <div className="px-2 py-8 text-center text-sm text-[var(--chat-muted)]">No thread selected</div> : null}
        <div className="flex flex-col">
          {items.map((item, index) => {
            const { run } = item;
            const selected = run.id === selectedRunId;
            const label = formatRunListLabel(item, index);
            return (
              <button
                key={run.id}
                type="button"
                title={run.id}
                onClick={() => onSelectRun(run.id)}
                className={cn(
                  'group flex h-10 w-full items-center justify-between rounded-[12px] px-3 text-left transition',
                  selected ? 'bg-[var(--chat-brand-accent-soft)] text-[var(--chat-text)]' : 'text-[var(--chat-text)] hover:bg-[var(--chat-hover)]'
                )}
              >
                <span className="min-w-0 flex-1 truncate text-sm leading-[1.2]" title={label}>
                  {label}
                </span>
                <span className="ml-2 flex shrink-0 items-center gap-1 opacity-80">
                  <RunStatusBadge status={run.status} />
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}
