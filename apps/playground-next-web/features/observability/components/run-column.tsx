import type { RunDto } from '@agent-infra/contracts';

import type { PlaygroundThreadDto } from '@/features/durable-chat/repo/chat-api';
import type { ObservabilitySelectionResult } from '@/features/observability/service/selection';
import { cn } from '@/lib/utils';
import { AlertCircle, CheckCircle2, Clock3, Loader2, XCircle } from 'lucide-react';

import { formatDateTime, formatDurationMs, formatShortId, formatTokenCount, getRunDurationMs } from '../service/format';

type RunColumnProps = {
  runs: RunDto[];
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

function RunStatusIcon({ status }: { status: RunDto['status'] }) {
  if (status === 'completed') {
    return <CheckCircle2 className="size-4 text-[var(--chat-status-success-text)]" />;
  }
  if (status === 'failed') {
    return <XCircle className="size-4 text-[var(--chat-status-danger-text)]" />;
  }
  if (status === 'running') {
    return <Loader2 className="size-4 animate-spin text-[var(--chat-status-running-text)]" />;
  }
  return <Clock3 className="size-4 text-[var(--chat-muted)]" />;
}

export function RunColumn({ runs, loading, error, selectedRunId, selectedThread, selection, onSelectRun }: RunColumnProps) {
  return (
    <section className="flex min-h-0 flex-col border-r border-[color:var(--chat-border)] bg-[var(--chat-surface)]">
      <div className="flex h-14 shrink-0 items-center justify-between border-b border-[color:var(--chat-border)] px-4">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-[var(--chat-text)]">Runs</h2>
          <p className="truncate text-xs text-[var(--chat-muted)]">{selectedThread ? formatShortId(selectedThread.id, 18) : 'No thread selected'}</p>
        </div>
        {selection.status === 'stale' ? <span className="text-xs text-[var(--chat-warning-text)]">Query reset</span> : null}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {error ? <div className="rounded-lg bg-[var(--chat-error-bg)] px-3 py-2 text-sm text-[var(--chat-error-text)]">{error}</div> : null}
        {!error && loading ? <div className="px-2 py-8 text-center text-sm text-[var(--chat-muted)]">Loading runs</div> : null}
        {!error && !loading && selectedThread && runs.length === 0 ? (
          <div className="px-2 py-8 text-center text-sm text-[var(--chat-muted)]">No runs</div>
        ) : null}
        {!error && !loading && !selectedThread ? <div className="px-2 py-8 text-center text-sm text-[var(--chat-muted)]">No thread selected</div> : null}
        <div className="flex flex-col gap-2">
          {runs.map((run) => {
            const selected = run.id === selectedRunId;
            return (
              <button
                key={run.id}
                type="button"
                onClick={() => onSelectRun(run.id)}
                className={cn(
                  'w-full rounded-lg border px-3 py-3 text-left transition hover:bg-[var(--chat-hover)]',
                  selected
                    ? 'border-[color:var(--chat-brand-accent-border)] bg-[var(--chat-brand-accent-soft)]'
                    : 'border-[color:var(--chat-border)] bg-[var(--chat-surface)]'
                )}
              >
                <div className="flex items-start gap-2">
                  <div className="mt-0.5">
                    <RunStatusIcon status={run.status} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate font-mono text-sm font-semibold text-[var(--chat-text)]">{formatShortId(run.id, 14)}</span>
                      <span className={cn('rounded-md px-2 py-0.5 text-xs font-medium', runStatusClass(run.status))}>{run.status}</span>
                    </div>
                    <div className="mt-2 flex min-w-0 flex-col gap-1 text-xs text-[var(--chat-muted)]">
                      <span className="truncate">
                        {(run.provider ?? 'provider unknown')} / {(run.model ?? 'model unknown')}
                      </span>
                      <span className="truncate">Started {formatDateTime(run.startedAt ?? run.createdAt)}</span>
                      <span className="truncate">
                        {formatDurationMs(getRunDurationMs(run))} · {formatTokenCount(run.usage)} tokens
                      </span>
                      {run.error ? (
                        <span className="inline-flex min-w-0 items-center gap-1 text-[var(--chat-error-text)]">
                          <AlertCircle className="size-3 shrink-0" />
                          <span className="truncate">{run.error}</span>
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
