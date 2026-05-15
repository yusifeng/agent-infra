import type { RunDto, RunTimelineResponseDto, RunTraceResponseDto } from '@agent-infra/contracts';
import { useState } from 'react';
import { Activity, Clock3, Database, Route } from 'lucide-react';

import type { PlaygroundThreadDto } from '@/features/durable-chat/repo/chat-api';
import { cn } from '@/lib/utils';

import { formatDateTime, formatDurationMs, formatShortId, formatTokenCount, getRunDurationMs } from '../service/format';
import { TimelineTab } from './timeline-tab';
import { TraceTab } from './trace-tab';

type RunContentPanelProps = {
  selectedRun: RunDto | null;
  selectedThread: PlaygroundThreadDto | null;
  timeline: RunTimelineResponseDto | null;
  timelineLoading: boolean;
  timelineError: string | null;
  trace: RunTraceResponseDto | null;
  traceLoading: boolean;
  traceError: string | null;
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

export function RunContentPanel({ selectedRun, selectedThread, timeline, timelineLoading, timelineError, trace, traceLoading, traceError }: RunContentPanelProps) {
  const [activeTab, setActiveTab] = useState<'timeline' | 'trace'>('timeline');

  return (
    <section className="flex min-h-0 min-w-0 flex-col bg-[var(--chat-surface)]">
      {!selectedRun ? (
        <div className="flex min-h-0 flex-1 items-center justify-center px-6 text-sm text-[var(--chat-muted)]">No run selected</div>
      ) : (
        <>
          <div className="shrink-0 border-b border-[color:var(--chat-border)] px-5 py-4">
            <div className="flex min-w-0 flex-wrap items-center gap-3">
              <h2 className="min-w-0 truncate font-mono text-lg font-semibold text-[var(--chat-text)]">{formatShortId(selectedRun.id, 18)}</h2>
              <span className={cn('rounded-md px-2 py-0.5 text-xs font-medium', runStatusClass(selectedRun.status))}>{selectedRun.status}</span>
              <span className="truncate text-sm text-[var(--chat-muted)]">
                {(selectedRun.provider ?? 'provider unknown')} / {(selectedRun.model ?? 'model unknown')}
              </span>
            </div>
            {selectedRun.error ? <div className="mt-3 rounded-lg bg-[var(--chat-error-bg)] px-3 py-2 text-sm text-[var(--chat-error-text)]">{selectedRun.error}</div> : null}
            <div className="mt-4 grid gap-3 text-sm text-[var(--chat-muted)] md:grid-cols-4">
              <div className="min-w-0 border-r border-[color:var(--chat-border)] pr-3">
                <div className="flex items-center gap-1 text-xs">
                  <Clock3 className="size-3" />
                  Duration
                </div>
                <div className="mt-1 font-medium text-[var(--chat-text)]">{formatDurationMs(getRunDurationMs(selectedRun))}</div>
              </div>
              <div className="min-w-0 border-r border-[color:var(--chat-border)] pr-3">
                <div className="flex items-center gap-1 text-xs">
                  <Database className="size-3" />
                  Tokens
                </div>
                <div className="mt-1 font-medium text-[var(--chat-text)]">{formatTokenCount(selectedRun.usage)}</div>
              </div>
              <div className="min-w-0 border-r border-[color:var(--chat-border)] pr-3">
                <div className="text-xs">Started</div>
                <div className="mt-1 truncate font-medium text-[var(--chat-text)]">{formatDateTime(selectedRun.startedAt ?? selectedRun.createdAt)}</div>
              </div>
              <div className="min-w-0">
                <div className="text-xs">Finished</div>
                <div className="mt-1 truncate font-medium text-[var(--chat-text)]">{formatDateTime(selectedRun.finishedAt)}</div>
              </div>
            </div>
          </div>
          <div className="grid shrink-0 grid-cols-2 border-b border-[color:var(--chat-border)] text-sm font-medium">
            <button
              type="button"
              onClick={() => setActiveTab('timeline')}
              className={cn(
                'flex h-12 items-center gap-2 border-r border-[color:var(--chat-border)] px-5 text-left',
                activeTab === 'timeline' ? 'bg-[var(--chat-brand-accent-soft)] text-[var(--chat-accent)]' : 'text-[var(--chat-muted)]'
              )}
            >
              <Activity className="size-4" />
              Timeline
              {timelineLoading ? <span className="text-xs text-[var(--chat-muted)]">Loading</span> : null}
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('trace')}
              className={cn('flex h-12 items-center gap-2 px-5 text-left', activeTab === 'trace' ? 'bg-[var(--chat-brand-accent-soft)] text-[var(--chat-accent)]' : 'text-[var(--chat-muted)]')}
            >
              <Route className="size-4" />
              Trace
              {traceLoading ? <span className="text-xs text-[var(--chat-muted)]">Loading</span> : null}
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-5">
            <div className="mb-5 grid gap-3 text-sm text-[var(--chat-muted)] md:grid-cols-3">
              <div className="rounded-lg border border-[color:var(--chat-border)] bg-[var(--chat-surface-muted)] p-3">
                <div className="text-xs">Thread</div>
                <div className="mt-1 truncate font-medium text-[var(--chat-text)]">{selectedThread?.title ?? 'Untitled thread'}</div>
              </div>
              <div className="rounded-lg border border-[color:var(--chat-border)] bg-[var(--chat-surface-muted)] p-3">
                <div className="text-xs">appId</div>
                <div className="mt-1 truncate font-medium text-[var(--chat-text)]">{selectedThread?.appId ?? '-'}</div>
              </div>
              <div className="rounded-lg border border-[color:var(--chat-border)] bg-[var(--chat-surface-muted)] p-3">
                <div className="text-xs">Run ID</div>
                <div className="mt-1 truncate font-mono text-[var(--chat-text)]">{selectedRun.id}</div>
              </div>
            </div>
            {activeTab === 'timeline' ? (
              <TimelineTab timeline={timeline} loading={timelineLoading} error={timelineError} />
            ) : (
              <TraceTab trace={trace} loading={traceLoading} error={traceError} />
            )}
          </div>
        </>
      )}
    </section>
  );
}
