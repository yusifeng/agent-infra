import type { MessageDto, MessagePartDto, RuntimePiMetaDto } from '@agent-infra/contracts';
import { emitChatRenderDiagnostic, getMessageRenderKey } from '@agent-infra/durable-chat-client';
import clsx from 'clsx';
import { Atom, ChevronDown, ChevronRight, Copy, Loader2, RotateCw, Search, Trash2 } from 'lucide-react';
import { memo, useEffect, useMemo, useRef, useState, type ComponentType, type CSSProperties } from 'react';

import type { AnswerContainer } from '@/features/durable-chat/types/answer-containers';
import { buildAnswerContainerActionContexts } from '@/features/durable-chat/service/build-answer-container-actions';
import { copyMessageToClipboard, copyTextToClipboard } from './helpers';
import { MarkdownRenderer } from './markdown/markdown-renderer';
import { AnimatedEmoji } from './shared';
import { SiteIconBadge } from './site-icon-badge';
import { buildAssistantTurnActionContexts } from '@/features/durable-chat/service/assistant-turn-actions';
import {
  buildVisibleLiveAssistantSegments,
  collectLiveDraftCopyText,
  hasVisibleLiveAssistantContent
} from '@/features/durable-chat/service/live-assistant-presentation';
import {
  buildResearchActivityViewModel,
  buildResearchStatusLabelViewModel,
  buildResearchSummaryLabelViewModel
} from '@/features/durable-chat/service/research-activity';
import type { LiveAssistantDraft } from '@/features/durable-chat/types/live-assistant-draft';
import type { DurableRecoveryState } from '@/features/durable-chat/types/runtime';
import type { ActiveSearchPanelData } from '@/features/durable-chat/types/search';
import type { AssistantTurnItem, TranscriptBlock } from '@/features/durable-chat/types/transcript-blocks';
import { maxWithTW, messageListMinHeight, ui } from './ui';

const transcriptRowPerformanceStyle: CSSProperties = {
  containIntrinsicSize: '180px',
  contentVisibility: 'auto'
};

const reasoningMarkdownClassName = 'text-sm leading-7 text-[color:var(--chat-reasoning-text)]';

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
  if (!activeThreadId) {
    return null;
  }

  return (
    <div className="flex w-full items-center justify-center px-4 py-2">
      <div className="flex w-full max-w-[800px] flex-col items-center gap-3 text-center">
        <AnimatedEmoji emoji="👋" size={40} />
        <h1 className={clsx('my-1 text-[32px]', ui.welcomeTitle)}>
          继续这个 durable chat
        </h1>
        <div className={clsx('max-w-[720px] text-sm leading-7', ui.welcomeDesc)}>
          这里保留真实的 durable thread 与 run 行为，只验证 Vite consumer 在非 Next.js 环境下的主聊天链路。
        </div>
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
          <Atom className={clsx('h-4 w-4 text-[color:var(--chat-reasoning-accent)]', thinking && 'animate-pulse')} />
          <span className="truncate text-sm font-medium text-[color:var(--chat-reasoning-title)]">
            {thinking ? '思考中...' : '已思考'}
          </span>
        </div>
        {expanded ? (
          <ChevronDown className="h-4 w-4 text-[color:var(--chat-icon-muted)]" />
        ) : (
          <ChevronRight className="h-4 w-4 text-[color:var(--chat-icon-muted)]" />
        )}
      </button>

      {expanded ? (
        <div ref={contentRef} className="mt-2 max-h-80 overflow-y-auto border-l border-[color:var(--chat-reasoning-divider)] pl-4">
          {content ? (
            <MarkdownRenderer
              className={reasoningMarkdownClassName}
              plainTextClassName={reasoningMarkdownClassName}
              text={content}
            />
          ) : (
            <div className="text-sm italic leading-7 text-[color:var(--chat-reasoning-text)]">思考中...</div>
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
            className="flex h-7 w-7 items-center justify-center rounded-md text-[color:var(--chat-icon-muted)] transition hover:bg-[var(--chat-hover)] hover:text-[color:var(--chat-text)] disabled:cursor-not-allowed disabled:opacity-40"
          >
            <item.icon className="h-[15px] w-[15px]" />
          </button>
        ))}
      </div>
    </div>
  );
});

const ResearchSummaryLabel = memo(function ResearchSummaryLabel({
  items,
  runId,
  showPersistedResearchStatus = false,
  onOpenSearchResult
}: {
  items: AssistantTurnItem[];
  runId: string | null;
  showPersistedResearchStatus?: boolean;
  onOpenSearchResult?: (runId: string, toolCallIds: string[]) => void;
}) {
  const activity = useMemo(() => buildResearchActivityViewModel(items), [items]);
  const statusViewModel = useMemo(
    () => (showPersistedResearchStatus ? buildResearchStatusLabelViewModel(activity) : null),
    [activity, showPersistedResearchStatus]
  );
  const summaryViewModel = useMemo(() => buildResearchSummaryLabelViewModel(activity), [activity]);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (!summaryViewModel) {
      setExpanded(false);
    }
  }, [summaryViewModel]);

  if (!statusViewModel && !summaryViewModel) {
    return null;
  }

  return (
    <div className="space-y-1.5 pt-0.5">
      {statusViewModel ? (
        <div className="inline-flex max-w-full items-center gap-1.5 rounded-full px-2 py-1 text-left text-[13px] text-[color:var(--chat-text-tertiary)]">
          {statusViewModel.isSearching ? (
            <Loader2 className="h-4 w-4 shrink-0 animate-spin text-[color:var(--chat-text-tertiary)]" />
          ) : (
            <Search className="h-4 w-4 shrink-0 text-[color:var(--chat-text-tertiary)]" />
          )}
          <span className="truncate font-normal">{statusViewModel.text}</span>
        </div>
      ) : null}

      {summaryViewModel ? (
      <div className="space-y-1">
        <button
          type="button"
          onClick={() => setExpanded((current) => !current)}
          className="inline-flex max-w-full items-center gap-1.5 rounded-full px-2 py-1 text-left text-[13px] text-[color:var(--chat-text-tertiary)] transition hover:bg-[var(--chat-hover)] hover:text-[color:var(--chat-text-secondary)]"
          title="查看搜索与浏览摘要"
        >
          <Search className="h-4 w-4 shrink-0 text-[color:var(--chat-text-tertiary)]" />
          <span className="truncate font-normal">{summaryViewModel.text}</span>
          {summaryViewModel.sources.length > 0 ? (
            <span className="flex shrink-0 items-center pl-0.5">
              {summaryViewModel.sources.map((source, index) => (
                <SiteIconBadge
                  key={`${source.hostname}:${source.sourceName}`}
                  hostname={source.hostname}
                  label={source.sourceName}
                  className={clsx('h-4 w-4 border border-white', index === 0 ? '' : '-ml-1')}
                  fallbackClassName="bg-indigo-100 text-indigo-700"
                />
              ))}
            </span>
          ) : null}
          {expanded ? (
            <ChevronDown className="h-4 w-4 shrink-0 text-[color:var(--chat-icon-muted)]" />
          ) : (
            <ChevronRight className="h-4 w-4 shrink-0 text-[color:var(--chat-icon-muted)]" />
          )}
        </button>

        {expanded ? (
          <div className="space-y-2 border-l border-[color:var(--chat-border)] pl-4 text-[13px] text-[color:var(--chat-text-secondary)]">
            {summaryViewModel.detailQueries.length > 0 ? (
              <div className="space-y-1">
                <div className="font-medium text-[color:var(--chat-text)]">搜索查询</div>
                <ul className="space-y-1">
                  {summaryViewModel.detailQueries.map((query) => (
                    <li key={query} className="truncate">- {query}</li>
                  ))}
                </ul>
              </div>
            ) : null}

            {summaryViewModel.detailPages.length > 0 ? (
              <div className="space-y-1">
                <div className="font-medium text-[color:var(--chat-text)]">浏览页面</div>
                <ul className="space-y-1">
                  {summaryViewModel.detailPages.map((page) => (
                    <li key={`${page.url}:${page.title}`} className="truncate">
                      - {page.sourceName} · {page.title}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {runId && onOpenSearchResult && activity.searchToolCallIds.length > 0 ? (
              <div>
                <button
                  type="button"
                  onClick={() => onOpenSearchResult(runId, activity.searchToolCallIds)}
                  className="text-[13px] font-medium text-[color:var(--chat-link)] transition hover:opacity-80"
                >
                  查看搜索结果
                </button>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
      ) : null}
    </div>
  );
});

const MessagePartView = memo(function MessagePartView({ part, variant = 'assistant', cacheKey }: {
  part: MessagePartDto;
  variant?: 'assistant' | 'user';
  cacheKey?: string;
}) {
  if (part.type === 'text') {
    const textValue = part.textValue ?? '';
    return variant === 'user' ? (
      <div className="whitespace-pre-wrap break-words text-sm leading-relaxed text-[color:var(--chat-text)]">{textValue}</div>
    ) : (
      <MarkdownRenderer
        cacheKey={cacheKey}
        className="text-[15px] leading-[1.9] text-[color:var(--chat-text)]"
        plainTextClassName="text-[15px] leading-[1.9] text-[color:var(--chat-text)]"
        text={textValue}
      />
    );
  }

  if (part.type === 'reasoning') {
    return <ReasoningPanel content={part.textValue ?? ''} />;
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

const AssistantTurnContent = memo(function AssistantTurnContent({
  items,
  runId,
  showPersistedResearchStatus = false,
  onOpenSearchResult
}: {
  items: AssistantTurnItem[];
  runId: string | null;
  showPersistedResearchStatus?: boolean;
  onOpenSearchResult?: (runId: string, toolCallIds: string[]) => void;
}) {
  const researchActivity = useMemo(() => buildResearchActivityViewModel(items), [items]);

  return (
    <div className="space-y-1.5">
      <ResearchSummaryLabel
        items={items}
        onOpenSearchResult={onOpenSearchResult}
        runId={runId}
        showPersistedResearchStatus={showPersistedResearchStatus}
      />
      {researchActivity.visibleItems.map((item) => {
        if (item.type === 'search-status' || item.type === 'search-summary') {
          return null;
        }

        return <MessagePartView key={item.id} cacheKey={item.type === 'text' ? item.cacheKey : undefined} part={item.part} />;
      })}
    </div>
  );
});

const LiveAssistantContent = memo(function LiveAssistantContent({
  liveAssistantDraft,
  getLiveSearchPanelData,
  onOpenSearchResult
}: {
  liveAssistantDraft: LiveAssistantDraft;
  getLiveSearchPanelData?: (runId: string, toolCallIds: string[]) => ActiveSearchPanelData | null;
  onOpenSearchResult?: (runId: string, toolCallIds: string[]) => void;
}) {
  const visibleSegments = buildVisibleLiveAssistantSegments(liveAssistantDraft, getLiveSearchPanelData);

  return (
    <div className="space-y-3">
      {visibleSegments.map(({ segment, searchEntries }) => {
        return (
          <div key={segment.id} className="space-y-1.5">
            {segment.reasoning ? <ReasoningPanel content={segment.reasoning} thinking /> : null}
            {segment.text ? (
              <MarkdownRenderer
                cacheKey={`live:${liveAssistantDraft.runId}:${segment.id}`}
                animateBlocks={false}
                className="text-[15px] leading-[1.9] text-[color:var(--chat-text)]"
                plainTextClassName="text-[15px] leading-[1.9] text-[color:var(--chat-text)]"
                text={segment.text}
              />
            ) : null}
            {searchEntries ? (
              <button
                type="button"
                disabled={!liveAssistantDraft.runId || !onOpenSearchResult || !searchEntries.searchToolCallIds?.length}
                onClick={() => {
                  if (liveAssistantDraft.runId && onOpenSearchResult && searchEntries.searchToolCallIds?.length) {
                    onOpenSearchResult(liveAssistantDraft.runId, searchEntries.searchToolCallIds);
                  }
                }}
                className={clsx(
                  'inline-flex max-w-full items-center gap-1.5 rounded-full px-2 py-1 text-left text-[13px] text-[color:var(--chat-text-tertiary)]',
                  liveAssistantDraft.runId && onOpenSearchResult && searchEntries.searchToolCallIds?.length
                    ? 'transition hover:bg-[var(--chat-hover)] hover:text-[color:var(--chat-text-secondary)]'
                    : 'cursor-default'
                )}
              >
                {searchEntries.isSearching ? (
                  <Loader2 className="h-4 w-4 shrink-0 animate-spin text-[color:var(--chat-text-tertiary)]" />
                ) : (
                  <Search className="h-4 w-4 shrink-0 text-[color:var(--chat-text-tertiary)]" />
                )}
                <span className="truncate font-normal">{searchEntries.text}</span>
                {searchEntries.sources?.length ? (
                  <span className="flex shrink-0 items-center pl-0.5">
                    {searchEntries.sources.map((source, index) => (
                      <SiteIconBadge
                        key={`${source.hostname}:${source.sourceName}`}
                        hostname={source.hostname}
                        label={source.sourceName}
                        className={clsx('h-4 w-4 border border-white', index === 0 ? '' : '-ml-1')}
                        fallbackClassName="bg-indigo-100 text-indigo-700"
                      />
                    ))}
                  </span>
                ) : null}
                {!searchEntries.isSearching && liveAssistantDraft.runId && onOpenSearchResult && searchEntries.searchToolCallIds?.length ? (
                  <ChevronRight className="h-4 w-4 shrink-0 text-[color:var(--chat-icon-muted)]" />
                ) : null}
              </button>
            ) : null}
          </div>
        );
      })}
    </div>
  );
});

const AssistantTranscriptCard = memo(function AssistantTranscriptCard(
  props:
    | {
      type: 'persisted-turn';
      block: Extract<TranscriptBlock, { type: 'assistant-turn' }>;
      showPersistedResearchStatus?: boolean;
      actionContext: {
        copyText: string;
        showActions: boolean;
      };
      onOpenSearchResult?: (runId: string, toolCallIds: string[]) => void;
      }
    | {
        type: 'live';
        liveAssistantDraft: LiveAssistantDraft;
        getLiveSearchPanelData?: (runId: string, toolCallIds: string[]) => ActiveSearchPanelData | null;
        onOpenSearchResult?: (runId: string, toolCallIds: string[]) => void;
      }
) {
  const assistantDiagnosticKey = props.type === 'persisted-turn' ? props.block.id : props.liveAssistantDraft.messageId;
  useRenderDiagnostic(
    props.type === 'persisted-turn' ? 'PersistedAssistantTurnCard' : 'LiveAssistantCard',
    assistantDiagnosticKey,
    props.type === 'persisted-turn'
      ? {
          itemSignature: props.block.items.map((item) => item.type).join('|'),
          renderKey: assistantDiagnosticKey,
          runId: props.block.runId ?? '',
          sourceMessageIds: props.block.sourceMessages.map((message) => message.id).join('|')
        }
      : {
          eventType: props.liveAssistantDraft.eventType,
          messageId: props.liveAssistantDraft.messageId,
          partialReasoningLength: props.liveAssistantDraft.partialReasoning?.length ?? 0,
          partialTextLength: props.liveAssistantDraft.partialText.length,
          runId: props.liveAssistantDraft.runId ?? ''
        }
  );

  const isCompleted = props.type === 'persisted-turn';
  const copyText =
    props.type === 'persisted-turn'
      ? props.actionContext.copyText
      : collectLiveDraftCopyText(props.liveAssistantDraft);
  const showActions = props.type === 'persisted-turn' ? props.actionContext.showActions : isCompleted && copyText.length > 0;
  const hasVisibleContent =
    props.type === 'persisted-turn'
      ? props.block.items.length > 0
      : hasVisibleLiveAssistantContent(props.liveAssistantDraft);

  if (!hasVisibleContent) {
    return null;
  }

  const handleCopy = () => {
    void copyTextToClipboard(copyText);
  };

  const content =
    props.type === 'persisted-turn' ? (
      <AssistantTurnContent
        items={props.block.items}
        onOpenSearchResult={props.onOpenSearchResult}
        runId={props.block.runId}
        showPersistedResearchStatus={props.showPersistedResearchStatus}
      />
    ) : (
      <LiveAssistantContent
        getLiveSearchPanelData={props.getLiveSearchPanelData}
        liveAssistantDraft={props.liveAssistantDraft}
        onOpenSearchResult={props.onOpenSearchResult}
      />
    );

  return (
    <div
      className={clsx('group relative w-[90%] max-w-screen px-4', showActions ? 'pb-8' : 'pb-2')}
      data-message-role="assistant"
      data-message-id={props.type === 'persisted-turn' ? props.block.id : props.liveAssistantDraft.messageId}
      data-render-key={assistantDiagnosticKey}
      style={transcriptRowPerformanceStyle}
    >
      <div className={clsx('relative flex flex-col gap-2 pt-1.5', ui.assistantBubble)}>{content}</div>
      <MessageActions
        available={props.type === 'persisted-turn' ? showActions : false}
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

const AnswerContainerCard = memo(function AnswerContainerCard({
  container,
  actionContext,
  showPersistedResearchStatus = false,
  onOpenSearchResult
}: {
  container: AnswerContainer;
  actionContext: {
    copyText: string;
    hasVisibleOperation: boolean;
  };
  showPersistedResearchStatus?: boolean;
  onOpenSearchResult?: (runId: string, toolCallIds: string[]) => void;
}) {
  const hasVisibleContent = container.blocks.some((block) => block.items.length > 0);
  if (!hasVisibleContent) {
    return null;
  }

  return (
    <div
      className={clsx('group relative w-[90%] max-w-screen px-4', actionContext.hasVisibleOperation ? 'pb-8' : 'pb-2')}
      data-answer-container-id={container.id}
      data-message-role="assistant"
      style={transcriptRowPerformanceStyle}
    >
      <div className={clsx('relative flex flex-col gap-3 pt-1.5', ui.assistantBubble)}>
        {container.blocks.map((block) => (
          <AssistantTurnContent
            key={block.id}
            items={block.items}
            onOpenSearchResult={onOpenSearchResult}
            runId={block.runId}
            showPersistedResearchStatus={showPersistedResearchStatus}
          />
        ))}
      </div>
      <MessageActions
        available={actionContext.hasVisibleOperation}
        items={assistantActions}
        onActionClick={(key) => {
          if (key === 'copy') {
            void copyTextToClipboard(actionContext.copyText);
          }
        }}
      />
    </div>
  );
});

const UserMessageBlockCard = memo(function UserMessageBlockCard({
  message
}: {
  message: MessageDto;
}) {
  const isOptimistic = message.metadata?.optimistic === true;
  const renderKey = getMessageRenderKey(message);
  useRenderDiagnostic('UserMessageBlock', renderKey, {
    messageId: message.id,
    optimistic: isOptimistic,
    partSignature: message.parts.map((part) => `${part.partIndex}:${part.type}:${part.textValue?.length ?? 0}`).join('|'),
    role: message.role,
    seq: message.seq,
    status: message.status
  });

  return (
    <div
      className="group relative flex w-full max-w-screen justify-end px-4"
      data-message-role="user"
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
          items={[
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
          ]}
          onActionClick={(key) => {
            if (key === 'copy') {
              void copyMessageToClipboard(message);
            }
          }}
        />
      </div>
    </div>
  );
});

const TranscriptBlockCard = memo(function TranscriptBlockCard({
  block,
  showPersistedResearchStatus = false,
  actionContext,
  onOpenSearchResult
}: {
  block: TranscriptBlock;
  showPersistedResearchStatus?: boolean;
  actionContext?: {
    copyText: string;
    showActions: boolean;
  };
  onOpenSearchResult?: (runId: string, toolCallIds: string[]) => void;
}) {
  if (block.type === 'user-message') {
    return <UserMessageBlockCard message={block.message} />;
  }

  return (
    <AssistantTranscriptCard
      actionContext={actionContext ?? { copyText: '', showActions: false }}
      block={block}
      onOpenSearchResult={onOpenSearchResult}
      showPersistedResearchStatus={showPersistedResearchStatus}
      type="persisted-turn"
    />
  );
});

const LiveAssistantCard = memo(function LiveAssistantCard({
  getLiveSearchPanelData,
  liveAssistantDraft,
  onOpenSearchResult
}: {
  liveAssistantDraft: LiveAssistantDraft;
  getLiveSearchPanelData?: (runId: string, toolCallIds: string[]) => ActiveSearchPanelData | null;
  onOpenSearchResult?: (runId: string, toolCallIds: string[]) => void;
}) {
  return (
    <AssistantTranscriptCard
      getLiveSearchPanelData={getLiveSearchPanelData}
      liveAssistantDraft={liveAssistantDraft}
      onOpenSearchResult={onOpenSearchResult}
      type="live"
    />
  );
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
  answerContainers?: AnswerContainer[];
  transcriptBlocks: TranscriptBlock[];
  liveAssistantDraft: LiveAssistantDraft | null;
  showLoadingText: boolean;
  centeredEmptyState: boolean;
  showPersistedResearchStatus?: boolean;
  showWelcomeWhenEmpty?: boolean;
  onLoadOlderMessages: () => void;
  onOpenSearchResult: (runId: string, toolCallIds: string[]) => void;
  getLiveSearchPanelData?: (runId: string, toolCallIds: string[]) => ActiveSearchPanelData | null;
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
  answerContainers = [],
  transcriptBlocks,
  liveAssistantDraft,
  showLoadingText,
  centeredEmptyState,
  showPersistedResearchStatus = false,
  showWelcomeWhenEmpty = true,
  onLoadOlderMessages,
  onOpenSearchResult,
  getLiveSearchPanelData
}: ChatMessageListProps) {
  const assistantTurnActionContexts = useMemo(() => buildAssistantTurnActionContexts(transcriptBlocks), [transcriptBlocks]);
  const answerContainerActionContexts = useMemo(() => buildAnswerContainerActionContexts(answerContainers), [answerContainers]);
  const answerContainerStartByBlockId = useMemo(
    () =>
      new Map(
        answerContainers
          .map((container) => [container.transcriptBlockIds[0], container] as const)
          .filter((entry): entry is readonly [string, AnswerContainer] => typeof entry[0] === 'string')
      ),
    [answerContainers]
  );
  const answerContainerBlockIds = useMemo(
    () => new Set(answerContainers.flatMap((container) => container.transcriptBlockIds)),
    [answerContainers]
  );

  useRenderDiagnostic('ChatMessageList', activeThreadId ?? 'new-thread', {
    hasOlderMessages,
    historyLoading,
    isThinking: showLoadingText,
    liveDraftKey: liveAssistantDraft ? `${liveAssistantDraft.messageId}:${liveAssistantDraft.eventType}` : '',
    loadingMessages,
    messageCount: messages.length,
    transcriptBlockCount: transcriptBlocks.length,
    transcriptBlockKeys: transcriptBlocks.map((block) => block.id).join('|')
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
            <div className="flex items-center gap-3 px-4 py-3 text-sm text-[color:var(--chat-text-secondary)]">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>Loading thread messages...</span>
            </div>
          </div>
        </div>
      ) : messages.length === 0 && transcriptBlocks.length === 0 && liveAssistantDraft === null ? (
        <div className={`${maxWithTW} mx-auto w-full`} style={centeredEmptyState ? undefined : messageListMinHeight}>
          <div className={clsx('flex flex-col items-center gap-3', centeredEmptyState ? 'justify-end' : 'min-h-full justify-center')}>
            {showWelcomeWhenEmpty ? <WelcomeMessage activeThreadId={activeThreadId} /> : null}
            {showLoadingText ? <ThinkingIndicator /> : null}
          </div>
        </div>
      ) : (
        <div className={`${maxWithTW} mx-auto w-full`} style={messageListMinHeight}>
          <div className="flex flex-col gap-1">
            {hasOlderMessages || historyLoading ? (
              <div className="flex justify-center px-4 pb-2 pt-1">
                <button
                  type="button"
                  disabled={historyLoading}
                  onClick={onLoadOlderMessages}
                  className={clsx(
                    'inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition',
                    historyLoading
                      ? 'cursor-wait border-[color:var(--chat-border)] bg-[var(--chat-surface-muted)] text-[color:var(--chat-text-tertiary)]'
                      : 'border-[color:var(--chat-border)] bg-[var(--chat-surface)] text-[color:var(--chat-text-secondary)] hover:border-[color:var(--chat-border-strong)] hover:text-[color:var(--chat-text)]'
                  )}
                >
                  {historyLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                  <span>{historyLoading ? 'Loading older messages...' : 'Load older messages'}</span>
                </button>
              </div>
            ) : null}
            {transcriptBlocks.map((block) => (
              block.type === 'assistant-turn' && answerContainerBlockIds.has(block.id) ? (
                answerContainerStartByBlockId.has(block.id) ? (
                  <AnswerContainerCard
                    key={block.id}
                    actionContext={
                      answerContainerActionContexts.get(answerContainerStartByBlockId.get(block.id)!.actionHostId) ?? {
                        copyText: '',
                        hasVisibleOperation: false
                      }
                    }
                    container={answerContainerStartByBlockId.get(block.id)!}
                    onOpenSearchResult={onOpenSearchResult}
                    showPersistedResearchStatus={showPersistedResearchStatus}
                  />
                ) : null
              ) : (
                  <TranscriptBlockCard
                    key={block.id}
                    actionContext={assistantTurnActionContexts.get(block.id)}
                    block={block}
                    onOpenSearchResult={onOpenSearchResult}
                    showPersistedResearchStatus={showPersistedResearchStatus}
                  />
              )
            ))}
            {liveAssistantDraft ? (
              <LiveAssistantCard
                getLiveSearchPanelData={getLiveSearchPanelData}
                liveAssistantDraft={liveAssistantDraft}
                onOpenSearchResult={onOpenSearchResult}
              />
            ) : null}
            {showLoadingText ? <ThinkingIndicator /> : null}
          </div>
        </div>
      )}
    </div>
  );
});
