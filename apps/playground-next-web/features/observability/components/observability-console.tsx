'use client';

import { BarChart3, LogOut, RefreshCw } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { AuthShellGate } from '@/components/chat-shell/auth-shell-gate';
import type { AuthUserDto } from '@/features/auth/dto/project-auth-user-dto';
import { useObservabilityConsole } from '@/features/observability/runtime/use-observability-console';

import { RunColumn } from './run-column';
import { RunContentPanel } from './run-content-panel';
import { ThreadColumn } from './thread-column';

export function ObservabilityConsole() {
  return (
    <AuthShellGate>
      {({ currentUser, onLogout }) => <AuthenticatedObservabilityConsole currentUser={currentUser} onLogout={onLogout} />}
    </AuthShellGate>
  );
}

function AuthenticatedObservabilityConsole({ currentUser, onLogout }: { currentUser: AuthUserDto; onLogout: () => void }) {
  const state = useObservabilityConsole();

  return (
    <main className="flex h-dvh min-h-0 flex-col overflow-hidden bg-[var(--chat-bg)] text-[var(--chat-text)]">
      <header className="flex h-[72px] shrink-0 items-center justify-between border-b border-[color:var(--chat-border)] bg-[var(--chat-surface)] px-5">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-[color:var(--chat-border-strong)] bg-[var(--chat-surface-muted)] text-[var(--chat-accent)]">
            <BarChart3 className="size-5" />
          </div>
          <div className="min-w-0">
            <h1 className="truncate text-lg font-semibold text-[var(--chat-text)]">Observability</h1>
            <p className="truncate text-sm text-[var(--chat-muted)]">Inspect durable agent runs by thread, timeline, and trace</p>
          </div>
        </div>
        <div className="flex min-w-0 items-center gap-2">
          <div className="hidden min-w-0 max-w-[260px] truncate rounded-lg border border-[color:var(--chat-border)] bg-[var(--chat-surface-muted)] px-3 py-1.5 text-xs text-[var(--chat-muted)] md:block">
            {currentUser.email}
          </div>
          <Button variant="outline" size="sm" onClick={state.refresh}>
            <RefreshCw className="size-4" />
            Refresh
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Log out"
            onClick={() => {
              void onLogout();
            }}
          >
            <LogOut className="size-4" />
          </Button>
        </div>
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-1 overflow-hidden lg:grid-cols-[280px_320px_minmax(0,1fr)]">
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
    </main>
  );
}
