'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

import { loadPiRuntime, type PiRuntimeState } from '@/lib/pi/runtime';

type Status =
  | { phase: 'loading' }
  | { phase: 'ready'; runtime: PiRuntimeState }
  | { phase: 'error'; message: string };

export default function PiExperimentPage() {
  const [status, setStatus] = useState<Status>({ phase: 'loading' });

  useEffect(() => {
    let active = true;

    void loadPiRuntime()
      .then((runtime) => {
        if (!active) return;
        setStatus({ phase: 'ready', runtime });
      })
      .catch((error: unknown) => {
        if (!active) return;
        setStatus({ phase: 'error', message: error instanceof Error ? error.message : String(error) });
      });

    return () => {
      active = false;
    };
  }, []);

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-4 p-4 lg:p-6">
      <header className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-2">
          <Link href="/" className="text-sm font-medium text-sky-700 hover:text-sky-600 hover:underline">
            ← Back to agent-infra demo
          </Link>
        </div>
        <h1 className="text-xl font-semibold">pi-web-ui experiment</h1>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          This page is an experimental entry for evaluating pi-agent-core + pi-web-ui interaction quality.
          It intentionally uses local browser storage (IndexedDB) and does not write sessions into agent-infra thread/run/message persistence.
        </p>
      </header>

      <section className="min-h-[65vh] rounded-xl border border-slate-200 bg-white p-2 shadow-sm">
        {status.phase === 'loading' ? (
          <div className="flex h-full min-h-[300px] items-center justify-center text-sm text-slate-500">Loading pi-web-ui experiment...</div>
        ) : null}

        {status.phase === 'error' ? (
          <div className="m-4 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            <p className="font-medium">Failed to initialize pi-web-ui experiment.</p>
            <p className="mt-1 break-all">{status.message}</p>
            <p className="mt-2 text-xs">
              Make sure optional dependencies <code>@mariozechner/pi-agent-core</code>, <code>@mariozechner/pi-ai</code>, and <code>@mariozechner/pi-web-ui</code> are installed.
            </p>
          </div>
        ) : null}

        {status.phase === 'ready' ? <status.runtime.ChatPanel agent={status.runtime.agent} className="h-[70vh]" /> : null}
      </section>
    </main>
  );
}
