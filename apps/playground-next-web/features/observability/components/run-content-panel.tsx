import type { RunDto, RunTimelineResponseDto, RunTraceResponseDto, ThreadRunListItemDto } from '@agent-infra/contracts';
import { useState } from 'react';
import { Activity, Plus, Route } from 'lucide-react';

import { Button } from '@/components/ui/button';
import type { PlaygroundThreadDto } from '@/features/durable-chat/repo/chat-api';
import { cn } from '@/lib/utils';

import { formatDateTime, formatDurationMs, formatShortId, formatTokenCount, getRunDurationMs } from '../service/format';
import { DatasetCaptureDialog } from './dataset-capture-dialog';
import { TimelineTab } from './timeline-tab';
import { TraceTab } from './trace-tab';

type RunContentPanelProps = {
  selectedRun: RunDto | null;
  selectedRunItem: ThreadRunListItemDto | null;
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

function RunStatusBadge({ status }: { status: RunDto['status'] }) {
  if (status === 'completed') {
    return null;
  }

  return <span className={cn('rounded-md px-2 py-0.5 text-xs font-medium', runStatusClass(status))}>{status}</span>;
}

function getRunTitle(selectedRun: RunDto, selectedRunItem: ThreadRunListItemDto | null) {
  const preview = selectedRunItem?.triggerMessage?.preview?.trim();
  if (preview) {
    return preview;
  }
  if (selectedRunItem?.triggerMessage) {
    return `Turn ${selectedRunItem.triggerMessage.seq}`;
  }

  return `Run ${formatShortId(selectedRun.id, 12)}`;
}

export function RunContentPanel({ selectedRun, selectedRunItem, selectedThread, timeline, timelineLoading, timelineError, trace, traceLoading, traceError }: RunContentPanelProps) {
  const [activeTab, setActiveTab] = useState<'timeline' | 'trace'>('timeline');
  const [captureOpen, setCaptureOpen] = useState(false);

  return (
    <section className="flex min-h-0 min-w-0 flex-col bg-[var(--chat-surface)]">
      {!selectedRun ? (
        <div className="flex min-h-0 flex-1 items-center justify-center px-6 text-sm text-[var(--chat-muted)]">No run selected</div>
      ) : (
        <>
          <div className="shrink-0 border-b border-[color:var(--chat-border)] px-5 py-4">
            <div className="flex min-w-0 items-start justify-between gap-4">
              <div className="min-w-0 flex-1">
                <div className="flex min-w-0 items-center gap-2">
                  <h2 className="min-w-0 truncate text-base font-semibold text-[var(--chat-text)]" title={getRunTitle(selectedRun, selectedRunItem)}>
                    {getRunTitle(selectedRun, selectedRunItem)}
                  </h2>
                  <RunStatusBadge status={selectedRun.status} />
                </div>
                <p className="mt-1 truncate text-xs text-[var(--chat-muted)]">{selectedThread?.title ?? formatShortId(selectedThread?.id, 12)}</p>
              </div>
              <Button
                size="lg"
                className="bg-[var(--chat-brand-accent)] text-white hover:bg-[var(--chat-brand-accent-hover)]"
                onClick={() => setCaptureOpen(true)}
              >
                <Plus className="size-4" />
                Capture example
              </Button>
            </div>
            {selectedRun.error ? <div className="mt-3 rounded-lg bg-[var(--chat-error-bg)] px-3 py-2 text-sm text-[var(--chat-error-text)]">{selectedRun.error}</div> : null}
            <dl className="mt-4 grid gap-y-3 border-t border-[color:var(--chat-border)] pt-3 text-sm md:grid-cols-[minmax(280px,1.4fr)_minmax(200px,1fr)_minmax(180px,0.9fr)_minmax(150px,0.7fr)]">
              <div className="min-w-0 pr-4 md:border-r md:border-[color:var(--chat-border)]">
                <dt className="text-xs text-[var(--chat-muted)]">UUID</dt>
                <dd className="mt-1 break-all font-mono text-xs font-medium text-[var(--chat-text)]">{selectedRun.id}</dd>
              </div>
              <div className="min-w-0 px-0 md:border-r md:border-[color:var(--chat-border)] md:px-4">
                <dt className="text-xs text-[var(--chat-muted)]">Model</dt>
                <dd className="mt-1 truncate font-medium text-[var(--chat-text)]" title={`${selectedRun.provider ?? 'provider unknown'} / ${selectedRun.model ?? 'model unknown'}`}>
                  {selectedRun.provider ?? 'provider unknown'} / {selectedRun.model ?? 'model unknown'}
                </dd>
              </div>
              <div className="min-w-0 px-0 md:border-r md:border-[color:var(--chat-border)] md:px-4">
                <dt className="text-xs text-[var(--chat-muted)]">Time</dt>
                <dd className="mt-1 space-y-0.5 font-medium text-[var(--chat-text)]">
                  <div className="truncate">Started {formatDateTime(selectedRun.startedAt ?? selectedRun.createdAt)}</div>
                  <div className="truncate">Finished {formatDateTime(selectedRun.finishedAt)}</div>
                </dd>
              </div>
              <div className="min-w-0 md:pl-4">
                <dt className="text-xs text-[var(--chat-muted)]">Usage</dt>
                <dd className="mt-1 space-y-0.5 font-medium text-[var(--chat-text)]">
                  <div>{formatDurationMs(getRunDurationMs(selectedRun))}</div>
                  <div>{formatTokenCount(selectedRun.usage)} tokens</div>
                </dd>
              </div>
            </dl>
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
            {activeTab === 'timeline' ? (
              <TimelineTab timeline={timeline} loading={timelineLoading} error={timelineError} />
            ) : (
              <TraceTab trace={trace} loading={traceLoading} error={traceError} />
            )}
          </div>
          <DatasetCaptureDialog
            open={captureOpen}
            selectedRun={selectedRun}
            selectedThread={selectedThread}
            onOpenChange={setCaptureOpen}
          />
        </>
      )}
    </section>
  );
}
