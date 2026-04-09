'use client';

import { useEffect, useMemo, useState } from 'react';

type Thread = { id: string; title: string | null };
type MessagePart = {
  type: string;
  textValue?: string | null;
  jsonValue?: Record<string, unknown> | null;
};
type Message = { id: string; role: string; parts: MessagePart[] };
type RuntimeMeta = { aiMode: string; aiProvider: string; aiModel: string; dbMode: string };
type NextAction =
  | {
      kind: 'tool';
      toolInvocationId: string;
      toolCallId: string;
      toolName: string;
      input: Record<string, unknown> | null;
    }
  | null;

function formatPart(part: MessagePart) {
  if (part.type === 'text') {
    return <p className="whitespace-pre-wrap leading-6">{part.textValue ?? ''}</p>;
  }

  if (part.type === 'tool-call') {
    const json = part.jsonValue ?? {};
    return (
      <div className="space-y-2 text-sm">
        <p className="font-medium text-sky-700">Tool Call · {String(json.toolName ?? 'unknown')}</p>
        <pre className="overflow-auto rounded-md bg-slate-900 p-3 text-xs text-slate-100">
          {JSON.stringify({ toolCallId: json.toolCallId ?? 'n/a', input: json.input ?? null }, null, 2)}
        </pre>
      </div>
    );
  }

  if (part.type === 'tool-result') {
    const json = part.jsonValue ?? {};
    return (
      <div className="space-y-2 text-sm">
        <p className="font-medium text-emerald-700">Tool Result · {String(json.toolName ?? 'unknown')}</p>
        <pre className="overflow-auto rounded-md bg-slate-900 p-3 text-xs text-slate-100">
          {JSON.stringify({ toolCallId: json.toolCallId ?? 'n/a', output: json.output ?? null, error: json.error ?? null }, null, 2)}
        </pre>
      </div>
    );
  }

  return <pre className="overflow-auto rounded-md bg-slate-900 p-3 text-xs text-slate-100">{JSON.stringify(part, null, 2)}</pre>;
}

export default function HomePage() {
  const [threads, setThreads] = useState<Thread[]>([]);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState('');
  const [newThreadTitle, setNewThreadTitle] = useState('');
  const [meta, setMeta] = useState<RuntimeMeta | null>(null);
  const [lastToolRoundTripError, setLastToolRoundTripError] = useState<string | null>(null);

  async function refreshThreads() {
    const res = await fetch('/api/threads');
    const data = await res.json();
    setThreads(data.threads);
  }

  async function refreshMeta() {
    const res = await fetch('/api/meta');
    const data = await res.json();
    setMeta(data);
  }

  async function createThread() {
    const res = await fetch('/api/threads', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: newThreadTitle.trim() || undefined })
    });
    const data = await res.json();
    const threadId: string = data.thread.id;
    setNewThreadTitle('');
    setActiveThreadId(threadId);
    await refreshThreads();
    await loadThreadMessages(threadId);
  }

  async function loadThreadMessages(threadId: string) {
    const res = await fetch(`/api/threads/${threadId}/messages`);
    const data = await res.json();
    setMessages(data.messages);
  }

  async function sendMessage() {
    if (!activeThreadId || !text.trim()) return;
    setLastToolRoundTripError(null);
    const res = await fetch(`/api/runs/${activeThreadId}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text })
    });
    const data = await res.json();
    setMessages(data.messages);

    // ReAct loop: keep executing tools until the server stops returning nextAction.
    let nextAction: NextAction = data.nextAction ?? null;
    let runId: string = data.runId;
    while (nextAction?.kind === 'tool') {
      // Simulate client-side tool execution, then send tool-result back to server (ReAct-style multi-request run).
      let output: Record<string, unknown> | null = null;
      let error: string | null = null;
      try {
        if (nextAction.toolName === 'getCurrentTime') {
          output = { now: new Date().toISOString() };
        } else {
          error = `Unknown tool: ${nextAction.toolName}`;
        }
      } catch (e) {
        error = e instanceof Error ? e.message : 'tool execution failed';
      }

      const r2 = await fetch(`/api/runs/${activeThreadId}/${runId}/tool-result`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          toolInvocationId: nextAction.toolInvocationId,
          toolCallId: nextAction.toolCallId,
          toolName: nextAction.toolName,
          output,
          error
        })
      });
      const d2 = await r2.json();
      if (!r2.ok) {
        setLastToolRoundTripError(`tool-result failed (${r2.status}): ${JSON.stringify(d2)}`);
        break;
      }
      setMessages(d2.messages);
      nextAction = (d2.nextAction ?? null) as NextAction;
      runId = d2.runId ?? runId;
    }

    setText('');
  }

  const activeThread = useMemo(() => threads.find((thread) => thread.id === activeThreadId), [threads, activeThreadId]);

  useEffect(() => {
    void refreshThreads();
    void refreshMeta();
  }, []);

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-7xl gap-4 p-4 lg:p-6">
      <aside className="w-full max-w-xs rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h1 className="text-lg font-semibold">agent-infra playground</h1>
        <p className="mt-1 text-sm text-slate-500">Zero-config demo workspace</p>

        <div className="mt-4 space-y-2">
          <input
            value={newThreadTitle}
            onChange={(e) => setNewThreadTitle(e.target.value)}
            placeholder="New thread title (optional)"
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none ring-sky-200 focus:ring"
          />
          <button
            onClick={createThread}
            className="w-full rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-700"
          >
            + New thread
          </button>
        </div>

        <div className="mt-5">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Threads</p>
          <ul className="space-y-2">
            {threads.map((thread) => {
              const active = thread.id === activeThreadId;
              return (
                <li key={thread.id}>
                  <button
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

      <section className="flex min-w-0 flex-1 flex-col rounded-xl border border-slate-200 bg-white shadow-sm">
        <header className="flex flex-wrap items-center gap-2 border-b border-slate-200 px-4 py-3 text-sm">
          <span className="rounded-full bg-slate-100 px-3 py-1">Thread: {activeThread?.title ?? activeThreadId ?? 'none'}</span>
          <span className="rounded-full bg-slate-100 px-3 py-1">AI: {meta ? `${meta.aiMode}/${meta.aiProvider}` : 'loading'}</span>
          <span className="rounded-full bg-slate-100 px-3 py-1">Model: {meta?.aiModel ?? 'loading'}</span>
          <span className="rounded-full bg-slate-100 px-3 py-1">DB: {meta?.dbMode ?? 'loading'}</span>
        </header>

        <div className="flex-1 space-y-3 overflow-y-auto p-4">
          {messages.length === 0 ? (
            <p className="text-sm text-slate-500">No messages yet. Create/select a thread and send a message.</p>
          ) : (
            messages.map((message) => (
              <article
                key={message.id}
                className={`max-w-3xl rounded-xl border p-3 ${
                  message.role === 'user' ? 'ml-auto border-sky-200 bg-sky-50' : 'border-slate-200 bg-slate-50'
                }`}
              >
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">{message.role}</p>
                <div className="space-y-3">{message.parts.map((part, idx) => <div key={idx}>{formatPart(part)}</div>)}</div>
              </article>
            ))
          )}
        </div>

        <footer className="border-t border-slate-200 p-4">
          {lastToolRoundTripError ? (
            <div className="mb-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              {lastToolRoundTripError}
            </div>
          ) : null}
          <div className="flex gap-2">
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={3}
              placeholder={activeThreadId ? 'Type your message...' : 'Create a thread first'}
              className="flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm outline-none ring-sky-200 focus:ring"
            />
            <button
              onClick={sendMessage}
              disabled={!activeThreadId || !text.trim()}
              className="rounded-md bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-500 disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              Send
            </button>
          </div>
        </footer>
      </section>
    </main>
  );
}
