'use client';

import type {
  RunDto,
  RunEventDto,
  RunTimelineResponseDto,
  RuntimePiMetaDto,
  ToolInvocationDto
} from '@agent-infra/contracts';
import clsx from 'clsx';
import { Workflow } from 'lucide-react';

import { formatDateTime, formatDuration, statusBadgeTone } from './helpers';
import { ui } from './ui';

function ToolRow({ invocation }: { invocation: ToolInvocationDto }) {
  return (
    <article className={clsx('rounded-2xl p-4', ui.subtlePanel)}>
      <header className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-slate-900">{invocation.toolName}</p>
          <p className="truncate text-xs text-slate-500">{invocation.toolCallId}</p>
        </div>
        <span className={clsx('rounded-full px-2 py-1 text-[11px] font-medium uppercase tracking-wide', statusBadgeTone(invocation.status))}>
          {invocation.status}
        </span>
      </header>

      <div className="mt-3 space-y-3">
        <div>
          <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-slate-500">Input</p>
          <pre className={clsx('overflow-auto rounded-2xl p-3 text-xs', ui.codeBlock)}>
            {JSON.stringify(invocation.input ?? null, null, 2)}
          </pre>
        </div>

        <div>
          <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-slate-500">Output</p>
          <pre className={clsx('overflow-auto rounded-2xl p-3 text-xs', ui.codeBlock)}>
            {JSON.stringify(invocation.output ?? null, null, 2)}
          </pre>
        </div>

        {invocation.error ? (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">{invocation.error}</div>
        ) : null}
      </div>
    </article>
  );
}

function EventRow({ event }: { event: RunEventDto }) {
  return (
    <article className={clsx('rounded-2xl p-4', ui.subtlePanel)}>
      <header className="flex items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-slate-100 px-2 py-1 font-medium text-slate-700">#{event.seq}</span>
          <span className="font-medium uppercase tracking-wide text-slate-600">{event.type}</span>
        </div>
        <span className="text-slate-500">{formatDateTime(event.createdAt)}</span>
      </header>

      {event.payload ? (
        <details className="mt-3">
          <summary className="cursor-pointer text-xs font-medium text-sky-700">Raw payload</summary>
          <pre className={clsx('mt-2 overflow-auto rounded-2xl p-3 text-xs', ui.codeBlock)}>
            {JSON.stringify(event.payload, null, 2)}
          </pre>
        </details>
      ) : null}
    </article>
  );
}

type DurableLogPaneProps = {
  logOpen: boolean;
  meta: RuntimePiMetaDto | null;
  recentRuns: RunDto[];
  recentRunsLoading: boolean;
  recentRunsError: string | null;
  activeThreadId: string | null;
  selectedRunId: string | null;
  selectedRun: RunTimelineResponseDto['run'] | null;
  runEvents: RunEventDto[];
  toolInvocations: ToolInvocationDto[];
  liveStreamRunId: string | null;
  persistingTurn: boolean;
  timelineLoading: boolean;
  timelineError: string | null;
  onSelectRun: (runId: string) => void;
};

export function DurableLogPane({
  logOpen,
  meta,
  recentRuns,
  recentRunsLoading,
  recentRunsError,
  activeThreadId,
  selectedRunId,
  selectedRun,
  runEvents,
  toolInvocations,
  liveStreamRunId,
  persistingTurn,
  timelineLoading,
  timelineError,
  onSelectRun
}: DurableLogPaneProps) {
  if (!logOpen) {
    return null;
  }

  return (
    <aside className={clsx('hidden min-h-0 w-[360px] shrink-0 border-l border-slate-200 xl:flex xl:flex-col', ui.logPane)}>
      <header className="border-b border-slate-200 px-5 py-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-slate-900">Durable log</p>
            <p className="mt-1 text-xs text-slate-500">Runs, tools, and timeline events stay visible here.</p>
          </div>
          <Workflow className="h-4 w-4 text-slate-400" />
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <span className={clsx('rounded-full px-3 py-1 text-xs', ui.badge)}>DB: {meta?.dbMode ?? 'loading'}</span>
          <span className={clsx('rounded-full px-3 py-1 text-xs', ui.badge)}>Provider: {meta?.runtimeProvider ?? 'loading'}</span>
          <span className={clsx('rounded-full px-3 py-1 text-xs', ui.badge)}>Model: {meta?.runtimeModel ?? 'loading'}</span>
          {persistingTurn ? <span className={clsx('rounded-full px-3 py-1 text-xs', ui.badge)}>Syncing durable state…</span> : null}
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        <div className="space-y-4">
          <section className={clsx('rounded-2xl p-4', ui.secondarySurface)}>
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Recent runs</p>
                <p className="mt-1 text-sm text-slate-600">Switch the log between durable runs for this thread.</p>
              </div>
              <span className="rounded-full bg-slate-100 px-2 py-1 text-[11px] font-medium text-slate-600">{recentRuns.length}</span>
            </div>

            {recentRunsLoading ? <p className="mt-3 text-sm text-slate-500">Loading recent runs...</p> : null}
            {recentRunsError ? <div className="mt-3 rounded-2xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">{recentRunsError}</div> : null}

            {!recentRunsLoading && !recentRunsError && activeThreadId && recentRuns.length === 0 ? (
              <div className="mt-3 rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-3 py-3 text-sm text-slate-500">
                No runs yet for this thread.
              </div>
            ) : null}

            {!recentRunsLoading && recentRuns.length > 0 ? (
              <div className="mt-3 max-h-60 space-y-2 overflow-y-auto pr-1">
                {recentRuns.map((run) => {
                  const selected = run.id === selectedRunId;
                  const live = run.id === liveStreamRunId;

                  return (
                    <button
                      key={run.id}
                      type="button"
                      onClick={() => onSelectRun(run.id)}
                      className={clsx(
                        'w-full rounded-2xl border px-3 py-3 text-left text-sm transition',
                        selected ? 'border-sky-300 bg-sky-50 shadow-sm' : 'border-slate-200 bg-white hover:bg-slate-50'
                      )}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate font-medium text-slate-900">{run.model ?? 'unknown model'}</p>
                          <p className="truncate text-xs text-slate-500">
                            {run.provider ?? 'unknown provider'} · {formatDateTime(run.createdAt)}
                          </p>
                        </div>
                        <div className="flex flex-col items-end gap-1">
                          <span className={clsx('rounded-full px-2 py-1 text-[10px] font-medium uppercase tracking-wide', statusBadgeTone(run.status))}>
                            {run.status}
                          </span>
                          {live ? <span className="text-[10px] font-medium uppercase tracking-wide text-sky-600">live</span> : null}
                        </div>
                      </div>
                      <p className="mt-2 truncate text-xs text-slate-500">{run.id}</p>
                      {run.error ? <p className="mt-2 break-words text-xs text-rose-700">{run.error}</p> : null}
                    </button>
                  );
                })}
              </div>
            ) : null}
          </section>

          <section className={clsx('rounded-2xl p-4', ui.secondarySurface)}>
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Current run</p>
                <p className="mt-1 break-all text-sm font-semibold text-slate-900">{selectedRunId ?? 'No run selected'}</p>
              </div>
              <span className={clsx('rounded-full px-3 py-1 text-xs font-medium uppercase tracking-wide', statusBadgeTone(selectedRun?.status ?? 'idle'))}>
                {selectedRun?.status ?? 'idle'}
              </span>
            </div>

            <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
              <div>
                <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Provider</dt>
                <dd className="mt-1 text-slate-900">{selectedRun?.provider ?? 'n/a'}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Model</dt>
                <dd className="mt-1 text-slate-900">{selectedRun?.model ?? 'n/a'}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Started</dt>
                <dd className="mt-1 text-slate-900">{selectedRun?.startedAt ? formatDateTime(selectedRun.startedAt) : 'n/a'}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Finished</dt>
                <dd className="mt-1 text-slate-900">{selectedRun?.finishedAt ? formatDateTime(selectedRun.finishedAt) : 'n/a'}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Duration</dt>
                <dd className="mt-1 text-slate-900">{selectedRun ? formatDuration(selectedRun.startedAt, selectedRun.finishedAt) : 'n/a'}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Counts</dt>
                <dd className="mt-1 text-slate-900">{runEvents.length} events · {toolInvocations.length} tools</dd>
              </div>
            </dl>

            {selectedRun?.error ? (
              <div className="mt-3 rounded-2xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">{selectedRun.error}</div>
            ) : null}
          </section>

          {timelineLoading ? <p className="text-sm text-slate-500">Loading run timeline...</p> : null}
          {timelineError ? <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{timelineError}</div> : null}

          {!timelineLoading && !timelineError && !selectedRunId ? (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-4 py-4 text-sm text-slate-600">
              Select a thread or start a run to inspect durable logs.
            </div>
          ) : null}

          {(toolInvocations.length > 0 || selectedRunId) && (
            <section className="space-y-3">
              <header className="flex items-center justify-between">
                <h3 className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Tools</h3>
                <span className="text-xs text-slate-400">{toolInvocations.length}</span>
              </header>
              <div className="space-y-3">
                {toolInvocations.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-3 text-sm text-slate-500">
                    No tool activity for this run.
                  </div>
                ) : (
                  toolInvocations.map((invocation) => <ToolRow key={invocation.id} invocation={invocation} />)
                )}
              </div>
            </section>
          )}

          {(runEvents.length > 0 || selectedRunId) && (
            <section className="space-y-3">
              <header className="flex items-center justify-between">
                <h3 className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Events</h3>
                <span className="text-xs text-slate-400">{runEvents.length}</span>
              </header>
              <div className="space-y-3">
                {runEvents.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-3 text-sm text-slate-500">
                    No run events for this run.
                  </div>
                ) : (
                  runEvents.map((event) => <EventRow key={event.id} event={event} />)
                )}
              </div>
            </section>
          )}
        </div>
      </div>
    </aside>
  );
}
