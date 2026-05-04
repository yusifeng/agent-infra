import { API_DIAGNOSTIC_EVENT, type ApiDiagnosticEntry } from '@agent-infra/durable-chat-client';

type DiagnosticWindow = Window & {
  __agentInfraApiDiagnosticsInstalled?: boolean;
  __agentInfraPrintApiDiagnostics?: () => void;
};

function roundDuration(durationMs?: number | null) {
  return durationMs == null ? '-' : `${durationMs.toFixed(1)}ms`;
}

function summarizeServerTiming(entry: ApiDiagnosticEntry) {
  if (!entry.serverTimingEntries?.length) {
    return 'server-timing: none';
  }

  return entry.serverTimingEntries
    .map((metric: NonNullable<ApiDiagnosticEntry['serverTimingEntries']>[number]) => `${metric.name}=${roundDuration(metric.durationMs)}`)
    .join(', ');
}

function toConsoleRow(entry: ApiDiagnosticEntry) {
  return {
    duration: roundDuration(entry.durationMs),
    headers: roundDuration(entry.headersDurationMs ?? null),
    kind: entry.kind,
    method: entry.method,
    note: entry.note ?? '',
    requestId: entry.requestId ?? '',
    status: entry.status ?? '',
    timing: summarizeServerTiming(entry),
    url: entry.url
  };
}

export function installApiDiagnostics() {
  if (!import.meta.env.DEV || typeof window === 'undefined') {
    return;
  }

  const target = window as DiagnosticWindow;
  if (target.__agentInfraApiDiagnosticsInstalled) {
    return;
  }

  target.__agentInfraApiDiagnosticsInstalled = true;

  target.addEventListener(API_DIAGNOSTIC_EVENT, (event) => {
    const detail = (event as CustomEvent<ApiDiagnosticEntry>).detail;
    console.debug('[agent-infra][api]', toConsoleRow(detail));
  });

  target.__agentInfraPrintApiDiagnostics = () => {
    const records = (window as Window & { __agentInfraApiDiagnostics?: ApiDiagnosticEntry[] }).__agentInfraApiDiagnostics ?? [];
    console.table(records.map(toConsoleRow));
  };

  console.info('[agent-infra][api] diagnostics enabled; use window.__agentInfraPrintApiDiagnostics?.() to inspect request timings');
}
