import type { RunEventDto, RunTimelineItemDto, RunTimelineResponseDto } from '@agent-infra/contracts';
import { AlertTriangle, BotMessageSquare, CircleDot, Terminal, Wrench } from 'lucide-react';

import { cn } from '@/lib/utils';

import { formatDateTime } from '../service/format';

type TimelineTabProps = {
  timeline: RunTimelineResponseDto | null;
  loading: boolean;
  error: string | null;
};

function itemIcon(kind: RunTimelineItemDto['kind']) {
  if (kind === 'assistant_message') {
    return <BotMessageSquare className="size-4" />;
  }
  if (kind === 'tool_invocation') {
    return <Wrench className="size-4" />;
  }
  if (kind === 'runtime_error' || kind === 'unknown_event') {
    return <AlertTriangle className="size-4" />;
  }
  return <CircleDot className="size-4" />;
}

function phaseClass(phase: string) {
  if (phase === 'completed') {
    return 'bg-[var(--chat-status-success-bg)] text-[var(--chat-status-success-text)]';
  }
  if (phase === 'failed' || phase === 'cancelled') {
    return 'bg-[var(--chat-status-danger-bg)] text-[var(--chat-status-danger-text)]';
  }
  return 'bg-[var(--chat-status-running-bg)] text-[var(--chat-status-running-text)]';
}

function findEvent(events: RunEventDto[], runEventId: string) {
  return events.find((event) => event.id === runEventId) ?? null;
}

function timelineDetail(item: RunTimelineItemDto) {
  if (item.kind === 'tool_invocation') {
    return item.toolInvocationId ? `${item.toolName} · ${item.toolCallId}` : `${item.toolName} · unmatched invocation`;
  }
  if (item.kind === 'runtime_error') {
    return item.message;
  }
  if (item.kind === 'unknown_event') {
    return item.type;
  }
  if (item.kind === 'assistant_message') {
    return `Assistant message ${item.phase}`;
  }
  return `Run ${item.phase}`;
}

export function TimelineTab({ timeline, loading, error }: TimelineTabProps) {
  if (error) {
    return <div className="rounded-lg bg-[var(--chat-error-bg)] px-3 py-2 text-sm text-[var(--chat-error-text)]">{error}</div>;
  }

  if (loading) {
    return <div className="rounded-lg border border-[color:var(--chat-border)] px-4 py-8 text-center text-sm text-[var(--chat-muted)]">Loading timeline</div>;
  }

  const items = timeline?.projection?.items ?? [];
  if (!timeline || items.length === 0) {
    return <div className="rounded-lg border border-[color:var(--chat-border)] px-4 py-8 text-center text-sm text-[var(--chat-muted)]">No timeline</div>;
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="overflow-hidden rounded-lg border border-[color:var(--chat-border)]">
        <div className="grid grid-cols-[64px_minmax(160px,1fr)_120px_minmax(180px,2fr)_140px] border-b border-[color:var(--chat-border)] bg-[var(--chat-surface-muted)] px-3 py-2 text-xs font-medium text-[var(--chat-muted)]">
          <div>Seq</div>
          <div>Kind</div>
          <div>Phase</div>
          <div>Details</div>
          <div>Time</div>
        </div>
        {items.map((item) => {
          const event = findEvent(timeline.runEvents, item.runEventId);
          return (
            <div
              key={`${item.runEventId}:${item.kind}:${item.seq}`}
              className="grid grid-cols-[64px_minmax(160px,1fr)_120px_minmax(180px,2fr)_140px] border-b border-[color:var(--chat-border)] px-3 py-3 text-sm last:border-b-0"
            >
              <div className="font-mono text-xs text-[var(--chat-muted)]">{item.seq}</div>
              <div className="flex min-w-0 items-center gap-2 text-[var(--chat-text)]">
                <span className="text-[var(--chat-icon-muted)]">{itemIcon(item.kind)}</span>
                <span className="truncate">{item.kind}</span>
              </div>
              <div>
                {'phase' in item ? <span className={cn('rounded-md px-2 py-0.5 text-xs font-medium', phaseClass(item.phase))}>{item.phase}</span> : null}
              </div>
              <div className="min-w-0 truncate text-[var(--chat-muted)]">{timelineDetail(item)}</div>
              <div className="truncate text-xs text-[var(--chat-muted)]">{formatDateTime(event?.createdAt)}</div>
            </div>
          );
        })}
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        <div className="rounded-lg border border-[color:var(--chat-border)] bg-[var(--chat-surface-muted)] p-3">
          <div className="flex items-center gap-2 text-xs text-[var(--chat-muted)]">
            <Terminal className="size-3" />
            Events
          </div>
          <div className="mt-1 text-lg font-semibold text-[var(--chat-text)]">{timeline.runEvents.length}</div>
        </div>
        <div className="rounded-lg border border-[color:var(--chat-border)] bg-[var(--chat-surface-muted)] p-3">
          <div className="text-xs text-[var(--chat-muted)]">Tool calls</div>
          <div className="mt-1 text-lg font-semibold text-[var(--chat-text)]">{timeline.toolInvocations.length}</div>
        </div>
        <div className="rounded-lg border border-[color:var(--chat-border)] bg-[var(--chat-surface-muted)] p-3">
          <div className="text-xs text-[var(--chat-muted)]">Timeline items</div>
          <div className="mt-1 text-lg font-semibold text-[var(--chat-text)]">{items.length}</div>
        </div>
      </div>
    </div>
  );
}
