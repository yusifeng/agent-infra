'use client';

import { useEffect, useState } from 'react';

type Thread = { id: string; title: string | null };
type MessagePart = {
  type: string;
  textValue?: string | null;
  jsonValue?: Record<string, unknown> | null;
};
type Message = { id: string; role: string; parts: MessagePart[] };

function renderPart(part: MessagePart) {
  if (part.type === 'text') return part.textValue ?? '';
  if (part.type === 'tool-call') {
    const json = part.jsonValue ?? {};
    return `Tool Call: ${String(json.toolName ?? 'unknown')} (${String(json.toolCallId ?? 'n/a')}) input=${JSON.stringify(json.input ?? null)}`;
  }
  if (part.type === 'tool-result') {
    const json = part.jsonValue ?? {};
    const payload = json.error ? `error=${JSON.stringify(json.error)}` : `output=${JSON.stringify(json.output ?? null)}`;
    return `Tool Result: ${String(json.toolName ?? 'unknown')} (${String(json.toolCallId ?? 'n/a')}) ${payload}`;
  }
  return JSON.stringify(part);
}

export default function HomePage() {
  const [threads, setThreads] = useState<Thread[]>([]);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState('');

  async function refreshThreads() {
    const res = await fetch('/api/threads');
    const data = await res.json();
    setThreads(data.threads);
  }

  async function createThread() {
    const res = await fetch('/api/threads', { method: 'POST' });
    const data = await res.json();
    const threadId: string = data.thread.id;
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
    const res = await fetch(`/api/runs/${activeThreadId}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text })
    });
    const data = await res.json();
    setMessages(data.messages);
    setText('');
  }

  useEffect(() => {
    void refreshThreads();
  }, []);

  return (
    <main>
      <h1>agent-infra playground</h1>
      <button onClick={createThread}>Create Thread</button>
      <div style={{ marginTop: 12 }}>
        <strong>Threads:</strong>
        <ul>
          {threads.map((thread) => (
            <li key={thread.id}>
              <button
                onClick={() => {
                  setActiveThreadId(thread.id);
                  void loadThreadMessages(thread.id);
                }}
              >
                {thread.title ?? thread.id}
              </button>
            </li>
          ))}
        </ul>
      </div>

      <hr />
      <p>Active thread: {activeThreadId ?? 'none'}</p>
      <textarea value={text} onChange={(e) => setText(e.target.value)} rows={4} style={{ width: '100%' }} />
      <br />
      <button onClick={sendMessage}>Send</button>

      <h3>Messages</h3>
      <ul>
        {messages.map((m) => (
          <li key={m.id}>
            <strong>{m.role}</strong>
            <div>
              {m.parts.map((p, idx) => (
                <p key={idx}>{renderPart(p)}</p>
              ))}
            </div>
          </li>
        ))}
      </ul>
    </main>
  );
}
