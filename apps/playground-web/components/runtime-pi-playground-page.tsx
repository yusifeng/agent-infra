'use client';

import type {
  MessageDto,
  MessagePartDto,
  RunDto,
  RuntimePiCreateThreadResponseDto,
  RuntimePiMessagesResponseDto,
  RuntimePiMetaDto,
  RuntimePiRunResponseDto,
  RuntimePiThreadsResponseDto,
  ThreadDto
} from '@agent-infra/contracts';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';

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
        <pre className="overflow-auto rounded-md bg-slate-900 p-3 text-xs text-slate-100">
          {JSON.stringify(json, null, 2)}
        </pre>
      </div>
    );
  }

  return <pre className="overflow-auto rounded-md bg-slate-900 p-3 text-xs text-slate-100">{JSON.stringify(part, null, 2)}</pre>;
}

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
  const [lastRun, setLastRun] = useState<RunDto | null>(null);
  const [lastRunEventCount, setLastRunEventCount] = useState(0);
  const [lastToolInvocationCount, setLastToolInvocationCount] = useState(0);

  const activeThread = useMemo(() => threads.find((thread) => thread.id === activeThreadId) ?? null, [threads, activeThreadId]);
  const selectedModelOption = useMemo(
    () => meta?.modelOptions.find((option) => option.key === selectedModelKey) ?? meta?.modelOptions[0] ?? null,
    [meta, selectedModelKey]
  );

  async function refreshThreads() {
    const response = await fetch('/api/runtime-pi/threads');
    const data = (await response.json()) as RuntimePiThreadsResponseDto;
    setThreads(data.threads);
  }

  async function refreshMeta() {
    const response = await fetch('/api/runtime-pi/meta');
    const data = normalizeRuntimeMeta((await response.json()) as Partial<RuntimePiMetaDto>);
    setMeta(data);
    setSelectedModelKey((current) => {
      if (current && data.modelOptions.some((option) => option.key === current)) {
        return current;
      }

      return data.defaultModelKey ?? data.modelOptions[0]?.key ?? '';
    });
  }

  async function loadThreadMessages(threadId: string) {
    setLoadingMessages(true);
    try {
      const response = await fetch(`/api/runtime-pi/threads/${threadId}/messages`);
      const data = (await response.json()) as RuntimePiMessagesResponseDto;
      if (!response.ok) {
        throw new Error(data.error ?? `Failed to load messages (${response.status})`);
      }

      setMessages(data.messages ?? []);
      setError(null);
      setLastRun(null);
      setLastRunEventCount(0);
      setLastToolInvocationCount(0);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Failed to load thread messages');
    } finally {
      setLoadingMessages(false);
    }
  }

  async function createThread() {
    const response = await fetch('/api/runtime-pi/threads', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: newThreadTitle.trim() || undefined })
    });
    const data = (await response.json()) as RuntimePiCreateThreadResponseDto;
    setNewThreadTitle('');
    setActiveThreadId(data.thread.id);
    await refreshThreads();
    await loadThreadMessages(data.thread.id);
  }

  async function sendMessage() {
    if (!activeThreadId || !draft.trim() || sending) {
      return;
    }

    setSending(true);
    setError(null);

    try {
      const response = await fetch(`/api/runtime-pi/runs/${activeThreadId}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          text: draft,
          provider: selectedModelOption?.provider,
          model: selectedModelOption?.model
        })
      });

      const data = (await response.json()) as RuntimePiRunResponseDto;
      if (!response.ok) {
        throw new Error(data.error ?? `runtime-pi request failed (${response.status})`);
      }

      setMessages(data.messages);
      setLastRun(data.run);
      setLastRunEventCount(data.runEvents?.length ?? 0);
      setLastToolInvocationCount(data.toolInvocations?.length ?? 0);
      setDraft('');
    } catch (sendError) {
      setError(sendError instanceof Error ? sendError.message : 'Failed to send message');
    } finally {
      setSending(false);
    }
  }

  useEffect(() => {
    void refreshThreads();
    void refreshMeta();
  }, []);

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-7xl flex-col gap-4 p-4 lg:p-6">
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

        {error ? <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div> : null}
      </header>

      <section className="grid min-h-[72vh] gap-4 lg:grid-cols-[300px_minmax(0,1fr)]">
        <aside className="flex flex-col rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
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

        <section className="flex min-w-0 flex-col rounded-xl border border-slate-200 bg-white shadow-sm">
          <header className="flex flex-wrap items-center gap-2 border-b border-slate-200 px-4 py-3 text-sm">
            <span className="rounded-full bg-slate-100 px-3 py-1">Thread: {activeThread?.title ?? activeThreadId ?? 'none'}</span>
            <span className="rounded-full bg-slate-100 px-3 py-1">Run: {lastRun?.status ?? 'idle'}</span>
            <span className="rounded-full bg-slate-100 px-3 py-1">Selected model: {selectedModelOption?.model ?? 'none'}</span>
            <span className="rounded-full bg-slate-100 px-3 py-1">Events: {lastRunEventCount}</span>
            <span className="rounded-full bg-slate-100 px-3 py-1">Tools: {lastToolInvocationCount}</span>
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
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] text-slate-600">{message.status}</span>
                  </div>
                  <span>{formatDateTime(message.createdAt)}</span>
                </header>
                <div className="space-y-3">{message.parts.map((part) => <div key={part.id}>{formatPart(part)}</div>)}</div>
              </article>
            ))}
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
                  {lastRun?.finishedAt ? `Last run finished ${formatDateTime(lastRun.finishedAt)}` : 'This page uses durable server-side storage.'}
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
      </section>
    </main>
  );
}
