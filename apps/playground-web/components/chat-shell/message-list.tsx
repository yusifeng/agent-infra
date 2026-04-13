'use client';

import type { MessageDto, MessagePartDto, RuntimePiMetaDto } from '@agent-infra/contracts';
import clsx from 'clsx';
import { Copy, Loader2, RotateCw, Trash2 } from 'lucide-react';
import type { ComponentType } from 'react';

import { copyMessageToClipboard } from './helpers';
import { AnimatedEmoji } from './shared';
import type { LiveAssistantDraft } from './types';
import { maxWithTW, messageListMinHeight, ui } from './ui';

function WelcomeMessage({ activeThreadId }: { activeThreadId: string | null }) {
  const greeting = (() => {
    const hour = new Date().getHours();
    if (hour < 6) return '夜深了';
    if (hour < 12) return '早上好';
    if (hour < 18) return '下午好';
    return '晚上好';
  })();

  return (
    <div className="flex w-full items-center justify-center p-4">
      <div className="flex w-full max-w-[800px] flex-col items-center gap-4">
        <div className="flex items-center gap-2">
          <AnimatedEmoji emoji="👋" size={40} />
          <h1 className={clsx('my-1 text-[32px]', ui.welcomeTitle)}>
            {activeThreadId ? '继续这个 durable chat' : greeting}
          </h1>
        </div>
        <div className={clsx('max-w-[720px] text-sm leading-7', ui.welcomeDesc)}>
          {activeThreadId
            ? '这里保留真实的 durable thread、run、message 与 tool timeline，只把左侧 threads 和中间聊天区域的视觉对齐到参考实现。'
            : '我是您的 durable chat 助手，请问现在能帮您做什么？'}
        </div>
      </div>
    </div>
  );
}

function MessageActions({
  items,
  align = 'start',
  onActionClick
}: {
  items: Array<{
    disabled?: boolean;
    icon: ComponentType<{ className?: string }>;
    key: string;
    label: string;
  }>;
  align?: 'start' | 'end';
  onActionClick: (key: string) => void;
}) {
  return (
    <div
      className={clsx(
        'pointer-events-none mt-1 flex w-full translate-y-1 opacity-0 transition duration-150 ease-out group-hover:pointer-events-auto group-hover:translate-y-0 group-hover:opacity-100',
        align === 'end' ? 'justify-end' : 'justify-start'
      )}
      data-message-actions="true"
    >
      <div className="flex items-center gap-1">
        {items.map((item) => (
          <button
            key={item.key}
            type="button"
            disabled={item.disabled}
            title={item.label}
            aria-label={item.label}
            onClick={() => {
              if (!item.disabled) {
                onActionClick(item.key);
              }
            }}
            className="flex h-7 w-7 items-center justify-center rounded-md text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <item.icon className="h-[15px] w-[15px]" />
          </button>
        ))}
      </div>
    </div>
  );
}

function MessagePartView({ part, variant = 'assistant' }: { part: MessagePartDto; variant?: 'assistant' | 'user' }) {
  if (part.type === 'text') {
    return (
      <div
        className={clsx(
          'whitespace-pre-wrap text-slate-800',
          variant === 'user' ? 'text-sm leading-relaxed' : 'text-[15px] leading-8'
        )}
      >
        {part.textValue ?? ''}
      </div>
    );
  }

  if (part.type === 'reasoning') {
    return (
      <details className={clsx('rounded-2xl px-4 py-3', ui.reasoning)}>
        <summary className="cursor-pointer text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Reasoning</summary>
        <pre className="mt-3 overflow-x-auto whitespace-pre-wrap text-xs leading-6 text-slate-600">{part.textValue ?? ''}</pre>
      </details>
    );
  }

  if (part.type === 'tool-call') {
    const json = part.jsonValue ?? {};
    return (
      <div className={clsx('space-y-2 rounded-2xl px-4 py-3', ui.toolCall)}>
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-indigo-700">Tool Call · {String(json.toolName ?? 'unknown')}</p>
        <pre className={clsx('overflow-auto rounded-2xl p-3 text-xs', ui.codeBlock)}>
          {JSON.stringify({ toolCallId: json.toolCallId ?? 'n/a', input: json.input ?? null }, null, 2)}
        </pre>
      </div>
    );
  }

  if (part.type === 'tool-result') {
    const json = part.jsonValue ?? {};
    return (
      <div className={clsx('space-y-2 rounded-2xl px-4 py-3', ui.toolResult)}>
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-emerald-700">
          Tool Result · {String(json.toolName ?? 'unknown')}
        </p>
        {part.textValue ? <p className="whitespace-pre-wrap text-sm leading-6 text-slate-700">{part.textValue}</p> : null}
        <pre className={clsx('overflow-auto rounded-2xl p-3 text-xs', ui.codeBlock)}>{JSON.stringify(json, null, 2)}</pre>
      </div>
    );
  }

  return <pre className={clsx('overflow-auto rounded-2xl p-3 text-xs', ui.codeBlock)}>{JSON.stringify(part, null, 2)}</pre>;
}

function MessageCard({ message }: { message: MessageDto }) {
  const isUser = message.role === 'user';
  const userActions = [
    {
      icon: Copy,
      key: 'copy',
      label: 'Copy'
    },
    {
      disabled: true,
      icon: Trash2,
      key: 'delete',
      label: 'Delete'
    }
  ];
  const assistantActions = [
    {
      icon: Copy,
      key: 'copy',
      label: 'Copy'
    },
    {
      disabled: true,
      icon: RotateCw,
      key: 'regenerate',
      label: 'Regenerate'
    },
    {
      disabled: true,
      icon: Trash2,
      key: 'delete',
      label: 'Delete'
    }
  ];

  if (isUser) {
    return (
      <div className={clsx('group relative flex w-full max-w-screen justify-end px-4', ui.messageAppear)}>
        <div className="max-w-[65%]">
          <div className={clsx('relative flex flex-col gap-3 rounded-lg px-3 py-2', ui.userBubble)}>
            <div className="space-y-2">{message.parts.map((part) => <MessagePartView key={part.id} part={part} variant="user" />)}</div>
          </div>
          <MessageActions
            align="end"
            items={userActions}
            onActionClick={(key) => {
              if (key === 'copy') {
                void copyMessageToClipboard(message);
              }
            }}
          />
        </div>
      </div>
    );
  }

  return (
    <div className={clsx('group relative w-[90%] max-w-screen px-4', ui.messageAppear)}>
      <div className={clsx('relative flex flex-col gap-2 pt-1.5', ui.assistantBubble)}>
        <div className="space-y-2">{message.parts.map((part) => <MessagePartView key={part.id} part={part} />)}</div>
      </div>
      <MessageActions
        items={assistantActions}
        onActionClick={(key) => {
          if (key === 'copy') {
            void copyMessageToClipboard(message);
          }
        }}
      />
    </div>
  );
}

function LiveAssistantCard({ liveAssistantDraft }: { liveAssistantDraft: LiveAssistantDraft }) {
  return (
    <div className={clsx('group relative w-[90%] max-w-screen px-4', ui.messageAppear)}>
      <div className={clsx('relative flex flex-col gap-2 pt-1.5', ui.assistantBubble)}>
        {liveAssistantDraft.partialReasoning ? (
          <details className={clsx('rounded-2xl px-4 py-3', ui.reasoning)}>
            <summary className="cursor-pointer text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
              Reasoning
            </summary>
            <pre className="mt-3 overflow-x-auto whitespace-pre-wrap text-xs leading-6 text-slate-600">
              {liveAssistantDraft.partialReasoning}
            </pre>
          </details>
        ) : null}

        {liveAssistantDraft.partialText ? (
          <div className="whitespace-pre-wrap text-[15px] leading-8 text-slate-800">{liveAssistantDraft.partialText}</div>
        ) : (
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>Assistant is responding...</span>
          </div>
        )}

        <div className="flex gap-2 text-[11px] text-slate-400">
          <span>streaming</span>
        </div>
      </div>
    </div>
  );
}

type ChatMessageListProps = {
  meta: RuntimePiMetaDto | null;
  error: string | null;
  durableRecoveryNotice: string | null;
  loadingMessages: boolean;
  activeThreadId: string | null;
  messages: MessageDto[];
  liveAssistantDraft: LiveAssistantDraft | null;
  liveStreamRunId: string | null;
};

export function ChatMessageList({
  meta,
  error,
  durableRecoveryNotice,
  loadingMessages,
  activeThreadId,
  messages,
  liveAssistantDraft,
  liveStreamRunId
}: ChatMessageListProps) {
  return (
    <div className="flex-1 p-6">
      {!meta?.runtimeConfigured && meta?.runtimeConfigError ? (
        <div className={clsx(`${maxWithTW} mx-auto mb-4 w-full rounded-xl px-4 py-3 text-sm`, ui.warningBanner)}>
          {meta.runtimeConfigError}
        </div>
      ) : null}

      {durableRecoveryNotice ? (
        <div className={clsx(`${maxWithTW} mx-auto mb-4 w-full rounded-xl px-4 py-3 text-sm`, ui.infoBanner)}>
          {durableRecoveryNotice}
        </div>
      ) : null}

      {error ? (
        <div className={clsx(`${maxWithTW} mx-auto mb-4 w-full rounded-xl px-4 py-3 text-sm`, ui.errorBanner)}>
          {error}
        </div>
      ) : null}

      {loadingMessages ? (
        <div className={`${maxWithTW} mx-auto w-full`} style={messageListMinHeight}>
          <div className="flex min-h-full items-center">
            <div className="flex items-center gap-3 px-4 py-3 text-sm text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>Loading thread messages...</span>
            </div>
          </div>
        </div>
      ) : messages.length === 0 ? (
        <div className={`${maxWithTW} mx-auto w-full`} style={messageListMinHeight}>
          <div className="flex min-h-full items-center justify-center">
            <WelcomeMessage activeThreadId={activeThreadId} />
          </div>
        </div>
      ) : (
        <div className={`${maxWithTW} mx-auto w-full`} style={messageListMinHeight}>
          <div className="flex flex-col gap-3">
            {messages.map((message) => (
              <MessageCard key={message.id} message={message} />
            ))}
            {liveAssistantDraft && liveAssistantDraft.runId === liveStreamRunId ? (
              <LiveAssistantCard liveAssistantDraft={liveAssistantDraft} />
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}
