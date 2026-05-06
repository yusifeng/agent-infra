'use client';

import type { MessageDto, MessagePartDto, RuntimePiMetaDto } from '@agent-infra/contracts';
import { emitChatRenderDiagnostic, getMessageRenderKey } from '@agent-infra/durable-chat-client';
import clsx from 'clsx';
import { Atom, ChevronDown, ChevronRight, Copy, Loader2, RotateCw, Trash2 } from 'lucide-react';
import { memo, useEffect, useRef, useState, type ComponentType, type CSSProperties } from 'react';

import { copyMessageToClipboard, copyTextToClipboard, messagePartHasVisibleContent } from './helpers';
import { MarkdownRenderer } from './markdown-renderer';
import { AnimatedEmoji } from './shared';
import { maxWithTW, messageListMinHeight, ui } from './ui';
import type { LiveAssistantDraft } from '@/features/durable-chat/types/live-assistant-draft';
import type { DurableRecoveryState } from '@/features/durable-chat/types/runtime';

const transcriptRowPerformanceStyle: CSSProperties = {
  containIntrinsicSize: '180px',
  contentVisibility: 'auto'
};

const reasoningMarkdownClassName = 'text-sm leading-7 text-slate-400';

function useRenderDiagnostic(component: string, key: string, summary: Record<string, unknown>) {
  const mountedRef = useRef(false);
  const previousSummaryRef = useRef<Record<string, unknown> | null>(null);
  const latestSummaryRef = useRef(summary);
  latestSummaryRef.current = summary;

  useEffect(() => {
    emitChatRenderDiagnostic({
      component,
      key,
      phase: 'mount',
      summary: latestSummaryRef.current
    });
    mountedRef.current = true;
    previousSummaryRef.current = latestSummaryRef.current;

    return () => {
      emitChatRenderDiagnostic({
        component,
        key,
        phase: 'unmount',
        summary: latestSummaryRef.current
      });
    };
  }, [component, key]);

  useEffect(() => {
    if (!mountedRef.current) {
      return;
    }

    const previousSummary = previousSummaryRef.current;
    if (!previousSummary) {
      previousSummaryRef.current = summary;
      return;
    }

    const keys = new Set([...Object.keys(previousSummary), ...Object.keys(summary)]);
    const changedKeys = [...keys].filter((currentKey) => previousSummary[currentKey] !== summary[currentKey]);
    if (changedKeys.length > 0) {
      emitChatRenderDiagnostic({
        component,
        key,
        phase: 'update',
        changedKeys,
        summary
      });
    }
    previousSummaryRef.current = summary;
  });
}

const WelcomeMessage = memo(function WelcomeMessage({ activeThreadId }: { activeThreadId: string | null }) {
  return (
    <div className="flex w-full items-center justify-center px-4 py-2">
      <div className="flex w-full max-w-[800px] flex-col items-center gap-3 text-center">
        {activeThreadId ? <AnimatedEmoji emoji="👋" size={40} /> : null}
        <h1 className={clsx('my-1 text-[32px]', ui.welcomeTitle)}>
          {activeThreadId ? '继续这个 durable chat' : '我能帮什么忙吗，朋友？'}
        </h1>
        {activeThreadId ? (
          <div className={clsx('max-w-[720px] text-sm leading-7', ui.welcomeDesc)}>
            这里保留真实的 durable thread、run、message 与 tool timeline，只把左侧 threads 和中间聊天区域的视觉对齐到参考实现。
          </div>
        ) : null}
      </div>
    </div>
  );
});

const ReasoningPanel = memo(function ReasoningPanel({
  content,
  thinking = false
}: {
  content: string;
  thinking?: boolean;
}) {
  const [expanded, setExpanded] = useState(thinking);
  const contentRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (thinking) {
      setExpanded(true);
    }
  }, [thinking]);

  useEffect(() => {
    if (!thinking || !expanded) {
      return;
    }

    const element = contentRef.current;
    if (!element) {
      return;
    }

    const distanceToBottom = element.scrollHeight - element.scrollTop - element.clientHeight;
    if (distanceToBottom < 120) {
      window.requestAnimationFrame(() => {
        element.scrollTop = element.scrollHeight;
      });
    }
  }, [content, thinking, expanded]);

  return (
    <div className="overflow-hidden" data-reasoning-panel="true">
      <button
        type="button"
        onClick={() => setExpanded((current) => !current)}
        className="flex w-full items-center justify-between gap-3 py-1 text-left"
        aria-expanded={expanded}
      >
        <div className="flex min-w-0 items-center gap-2.5">
          <Atom className={clsx('h-4 w-4 text-indigo-500', thinking && 'animate-pulse')} />
          <span className="truncate text-sm font-medium text-slate-600">
            {thinking ? '思考中...' : '已思考'}
          </span>
        </div>
        {expanded ? <ChevronDown className="h-4 w-4 text-slate-400" /> : <ChevronRight className="h-4 w-4 text-slate-400" />}
      </button>

      {expanded ? (
        <div ref={contentRef} className="mt-2 max-h-80 overflow-y-auto border-l border-slate-200 pl-4">
          {content ? (
            <MarkdownRenderer
              className={reasoningMarkdownClassName}
              plainTextClassName={reasoningMarkdownClassName}
              text={content}
            />
          ) : (
            <div className="text-sm italic leading-7 text-slate-400">思考中...</div>
          )}
        </div>
      ) : null}
    </div>
  );
});

const MessageActions = memo(function MessageActions({
  available = true,
  items,
  align = 'start',
  onActionClick
}: {
  available?: boolean;
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
        'absolute inset-x-0 bottom-0 flex w-full px-4',
        available
          ? 'pointer-events-none translate-y-1 opacity-0 transition duration-150 ease-out group-hover:pointer-events-auto group-hover:translate-y-0 group-hover:opacity-100'
          : 'pointer-events-none invisible',
        align === 'end' ? 'justify-end' : 'justify-start'
      )}
      data-message-actions="true"
      data-message-actions-available={available ? 'true' : 'false'}
    >
      <div className="flex items-center gap-1">
        {items.map((item) => (
          <button
            key={item.key}
            type="button"
            disabled={!available || item.disabled}
            title={item.label}
            aria-label={item.label}
            onClick={() => {
              if (available && !item.disabled) {
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
});

const MessagePartView = memo(function MessagePartView({
  part,
  variant = 'assistant',
  cacheKey
}: {
  part: MessagePartDto;
  variant?: 'assistant' | 'user';
  cacheKey?: string;
}) {
  if (part.type === 'text') {
    const textValue = part.textValue ?? '';
    return (
      variant === 'user'
        ? (
          <div className="whitespace-pre-wrap break-words text-sm leading-relaxed text-slate-800">
            {textValue}
          </div>
        )
        : (
          <MarkdownRenderer
            cacheKey={cacheKey}
            className="text-[15px] leading-[1.9] text-slate-800"
            plainTextClassName="text-[15px] leading-[1.9] text-slate-800"
            text={textValue}
          />
        )
    );
  }

  if (part.type === 'reasoning') {
    return <ReasoningPanel content={part.textValue ?? ''} />;
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
});

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

const AssistantTranscriptCard = memo(function AssistantTranscriptCard(
  props:
    | {
        type: 'persisted';
        message: MessageDto;
      }
    | {
        type: 'live';
        liveAssistantDraft: LiveAssistantDraft;
      }
) {
  const assistantDiagnosticKey = props.type === 'persisted' ? getMessageRenderKey(props.message) : props.liveAssistantDraft.messageId;
  useRenderDiagnostic(
    props.type === 'persisted' ? 'PersistedAssistantCard' : 'LiveAssistantCard',
    assistantDiagnosticKey,
    props.type === 'persisted'
      ? {
          messageId: props.message.id,
          partSignature: props.message.parts.map((part) => `${part.partIndex}:${part.type}:${part.textValue?.length ?? 0}`).join('|'),
          renderKey: assistantDiagnosticKey,
          runId: props.message.runId ?? '',
          seq: props.message.seq,
          status: props.message.status
        }
      : {
          eventType: props.liveAssistantDraft.eventType,
          messageId: props.liveAssistantDraft.messageId,
          partialReasoningLength: props.liveAssistantDraft.partialReasoning?.length ?? 0,
          partialTextLength: props.liveAssistantDraft.partialText.length,
          runId: props.liveAssistantDraft.runId ?? ''
        }
  );

  const isCompleted = props.type === 'persisted' ? true : props.liveAssistantDraft.eventType === 'text_end';
  const hasVisibleContent =
    props.type === 'persisted'
      ? props.message.parts.some(messagePartHasVisibleContent)
      : Boolean(props.liveAssistantDraft.partialText || props.liveAssistantDraft.partialReasoning);

  if (!hasVisibleContent) {
    return null;
  }

  const handleCopy = () => {
    if (props.type === 'persisted') {
      void copyMessageToClipboard(props.message);
      return;
    }

    const copyValue = [props.liveAssistantDraft.partialReasoning, props.liveAssistantDraft.partialText].filter(Boolean).join('\n\n');
    void copyTextToClipboard(copyValue);
  };

  const content =
    props.type === 'persisted'
      ? (
        <div className="space-y-2">
          {props.message.parts.filter(messagePartHasVisibleContent).map((part) => (
            <MessagePartView key={part.id} cacheKey={`${props.message.id}:${part.id}`} part={part} />
          ))}
        </div>
      )
      : (
        <>
          {props.liveAssistantDraft.partialReasoning ? (
            <ReasoningPanel content={props.liveAssistantDraft.partialReasoning} thinking={props.liveAssistantDraft.eventType !== 'text_end'} />
          ) : null}

          {props.liveAssistantDraft.partialText ? (
            <MarkdownRenderer
              cacheKey={props.liveAssistantDraft.runId ? `live:${props.liveAssistantDraft.runId}` : 'live-assistant'}
              animateBlocks={false}
              className="text-[15px] leading-[1.9] text-slate-800"
              plainTextClassName="text-[15px] leading-[1.9] text-slate-800"
              text={props.liveAssistantDraft.partialText}
            />
          ) : null}
        </>
      );

  return (
    <div
      className="group relative w-[90%] max-w-screen px-4 pb-8"
      data-message-id={props.type === 'persisted' ? props.message.id : props.liveAssistantDraft.messageId}
      data-render-key={assistantDiagnosticKey}
      style={transcriptRowPerformanceStyle}
    >
      <div className={clsx('relative flex flex-col gap-2 pt-1.5', ui.assistantBubble)}>{content}</div>
      <MessageActions
        available={isCompleted}
        items={assistantActions}
        onActionClick={(key) => {
          if (key === 'copy') {
            handleCopy();
          }
        }}
      />
    </div>
  );
});

const MessageCard = memo(function MessageCard({ message }: { message: MessageDto }) {
  const isUser = message.role === 'user';
  const isOptimistic = message.metadata?.optimistic === true;
  const renderKey = getMessageRenderKey(message);
  useRenderDiagnostic('MessageCard', renderKey, {
    messageId: message.id,
    optimistic: isOptimistic,
    partSignature: message.parts.map((part) => `${part.partIndex}:${part.type}:${part.textValue?.length ?? 0}`).join('|'),
    role: message.role,
    seq: message.seq,
    status: message.status
  });
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

  if (isUser) {
    return (
      <div
        className="group relative flex w-full max-w-screen justify-end px-4"
        data-message-id={message.id}
        data-render-key={renderKey}
        style={transcriptRowPerformanceStyle}
      >
        <div className="relative max-w-[65%] pb-8">
          <div className={clsx('relative flex flex-col gap-3 rounded-lg px-3 py-2', ui.userBubble, isOptimistic && 'opacity-85')}>
            <div className="space-y-2">
              {message.parts.map((part) => (
                <MessagePartView key={part.id} cacheKey={`${message.id}:${part.id}`} part={part} variant="user" />
              ))}
            </div>
          </div>
          <MessageActions
            align="end"
            available={!isOptimistic}
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

  return <AssistantTranscriptCard message={message} type="persisted" />;
});

const LiveAssistantCard = memo(function LiveAssistantCard({
  liveAssistantDraft
}: {
  liveAssistantDraft: LiveAssistantDraft;
}) {
  return <AssistantTranscriptCard liveAssistantDraft={liveAssistantDraft} type="live" />;
});

const ThinkingIndicator = memo(function ThinkingIndicator() {
  return (
    <div className="w-[90%] max-w-screen px-4">
      <div className="flex items-center gap-2.5 py-1.5">
        <span className="h-2 w-2 rounded-full bg-[color:var(--chat-text-tertiary)]" aria-hidden="true" />
        <span className="chat-shimmer-text text-sm font-medium tracking-[0.01em]">Thinking...</span>
      </div>
    </div>
  );
});

type ChatMessageListProps = {
  meta: RuntimePiMetaDto | null;
  error: string | null;
  durableRecoveryState: DurableRecoveryState;
  hasOlderMessages: boolean;
  historyLoading: boolean;
  loadingMessages: boolean;
  activeThreadId: string | null;
  messages: MessageDto[];
  liveAssistantDraft: LiveAssistantDraft | null;
  showLoadingText: boolean;
  centeredEmptyState: boolean;
  onLoadOlderMessages: () => void;
};

export const ChatMessageList = memo(function ChatMessageList({
  meta,
  error,
  durableRecoveryState,
  hasOlderMessages,
  historyLoading,
  loadingMessages,
  activeThreadId,
  messages,
  liveAssistantDraft,
  showLoadingText,
  centeredEmptyState,
  onLoadOlderMessages
}: ChatMessageListProps) {
  useRenderDiagnostic('ChatMessageList', activeThreadId ?? 'new-thread', {
    hasOlderMessages,
    historyLoading,
    isThinking: showLoadingText,
    liveDraftKey: liveAssistantDraft ? `${liveAssistantDraft.messageId}:${liveAssistantDraft.eventType}` : '',
    loadingMessages,
    messageCount: messages.length,
    messageRenderKeys: messages.map((message) => getMessageRenderKey(message)).join('|')
  });

  return (
    <div className={clsx('flex-1 p-6', centeredEmptyState && 'flex-none pb-3')}>
      {!meta?.runtimeConfigured && meta?.runtimeConfigError ? (
        <div className={clsx(`${maxWithTW} mx-auto mb-4 w-full rounded-xl px-4 py-3 text-sm`, ui.warningBanner)}>
          {meta.runtimeConfigError}
        </div>
      ) : null}

      {durableRecoveryState.phase !== 'idle' && durableRecoveryState.message ? (
        <div className={clsx(`${maxWithTW} mx-auto mb-4 w-full rounded-xl px-4 py-3 text-sm`, ui.infoBanner)}>
          <div className="flex items-center gap-2">
            {durableRecoveryState.phase === 'recovering' ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            <span>{durableRecoveryState.message}</span>
          </div>
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
        <div className={`${maxWithTW} mx-auto w-full`} style={centeredEmptyState ? undefined : messageListMinHeight}>
          <div className={clsx('flex flex-col items-center gap-3', centeredEmptyState ? 'justify-end' : 'min-h-full justify-center')}>
            <WelcomeMessage activeThreadId={activeThreadId} />
            {showLoadingText ? <ThinkingIndicator /> : null}
          </div>
        </div>
      ) : (
        <div className={`${maxWithTW} mx-auto w-full`} style={messageListMinHeight}>
          <div className="flex flex-col gap-3">
            {hasOlderMessages || historyLoading ? (
              <div className="flex justify-center px-4 pb-2 pt-1">
                <button
                  type="button"
                  disabled={historyLoading}
                  onClick={onLoadOlderMessages}
                  className={clsx(
                    'inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition',
                    historyLoading
                      ? 'cursor-wait border-slate-200 bg-slate-50 text-slate-400'
                      : 'border-slate-200 bg-white text-slate-500 hover:border-slate-300 hover:text-slate-700'
                  )}
                >
                  {historyLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                  <span>{historyLoading ? 'Loading older messages...' : 'Load older messages'}</span>
                </button>
              </div>
            ) : null}
            {messages.map((message) => (
              <MessageCard key={getMessageRenderKey(message)} message={message} />
            ))}
            {liveAssistantDraft ? <LiveAssistantCard liveAssistantDraft={liveAssistantDraft} /> : null}
            {showLoadingText ? <ThinkingIndicator /> : null}
          </div>
        </div>
      )}
    </div>
  );
});
