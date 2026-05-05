type ApiDiagnosticKind =
  | 'http-json'
  | 'reconcile-sync'
  | 'stream-open'
  | 'stream-first-event'
  | 'stream-first-assistant'
  | 'stream-terminal';

export type ApiDiagnosticEntry = {
  durationMs: number;
  headersDurationMs?: number;
  kind: ApiDiagnosticKind;
  method: string;
  note?: string;
  ok?: boolean;
  requestId?: string | null;
  serverTiming?: string | null;
  serverTimingEntries?: Array<{ durationMs: number | null; name: string }>;
  status?: number;
  url: string;
};

export const API_DIAGNOSTIC_EVENT = 'agent-infra:api-diagnostic';

function getDiagnosticWindow() {
  return typeof window === 'undefined' ? null : window;
}

function parseDuration(value: string | undefined) {
  if (!value) {
    return null;
  }

  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function parseServerTimingHeader(header: string | null) {
  if (!header) {
    return [];
  }

  return header
    .split(',')
    .map((metric) => metric.trim())
    .filter(Boolean)
    .map((metric) => {
      const [name, ...params] = metric.split(';').map((part) => part.trim());
      const durationParam = params.find((part) => part.startsWith('dur='));
      return {
        name,
        durationMs: parseDuration(durationParam?.slice('dur='.length))
      };
    });
}

export function readResponseDiagnostics(response: Response) {
  const serverTiming = response.headers.get('server-timing');

  return {
    requestId: response.headers.get('x-request-id'),
    serverTiming,
    serverTimingEntries: parseServerTimingHeader(serverTiming)
  };
}

export function emitApiDiagnostic(entry: ApiDiagnosticEntry) {
  const target = getDiagnosticWindow();
  if (!target) {
    return;
  }

  const records = ((target as typeof target & { __agentInfraApiDiagnostics?: ApiDiagnosticEntry[] }).__agentInfraApiDiagnostics ??= []);
  records.push(entry);
  if (records.length > 200) {
    records.splice(0, records.length - 200);
  }

  if (typeof CustomEvent === 'function') {
    target.dispatchEvent(new CustomEvent<ApiDiagnosticEntry>(API_DIAGNOSTIC_EVENT, { detail: entry }));
  }
}
