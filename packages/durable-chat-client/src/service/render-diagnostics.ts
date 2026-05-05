export const CHAT_RENDER_DIAGNOSTIC_EVENT = 'agent-infra:chat-render-diagnostic';
const CHAT_RENDER_DIAGNOSTIC_STORAGE_KEY = 'agent-infra:chat-render-debug';
const CHAT_RENDER_DIAGNOSTIC_QUERY_KEY = 'chatRenderDebug';

export type ChatRenderDiagnosticEntry = {
  component: string;
  changedKeys?: string[];
  key: string;
  phase: 'mount' | 'update' | 'unmount';
  summary: Record<string, unknown>;
  timestamp: string;
};

type DiagnosticWindow = Window & {
  __agentInfraChatRenderDiagnostics?: ChatRenderDiagnosticEntry[];
  __agentInfraChatRenderDiagnosticsInstalled?: boolean;
  __agentInfraClearChatRenderDiagnostics?: () => void;
  __agentInfraDisableChatRenderDiagnostics?: () => void;
  __agentInfraEnableChatRenderDiagnostics?: () => void;
  __agentInfraPrintChatRenderDiagnostics?: () => void;
};

function getDiagnosticWindow() {
  if (typeof window === 'undefined') {
    return null;
  }

  return window as DiagnosticWindow;
}

export function isChatRenderDiagnosticsEnabled() {
  const target = getDiagnosticWindow();
  if (!target) {
    return false;
  }

  const params = new URLSearchParams(target.location.search);
  if (params.get(CHAT_RENDER_DIAGNOSTIC_QUERY_KEY) === '1') {
    return true;
  }

  return target.localStorage.getItem(CHAT_RENDER_DIAGNOSTIC_STORAGE_KEY) === '1';
}

function toConsoleRow(entry: ChatRenderDiagnosticEntry) {
  return {
    changed: entry.changedKeys?.join(', ') ?? '',
    component: entry.component,
    key: entry.key,
    phase: entry.phase,
    ...entry.summary
  };
}

export function installChatRenderDiagnostics() {
  const target = getDiagnosticWindow();
  if (!target || target.__agentInfraChatRenderDiagnosticsInstalled) {
    return;
  }

  target.__agentInfraChatRenderDiagnosticsInstalled = true;
  target.__agentInfraPrintChatRenderDiagnostics = () => {
    const records = target.__agentInfraChatRenderDiagnostics ?? [];
    console.table(records.map(toConsoleRow));
  };
  target.__agentInfraClearChatRenderDiagnostics = () => {
    target.__agentInfraChatRenderDiagnostics = [];
    console.info('[agent-infra][render] cleared render diagnostics');
  };
  target.__agentInfraEnableChatRenderDiagnostics = () => {
    target.localStorage.setItem(CHAT_RENDER_DIAGNOSTIC_STORAGE_KEY, '1');
    console.info('[agent-infra][render] enabled; refresh to capture render traces');
  };
  target.__agentInfraDisableChatRenderDiagnostics = () => {
    target.localStorage.removeItem(CHAT_RENDER_DIAGNOSTIC_STORAGE_KEY);
    console.info('[agent-infra][render] disabled; refresh to stop render traces');
  };

  target.addEventListener(CHAT_RENDER_DIAGNOSTIC_EVENT, (event) => {
    const detail = (event as CustomEvent<ChatRenderDiagnosticEntry>).detail;
    console.debug('[agent-infra][render]', toConsoleRow(detail));
  });

  console.info(
    '[agent-infra][render] diagnostics ready; enable with ?chatRenderDebug=1 or window.__agentInfraEnableChatRenderDiagnostics?.(), then use window.__agentInfraPrintChatRenderDiagnostics?.()'
  );
}

export function emitChatRenderDiagnostic(entry: Omit<ChatRenderDiagnosticEntry, 'timestamp'>) {
  if (!isChatRenderDiagnosticsEnabled()) {
    return;
  }

  const target = getDiagnosticWindow();
  if (!target) {
    return;
  }

  const record: ChatRenderDiagnosticEntry = {
    ...entry,
    timestamp: new Date().toISOString()
  };
  const records = (target.__agentInfraChatRenderDiagnostics ??= []);
  records.push(record);
  target.dispatchEvent(new CustomEvent(CHAT_RENDER_DIAGNOSTIC_EVENT, { detail: record }));
}
