'use client';

import clsx from 'clsx';
import {
  ArrowUp,
  Box,
  Check,
  ChevronDown,
  FileText,
  LogOut,
  MessageSquarePlus,
  Pencil,
  Square,
  Terminal,
  Wrench,
  X
} from 'lucide-react';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import type { CloudAgentUser } from '@/lib/auth';
import type { AgentProviderId, AgentProviderOption } from '@/lib/provider-config';
import type { CloudMessage, CloudThread } from '@/lib/thread-store';

interface ChatShellProps {
  currentUser: CloudAgentUser;
  defaultProvider: AgentProviderId;
  initialThreads: CloudThread[];
  providerOptions: AgentProviderOption[];
}

type MessageStreamEvent =
  | {
      type: 'user_message';
      runId: string;
      thread: CloudThread;
      message: CloudMessage;
    }
  | {
      type: 'assistant_delta';
      content: string;
    }
  | {
      type: 'tool_call';
      status: 'started' | 'completed' | 'failed';
      toolCallId: string | null;
      toolName: string | null;
      inputSummary: string | null;
      resultSummary: string | null;
      error?: string | null;
      filePath: string | null;
      command: string | null;
    }
  | {
      type: 'file_change';
      path: string;
      changeType: string;
      toolCallId: string | null;
    }
  | {
      type: 'approval_request';
      runId: string;
      permissionRequestId: string;
      action: string;
      details: Record<string, unknown> | null;
    }
  | {
      type: 'approval_resolved';
      runId: string;
      permissionRequestId: string;
      decision: 'approved' | 'denied';
      status?: 'approved' | 'denied' | 'expired' | 'cancelled' | null;
      reason?: string | null;
      resolvedByActorId: string | null;
    }
  | {
      type: 'run_cancelled';
      runId: string;
      reason: string | null;
    }
  | {
      type: 'completed';
      thread: CloudThread;
      message: CloudMessage | null;
      messages: CloudMessage[];
      failed?: boolean;
      error?: string | null;
    };

interface ActiveRunSummary {
  id: string;
  status: 'queued' | 'running';
}

type RunEventStreamEvent =
  | {
      type: 'run_event_replay_start' | 'run_event_replay_end';
    }
  | {
      type: 'cloud_run_event';
      event: {
        runId: string;
        seq: number;
        payload: Record<string, unknown> & { type: string };
      };
    }
  | {
      type: 'error';
      error: string;
    };

interface LiveAssistantDraft {
  threadId: string;
  content: string;
}

interface LiveToolCall {
  command?: string | null;
  filePath?: string | null;
  id: string;
  inputSummary?: string | null;
  resultSummary?: string | null;
  status: 'started' | 'completed' | 'failed';
  toolName: string;
}

interface LiveApprovalRequest {
  action: string;
  details?: Record<string, unknown> | null;
  permissionRequestId: string;
  reason?: string | null;
  resolving?: boolean;
  runId: string;
  status: 'pending' | 'approved' | 'denied' | 'expired' | 'cancelled';
}

export function ChatShell({ currentUser, defaultProvider, initialThreads, providerOptions }: ChatShellProps) {
  const params = useParams<{ threadId?: string | string[] }>();
  const router = useRouter();
  const routeThreadId = Array.isArray(params.threadId) ? params.threadId[0] : params.threadId ?? null;
  const messagesViewportRef = useRef<HTMLDivElement | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const activeRunIdRef = useRef<string | null>(null);
  const attachingRunIdsRef = useRef<Set<string>>(new Set());
  const messagesByThreadRef = useRef<Record<string, CloudMessage[]>>({});
  const activeThreadIdRef = useRef<string | null>(routeThreadId);
  const loadingThreadIdRef = useRef<string | null>(null);
  const messagesRequestIdRef = useRef(0);
  const sendingRef = useRef(false);
  const [threads, setThreads] = useState(initialThreads);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(routeThreadId);
  const [messagesByThread, setMessagesByThread] = useState<Record<string, CloudMessage[]>>({});
  const [draft, setDraft] = useState('');
  const [provider, setProvider] = useState<AgentProviderId>(defaultProvider);
  const [loadingThreadId, setLoadingThreadId] = useState<string | null>(routeThreadId);
  const [sending, setSending] = useState(false);
  const [streamStatus, setStreamStatus] = useState<string | null>(null);
  const [liveAssistantDraft, setLiveAssistantDraft] = useState<LiveAssistantDraft | null>(null);
  const [toolCallsByThread, setToolCallsByThread] = useState<Record<string, LiveToolCall[]>>({});
  const [approvalRequestsByThread, setApprovalRequestsByThread] = useState<Record<string, LiveApprovalRequest[]>>({});

  useEffect(() => {
    activeThreadIdRef.current = activeThreadId;
  }, [activeThreadId]);

  useEffect(() => {
    loadingThreadIdRef.current = loadingThreadId;
  }, [loadingThreadId]);

  useEffect(() => {
    messagesByThreadRef.current = messagesByThread;
  }, [messagesByThread]);

  useEffect(() => {
    sendingRef.current = sending;
  }, [sending]);

  useEffect(() => {
    setThreads(initialThreads);
  }, [initialThreads]);

  useEffect(() => {
    if (!routeThreadId) {
      setActiveThreadId(null);
      setLoadingThreadId(null);
      return;
    }

    setActiveThreadId(routeThreadId);
    const thread = threads.find((candidate) => candidate.id === routeThreadId);
    if (thread) {
      setProvider(thread.provider);
    }
    if (!messagesByThreadRef.current[routeThreadId]) {
      void loadMessagesForThread(routeThreadId);
    } else {
      void attachLatestActiveRunForThread(routeThreadId);
    }
  }, [routeThreadId]);

  useEffect(
    () => () => {
      abortControllerRef.current?.abort();
    },
    []
  );

  const activeThread = useMemo(
    () => threads.find((thread) => thread.id === activeThreadId) ?? null,
    [activeThreadId, threads]
  );
  const activeMessages = activeThreadId ? messagesByThread[activeThreadId] ?? [] : [];
  const displayedMessages =
    activeThreadId && liveAssistantDraft?.threadId === activeThreadId
      ? [
          ...activeMessages,
          {
            id: `live-${activeThreadId}`,
            threadId: activeThreadId,
            role: 'assistant' as const,
            content: liveAssistantDraft.content,
            createdAt: new Date().toISOString()
          }
        ]
      : activeMessages;
  const lastAssistantMessageId = [...displayedMessages].reverse().find((message) => message.role === 'assistant')?.id ?? null;
  const activeThreadStreaming = Boolean(activeThreadId && liveAssistantDraft?.threadId === activeThreadId && sending);
  const centeredEmptyState = !activeThreadId && displayedMessages.length === 0;
  const showTypingRow = activeThreadStreaming && liveAssistantDraft?.content.length === 0;
  const composerStatus =
    sending && liveAssistantDraft && activeThreadId !== liveAssistantDraft.threadId
      ? 'Agent running in another thread'
      : streamStatus;

  useEffect(() => {
    const viewport = messagesViewportRef.current;
    if (!viewport || centeredEmptyState) {
      return;
    }

    viewport.scrollTo({ top: viewport.scrollHeight, behavior: activeThreadStreaming ? 'smooth' : 'instant' });
  }, [activeThreadStreaming, centeredEmptyState, displayedMessages, streamStatus]);

  async function refreshThreads() {
    const response = await fetch('/api/threads');
    if (!response.ok) {
      return;
    }

    const body = (await response.json()) as { threads: CloudThread[] };
    setThreads(body.threads);
  }

  async function loadMessagesForThread(threadId: string, options: { attachActiveRun?: boolean } = {}) {
    const requestId = messagesRequestIdRef.current + 1;
    messagesRequestIdRef.current = requestId;
    setLoadingThreadId(threadId);
    const response = await fetch(`/api/threads/${encodeURIComponent(threadId)}/messages`);
    if (messagesRequestIdRef.current === requestId || loadingThreadIdRef.current === threadId) {
      setLoadingThreadId(null);
    }
    if (!response.ok) {
      return;
    }

    const body = (await response.json()) as { messages: CloudMessage[] };
    setMessagesByThread((current) => ({
      ...current,
      [threadId]: body.messages
    }));
    if (options.attachActiveRun !== false) {
      void attachLatestActiveRunForThread(threadId);
    }
  }

  function openThread(threadId: string) {
    activeThreadIdRef.current = threadId;
    setActiveThreadId(threadId);
    const thread = threads.find((candidate) => candidate.id === threadId);
    if (thread) {
      setProvider(thread.provider);
    }
    if (!messagesByThreadRef.current[threadId]) {
      void loadMessagesForThread(threadId);
    }
    void attachLatestActiveRunForThread(threadId);
    router.push(`/chat/${encodeURIComponent(threadId)}`);
  }

  function startNewThread() {
    setActiveThreadId(null);
    setDraft('');
    setLoadingThreadId(null);
    if (!sending) {
      setStreamStatus(null);
    }
    router.push('/new');
  }

  async function stopStream() {
    const runId = activeRunIdRef.current;
    if (runId) {
      await fetch(`/api/runs/${encodeURIComponent(runId)}/cancel`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json'
        },
        body: JSON.stringify({ reason: 'Stopped from chat UI.' })
      }).catch(() => undefined);
    }

    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    activeRunIdRef.current = null;
    setLiveAssistantDraft(null);
    setSending(false);
    setStreamStatus('Stopped');
  }

  async function attachLatestActiveRunForThread(threadId: string) {
    if (sendingRef.current || activeRunIdRef.current) {
      return;
    }

    const response = await fetch(`/api/threads/${encodeURIComponent(threadId)}/runs`).catch(() => null);
    if (!response?.ok) {
      return;
    }

    const body = (await response.json()) as { runs: ActiveRunSummary[] };
    const run = body.runs[0];
    if (!run || attachingRunIdsRef.current.has(run.id)) {
      return;
    }

    void attachRunStream(threadId, run.id);
  }

  async function attachRunStream(threadId: string, runId: string) {
    if (sendingRef.current || attachingRunIdsRef.current.has(runId)) {
      return;
    }

    attachingRunIdsRef.current.add(runId);
    const controller = new AbortController();
    abortControllerRef.current = controller;
    activeRunIdRef.current = runId;
    setSending(true);
    setStreamStatus('Reattaching agent');
    setLiveAssistantDraft({ threadId, content: '' });

    try {
      const response = await fetch(`/api/runs/${encodeURIComponent(runId)}/events?stream=true`, {
        signal: controller.signal
      });
      if (!response.ok || !response.body) {
        setStreamStatus('Failed to reattach run');
        return;
      }

      await readRunEventStream(response.body, {
        onEvent: async (event) => {
          if (event.type === 'error') {
            setStreamStatus(event.error);
            return;
          }

          if (event.type !== 'cloud_run_event') {
            return;
          }

          const streamEvent = messageStreamEventFromRunEvent(event);
          if (!streamEvent) {
            return;
          }

          if (streamEvent.type === 'assistant_delta') {
            setStreamStatus('Streaming response');
            setLiveAssistantDraft((current) =>
              current?.threadId === threadId
                ? {
                    ...current,
                    content: `${current.content}${streamEvent.content}`
                  }
                : current
            );
          }

          if (streamEvent.type === 'tool_call' && streamEvent.toolCallId) {
            const toolCallId = streamEvent.toolCallId;
            setStreamStatus(formatToolStatus(streamEvent));
            setToolCallsByThread((current) => ({
              ...current,
              [threadId]: upsertToolCall(current[threadId] ?? [], {
                command: streamEvent.command,
                filePath: streamEvent.filePath,
                id: toolCallId,
                inputSummary: streamEvent.inputSummary,
                resultSummary: streamEvent.resultSummary,
                status: streamEvent.status,
                toolName: streamEvent.toolName ?? 'Tool'
              })
            }));
          }

          if (streamEvent.type === 'file_change') {
            setStreamStatus(`${streamEvent.changeType} ${streamEvent.path}`);
          }

          if (streamEvent.type === 'approval_request') {
            setStreamStatus(`${streamEvent.action} waiting for approval`);
            setApprovalRequestsByThread((current) => ({
              ...current,
              [threadId]: upsertApprovalRequest(current[threadId] ?? [], {
                action: streamEvent.action,
                details: streamEvent.details,
                permissionRequestId: streamEvent.permissionRequestId,
                runId: streamEvent.runId,
                status: 'pending'
              })
            }));
          }

          if (streamEvent.type === 'approval_resolved') {
            setStreamStatus(streamEvent.decision === 'approved' ? 'Approval granted' : 'Approval denied');
            setApprovalRequestsByThread((current) => ({
              ...current,
              [threadId]: updateApprovalRequest(current[threadId] ?? [], streamEvent.permissionRequestId, {
                resolving: false,
                reason: streamEvent.reason,
                status: streamEvent.status ?? streamEvent.decision
              })
            }));
          }

          if (streamEvent.type === 'run_cancelled') {
            setLiveAssistantDraft(null);
            setStreamStatus(streamEvent.reason ?? 'Run cancelled');
          }
        }
      });
      await loadMessagesForThread(threadId, { attachActiveRun: false });
      await refreshThreads();
    } catch (error) {
      if (!(error instanceof Error && error.name === 'AbortError')) {
        setStreamStatus(error instanceof Error ? error.message : String(error));
      }
    } finally {
      attachingRunIdsRef.current.delete(runId);
      if (activeRunIdRef.current === runId) {
        activeRunIdRef.current = null;
      }
      if (abortControllerRef.current === controller) {
        abortControllerRef.current = null;
      }
      setLiveAssistantDraft((current) => (current?.threadId === threadId ? null : current));
      setSending(false);
    }
  }

  async function sendMessage() {
    const content = draft.trim();
    if (!content || sending) {
      return;
    }

    const controller = new AbortController();
    abortControllerRef.current = controller;
    const targetThreadId = activeThreadId ?? 'new';
    setSending(true);
    setStreamStatus('Starting agent');
    setDraft('');

    const response = await fetch(`/api/threads/${encodeURIComponent(targetThreadId)}/messages`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json'
      },
      body: JSON.stringify({ content, provider, stream: true }),
      signal: controller.signal
    }).catch((error: unknown) => {
      if (error instanceof Error && error.name === 'AbortError') {
        return null;
      }

      throw error;
    });

    if (!response) {
      setSending(false);
      return;
    }

    if (!response.ok || !response.body) {
      setDraft(content);
      setSending(false);
      setStreamStatus('Failed to send');
      return;
    }

    try {
      await readMessageStream(response.body, {
        onEvent: async (event) => {
          if (event.type === 'user_message') {
            activeRunIdRef.current = event.runId;
            const currentActiveThreadId = activeThreadIdRef.current;
            const shouldAttachNewThreadToCurrentView = targetThreadId === 'new' && currentActiveThreadId === null;
            setThreads((current) => upsertThread(current, event.thread));
            setMessagesByThread((current) => ({
              ...current,
              [event.thread.id]: [...(current[event.thread.id] ?? []), event.message]
            }));
            setLiveAssistantDraft({ threadId: event.thread.id, content: '' });
            setToolCallsByThread((current) => ({
              ...current,
              [event.thread.id]: []
            }));
            setApprovalRequestsByThread((current) => ({
              ...current,
              [event.thread.id]: []
            }));
            setStreamStatus('Agent is thinking');
            if (shouldAttachNewThreadToCurrentView) {
              setActiveThreadId(event.thread.id);
              window.history.replaceState(window.history.state, '', `/chat/${encodeURIComponent(event.thread.id)}`);
            }
          }

          if (event.type === 'assistant_delta') {
            setStreamStatus('Streaming response');
            setLiveAssistantDraft((current) =>
              current
                ? {
                    ...current,
                    content: `${current.content}${event.content}`
                  }
                : current
            );
          }

          if (event.type === 'tool_call') {
            const targetId = liveAssistantDraft?.threadId ?? activeThreadIdRef.current;
            if (!targetId || !event.toolCallId) {
              return;
            }

            const toolCallId = event.toolCallId;
            const toolName = event.toolName ?? 'Tool';
            setStreamStatus(formatToolStatus(event));
            setToolCallsByThread((current) => ({
              ...current,
              [targetId]: upsertToolCall(current[targetId] ?? [], {
                command: event.command,
                filePath: event.filePath,
                id: toolCallId,
                inputSummary: event.inputSummary,
                resultSummary: event.resultSummary,
                status: event.status,
                toolName
              })
            }));
          }

          if (event.type === 'approval_request') {
            const targetId = liveAssistantDraft?.threadId ?? activeThreadIdRef.current;
            if (!targetId) {
              return;
            }

            setStreamStatus(`${event.action} waiting for approval`);
            setApprovalRequestsByThread((current) => ({
              ...current,
              [targetId]: upsertApprovalRequest(current[targetId] ?? [], {
                action: event.action,
                details: event.details,
                permissionRequestId: event.permissionRequestId,
                runId: event.runId,
                status: 'pending'
              })
            }));
          }

          if (event.type === 'approval_resolved') {
            const targetId = liveAssistantDraft?.threadId ?? activeThreadIdRef.current;
            if (!targetId) {
              return;
            }

            setStreamStatus(event.decision === 'approved' ? 'Approval granted' : 'Approval denied');
            setApprovalRequestsByThread((current) => ({
              ...current,
              [targetId]: updateApprovalRequest(current[targetId] ?? [], event.permissionRequestId, {
                resolving: false,
                reason: event.reason,
                status: event.status ?? event.decision
              })
            }));
          }

          if (event.type === 'run_cancelled') {
            if (activeRunIdRef.current === event.runId) {
              activeRunIdRef.current = null;
            }
            setLiveAssistantDraft(null);
            setStreamStatus(event.reason ?? 'Run cancelled');
          }

          if (event.type === 'completed') {
            if (activeRunIdRef.current) {
              activeRunIdRef.current = null;
            }
            const stillViewingCompletedThread = activeThreadIdRef.current === event.thread.id;
            setThreads((current) => upsertThread(current, event.thread));
            setMessagesByThread((current) => ({
              ...current,
              [event.thread.id]: event.messages
            }));
            setLiveAssistantDraft((current) => (current?.threadId === event.thread.id ? null : current));
            if (stillViewingCompletedThread) {
              setActiveThreadId(event.thread.id);
              setStreamStatus(event.failed ? event.error ?? 'Agent failed' : null);
            } else if (!event.failed) {
              setStreamStatus(null);
            }
            await refreshThreads();
          }
        }
      });
    } finally {
      abortControllerRef.current = null;
      setSending(false);
    }
  }

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.replace('/login');
    router.refresh();
  }

  async function resolveApprovalRequest(request: LiveApprovalRequest, decision: 'approved' | 'denied') {
    const targetThreadId = liveAssistantDraft?.threadId ?? activeThreadIdRef.current;
    if (!targetThreadId || request.status !== 'pending' || request.resolving) {
      return;
    }

    setApprovalRequestsByThread((current) => ({
      ...current,
      [targetThreadId]: updateApprovalRequest(current[targetThreadId] ?? [], request.permissionRequestId, {
        resolving: true
      })
    }));

    const response = await fetch(
      `/api/runs/${encodeURIComponent(request.runId)}/approval-requests/${encodeURIComponent(request.permissionRequestId)}`,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json'
        },
        body: JSON.stringify({ decision })
      }
    );

    if (!response.ok) {
      setStreamStatus('Approval update failed');
      setApprovalRequestsByThread((current) => ({
        ...current,
        [targetThreadId]: updateApprovalRequest(current[targetThreadId] ?? [], request.permissionRequestId, {
          resolving: false
        })
      }));
      return;
    }

    setApprovalRequestsByThread((current) => ({
      ...current,
      [targetThreadId]: updateApprovalRequest(current[targetThreadId] ?? [], request.permissionRequestId, {
        resolving: false,
        status: decision
      })
    }));
  }

  const renderComposerDock = (centered: boolean) => (
    <div className={clsx('cloud-agent-composer-dock z-10 px-4', centered ? 'pb-6 pt-3' : 'sticky bottom-0 pb-0')}>
      <div className="relative mx-auto max-w-[762px]">
        {!centered ? (
          <div className="cloud-agent-scroll-button-wrap">
            <button className="cloud-agent-scroll-button" type="button" aria-label="Scroll to bottom">
              <ChevronDown className="h-4 w-4" />
            </button>
          </div>
        ) : null}

        <form
          className={clsx('cloud-agent-composer-card', centered && 'cloud-agent-composer-card-centered')}
          onSubmit={(event) => {
            event.preventDefault();
            if (sending) {
              void stopStream();
              return;
            }

            void sendMessage();
          }}
        >
          <div className="relative h-full">
            <div className="px-4 py-3 pb-[52px]">
              <textarea
                className="cloud-agent-textarea"
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={(event) => {
                  if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
                    event.preventDefault();
                    void sendMessage();
                  }
                }}
                placeholder="Message Claude Code..."
                rows={3}
                value={draft}
                disabled={sending}
              />
            </div>

            <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-3 p-3">
              <div className="flex min-w-0 items-center gap-2">
                <span className="cloud-agent-tool-chip">
                  <Terminal className="h-4 w-4" />
                  <span>Bash</span>
                </span>
                <span className="cloud-agent-tool-chip">
                  <Box className="h-4 w-4" />
                  <span>/workspace</span>
                </span>
                {composerStatus ? (
                  <span className="truncate text-xs text-[color:var(--chat-text-secondary)]">{composerStatus}</span>
                ) : null}
              </div>
              <button
                className={clsx('cloud-agent-send-button', sending && 'cloud-agent-send-button-stop')}
                type="submit"
                disabled={!sending && draft.trim().length === 0}
                aria-label={sending ? 'Stop generation' : 'Send message'}
                title={sending ? '停止接收响应' : '发送 (Cmd/Ctrl + Enter)'}
              >
                {sending ? <Square className="h-3.5 w-3.5 fill-current" /> : <ArrowUp className="h-5 w-5" />}
              </button>
            </div>
          </div>
        </form>
      </div>
      {!centered ? (
        <div className="flex h-7 items-center justify-center text-[11px] leading-none text-[color:var(--chat-text-tertiary)]">
          内容由 AI 生成，请仔细甄别
        </div>
      ) : null}
    </div>
  );

  return (
    <main className="chat-shell-theme cloud-agent-shell flex h-dvh min-h-0 overflow-hidden">
      <aside className="cloud-agent-sidebar flex h-full w-[var(--chat-sidebar-width)] shrink-0 flex-col overflow-hidden">
        <div className="flex shrink-0 items-center justify-between px-3 pt-4">
          <div className="cloud-agent-avatar">A</div>
        </div>

        <div className="px-3 pb-3 pt-6">
          <button className="cloud-agent-new-chat-button" type="button" onClick={startNewThread}>
            <MessageSquarePlus className="h-4 w-4" strokeWidth={2.2} />
            <span>开启新对话</span>
          </button>
        </div>

        <div className="cloud-agent-sidebar-scroll min-h-0 flex-1 overflow-y-auto px-3 pb-3">
          <SidebarSection title="最近对话" empty={threads.length === 0}>
            {threads.map((thread) => (
              <div
                className={clsx('cloud-agent-thread-row', thread.id === activeThreadId && 'cloud-agent-thread-row-active')}
                key={thread.id}
              >
                <button
                  className="flex h-full min-w-0 flex-1 items-center text-left"
                  data-thread-id={thread.id}
                  onClick={() => openThread(thread.id)}
                  type="button"
                >
                  <span className="truncate text-[length:var(--chat-sidebar-item-font-size)] leading-[1.2]" title={thread.title}>
                    {thread.title}
                  </span>
                </button>
                <span className="ml-2 shrink-0 text-[11px] text-[color:var(--chat-sidebar-muted-text)]">
                  {formatThreadTime(thread.updatedAt)}
                </span>
              </div>
            ))}
          </SidebarSection>
        </div>

        <div className="shrink-0 px-2 py-2">
          <button className="cloud-agent-account-button" type="button" onClick={() => void logout()}>
            <span className="cloud-agent-account-monogram">{currentUser.displayName.slice(0, 1).toUpperCase()}</span>
            <span className="min-w-0 flex-1 truncate text-left">{currentUser.displayName}</span>
            <LogOut className="h-4 w-4 text-[color:var(--chat-sidebar-muted-text)]" />
          </button>
        </div>
      </aside>

      <section className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-[var(--chat-bg)]">
        <header className="cloud-agent-header z-[11] flex h-[60px] min-h-[60px] items-center gap-4 px-6">
          <div className="min-w-0">
            <h1 className="truncate text-sm font-bold leading-[1.2] text-[color:var(--chat-text)]">
              {activeThread?.title ?? 'Cloud Agent Runtime'}
            </h1>
            <p className="mt-1 truncate text-xs font-medium text-[color:var(--chat-text-secondary)]">
              {activeThread ? `Thread ${activeThread.id.slice(0, 8)} · Workspace default` : 'Docker sandbox · /workspace'}
            </p>
          </div>
          <div className="flex-1" />
          <label className="cloud-agent-provider-chip">
            <span>Provider</span>
            <select value={provider} onChange={(event) => setProvider(event.target.value as AgentProviderId)}>
              {providerOptions.map((option) => (
                <option disabled={option.status === 'planned'} key={option.id} value={option.id}>
                  {option.label}
                  {option.status === 'planned' ? ' (planned)' : ''}
                  {option.status === 'available' && !option.configured ? ' (env missing)' : ''}
                </option>
              ))}
            </select>
          </label>
        </header>

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          {centeredEmptyState ? (
            <div
              ref={messagesViewportRef}
              className="cloud-agent-message-viewport flex min-h-0 flex-1 flex-col justify-center overflow-hidden pb-16"
            >
              <div className="mb-[38px] flex flex-col items-center px-4 text-center">
                <div className="flex items-center gap-2.5 text-[color:var(--chat-text)]">
                  <span className="cloud-agent-landing-logo">A</span>
                  <h2 className="text-[24px] font-semibold leading-none">使用 Cloud Agent Runtime 开始对话</h2>
                </div>
                <p className="mt-[18px] max-w-xl text-sm leading-6 text-[color:var(--chat-text-secondary)]">
                  Claude Code SDK 运行在 Docker sandbox 内，工具命令会看到 /workspace。
                </p>
              </div>
              {renderComposerDock(true)}
            </div>
          ) : (
            <>
              <div
                ref={messagesViewportRef}
                className="cloud-agent-message-viewport relative flex min-h-0 flex-1 flex-col overflow-y-auto px-4"
              >
                <div className="mx-auto flex w-full max-w-3xl flex-col gap-5 py-8">
                  {loadingThreadId !== null && loadingThreadId === activeThreadId ? (
                    <p className="text-sm text-[color:var(--chat-text-secondary)]">Loading thread...</p>
                  ) : null}
                  {displayedMessages.map((message) => (
                    <MessageBubble
                      key={message.id}
                      message={message}
                      live={message.id.startsWith('live-')}
                      toolCalls={
                        activeThreadId && message.id === lastAssistantMessageId ? toolCallsByThread[activeThreadId] ?? [] : []
                      }
                      approvalRequests={
                        activeThreadId && message.id === lastAssistantMessageId
                          ? approvalRequestsByThread[activeThreadId] ?? []
                          : []
                      }
                      onResolveApproval={(request, decision) => void resolveApprovalRequest(request, decision)}
                    />
                  ))}
                  {showTypingRow ? (
                    <div className="cloud-agent-typing-row">
                      <span className="cloud-agent-dot" />
                      <span className="cloud-agent-dot" />
                      <span className="cloud-agent-dot" />
                      <span className="ml-2 text-xs text-[color:var(--chat-text-secondary)]">
                        {streamStatus ?? 'Agent is working'}
                      </span>
                    </div>
                  ) : null}
                </div>
              </div>
              {renderComposerDock(false)}
            </>
          )}
        </div>
      </section>
    </main>
  );
}

function SidebarSection({ children, empty, title }: { children: ReactNode; empty: boolean; title: string }) {
  if (empty) {
    return <p className="px-1 py-2 text-sm text-[color:var(--chat-sidebar-muted-text)]">暂无对话</p>;
  }

  return (
    <section className="mb-3">
      <div className="sticky top-0 z-10 -mx-3 mb-[2px] bg-[var(--chat-sidebar-bg)] px-4 pt-1 text-[length:var(--chat-sidebar-section-font-size)] font-normal text-[color:var(--chat-sidebar-muted-text)]">
        {title}
      </div>
      <div className="flex flex-col">{children}</div>
    </section>
  );
}

function MessageBubble({
  approvalRequests,
  live,
  message,
  onResolveApproval,
  toolCalls
}: {
  approvalRequests: LiveApprovalRequest[];
  live: boolean;
  message: CloudMessage;
  onResolveApproval: (request: LiveApprovalRequest, decision: 'approved' | 'denied') => void;
  toolCalls: LiveToolCall[];
}) {
  const isUser = message.role === 'user';
  return (
    <article className={clsx('cloud-agent-message-row', isUser ? 'justify-end' : 'justify-start')}>
      <div className={clsx('cloud-agent-message-bubble', isUser ? 'cloud-agent-user-bubble' : 'cloud-agent-assistant-bubble')}>
        <span className="mb-2 block text-[11px] font-bold uppercase tracking-normal text-[color:var(--chat-text-tertiary)]">
          {isUser ? 'USER' : live ? 'ASSISTANT · streaming' : 'ASSISTANT'}
        </span>
        {!isUser && toolCalls.length > 0 ? <ToolCallList toolCalls={toolCalls} /> : null}
        {!isUser && approvalRequests.length > 0 ? (
          <ApprovalRequestList approvalRequests={approvalRequests} onResolve={onResolveApproval} />
        ) : null}
        <p className="whitespace-pre-wrap break-words text-sm leading-6">
          {message.content}
          {live ? <span className="cloud-agent-caret" aria-hidden="true" /> : null}
        </p>
      </div>
    </article>
  );
}

function ApprovalRequestList({
  approvalRequests,
  onResolve
}: {
  approvalRequests: LiveApprovalRequest[];
  onResolve: (request: LiveApprovalRequest, decision: 'approved' | 'denied') => void;
}) {
  return (
    <div className="cloud-agent-approval-list">
      {approvalRequests.map((request) => (
        <div className="cloud-agent-approval-row" key={request.permissionRequestId}>
          <span className={clsx('cloud-agent-approval-dot', `cloud-agent-approval-dot-${request.status}`)} />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-xs font-semibold text-[color:var(--chat-text)]">
              {request.action} approval
            </span>
            <span className="mt-0.5 block truncate text-[11px] text-[color:var(--chat-text-tertiary)]">
              {approvalSummary(request)}
            </span>
          </span>
          {request.status === 'pending' ? (
            <span className="flex shrink-0 items-center gap-1">
              <button
                aria-label={`Approve ${request.action}`}
                className="cloud-agent-approval-button"
                disabled={request.resolving}
                onClick={() => onResolve(request, 'approved')}
                type="button"
              >
                <Check className="h-3.5 w-3.5" />
              </button>
              <button
                aria-label={`Deny ${request.action}`}
                className="cloud-agent-approval-button cloud-agent-approval-button-deny"
                disabled={request.resolving}
                onClick={() => onResolve(request, 'denied')}
                type="button"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </span>
          ) : null}
        </div>
      ))}
    </div>
  );
}

function ToolCallList({ toolCalls }: { toolCalls: LiveToolCall[] }) {
  return (
    <div className="cloud-agent-tool-call-list">
      {toolCalls.map((toolCall) => (
        <div className="cloud-agent-tool-call-row" key={toolCall.id}>
          <span className={clsx('cloud-agent-tool-call-icon', `cloud-agent-tool-call-icon-${toolCall.status}`)}>
            {toolIcon(toolCall.toolName)}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-xs font-semibold text-[color:var(--chat-text)]">
              {toolCall.inputSummary ?? toolCall.toolName}
            </span>
            <span className="mt-0.5 block truncate text-[11px] text-[color:var(--chat-text-tertiary)]">
              {toolCall.status === 'started' ? 'Running' : toolCall.resultSummary || statusLabel(toolCall.status)}
            </span>
          </span>
        </div>
      ))}
    </div>
  );
}

async function readMessageStream(
  body: ReadableStream<Uint8Array>,
  options: { onEvent: (event: MessageStreamEvent) => void | Promise<void> }
) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  for (;;) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) {
        continue;
      }

      await options.onEvent(JSON.parse(trimmed) as MessageStreamEvent);
    }
  }

  const tail = buffer.trim();
  if (tail) {
    await options.onEvent(JSON.parse(tail) as MessageStreamEvent);
  }
}

async function readRunEventStream(
  body: ReadableStream<Uint8Array>,
  options: { onEvent: (event: RunEventStreamEvent) => void | Promise<void> }
) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  for (;;) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) {
        continue;
      }

      await options.onEvent(JSON.parse(trimmed) as RunEventStreamEvent);
    }
  }

  const tail = buffer.trim();
  if (tail) {
    await options.onEvent(JSON.parse(tail) as RunEventStreamEvent);
  }
}

function messageStreamEventFromRunEvent(event: Extract<RunEventStreamEvent, { type: 'cloud_run_event' }>): MessageStreamEvent | null {
  const payload = event.event.payload;
  if (payload.type === 'agent_message_delta' && typeof payload.delta === 'string') {
    return { type: 'assistant_delta', content: payload.delta };
  }

  if (
    payload.type === 'tool_call_started' ||
    payload.type === 'tool_call_completed' ||
    payload.type === 'tool_call_failed'
  ) {
    return {
      type: 'tool_call',
      status:
        payload.type === 'tool_call_started'
          ? 'started'
          : payload.type === 'tool_call_completed'
            ? 'completed'
            : 'failed',
      toolCallId: readPayloadString(payload, 'toolCallId'),
      toolName: payload.type === 'tool_call_started' ? readPayloadString(payload, 'toolName') : null,
      inputSummary: payload.type === 'tool_call_started' ? summarizePayloadRecord(payload.input) : null,
      resultSummary: payload.type === 'tool_call_completed' ? summarizePayloadRecord(payload.output) : null,
      error: payload.type === 'tool_call_failed' ? readPayloadString(payload, 'error') : null,
      filePath: readPayloadPath(payload),
      command: payload.type === 'tool_call_started' ? readPayloadRecordString(payload.input, 'command') : null
    };
  }

  if (payload.type === 'file_change_detected' && typeof payload.path === 'string') {
    return {
      type: 'file_change',
      path: payload.path,
      changeType: readPayloadString(payload, 'changeType') ?? 'changed',
      toolCallId: readPayloadString(payload, 'toolCallId')
    };
  }

  if (payload.type === 'permission_requested') {
    return {
      type: 'approval_request',
      runId: event.event.runId,
      permissionRequestId: readPayloadString(payload, 'permissionRequestId') ?? '',
      action: readPayloadString(payload, 'action') ?? 'Tool use',
      details: isPlainRecord(payload.details) ? payload.details : null
    };
  }

  if (payload.type === 'approval_resolved') {
    return {
      type: 'approval_resolved',
      runId: event.event.runId,
      permissionRequestId: readPayloadString(payload, 'permissionRequestId') ?? '',
      decision: readPayloadString(payload, 'decision') === 'approved' ? 'approved' : 'denied',
      status: readApprovalStatus(payload),
      reason: readPayloadString(payload, 'reason'),
      resolvedByActorId: readPayloadString(payload, 'resolvedByActorId')
    };
  }

  if (payload.type === 'run_cancelled') {
    return {
      type: 'run_cancelled',
      runId: event.event.runId,
      reason: readPayloadString(payload, 'reason')
    };
  }

  return null;
}

function upsertThread(threads: CloudThread[], nextThread: CloudThread): CloudThread[] {
  const without = threads.filter((thread) => thread.id !== nextThread.id);
  return [nextThread, ...without].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

function upsertToolCall(toolCalls: LiveToolCall[], nextToolCall: LiveToolCall): LiveToolCall[] {
  const existingIndex = toolCalls.findIndex((toolCall) => toolCall.id === nextToolCall.id);
  if (existingIndex === -1) {
    return [...toolCalls, nextToolCall];
  }

  return toolCalls.map((toolCall, index) =>
    index === existingIndex
      ? {
          ...toolCall,
          ...nextToolCall,
          command: nextToolCall.command ?? toolCall.command,
          filePath: nextToolCall.filePath ?? toolCall.filePath,
          inputSummary: nextToolCall.inputSummary ?? toolCall.inputSummary,
          resultSummary: nextToolCall.resultSummary ?? toolCall.resultSummary,
          toolName: nextToolCall.toolName || toolCall.toolName
        }
      : toolCall
  );
}

function upsertApprovalRequest(
  approvalRequests: LiveApprovalRequest[],
  nextRequest: LiveApprovalRequest
): LiveApprovalRequest[] {
  const existingIndex = approvalRequests.findIndex(
    (request) => request.permissionRequestId === nextRequest.permissionRequestId
  );
  if (existingIndex === -1) {
    return [...approvalRequests, nextRequest];
  }

  return approvalRequests.map((request, index) =>
    index === existingIndex
      ? {
          ...request,
          ...nextRequest,
          details: nextRequest.details ?? request.details
        }
      : request
  );
}

function updateApprovalRequest(
  approvalRequests: LiveApprovalRequest[],
  permissionRequestId: string,
  patch: Partial<LiveApprovalRequest>
): LiveApprovalRequest[] {
  return approvalRequests.map((request) =>
    request.permissionRequestId === permissionRequestId
      ? {
          ...request,
          ...patch
        }
      : request
  );
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function readPayloadString(payload: Record<string, unknown>, key: string): string | null {
  const value = payload[key];
  return typeof value === 'string' ? value : null;
}

function readPayloadRecordString(value: unknown, key: string): string | null {
  if (!isPlainRecord(value)) {
    return null;
  }

  const nested = value[key];
  return typeof nested === 'string' ? nested : null;
}

function readApprovalStatus(payload: Record<string, unknown>): 'approved' | 'denied' | 'expired' | 'cancelled' | null {
  const status = readPayloadString(payload, 'status');
  return status === 'approved' || status === 'denied' || status === 'expired' || status === 'cancelled' ? status : null;
}

function readPayloadPath(payload: Record<string, unknown>): string | null {
  if (payload.type === 'file_change_detected') {
    return readPayloadString(payload, 'path');
  }

  if (payload.type === 'tool_call_started') {
    return readPayloadRecordString(payload.input, 'filePath');
  }

  if (payload.type === 'tool_call_completed') {
    return readPayloadRecordString(payload.output, 'filePath');
  }

  return null;
}

function summarizePayloadRecord(value: unknown): string | null {
  if (!isPlainRecord(value) || Object.keys(value).length === 0) {
    return null;
  }

  return JSON.stringify(value);
}

function formatToolStatus(event: Extract<MessageStreamEvent, { type: 'tool_call' }>): string {
  const toolName = event.toolName ?? 'Tool';
  if (event.status === 'started') {
    return `${toolName} running`;
  }

  if (event.status === 'failed') {
    return `${toolName} failed`;
  }

  return `${toolName} completed`;
}

function approvalSummary(request: LiveApprovalRequest): string {
  if (request.status === 'approved') {
    return 'Approved';
  }

  if (request.status === 'expired') {
    return request.reason ?? 'Expired';
  }

  if (request.status === 'cancelled') {
    return request.reason ?? 'Cancelled';
  }

  if (request.status === 'denied') {
    return request.reason ?? 'Denied';
  }

  const input = request.details?.input;
  if (input && typeof input === 'object' && !Array.isArray(input)) {
    const command = (input as Record<string, unknown>).command;
    const filePath = (input as Record<string, unknown>).filePath ?? (input as Record<string, unknown>).file_path;
    if (typeof command === 'string') {
      return command;
    }
    if (typeof filePath === 'string') {
      return filePath;
    }
  }

  return request.resolving ? 'Submitting decision' : 'Waiting for decision';
}

function formatThreadTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '';
  }

  return `${date.getMonth() + 1}月${date.getDate()}日`;
}

function statusLabel(status: LiveToolCall['status']): string {
  if (status === 'failed') {
    return 'Failed';
  }

  if (status === 'completed') {
    return 'Completed';
  }

  return 'Running';
}

function toolIcon(toolName: string) {
  if (toolName === 'Bash') {
    return <Terminal className="h-3.5 w-3.5" />;
  }

  if (toolName === 'Read') {
    return <FileText className="h-3.5 w-3.5" />;
  }

  if (toolName === 'Write' || toolName === 'Edit') {
    return <Pencil className="h-3.5 w-3.5" />;
  }

  return <Wrench className="h-3.5 w-3.5" />;
}
