'use client';

import { BarChart3 } from 'lucide-react';

import type { AuthUserDto } from '@/features/auth/dto/project-auth-user-dto';
import { useObservabilityConsole } from '@/features/observability/runtime/use-observability-console';

import { ObservabilityConsoleShell } from './observability-console-shell';
import { RunColumn } from './run-column';
import { RunContentPanel } from './run-content-panel';
import { ThreadColumn } from './thread-column';

export function ObservabilityConsole({ currentUser }: { currentUser: AuthUserDto }) {
  const state = useObservabilityConsole();

  return (
    <ObservabilityConsoleShell
      activeSection="runs"
      currentUser={currentUser}
      title="Runs"
      subtitle="Inspect durable agent runs by thread, timeline, and trace"
      icon={<BarChart3 className="size-5" />}
      onRefresh={state.refresh}
    >
      <div className="grid h-full min-h-0 grid-cols-1 overflow-hidden lg:grid-cols-[280px_320px_minmax(0,1fr)]">
        <ThreadColumn
          threads={state.threads}
          loading={state.threadsLoading}
          error={state.threadsError}
          selectedThreadId={state.selectedThreadId}
          selection={state.threadSelection}
          onSelectThread={state.selectThread}
        />
        <RunColumn
          runs={state.runs}
          loading={state.runsLoading}
          error={state.runsError}
          selectedRunId={state.selectedRunId}
          selectedThread={state.selectedThread}
          selection={state.runSelection}
          onSelectRun={state.selectRun}
        />
        <RunContentPanel
          selectedRun={state.selectedRun}
          selectedThread={state.selectedThread}
          timeline={state.timeline}
          timelineLoading={state.timelineLoading}
          timelineError={state.timelineError}
          trace={state.trace}
          traceLoading={state.traceLoading}
          traceError={state.traceError}
        />
      </div>
    </ObservabilityConsoleShell>
  );
}
