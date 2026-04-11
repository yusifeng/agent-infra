'use client';

import type {
  CreateThreadResponseDto,
  MessageDto,
  MessagePartDto,
  RunDto,
  RunEventDto,
  RunStreamAssistantSnapshotDto,
  RunStreamEventDto,
  RunTimelineResponseDto,
  RuntimePiMetaDto,
  ThreadMessagesResponseDto,
  ThreadRunsResponseDto,
  ThreadDto,
  ThreadsResponseDto,
  ToolInvocationDto
} from '@agent-infra/contracts';
import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';

const ACTIVE_THREAD_STORAGE_KEY = 'agent-infra.runtime-pi.active-thread-id';
const SELECTED_RUN_STORAGE_KEY = 'agent-infra.runtime-pi.selected-run-id';

function normalizeRuntimeMeta(data: Partial<RuntimePiMetaDto>): RuntimePiMetaDto {
  const modelOptions = Array.isArray(data.modelOptions) ? data.modelOptions : [];

  return {
    dbMode: data.dbMode ?? 'unknown',
    dbConnection: data.dbConnection ?? 'unknown',
    runtimeConfigured: data.runtimeConfigured ?? false,
    runtimeProvider: data.runtimeProvider ?? modelOptions[0]?.provider ?? 'unknown',
    runtimeModel: data.runtimeModel ?? modelOptions[0]?.model ?? 'unknown',
    defaultModelKey: data.defaultModelKey ?? modelOptions[0]?.key ?? null,
    modelOptions,
    runtimeConfigError: data.runtimeConfigError ?? null
  };
}

function formatDateTime(value?: string | null) {
  if (!value) {
    return '';
  }

  return new Intl.DateTimeFormat(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    month: 'short',
    day: 'numeric'
  }).format(new Date(value));
}

function formatDuration(startedAt?: string | null, finishedAt?: string | null) {
  if (!startedAt) {
    return 'Not started';
  }

  const start = new Date(startedAt).getTime();
  const end = finishedAt ? new Date(finishedAt).getTime() : Date.now();
  const durationMs = Math.max(0, end - start);

  if (durationMs < 1000) {
    return `${durationMs} ms`;
  }

  const seconds = durationMs / 1000;
  if (seconds < 60) {
    return `${seconds.toFixed(seconds < 10 ? 1 : 0)} s`;
  }

  const roundedSeconds = Math.round(seconds);
  const minutes = Math.floor(roundedSeconds / 60);
  const remainingSeconds = roundedSeconds % 60;
  return `${minutes}m ${remainingSeconds}s`;
}

function deriveLatestRunId(messages: MessageDto[]) {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const runId = messages[index]?.runId;
    if (runId) {
      return runId;
    }
  }

  return null;
}

function chooseInitialThreadId(threads: ThreadDto[], preferredThreadId: string | null) {
  if (preferredThreadId && threads.some((thread) => thread.id === preferredThreadId)) {
    return preferredThreadId;
  }

  return threads[0]?.id ?? null;
}

function chooseInitialRunId(messages: MessageDto[], runs: RunDto[], preferredRunId: string | null) {
  if (preferredRunId && runs.some((run) => run.id === preferredRunId)) {
    return preferredRunId;
  }

  return runs[0]?.id ?? deriveLatestRunId(messages);
}

function readPersistedSelection() {
  if (typeof window === 'undefined') {
    return {
      threadId: null,
      runId: null
    };
  }

  const url = new URL(window.location.href);
  const threadIdFromUrl = url.searchParams.get('thread');
  const runIdFromUrl = url.searchParams.get('run');
  let threadIdFromStorage: string | null = null;
  let runIdFromStorage: string | null = null;

  try {
    threadIdFromStorage = window.localStorage.getItem(ACTIVE_THREAD_STORAGE_KEY);
    runIdFromStorage = window.localStorage.getItem(SELECTED_RUN_STORAGE_KEY);
  } catch {
    threadIdFromStorage = null;
    runIdFromStorage = null;
  }

  return {
    threadId: threadIdFromUrl ?? threadIdFromStorage,
    runId: runIdFromUrl ?? runIdFromStorage
  };
}

function persistSelection(threadId: string | null, runId: string | null) {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    if (threadId) {
      window.localStorage.setItem(ACTIVE_THREAD_STORAGE_KEY, threadId);
    } else {
      window.localStorage.removeItem(ACTIVE_THREAD_STORAGE_KEY);
    }

    if (runId) {
      window.localStorage.setItem(SELECTED_RUN_STORAGE_KEY, runId);
    } else {
      window.localStorage.removeItem(SELECTED_RUN_STORAGE_KEY);
    }
  } catch {
    // Storage may be unavailable in privacy-restricted contexts. URL state still works.
  }

  const url = new URL(window.location.href);
  if (threadId) {
    url.searchParams.set('thread', threadId);
  } else {
    url.searchParams.delete('thread');
  }

  if (runId) {
    url.searchParams.set('run', runId);
  } else {
    url.searchParams.delete('run');
  }

  window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);
}

const RECENT_RUNS_LIMIT = 8;

function compareRunsByCreatedAt(left: RunDto, right: RunDto) {
  return new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime();
}

function upsertMessage(messages: MessageDto[], nextMessage: MessageDto) {
  const existingIndex = messages.findIndex((message) => message.id === nextMessage.id);
  if (existingIndex === -1) {
    return [...messages, nextMessage].sort((left, right) => left.seq - right.seq);
  }

  const nextMessages = [...messages];
  nextMessages[existingIndex] = nextMessage;
  return nextMessages;
}

function upsertRun(runs: RunDto[], nextRun: RunDto) {
  const existingIndex = runs.findIndex((run) => run.id === nextRun.id);
  if (existingIndex === -1) {
    return [...runs, nextRun].sort(compareRunsByCreatedAt).slice(0, RECENT_RUNS_LIMIT);
  }

  const nextRuns = [...runs];
  nextRuns[existingIndex] = nextRun;
  return nextRuns.sort(compareRunsByCreatedAt).slice(0, RECENT_RUNS_LIMIT);
}

function includeSelectedRun(runs: RunDto[], selectedRun: RunDto | null) {
  if (!selectedRun) {
    return runs;
  }

  const existing = runs.some((run) => run.id === selectedRun.id);
  if (existing) {
    return runs;
  }

  return [...runs, selectedRun].sort(compareRunsByCreatedAt);
}

function upsertRunEvent(events: RunEventDto[], nextEvent: RunEventDto) {
  const existingIndex = events.findIndex((event) => event.id === nextEvent.id);
  if (existingIndex === -1) {
    return [...events, nextEvent].sort((left, right) => left.seq - right.seq);
  }

  const nextEvents = [...events];
  nextEvents[existingIndex] = nextEvent;
  return nextEvents.sort((left, right) => left.seq - right.seq);
}

function upsertToolInvocation(invocations: ToolInvocationDto[], nextInvocation: ToolInvocationDto) {
  const existingIndex = invocations.findIndex((invocation) => invocation.id === nextInvocation.id);
  if (existingIndex === -1) {
    return [...invocations, nextInvocation];
  }

  const nextInvocations = [...invocations];
  nextInvocations[existingIndex] = nextInvocation;
  return nextInvocations;
}

function applyRunStreamEvent(current: RunTimelineResponseDto | null, event: RunStreamEventDto): RunTimelineResponseDto {
  switch (event.type) {
    case 'run.ready':
      return {
        run: event.run,
        runEvents: [],
        toolInvocations: []
      };
    case 'run.state':
      return {
        run: event.run,
        runEvents: current?.runEvents ?? [],
        toolInvocations: current?.toolInvocations ?? []
      };
    case 'run.event':
      return {
        run: current?.run ?? null,
        runEvents: upsertRunEvent(current?.runEvents ?? [], event.event),
        toolInvocations: current?.toolInvocations ?? []
      };
    case 'run.tool':
      return {
        run: current?.run ?? null,
        runEvents: current?.runEvents ?? [],
        toolInvocations: upsertToolInvocation(current?.toolInvocations ?? [], event.toolInvocation)
      };
    case 'run.completed':
      return {
        run: event.run,
        runEvents: current?.runEvents ?? [],
        toolInvocations: current?.toolInvocations ?? []
      };
    case 'run.failed':
      return {
        run: event.run,
        runEvents: current?.runEvents ?? [],
        toolInvocations: current?.toolInvocations ?? []
      };
    case 'run.assistant':
      return current ?? {
        run: null,
        runEvents: [],
        toolInvocations: []
      };
    default:
      return current ?? {
        run: null,
        runEvents: [],
        toolInvocations: []
      };
  }
}

function parseSseChunk(buffer: string) {
  const frames = buffer.split('\n\n');
  const remainder = frames.pop() ?? '';
  const events: RunStreamEventDto[] = [];

  for (const frame of frames) {
    const lines = frame.split('\n');
    let eventName = '';
    let data = '';

    for (const line of lines) {
      if (line.startsWith('event:')) {
        eventName = line.slice(6).trim();
        continue;
      }

      if (line.startsWith('data:')) {
        data += line.slice(5).trim();
      }
    }

    if (!eventName || !data) {
      continue;
    }

    try {
      const parsed = JSON.parse(data) as RunStreamEventDto;
      if (parsed.type === eventName) {
        events.push(parsed);
      }
    } catch {
      continue;
    }
  }

  return {
    events,
    remainder
  };
}

function statusBadgeTone(status: RunDto['status'] | ToolInvocationDto['status'] | MessageDto['status'] | 'idle') {
  switch (status) {
    case 'running':
      return 'bg-amber-100 text-amber-800';
    case 'queued':
    case 'created':
      return 'bg-slate-200 text-slate-700';
    case 'completed':
      return 'bg-emerald-100 text-emerald-800';
    case 'failed':
      return 'bg-rose-100 text-rose-800';
    default:
      return 'bg-slate-100 text-slate-600';
  }
}

function formatPart(part: MessagePartDto) {
  if (part.type === 'text') {
    return <p className="whitespace-pre-wrap leading-6">{part.textValue ?? ''}</p>;
  }

  if (part.type === 'reasoning') {
    return (
      <details className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
        <summary className="cursor-pointer text-xs font-medium uppercase tracking-wide text-slate-500">Reasoning</summary>
        <pre className="mt-3 overflow-x-auto whitespace-pre-wrap text-xs leading-5 text-slate-600">{part.textValue ?? ''}</pre>
      </details>
    );
  }

  if (part.type === 'tool-call') {
    const json = part.jsonValue ?? {};
    return (
      <div className="space-y-2 rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-3">
        <p className="text-xs font-medium uppercase tracking-wide text-indigo-700">Tool Call · {String(json.toolName ?? 'unknown')}</p>
        <pre className="overflow-auto rounded-md bg-slate-900 p-3 text-xs text-slate-100">
          {JSON.stringify({ toolCallId: json.toolCallId ?? 'n/a', input: json.input ?? null }, null, 2)}
        </pre>
      </div>
    );
  }

  if (part.type === 'tool-result') {
    const json = part.jsonValue ?? {};
    return (
      <div className="space-y-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-3">
        <p className="text-xs font-medium uppercase tracking-wide text-emerald-700">Tool Result · {String(json.toolName ?? 'unknown')}</p>
        {part.textValue ? <p className="whitespace-pre-wrap text-sm leading-6 text-slate-700">{part.textValue}</p> : null}
        <pre className="overflow-auto rounded-md bg-slate-900 p-3 text-xs text-slate-100">{JSON.stringify(json, null, 2)}</pre>
      </div>
    );
  }

  return <pre className="overflow-auto rounded-md bg-slate-900 p-3 text-xs text-slate-100">{JSON.stringify(part, null, 2)}</pre>;
}

function EventRow({ event }: { event: RunEventDto }) {
  return (
    <article className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
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
          <pre className="mt-2 overflow-auto rounded-lg bg-slate-900 p-3 text-xs text-slate-100">{JSON.stringify(event.payload, null, 2)}</pre>
        </details>
      ) : null}
    </article>
  );
}

function ToolRow({ invocation }: { invocation: ToolInvocationDto }) {
  return (
    <article className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
      <header className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-slate-900">{invocation.toolName}</p>
          <p className="truncate text-xs text-slate-500">{invocation.toolCallId}</p>
        </div>
        <span className={`rounded-full px-2 py-1 text-[11px] font-medium uppercase tracking-wide ${statusBadgeTone(invocation.status)}`}>
          {invocation.status}
        </span>
      </header>

      <div className="mt-3 grid gap-3">
        <div>
          <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-slate-500">Input</p>
          <pre className="overflow-auto rounded-lg bg-slate-900 p-3 text-xs text-slate-100">{JSON.stringify(invocation.input ?? null, null, 2)}</pre>
        </div>

        <div>
          <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-slate-500">Output</p>
          <pre className="overflow-auto rounded-lg bg-slate-900 p-3 text-xs text-slate-100">{JSON.stringify(invocation.output ?? null, null, 2)}</pre>
        </div>

        {invocation.error ? (
          <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">{invocation.error}</div>
        ) : null}
      </div>
    </article>
  );
}

type LiveAssistantDraft = {
  runId: string;
  messageId: string;
  partialText: string;
  partialReasoning: string | null;
  eventType: RunStreamAssistantSnapshotDto['eventType'];
};

export function RuntimePiPlaygroundPage() {
  const [threads, setThreads] = useState<ThreadDto[]>([]);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [messages, setMessages] = useState<MessageDto[]>([]);
  const [draft, setDraft] = useState('');
  const [newThreadTitle, setNewThreadTitle] = useState('');
  const [meta, setMeta] = useState<RuntimePiMetaDto | null>(null);
  const [selectedModelKey, setSelectedModelKey] = useState('');
  const [sending, setSending] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [recentRuns, setRecentRuns] = useState<RunDto[]>([]);
  const [recentRunsLoading, setRecentRunsLoading] = useState(false);
  const [recentRunsError, setRecentRunsError] = useState<string | null>(null);
  const [timeline, setTimeline] = useState<RunTimelineResponseDto | null>(null);
  const [timelineLoading, setTimelineLoading] = useState(false);
  const [timelineError, setTimelineError] = useState<string | null>(null);
  const [liveStreamRunId, setLiveStreamRunId] = useState<string | null>(null);
  const [liveAssistantDraft, setLiveAssistantDraft] = useState<LiveAssistantDraft | null>(null);
  const [durableRecoveryNotice, setDurableRecoveryNotice] = useState<string | null>(null);
  const selectionPersistenceReadyRef = useRef(false);
  const activeThreadIdRef = useRef<string | null>(null);
  const messagesRequestIdRef = useRef(0);
  const messagesAbortControllerRef = useRef<AbortController | null>(null);
  const timelineRequestIdRef = useRef(0);
  const timelineAbortControllerRef = useRef<AbortController | null>(null);
  const sendRequestIdRef = useRef(0);
  const sendAbortControllerRef = useRef<AbortController | null>(null);

  const activeThread = useMemo(() => threads.find((thread) => thread.id === activeThreadId) ?? null, [threads, activeThreadId]);
  const selectedModelOption = useMemo(
    () => meta?.modelOptions.find((option) => option.key === selectedModelKey) ?? meta?.modelOptions[0] ?? null,
    [meta, selectedModelKey]
  );
  const selectedRun = timeline?.run ?? null;
  const runEvents = timeline?.runEvents ?? [];
  const toolInvocations = timeline?.toolInvocations ?? [];

  async function readJsonOrEmpty<T>(response: Response): Promise<Partial<T>> {
    const text = await response.text();
    if (!text) {
      return {};
    }

    try {
      return JSON.parse(text) as Partial<T>;
    } catch {
      return {};
    }
  }

  useEffect(() => {
    activeThreadIdRef.current = activeThreadId;
  }, [activeThreadId]);

  useEffect(() => {
    if (!selectionPersistenceReadyRef.current) {
      return;
    }

    persistSelection(activeThreadId, selectedRunId);
  }, [activeThreadId, selectedRunId]);

  async function refreshThreads() {
    const response = await fetch('/api/runtime-pi/threads');
    const data = (await readJsonOrEmpty<ThreadsResponseDto>(response)) as ThreadsResponseDto;
    if (!response.ok) {
      throw new Error(data.error ?? `Failed to load threads (${response.status})`);
    }

    setThreads(data.threads);
    return data.threads;
  }

  async function loadRunTimeline(runId: string | null) {
    timelineRequestIdRef.current += 1;
    const requestId = timelineRequestIdRef.current;
    timelineAbortControllerRef.current?.abort();
    setSelectedRunId(runId);
    setLiveAssistantDraft((current) => (current?.runId === runId ? current : null));

    if (!runId) {
      timelineAbortControllerRef.current = null;
      setTimeline(null);
      setTimelineError(null);
      setTimelineLoading(false);
      return;
    }

    const controller = new AbortController();
    timelineAbortControllerRef.current = controller;
    setTimeline(null);
    setTimelineLoading(true);
    setTimelineError(null);

    try {
      const response = await fetch(`/api/runtime-pi/runs/${runId}/timeline`, {
        signal: controller.signal
      });
      const data = (await response.json()) as RunTimelineResponseDto;
      if (!response.ok) {
        throw new Error(data.error ?? `Failed to load run timeline (${response.status})`);
      }

      if (requestId !== timelineRequestIdRef.current) {
        return;
      }

      setTimeline(data);
    } catch (loadError) {
      if (controller.signal.aborted || requestId !== timelineRequestIdRef.current) {
        return;
      }

      setTimeline(null);
      setTimelineError(loadError instanceof Error ? loadError.message : 'Failed to load run timeline');
    } finally {
      if (requestId === timelineRequestIdRef.current) {
        timelineAbortControllerRef.current = null;
        setTimelineLoading(false);
      }
    }
  }

  async function tryResolvePreferredRun(threadId: string, runId: string, signal: AbortSignal) {
    try {
      const response = await fetch(`/api/runtime-pi/runs/${runId}/timeline`, {
        signal
      });
      const data = (await response.json()) as RunTimelineResponseDto;
      if (!response.ok || !data.run || data.run.threadId !== threadId) {
        return null;
      }

      return data.run;
    } catch {
      return null;
    }
  }

  async function refreshMeta() {
    const response = await fetch('/api/runtime-pi/meta');
    const data = normalizeRuntimeMeta((await readJsonOrEmpty<RuntimePiMetaDto>(response)) as Partial<RuntimePiMetaDto>);
    setMeta(data);
    if (!response.ok) {
      setError(data.runtimeConfigError ?? `Failed to load runtime metadata (${response.status})`);
      return;
    }

    setSelectedModelKey((current) => {
      if (current && data.modelOptions.some((option) => option.key === current)) {
        return current;
      }

      return data.defaultModelKey ?? data.modelOptions[0]?.key ?? '';
    });
  }

  async function loadThreadMessages(threadId: string, options?: { preferredRunId?: string | null }) {
    messagesRequestIdRef.current += 1;
    const requestId = messagesRequestIdRef.current;
    messagesAbortControllerRef.current?.abort();
    const controller = new AbortController();
    messagesAbortControllerRef.current = controller;
    setLoadingMessages(true);
    setRecentRunsLoading(true);
    setRecentRunsError(null);
    try {
      const [messagesResponse, runsResponse] = await Promise.all([
        fetch(`/api/runtime-pi/threads/${threadId}/messages`, {
          signal: controller.signal
        }),
        fetch(`/api/runtime-pi/threads/${threadId}/runs?limit=${RECENT_RUNS_LIMIT}`, {
          signal: controller.signal
        })
      ]);

      const messagesData = (await messagesResponse.json()) as ThreadMessagesResponseDto;
      if (!messagesResponse.ok) {
        throw new Error(messagesData.error ?? `Failed to load messages (${messagesResponse.status})`);
      }

      const runsData = (await readJsonOrEmpty<ThreadRunsResponseDto>(runsResponse)) as ThreadRunsResponseDto;
      if (!runsResponse.ok) {
        throw new Error(runsData.error ?? `Failed to load thread runs (${runsResponse.status})`);
      }

      if (controller.signal.aborted || requestId !== messagesRequestIdRef.current) {
        return;
      }

      const nextMessages = messagesData.messages ?? [];
      let nextRuns = (runsData.runs ?? []).slice().sort(compareRunsByCreatedAt);
      let preferredResolvedRun: RunDto | null = null;

      if (options?.preferredRunId && !nextRuns.some((run) => run.id === options.preferredRunId)) {
        preferredResolvedRun = await tryResolvePreferredRun(threadId, options.preferredRunId, controller.signal);

        if (controller.signal.aborted || requestId !== messagesRequestIdRef.current) {
          return;
        }

        nextRuns = includeSelectedRun(nextRuns, preferredResolvedRun);
      }

      const nextSelectedRunId = chooseInitialRunId(
        nextMessages,
        nextRuns,
        preferredResolvedRun?.id ?? options?.preferredRunId ?? null
      );
      setMessages(nextMessages);
      setRecentRuns(nextRuns);
      setLiveAssistantDraft(null);
      setRecentRunsError(null);
      setRecentRunsLoading(false);
      setError(null);
      await loadRunTimeline(nextSelectedRunId);
      return nextSelectedRunId;
    } catch (loadError) {
      if (controller.signal.aborted || requestId !== messagesRequestIdRef.current) {
        return;
      }

      setRecentRuns([]);
      setRecentRunsLoading(false);
      setRecentRunsError(loadError instanceof Error ? loadError.message : 'Failed to load thread runs');
      setLiveAssistantDraft(null);
      setSelectedRunId(null);
      setTimeline(null);
      setTimelineError(null);
      setError(loadError instanceof Error ? loadError.message : 'Failed to load thread messages');
      return null;
    } finally {
      if (requestId === messagesRequestIdRef.current) {
        messagesAbortControllerRef.current = null;
        setLoadingMessages(false);
      }
    }
  }

  async function createThread() {
    try {
      const response = await fetch('/api/runtime-pi/threads', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ title: newThreadTitle.trim() || undefined })
      });
      const data = (await response.json()) as CreateThreadResponseDto;
      if (!response.ok || !data.thread) {
        throw new Error(data.error ?? `Failed to create thread (${response.status})`);
      }

      setNewThreadTitle('');
      await refreshThreads();
      setSelectedRunId(null);
      setActiveThreadId(data.thread.id);
      await loadThreadMessages(data.thread.id);
      setError(null);
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : 'Failed to create thread');
    }
  }

  async function sendMessage() {
    if (!activeThreadId || !draft.trim() || sending || !selectedModelOption) {
      return;
    }

    const threadId = activeThreadId;
    const text = draft.trim();
    const requestId = sendRequestIdRef.current + 1;
    sendRequestIdRef.current = requestId;
    sendAbortControllerRef.current?.abort();
    const controller = new AbortController();
    sendAbortControllerRef.current = controller;

    let streamedRunId: string | null = null;
    let streamSessionStarted = false;
    let terminalStreamError: string | null = null;
    setSending(true);
    setError(null);
    setLiveStreamRunId(null);
    setLiveAssistantDraft(null);
    timelineRequestIdRef.current += 1;
    timelineAbortControllerRef.current?.abort();
    setSelectedRunId(null);
    setTimeline(null);
    setTimelineLoading(false);
    setTimelineError(null);

    try {
      const response = await fetch(`/api/runtime-pi/runs/${threadId}/stream`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          text,
          provider: selectedModelOption?.provider,
          model: selectedModelOption?.model
        }),
        signal: controller.signal
      });

      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? `runtime-pi request failed (${response.status})`);
      }

      if (!response.body) {
        throw new Error('runtime-pi stream response body is unavailable');
      }

      streamSessionStarted = true;
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }

        if (controller.signal.aborted || requestId !== sendRequestIdRef.current) {
          return;
        }

        buffer += decoder.decode(value, { stream: true });
        const parsed = parseSseChunk(buffer);
        buffer = parsed.remainder;

        for (const event of parsed.events) {
          if (controller.signal.aborted || requestId !== sendRequestIdRef.current) {
            return;
          }

          streamedRunId = event.runId;
          setLiveStreamRunId(event.runId);
          setSelectedRunId(event.runId);
          setTimeline((current) => applyRunStreamEvent(current, event));

          if (event.type === 'run.ready') {
            setDraft('');
            setMessages((current) => upsertMessage(current, event.userMessage));
            setRecentRuns((current) => upsertRun(current, event.run));
            continue;
          }

          if (event.type === 'run.assistant') {
            setLiveAssistantDraft({
              runId: event.runId,
              messageId: event.assistant.messageId,
              partialText: event.assistant.partialText,
              partialReasoning: event.assistant.partialReasoning,
              eventType: event.assistant.eventType
            });
            continue;
          }

          if (event.type === 'run.state' || event.type === 'run.completed') {
            setRecentRuns((current) => upsertRun(current, event.run));
          }

          if (event.type === 'run.failed' && event.run) {
            const failedRun = event.run;
            setRecentRuns((current) => upsertRun(current, failedRun));
          }

          if (event.type === 'run.failed') {
            terminalStreamError = event.error;
            setError(event.error);
            continue;
          }

          if (event.type === 'run.completed') {
            setError(null);
            setLiveAssistantDraft((current) => (current?.runId === event.runId ? null : current));
          }
        }
      }

      const finalChunk = decoder.decode();
      if (finalChunk) {
        const parsed = parseSseChunk(`${buffer}${finalChunk}\n\n`);
        for (const event of parsed.events) {
          streamedRunId = event.runId;
          setLiveStreamRunId(event.runId);
          setSelectedRunId(event.runId);
          setTimeline((current) => applyRunStreamEvent(current, event));
          if (event.type === 'run.ready') {
            setDraft('');
            setMessages((current) => upsertMessage(current, event.userMessage));
            setRecentRuns((current) => upsertRun(current, event.run));
          } else if (event.type === 'run.assistant') {
            setLiveAssistantDraft({
              runId: event.runId,
              messageId: event.assistant.messageId,
              partialText: event.assistant.partialText,
              partialReasoning: event.assistant.partialReasoning,
              eventType: event.assistant.eventType
            });
          } else if (event.type === 'run.failed') {
            setRecentRuns((current) => (event.run ? upsertRun(current, event.run) : current));
            terminalStreamError = event.error;
            setError(event.error);
            setLiveAssistantDraft((current) => (current?.runId === event.runId ? current : null));
          } else if (event.type === 'run.state' || event.type === 'run.completed') {
            setRecentRuns((current) => upsertRun(current, event.run));
            if (event.type === 'run.completed') {
              setLiveAssistantDraft((current) => (current?.runId === event.runId ? null : current));
            }
          }
        }
      }
    } catch (sendError) {
      if (controller.signal.aborted || requestId !== sendRequestIdRef.current) {
        return;
      }

      setError(sendError instanceof Error ? sendError.message : 'Failed to send message');
    } finally {
      if (requestId === sendRequestIdRef.current) {
        sendAbortControllerRef.current = null;
        setSending(false);
        setLiveStreamRunId(null);
      }

      if (!controller.signal.aborted && requestId === sendRequestIdRef.current && (streamSessionStarted || streamedRunId)) {
        if (activeThreadIdRef.current === threadId) {
          await loadThreadMessages(threadId);
        } else {
          await refreshThreads();
        }

        if (terminalStreamError) {
          setError(terminalStreamError);
        }
      }
    }
  }

  useEffect(() => {
    void (async () => {
      try {
        const persistedSelection = readPersistedSelection();
        const nextThreads = await refreshThreads();
        const initialThreadId = chooseInitialThreadId(nextThreads, persistedSelection.threadId);

        if (!initialThreadId) {
          setActiveThreadId(null);
          setMessages([]);
          setRecentRuns([]);
          setSelectedRunId(null);
          setTimeline(null);
          setLiveAssistantDraft(null);
          setDurableRecoveryNotice(null);
          selectionPersistenceReadyRef.current = true;
          persistSelection(null, null);
          return;
        }

        setActiveThreadId(initialThreadId);
        const restoredRunId = await loadThreadMessages(initialThreadId, {
          preferredRunId: persistedSelection.runId
        });
        if (persistedSelection.threadId || persistedSelection.runId) {
          setDurableRecoveryNotice(
            restoredRunId
              ? 'Restored thread and run selection from durable records. Live stream drafts are transient and may not survive refresh.'
              : 'Restored thread selection from durable records. Live stream drafts are transient and may not survive refresh.'
          );
        } else {
          setDurableRecoveryNotice(null);
        }
        persistSelection(initialThreadId, restoredRunId ?? null);
      } catch (refreshError) {
        setError(refreshError instanceof Error ? refreshError.message : 'Failed to load threads');
      } finally {
        selectionPersistenceReadyRef.current = true;
      }
    })();
    void refreshMeta();
  }, []);

  useEffect(
    () => () => {
      sendAbortControllerRef.current?.abort();
      messagesAbortControllerRef.current?.abort();
      timelineAbortControllerRef.current?.abort();
    },
    []
  );

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-[1600px] flex-col gap-4 p-4 lg:p-6">
      <header className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-2">
            <p>
              <Link href="/" className="text-sm font-medium text-sky-700 underline decoration-sky-300 underline-offset-4 hover:text-sky-600">
                Back to browser-local pi experiment
              </Link>
            </p>
            <h1 className="text-2xl font-semibold text-slate-900">runtime-pi durable playground</h1>
            <p className="max-w-4xl text-sm leading-6 text-slate-600">
              This route exercises the real server-side stack: <code>@agent-infra/db</code> persists threads, runs, messages, tool invocations, and run events; <code>@agent-infra/runtime-pi</code> drives the assistant turn.
            </p>
          </div>
          <div className="flex flex-wrap gap-2 text-xs text-slate-500">
            <span className="rounded-full bg-slate-100 px-3 py-1">DB: {meta?.dbMode ?? 'loading'}</span>
            <span className="rounded-full bg-slate-100 px-3 py-1">Provider: {meta?.runtimeProvider ?? 'loading'}</span>
            <span className="rounded-full bg-slate-100 px-3 py-1">Model: {meta?.runtimeModel ?? 'loading'}</span>
          </div>
        </div>

        {meta && !meta.runtimeConfigured ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            {meta.runtimeConfigError ?? 'runtime-pi is not configured'}
          </div>
        ) : null}

        {durableRecoveryNotice ? (
          <div className="flex items-start justify-between gap-3 rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900">
            <p>{durableRecoveryNotice}</p>
            <button
              type="button"
              onClick={() => setDurableRecoveryNotice(null)}
              className="shrink-0 text-xs font-medium uppercase tracking-wide text-sky-700 hover:text-sky-900"
            >
              Dismiss
            </button>
          </div>
        ) : null}

        {error ? <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div> : null}
      </header>

      <section className="grid min-h-[72vh] gap-4 xl:h-[72vh] xl:grid-cols-[280px_minmax(0,1fr)_380px]">
        <aside className="flex min-h-0 flex-col rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="space-y-2">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Threads</h2>
            <input
              value={newThreadTitle}
              onChange={(event) => setNewThreadTitle(event.target.value)}
              placeholder="New thread title (optional)"
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none ring-sky-200 focus:ring"
            />
            <button
              type="button"
              onClick={() => {
                void createThread();
              }}
              className="w-full rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-700"
            >
              + New thread
            </button>
          </div>

          <div className="mt-5 flex-1 overflow-y-auto">
            <ul className="space-y-2">
              {threads.map((thread) => {
                const active = thread.id === activeThreadId;
                return (
                  <li key={thread.id}>
	                    <button
	                      type="button"
	                      onClick={() => {
	                        sendAbortControllerRef.current?.abort();
	                        setSelectedRunId(null);
	                        setActiveThreadId(thread.id);
	                        void loadThreadMessages(thread.id);
	                      }}
                      className={`w-full rounded-md border px-3 py-2 text-left text-sm ${
                        active ? 'border-sky-300 bg-sky-50' : 'border-slate-200 bg-white hover:bg-slate-50'
                      }`}
                    >
                      <p className="truncate font-medium">{thread.title ?? 'Untitled thread'}</p>
                      <p className="truncate text-xs text-slate-500">{thread.id}</p>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        </aside>

        <section className="flex min-h-0 min-w-0 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <header className="flex flex-wrap items-center gap-2 border-b border-slate-200 px-4 py-3 text-sm">
            <span className="rounded-full bg-slate-100 px-3 py-1">Thread: {activeThread?.title ?? activeThreadId ?? 'none'}</span>
            <span className="rounded-full bg-slate-100 px-3 py-1">Model: {selectedModelOption?.model ?? 'none'}</span>
            <span className="rounded-full bg-slate-100 px-3 py-1">Focused run: {selectedRunId ?? 'none'}</span>
            <span className="rounded-full bg-slate-100 px-3 py-1">Stream: {liveStreamRunId ?? 'idle'}</span>
          </header>

          <div className="flex-1 space-y-3 overflow-y-auto bg-slate-50 p-4">
            {loadingMessages ? <p className="text-sm text-slate-500">Loading thread messages...</p> : null}

            {!loadingMessages && messages.length === 0 ? (
              <div className="space-y-4 rounded-2xl border border-dashed border-slate-300 bg-white p-6">
                <div className="space-y-2">
                  <h2 className="text-base font-semibold text-slate-900">Start a durable run</h2>
                  <p className="text-sm leading-6 text-slate-600">
                    Create a thread, then send a prompt. The server will persist user messages, run state, tool invocations, tool results, and run events using the real runtime adapter.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {[
                    'Use getCurrentTime and summarize the result in one short paragraph.',
                    'Call getRuntimeInfo, then explain what runtime is being exercised.',
                    'Use echoText to repeat this sentence, then tell me why the tool was useful.'
                  ].map((prompt) => (
                    <button
                      key={prompt}
                      type="button"
                      onClick={() => setDraft(prompt)}
                      className="rounded-full border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
                    >
                      {prompt}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            {messages.map((message) => (
              <article
                key={message.id}
                className={`max-w-4xl rounded-2xl border p-4 shadow-sm ${
                  message.role === 'user' ? 'ml-auto border-amber-200 bg-amber-50' : 'border-slate-200 bg-white'
                }`}
              >
                <header className="mb-3 flex items-center justify-between gap-3 text-xs font-medium uppercase tracking-wide text-slate-500">
                  <div className="flex items-center gap-2">
                    <span>{message.role}</span>
                    <span className={`rounded-full px-2 py-0.5 text-[10px] ${statusBadgeTone(message.status)}`}>{message.status}</span>
                  </div>
                  <span>{formatDateTime(message.createdAt)}</span>
                </header>
                <div className="space-y-3">{message.parts.map((part) => <div key={part.id}>{formatPart(part)}</div>)}</div>
              </article>
            ))}

            {liveAssistantDraft && liveAssistantDraft.runId === liveStreamRunId ? (
              <article className="max-w-4xl rounded-2xl border border-sky-200 bg-white p-4 shadow-sm">
                <header className="mb-3 flex items-center justify-between gap-3 text-xs font-medium uppercase tracking-wide text-slate-500">
                  <div className="flex items-center gap-2">
                    <span>assistant</span>
                    <span className="rounded-full bg-sky-100 px-2 py-0.5 text-[10px] text-sky-700">streaming</span>
                  </div>
                  <span>{liveAssistantDraft.eventType}</span>
                </header>
                <div className="space-y-3">
                  {liveAssistantDraft.partialReasoning ? (
                    <details className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                      <summary className="cursor-pointer text-xs font-medium uppercase tracking-wide text-slate-500">Reasoning</summary>
                      <pre className="mt-3 overflow-x-auto whitespace-pre-wrap text-xs leading-5 text-slate-600">{liveAssistantDraft.partialReasoning}</pre>
                    </details>
                  ) : null}
                  {liveAssistantDraft.partialText ? (
                    <p className="whitespace-pre-wrap leading-6 text-slate-900">{liveAssistantDraft.partialText}</p>
                  ) : (
                    <p className="text-sm text-slate-500">Assistant is responding...</p>
                  )}
                </div>
              </article>
            ) : null}
          </div>

          <form
            className="border-t border-slate-200 bg-white p-4"
            onSubmit={(event) => {
              event.preventDefault();
              if (!activeThreadId || !draft.trim() || sending || !meta?.runtimeConfigured || !selectedModelOption) {
                return;
              }

              void sendMessage();
            }}
          >
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-3">
                <label className="flex min-w-[18rem] items-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700">
                  <span className="text-slate-500">Model</span>
                  <select
                    value={selectedModelKey}
                    onChange={(event) => setSelectedModelKey(event.target.value)}
                    disabled={sending || !meta || meta.modelOptions.length === 0}
                    className="min-w-0 flex-1 bg-transparent outline-none disabled:cursor-not-allowed"
                  >
                    {meta?.modelOptions.map((option) => (
                      <option key={option.key} value={option.key}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
                <p className="text-xs text-slate-500">{selectedModelOption?.description ?? 'No runtime model is currently configured.'}</p>
              </div>

              <textarea
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                rows={4}
                placeholder={activeThreadId ? 'Send a prompt to runtime-pi...' : 'Create or select a thread first'}
                disabled={!activeThreadId || !meta?.runtimeConfigured || sending || !selectedModelOption}
                className="w-full resize-none rounded-xl border border-slate-300 px-4 py-3 text-sm leading-6 text-slate-900 outline-none ring-sky-200 placeholder:text-slate-400 focus:ring disabled:cursor-not-allowed disabled:bg-slate-50"
              />

              <div className="flex items-center justify-between gap-3">
                <div className="text-xs text-slate-500">
                  {selectedRun?.finishedAt ? `Last run finished ${formatDateTime(selectedRun.finishedAt)}` : 'This page uses durable server-side storage.'}
                </div>
                <button
                  type="submit"
                  disabled={!activeThreadId || !draft.trim() || sending || !meta?.runtimeConfigured || !selectedModelOption}
                  className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:bg-slate-300"
                >
                  {sending ? 'Running...' : 'Send'}
                </button>
              </div>
            </div>
          </form>
        </section>

        <aside className="flex min-h-0 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <header className="border-b border-slate-200 px-4 py-3">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Log</h2>
          </header>

          <section className="space-y-4 border-b border-slate-200 px-4 py-4">
            <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Recent Runs</p>
                  <p className="mt-1 text-sm text-slate-600">Switch the right-side log between durable runs for this thread.</p>
                </div>
                <span className="rounded-full bg-slate-100 px-2 py-1 text-[11px] font-medium text-slate-600">{recentRuns.length}</span>
              </div>

              {recentRunsLoading ? <p className="text-sm text-slate-500">Loading recent runs...</p> : null}
              {recentRunsError ? <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">{recentRunsError}</div> : null}

              {!recentRunsLoading && !recentRunsError && activeThreadId && recentRuns.length === 0 ? (
                <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-3 py-3 text-sm text-slate-500">
                  No runs yet for this thread.
                </div>
              ) : null}

              {!recentRunsLoading && recentRuns.length > 0 ? (
                <div className="max-h-60 space-y-2 overflow-y-auto pr-1">
                  {recentRuns.map((run) => {
                    const selected = run.id === selectedRunId;
                    const live = run.id === liveStreamRunId;

                    return (
                      <button
                        key={run.id}
                        type="button"
                        onClick={() => {
                          void loadRunTimeline(run.id);
                        }}
                        className={`w-full rounded-xl border px-3 py-3 text-left text-sm transition ${
                          selected ? 'border-sky-300 bg-sky-50 shadow-sm' : 'border-slate-200 bg-slate-50 hover:bg-white'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate font-medium text-slate-900">{run.model ?? 'unknown model'}</p>
                            <p className="truncate text-xs text-slate-500">{run.provider ?? 'unknown provider'} · {formatDateTime(run.createdAt)}</p>
                          </div>
                          <div className="flex flex-col items-end gap-1">
                            <span className={`rounded-full px-2 py-1 text-[10px] font-medium uppercase tracking-wide ${statusBadgeTone(run.status)}`}>
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
            </div>

            <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Current Run</p>
                  <p className="mt-1 break-all text-sm font-semibold text-slate-900">{selectedRunId ?? 'No run selected'}</p>
                </div>
                <span className={`rounded-full px-3 py-1 text-xs font-medium uppercase tracking-wide ${statusBadgeTone(selectedRun?.status ?? 'idle')}`}>
                  {selectedRun?.status ?? 'idle'}
                </span>
              </div>

              <dl className="grid grid-cols-2 gap-3 text-sm">
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
                <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">{selectedRun.error}</div>
              ) : null}
            </div>
          </section>

          <div className="min-h-0 flex-1 overflow-y-auto bg-slate-50 px-4 py-4">
            <div className="space-y-5">
              {timelineLoading ? <p className="text-sm text-slate-500">Loading run timeline...</p> : null}
              {timelineError ? <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{timelineError}</div> : null}

              {!timelineLoading && !timelineError && !selectedRunId ? (
                <div className="rounded-xl border border-dashed border-slate-300 bg-white p-4 text-sm text-slate-600">
                  Select a thread or start a run to inspect durable logs.
                </div>
              ) : null}

              {(toolInvocations.length > 0 || selectedRunId) && (
                <section className="space-y-3">
                  <header className="flex items-center justify-between">
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Tools</h3>
                    <span className="text-xs text-slate-400">{toolInvocations.length}</span>
                  </header>
                  <div className="space-y-3">
                    {toolInvocations.length === 0 ? (
                      <div className="rounded-xl border border-dashed border-slate-300 bg-white p-3 text-sm text-slate-500">No tool activity for this run.</div>
                    ) : (
                      toolInvocations.map((invocation) => <ToolRow key={invocation.id} invocation={invocation} />)
                    )}
                  </div>
                </section>
              )}

              {(runEvents.length > 0 || selectedRunId) && (
                <section className="space-y-3">
                  <header className="flex items-center justify-between">
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Events</h3>
                    <span className="text-xs text-slate-400">{runEvents.length}</span>
                  </header>
                  <div className="space-y-3">
                    {runEvents.length === 0 ? (
                      <div className="rounded-xl border border-dashed border-slate-300 bg-white p-3 text-sm text-slate-500">No run events for this run.</div>
                    ) : (
                      runEvents.map((event) => <EventRow key={event.id} event={event} />)
                    )}
                  </div>
                </section>
              )}
            </div>
          </div>
        </aside>
      </section>
    </main>
  );
}
