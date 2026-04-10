'use client';

import type { AgentMessage } from '@mariozechner/pi-agent-core';
import type { ImageContent, ToolCall, ToolResultMessage } from '@mariozechner/pi-ai';
import Link from 'next/link';
import { useEffect, useState } from 'react';

import { usePiNarrowRuntime, type ProviderSettingsState } from '@/lib/pi-narrow/use-pi-narrow-runtime';

const PI_WEB_UI_STYLESHEET_ID = 'agent-infra-pi-narrow-web-ui-stylesheet';
const PI_WEB_UI_STYLESHEET_HREF = '/pi-narrow/pi-web-ui.css';

type TranscriptEntry = {
  key: string;
  message: AgentMessage;
  streaming: boolean;
};

function loadPiWebUiStyles(): Promise<() => void> {
  if (typeof document === 'undefined') {
    return Promise.resolve(() => {});
  }

  const existing = document.getElementById(PI_WEB_UI_STYLESHEET_ID) as HTMLLinkElement | null;
  if (existing) {
    return Promise.resolve(() => {});
  }

  return new Promise((resolve, reject) => {
    const link = document.createElement('link');
    link.id = PI_WEB_UI_STYLESHEET_ID;
    link.rel = 'stylesheet';
    link.href = PI_WEB_UI_STYLESHEET_HREF;

    const cleanup = () => {
      link.removeEventListener('load', handleLoad);
      link.removeEventListener('error', handleError);
    };

    const handleLoad = () => {
      cleanup();
      resolve(() => {
        link.remove();
      });
    };

    const handleError = () => {
      cleanup();
      link.remove();
      reject(new Error('Unable to load pi-web-ui dialog styles.'));
    };

    link.addEventListener('load', handleLoad);
    link.addEventListener('error', handleError);
    document.head.append(link);
  });
}

function normalizeText(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function formatTimestamp(timestamp?: number): string {
  if (!timestamp) {
    return '';
  }

  return new Intl.DateTimeFormat(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    month: 'short',
    day: 'numeric'
  }).format(new Date(timestamp));
}

function getUserBlocks(content: unknown): Array<{ type: 'text'; value: string } | { type: 'image'; value: string }> {
  if (typeof content === 'string') {
    return content ? [{ type: 'text', value: content }] : [];
  }

  if (!Array.isArray(content)) {
    return [];
  }

  const blocks: Array<{ type: 'text'; value: string } | { type: 'image'; value: string }> = [];

  for (const block of content) {
    if (!block || typeof block !== 'object' || !('type' in block)) {
      continue;
    }

    if (block.type === 'text' && typeof block.text === 'string') {
      blocks.push({ type: 'text', value: block.text });
      continue;
    }

    if (block.type === 'image' && typeof (block as ImageContent).mimeType === 'string') {
      blocks.push({ type: 'image', value: (block as ImageContent).mimeType });
    }
  }

  return blocks;
}

function getToolResultText(message: ToolResultMessage<any>): string {
  return message.content
    .filter((block): block is { type: 'text'; text: string } => block.type === 'text')
    .map((block) => block.text)
    .join('\n')
    .trim();
}

function renderMessage(entry: TranscriptEntry) {
  const { message, streaming } = entry;

  if (message.role === 'user') {
    const blocks = getUserBlocks(message.content);

    return (
      <article key={entry.key} className="ml-auto flex w-full max-w-3xl flex-col rounded-2xl border border-amber-200 bg-amber-50 p-4 shadow-sm">
        <header className="mb-3 flex items-center justify-between gap-3 text-xs font-medium uppercase tracking-wide text-amber-800">
          <span>User</span>
          <span>{formatTimestamp(message.timestamp)}</span>
        </header>
        <div className="space-y-3 text-sm leading-6 text-slate-800">
          {blocks.length === 0 ? <p className="text-slate-500">Empty message</p> : null}
          {blocks.map((block, index) =>
            block.type === 'text' ? (
              <p key={index} className="whitespace-pre-wrap">
                {block.value}
              </p>
            ) : (
              <div key={index} className="rounded-xl border border-amber-200 bg-white px-3 py-2 text-xs text-slate-600">
                Image attachment placeholder · {block.value}
              </div>
            )
          )}
        </div>
      </article>
    );
  }

  if (message.role === 'assistant') {
    return (
      <article key={entry.key} className="flex w-full max-w-4xl flex-col rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <header className="mb-3 flex items-center justify-between gap-3 text-xs font-medium uppercase tracking-wide text-slate-500">
          <div className="flex items-center gap-2">
            <span>Assistant</span>
            {streaming ? <span className="rounded-full bg-sky-100 px-2 py-0.5 text-[10px] text-sky-700">Streaming</span> : null}
            {message.stopReason === 'toolUse' ? (
              <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-[10px] text-indigo-700">Tool step</span>
            ) : null}
          </div>
          <span>{formatTimestamp(message.timestamp)}</span>
        </header>
        <div className="space-y-3 text-sm leading-6 text-slate-700">
          {message.content.map((block, index) => {
            if (block.type === 'text') {
              return (
                <p key={index} className="whitespace-pre-wrap">
                  {block.text}
                </p>
              );
            }

            if (block.type === 'thinking') {
              return (
                <details key={index} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                  <summary className="cursor-pointer text-xs font-medium uppercase tracking-wide text-slate-500">Reasoning trace</summary>
                  <pre className="mt-3 overflow-x-auto whitespace-pre-wrap text-xs leading-5 text-slate-600">{block.thinking}</pre>
                </details>
              );
            }

            const toolCall = block as ToolCall;
            return (
              <div key={index} className="rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-3">
                <div className="text-xs font-medium uppercase tracking-wide text-indigo-700">Tool call · {toolCall.name}</div>
                <pre className="mt-2 overflow-x-auto rounded-lg bg-slate-900 p-3 text-xs text-slate-100">
                  {JSON.stringify(toolCall.arguments ?? {}, null, 2)}
                </pre>
              </div>
            );
          })}
          {message.stopReason === 'error' && message.errorMessage ? (
            <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{message.errorMessage}</div>
          ) : null}
        </div>
      </article>
    );
  }

  if (message.role === 'toolResult') {
    const toolText = getToolResultText(message);

    return (
      <article
        key={entry.key}
        className={`flex w-full max-w-4xl flex-col rounded-2xl border p-4 shadow-sm ${
          message.isError ? 'border-rose-200 bg-rose-50' : 'border-emerald-200 bg-emerald-50'
        }`}
      >
        <header
          className={`mb-3 flex items-center justify-between gap-3 text-xs font-medium uppercase tracking-wide ${
            message.isError ? 'text-rose-700' : 'text-emerald-700'
          }`}
        >
          <span>Tool result · {message.toolName}</span>
          <span>{formatTimestamp(message.timestamp)}</span>
        </header>
        <div className="space-y-3 text-sm leading-6 text-slate-700">
          {toolText ? <p className="whitespace-pre-wrap">{toolText}</p> : null}
          {message.details !== undefined ? (
            <pre className="overflow-x-auto rounded-lg bg-slate-900 p-3 text-xs text-slate-100">
              {JSON.stringify(message.details, null, 2)}
            </pre>
          ) : null}
          {message.isError && !toolText ? <p>The tool returned an error.</p> : null}
        </div>
      </article>
    );
  }

  return (
    <article key={entry.key} className="flex w-full max-w-4xl flex-col rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <header className="mb-3 flex items-center justify-between gap-3 text-xs font-medium uppercase tracking-wide text-slate-500">
        <span>Unknown message</span>
      </header>
      <pre className="overflow-x-auto rounded-lg bg-slate-900 p-3 text-xs text-slate-100">{JSON.stringify(message, null, 2)}</pre>
    </article>
  );
}

export default function PiNarrowExperimentPage() {
  const {
    status,
    error,
    warning,
    input,
    setInput,
    agentState,
    modelOptions,
    selectedModelKey,
    providerSettings,
    sendMessage,
    abort,
    selectModel,
    createNewSession,
    openSavedSessions,
    saveProviderKey,
    saveProxySettings,
    currentSessionId
  } = usePiNarrowRuntime();

  const [styleError, setStyleError] = useState<string | null>(null);
  const [providerSettingsOpen, setProviderSettingsOpen] = useState(false);
  const [providerDraft, setProviderDraft] = useState<ProviderSettingsState>(providerSettings);
  const [savingProviderSettings, setSavingProviderSettings] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let disposeStyles: (() => void) | null = null;

    async function bootstrapStyles() {
      try {
        disposeStyles = await loadPiWebUiStyles();
      } catch (stylesheetError) {
        if (cancelled) {
          return;
        }

        const message = stylesheetError instanceof Error ? stylesheetError.message : 'Unknown stylesheet error';
        setStyleError(message);
      }
    }

    void bootstrapStyles();

    return () => {
      cancelled = true;
      disposeStyles?.();
    };
  }, []);

  useEffect(() => {
    setProviderDraft(providerSettings);
  }, [providerSettings]);

  const transcript: TranscriptEntry[] = [];
  if (agentState) {
    transcript.push(...agentState.messages.map((message, index) => ({ key: `${message.role}:${message.timestamp}:${index}`, message, streaming: false })));
    if (agentState.streamingMessage) {
      transcript.push({
        key: `streaming:${agentState.streamingMessage.timestamp}:${agentState.messages.length}`,
        message: agentState.streamingMessage,
        streaming: true
      });
    }
  }

  const isReady = status === 'ready';
  const isStreaming = agentState?.isStreaming ?? false;
  const canSend = isReady && !isStreaming && normalizeText(input).length > 0;
  const shortSessionId = currentSessionId ? currentSessionId.slice(0, 8) : 'loading';

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-7xl flex-col gap-4 p-4 lg:p-6">
      <header className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <p>
          <Link href="/" className="text-sm font-medium text-sky-700 underline decoration-sky-300 underline-offset-4 hover:text-sky-600">
            Back to agent-infra demo
          </Link>
        </p>

        <div className="space-y-2">
          <h1 className="text-2xl font-semibold text-slate-900">pi-web-ui narrow experiment</h1>
          <p className="max-w-4xl text-sm leading-6 text-slate-600">
            This route keeps the experiment browser-local and focused: <code>pi-agent-core</code> runs the agent loop, <code>pi-ai</code> provides the faux and real models, and a narrow slice of <code>pi-web-ui</code> handles IndexedDB storage plus provider and session dialogs.
          </p>
          <p className="max-w-4xl text-sm leading-6 text-slate-600">
            It does not write into the existing <code>agent-infra</code> durable persistence. Sessions, provider keys, and settings stay in browser IndexedDB for this evaluation pass.
          </p>
        </div>

        <div className="flex flex-wrap gap-2 text-xs text-slate-500">
          <span className="rounded-full bg-slate-100 px-3 py-1">Session {shortSessionId}</span>
          <span className="rounded-full bg-slate-100 px-3 py-1">{isStreaming ? 'Agent running' : isReady ? 'Ready' : 'Bootstrapping'}</span>
          <span className="rounded-full bg-slate-100 px-3 py-1">Storage: IndexedDB</span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => {
              void createNewSession();
            }}
            disabled={!isReady || isStreaming}
            className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-400"
          >
            New local session
          </button>
          <button
            type="button"
            onClick={openSavedSessions}
            disabled={!isReady}
            className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-400"
          >
            Saved sessions
          </button>
          <button
            type="button"
            onClick={() => setProviderSettingsOpen(true)}
            disabled={!isReady}
            className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-400"
          >
            Provider settings
          </button>
          <label className="flex items-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700">
            <span className="text-slate-500">Model</span>
            <select
              value={selectedModelKey}
              onChange={(event) => {
                void selectModel(event.target.value);
              }}
              disabled={!isReady || isStreaming}
              className="min-w-52 bg-transparent outline-none disabled:cursor-not-allowed"
            >
              {modelOptions.map((option) => (
                <option key={option.key} value={option.key}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        {styleError ? <p className="text-xs text-amber-700">{styleError} The page still works, but pi dialog styling may be incomplete.</p> : null}
        {error ? <p className="text-sm text-rose-700">{error}</p> : null}
        {warning ? <p className="text-sm text-amber-700">{warning}</p> : null}
      </header>

      <section className="flex min-h-[72vh] flex-1 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-4 py-3">
          <p className="text-sm text-slate-500">
            Enter your DeepSeek API key in Provider settings, select a DeepSeek model, then start chatting. Sessions stay browser-local in IndexedDB.
          </p>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto bg-slate-50 p-4">
          {status === 'loading' ? <div className="rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-500">Bootstrapping the pi runtime...</div> : null}

          {status === 'error' ? <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">Failed to start the narrow pi experiment.</div> : null}

          {status === 'ready' && transcript.length === 0 ? (
            <div className="space-y-4 rounded-2xl border border-dashed border-slate-300 bg-white p-6">
              <div className="space-y-2">
                <h2 className="text-base font-semibold text-slate-900">Start with a quick check</h2>
                <p className="text-sm leading-6 text-slate-600">
                  This route keeps the transcript local and saves sessions into IndexedDB. Configure a browser-local DeepSeek key, then pick <code>deepseek-chat</code> or <code>deepseek-reasoner</code>.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {['用一句话解释这个页面是做什么的。', '给我 3 条测试提示词，用来验证 deepseek-chat。', '用条列总结一下当前会话的目标。'].map((prompt) => (
                  <button
                    key={prompt}
                    type="button"
                    onClick={() => setInput(prompt)}
                    className="rounded-full border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {transcript.map((entry) => renderMessage(entry))}
        </div>

        <form
          className="border-t border-slate-200 bg-white p-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (!canSend) {
              return;
            }

            void sendMessage();
          }}
        >
          <div className="space-y-3">
            <textarea
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault();
                  if (canSend) {
                    void sendMessage();
                  }
                }
              }}
              placeholder="Send a prompt to the narrow pi experiment..."
              disabled={!isReady}
              rows={4}
              className="w-full resize-none rounded-xl border border-slate-300 px-4 py-3 text-sm leading-6 text-slate-900 outline-none ring-sky-200 placeholder:text-slate-400 focus:ring disabled:cursor-not-allowed disabled:bg-slate-50"
            />

            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="text-xs text-slate-500">
                {agentState?.pendingToolCalls.size ? `${agentState.pendingToolCalls.size} tool call running` : 'Messages and sessions stay in browser-local storage.'}
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={abort}
                  disabled={!isStreaming}
                  className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-400"
                >
                  Stop
                </button>
                <button
                  type="submit"
                  disabled={!canSend}
                  className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:bg-slate-300"
                >
                  {isStreaming ? 'Running...' : 'Send'}
                </button>
              </div>
            </div>
          </div>
        </form>
      </section>

      {providerSettingsOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4">
          <div className="w-full max-w-2xl rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-2">
                <h2 className="text-lg font-semibold text-slate-900">Provider settings</h2>
                <p className="text-sm leading-6 text-slate-600">
                  These keys stay in browser IndexedDB for this experiment. Real provider calls depend on browser/CORS behavior; the optional proxy can be used to route requests through a local compatible gateway.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setProviderDraft(providerSettings);
                  setProviderSettingsOpen(false);
                }}
                className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Close
              </button>
            </div>

            <div className="mt-6 space-y-5">
              {[
                { provider: 'openai', label: 'OpenAI API key', value: providerDraft.openaiKey },
                { provider: 'anthropic', label: 'Anthropic API key', value: providerDraft.anthropicKey },
                { provider: 'google', label: 'Google API key', value: providerDraft.googleKey },
                { provider: 'deepseek', label: 'DeepSeek API key', value: providerDraft.deepseekKey }
              ].map((entry) => (
                <label key={entry.provider} className="block space-y-2">
                  <span className="text-sm font-medium text-slate-700">{entry.label}</span>
                  <input
                    type="password"
                    value={entry.value}
                    onChange={(event) => {
                      const nextValue = event.target.value;
                      setProviderDraft((current) =>
                        entry.provider === 'openai'
                          ? { ...current, openaiKey: nextValue }
                          : entry.provider === 'anthropic'
                            ? { ...current, anthropicKey: nextValue }
                            : entry.provider === 'google'
                              ? { ...current, googleKey: nextValue }
                              : { ...current, deepseekKey: nextValue }
                      );
                    }}
                    placeholder="Enter key or leave blank to remove"
                    className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm text-slate-900 outline-none ring-sky-200 placeholder:text-slate-400 focus:ring"
                  />
                </label>
              ))}

              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <label className="flex items-center gap-3 text-sm font-medium text-slate-700">
                  <input
                    type="checkbox"
                    checked={providerDraft.proxyEnabled}
                    onChange={(event) =>
                      setProviderDraft((current) => ({
                        ...current,
                        proxyEnabled: event.target.checked
                      }))
                    }
                    className="size-4 rounded border-slate-300 text-slate-900"
                  />
                  Enable proxy rewriting
                </label>
                <label className="mt-4 block space-y-2">
                  <span className="text-sm font-medium text-slate-700">Proxy base URL</span>
                  <input
                    type="text"
                    value={providerDraft.proxyUrl}
                    onChange={(event) =>
                      setProviderDraft((current) => ({
                        ...current,
                        proxyUrl: event.target.value
                      }))
                    }
                    placeholder="http://localhost:3001"
                    className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm text-slate-900 outline-none ring-sky-200 placeholder:text-slate-400 focus:ring"
                  />
                </label>
              </div>
            </div>

            <div className="mt-6 flex flex-wrap items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setProviderDraft(providerSettings);
                  setProviderSettingsOpen(false);
                }}
                className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={savingProviderSettings}
                onClick={() => {
                  void (async () => {
                    setSavingProviderSettings(true);
                    try {
                      await saveProviderKey('openai', providerDraft.openaiKey);
                      await saveProviderKey('anthropic', providerDraft.anthropicKey);
                      await saveProviderKey('google', providerDraft.googleKey);
                      await saveProviderKey('deepseek', providerDraft.deepseekKey);
                      await saveProxySettings(providerDraft.proxyEnabled, providerDraft.proxyUrl);
                      setProviderSettingsOpen(false);
                    } finally {
                      setSavingProviderSettings(false);
                    }
                  })();
                }}
                className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:bg-slate-300"
              >
                {savingProviderSettings ? 'Saving...' : 'Save settings'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
