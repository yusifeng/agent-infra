'use client';

import type { MessageDto, MessagePartDto, RuntimePiMetaDto } from '@agent-infra/contracts';
import { getMessageRenderKey } from '@agent-infra/durable-chat-client';
import clsx from 'clsx';
import { Atom, ChevronDown, ChevronRight, Copy, FileText, Loader2, RotateCw, Search, Trash2 } from 'lucide-react';
import { memo, useMemo, useState, type CSSProperties, type ReactNode } from 'react';

import type { AnswerContainer } from '@/features/durable-chat/types/answer-containers';
import { buildAnswerContainerActionContexts } from '@/features/durable-chat/service/build-answer-container-actions';
import { buildMessageListRenderPlan } from '@/features/durable-chat/service/message-list-presentation';
import { copyMessageToClipboard, copyTextToClipboard } from './helpers';
import { MessageActions } from './message-actions';
import { MarkdownRenderer } from './markdown-renderer';
import { ReasoningPanel } from './reasoning-panel';
import { useRenderDiagnostic } from './render-diagnostics';
import { AnimatedEmoji } from './shared';
import { SiteIconBadge } from './site-icon-badge';
import { buildAssistantTurnActionContexts } from '@/features/durable-chat/service/assistant-turn-actions';
import {
  buildLiveThinkingTokens,
  buildPersistedThinkingTokens,
  buildPersistedThinkingTokensFromBlocks,
  buildThinkingFlowSections,
  isThinkingFlowSectionVisible,
  type LiveSummaryToken,
  type PersistedResearchToken,
  type ReasoningToken
} from '@/features/durable-chat/service/thinking-flow';
import {
  collectLiveDraftCopyText,
  hasVisibleLiveAssistantContent
} from '@/features/durable-chat/service/live-assistant-presentation';
import {
  buildResearchActivityViewModel,
  buildResearchTimelineRowsFromActivity,
  type ResearchTimelineRow
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

const reasoningTimelineTextClassName = 'text-sm leading-7 text-[color:var(--chat-text-secondary)]';
const reasoningMarkdownClassName = reasoningTimelineTextClassName;
const maxInlineBrowsePageCount = 4;

const TimelineItem = memo(function TimelineItem({
  children,
  marker
}: {
  children: ReactNode;
  marker: ReactNode;
}) {
  return (
    <div className="grid grid-cols-[24px_minmax(0,1fr)] gap-3">
      <div className="relative flex justify-center pt-[6px]">
        <div className="absolute bottom-[-3px] top-[24px] w-px bg-[color:var(--chat-reasoning-divider)]" />
        <div className="relative z-10 flex h-4 w-4 items-center justify-center bg-[var(--chat-bg)] text-[color:var(--chat-text-secondary)]">
          {marker}
        </div>
      </div>
      <div className="mb-1.5 min-w-0">{children}</div>
    </div>
  );
});

const reasoningDotMarker = <span className="h-1.5 w-1.5 rounded-full bg-[color:var(--chat-text-secondary)]" />;

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
  const rows = useMemo(
    () => buildResearchTimelineRowsFromActivity(activity, { includePending: showPersistedResearchStatus }),
    [activity, showPersistedResearchStatus]
  );

  if (rows.length === 0) {
    return null;
  }

  return <ResearchTimelineRows onOpenSearchResult={onOpenSearchResult} rows={rows} runId={runId} />;
});

const ResearchTimelineRows = memo(function ResearchTimelineRows({
  runId,
  rows,
  onOpenSearchResult
}: {
  runId: string | null;
  rows: ResearchTimelineRow[];
  onOpenSearchResult?: (runId: string, toolCallIds: string[]) => void;
}) {
  const [expandedBrowseRowIds, setExpandedBrowseRowIds] = useState<Set<string>>(() => new Set());

  return (
    <div>
      {rows.map((row) => {
        if (row.kind === 'search') {
          const isClickable = Boolean(runId && onOpenSearchResult && row.searchToolCallIds.length > 0);
          const content = (
            <>
              <span className="truncate">{row.label}</span>
              {row.sources.length > 0 ? (
                <span className="flex shrink-0 items-center pl-0.5">
                  {row.sources.map((source, index) => (
                    <SiteIconBadge
                      key={`${source.hostname}:${source.sourceName}`}
                      hostname={source.hostname}
                      label={source.sourceName}
                      className={clsx('h-5 w-5 border border-white', index === 0 ? '' : '-ml-1.5')}
                      fallbackClassName="bg-[var(--chat-site-icon-fallback-bg)] text-[color:var(--chat-site-icon-fallback-text)]"
                    />
                  ))}
                </span>
              ) : null}
            </>
          );
          const marker =
            row.state === 'running' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />;
          const searchRowClassName = clsx(
            'inline-flex max-w-full items-center gap-2 text-left transition',
            reasoningTimelineTextClassName,
            row.state === 'running'
              ? 'rounded-full bg-[var(--chat-surface-muted)] px-3 py-1 leading-6'
              : 'py-0.5',
            isClickable && row.state !== 'running' && '-mx-2 rounded-md px-2 hover:bg-[var(--chat-hover)]'
          );

          return (
            <TimelineItem key={row.id} marker={marker}>
              {isClickable ? (
                <button
                  type="button"
                  onClick={() => onOpenSearchResult?.(runId!, row.searchToolCallIds)}
                  className={searchRowClassName}
                  title="查看搜索结果"
                >
                  {content}
                </button>
              ) : (
                <div className={searchRowClassName}>
                  {content}
                </div>
              )}
            </TimelineItem>
          );
        }

        const expanded = expandedBrowseRowIds.has(row.id);
        const visiblePages = expanded ? row.pages : row.pages.slice(0, maxInlineBrowsePageCount);
        const hiddenPageCount = Math.max(0, row.pages.length - visiblePages.length);

        return (
          <TimelineItem
            key={row.id}
            marker={row.state === 'running' ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
          >
            <div className={clsx('flex max-w-full flex-wrap items-center gap-x-3 gap-y-1 py-0.5', reasoningTimelineTextClassName)}>
              <span className="inline-flex min-w-0 items-center">
                <span className="shrink-0">{row.label}</span>
              </span>
              {visiblePages.map((page) => (
                <a
                  key={`${row.id}:${page.url}:${page.title}`}
                  href={page.url}
                  target="_blank"
                  rel="noreferrer"
                  className="max-w-full truncate text-[color:var(--chat-text-secondary)] underline decoration-dotted underline-offset-4 transition hover:text-[color:var(--chat-link)]"
                  title={page.url}
                >
                  {page.title}↗
                </a>
              ))}
              {hiddenPageCount > 0 ? (
                <button
                  type="button"
                  onClick={() => {
                    setExpandedBrowseRowIds((current) => {
                      const next = new Set(current);
                      next.add(row.id);
                      return next;
                    });
                  }}
                  className="rounded-md bg-[var(--chat-surface-muted)] px-2 py-0.5 text-[13px] text-[color:var(--chat-text-secondary)] transition hover:text-[color:var(--chat-text)]"
                >
                  查看全部
                </button>
              ) : null}
            </div>
          </TimelineItem>
        );
      })}
    </div>
  );
});

const ThinkingTimelinePanel = memo(function ThinkingTimelinePanel({
  entries,
  thinking,
  showPersistedResearchStatus = false,
  onOpenSearchResult
}: {
  entries: Array<ReasoningToken | PersistedResearchToken | LiveSummaryToken>;
  thinking: boolean;
  showPersistedResearchStatus?: boolean;
  onOpenSearchResult?: (runId: string, toolCallIds: string[]) => void;
}) {
  const [manualExpanded, setManualExpanded] = useState(true);
  const expanded = thinking || manualExpanded;

  return (
    <div className="overflow-hidden" data-reasoning-panel="true" data-thinking-container="true">
      <button
        type="button"
        onClick={() => {
          if (!thinking) {
            setManualExpanded((current) => !current);
          }
        }}
        className="flex w-full items-center justify-between gap-3 py-1 text-left"
        aria-expanded={expanded}
      >
        <div className="flex min-w-0 items-center gap-2.5">
          <Atom className={clsx('h-4 w-4 text-[color:var(--chat-reasoning-accent)]', thinking && 'animate-pulse')} />
          <span
            className={clsx(
              'truncate text-sm font-medium',
              thinking ? 'chat-reasoning-shimmer-text' : 'text-[color:var(--chat-reasoning-text)]'
            )}
          >
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
        <div className="mt-2">
          {entries.map((entry) => {
            if (entry.kind === 'reasoning') {
              return (
                <TimelineItem key={entry.id} marker={reasoningDotMarker}>
                  <MarkdownRenderer
                    className={reasoningMarkdownClassName}
                    plainTextClassName={reasoningMarkdownClassName}
                    text={entry.text}
                  />
                </TimelineItem>
              );
            }

            if (entry.kind === 'persisted-research') {
              return (
                <ResearchSummaryLabel
                  key={entry.id}
                  items={entry.items}
                  onOpenSearchResult={onOpenSearchResult}
                  runId={entry.runId}
                  showPersistedResearchStatus={showPersistedResearchStatus}
                />
              );
            }

            return (
              <ResearchTimelineRows
                key={entry.id}
                onOpenSearchResult={onOpenSearchResult}
                rows={entry.rows}
                runId={entry.runId}
              />
            );
          })}
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
  const sections = useMemo(
    () =>
      buildThinkingFlowSections(buildPersistedThinkingTokens(items, runId), false).filter((section) =>
        isThinkingFlowSectionVisible(section, showPersistedResearchStatus)
      ),
    [items, runId, showPersistedResearchStatus]
  );

  if (sections.length === 0) {
    return null;
  }

  return (
    <div className="space-y-1.5">
      {sections.map((section) => {
        if (section.type === 'thinking') {
          return (
            <ThinkingTimelinePanel
              key={section.id}
              entries={section.entries}
              thinking={section.thinking}
              showPersistedResearchStatus={showPersistedResearchStatus}
              onOpenSearchResult={onOpenSearchResult}
            />
          );
        }

        if (section.type === 'research') {
          return section.entry.kind === 'persisted-research' ? (
            <ResearchSummaryLabel
              key={section.id}
              items={section.entry.items}
              onOpenSearchResult={onOpenSearchResult}
              runId={section.entry.runId}
              showPersistedResearchStatus={showPersistedResearchStatus}
            />
          ) : (
            <ResearchTimelineRows
              key={section.id}
              onOpenSearchResult={onOpenSearchResult}
              rows={section.entry.rows}
              runId={section.entry.runId}
            />
          );
        }

        if (section.token.kind === 'persisted-text') {
          return (
            <MessagePartView
              key={section.id}
              cacheKey={section.token.part.cacheKey}
              part={section.token.part.part}
            />
          );
        }

        if (section.token.kind === 'live-text') {
          return (
            <MarkdownRenderer
              key={section.id}
              cacheKey={section.token.cacheKey}
              animateBlocks={false}
              className="text-[15px] leading-[1.9] text-[color:var(--chat-text)]"
              plainTextClassName="text-[15px] leading-[1.9] text-[color:var(--chat-text)]"
              text={section.token.text}
            />
          );
        }

        return null;
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
  const sections = useMemo(
    () => buildThinkingFlowSections(buildLiveThinkingTokens(liveAssistantDraft, getLiveSearchPanelData), true),
    [getLiveSearchPanelData, liveAssistantDraft]
  );

  return (
    <div className="space-y-3">
      {sections.map((section) => {
        if (section.type === 'thinking') {
          return (
            <ThinkingTimelinePanel
              key={section.id}
              entries={section.entries}
              thinking={section.thinking}
              showPersistedResearchStatus
              onOpenSearchResult={onOpenSearchResult}
            />
          );
        }

        if (section.type === 'research') {
          return section.entry.kind === 'persisted-research' ? (
            <ResearchSummaryLabel
              key={section.id}
              items={section.entry.items}
              onOpenSearchResult={onOpenSearchResult}
              runId={section.entry.runId}
              showPersistedResearchStatus
            />
          ) : (
            <ResearchTimelineRows
              key={section.id}
              onOpenSearchResult={onOpenSearchResult}
              rows={section.entry.rows}
              runId={section.entry.runId}
            />
          );
        }

        if (section.token.kind === 'live-text') {
          return (
            <MarkdownRenderer
              key={section.id}
              cacheKey={section.token.cacheKey}
              animateBlocks={false}
              className="text-[15px] leading-[1.9] text-[color:var(--chat-text)]"
              plainTextClassName="text-[15px] leading-[1.9] text-[color:var(--chat-text)]"
              text={section.token.text}
            />
          );
        }

        return null;
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
        actionsAvailable?: boolean;
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

  const copyText =
    props.type === 'persisted-turn'
      ? props.actionContext.copyText
      : collectLiveDraftCopyText(props.liveAssistantDraft);
  const showActions = props.type === 'persisted-turn' ? props.actionContext.showActions : props.actionsAvailable === true && copyText.length > 0;
  const hasVisibleContent =
    props.type === 'persisted-turn'
      ? buildThinkingFlowSections(buildPersistedThinkingTokens(props.block.items, props.block.runId), false).some((section) =>
          isThinkingFlowSectionVisible(section, props.showPersistedResearchStatus ?? false)
        )
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
  const sections = useMemo(
    () =>
      buildThinkingFlowSections(buildPersistedThinkingTokensFromBlocks(container.blocks), false).filter((section) =>
        isThinkingFlowSectionVisible(section, showPersistedResearchStatus)
      ),
    [container.blocks, showPersistedResearchStatus]
  );
  if (sections.length === 0) {
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
        {sections.map((section) => {
          if (section.type === 'thinking') {
            return (
              <ThinkingTimelinePanel
                key={section.id}
                entries={section.entries}
                thinking={section.thinking}
                showPersistedResearchStatus={showPersistedResearchStatus}
                onOpenSearchResult={onOpenSearchResult}
              />
            );
          }

          if (section.type === 'research') {
            return section.entry.kind === 'persisted-research' ? (
              <ResearchSummaryLabel
                key={section.id}
                items={section.entry.items}
                onOpenSearchResult={onOpenSearchResult}
                runId={section.entry.runId}
                showPersistedResearchStatus={showPersistedResearchStatus}
              />
            ) : (
              <ResearchTimelineRows
                key={section.id}
                onOpenSearchResult={onOpenSearchResult}
                rows={section.entry.rows}
                runId={section.entry.runId}
              />
            );
          }

          if (section.token.kind === 'persisted-text') {
            return (
              <MessagePartView
                key={section.id}
                cacheKey={section.token.part.cacheKey}
                part={section.token.part.part}
              />
            );
          }

          return (
            <MarkdownRenderer
              key={section.id}
              cacheKey={section.token.cacheKey}
              animateBlocks={false}
              className="text-[15px] leading-[1.9] text-[color:var(--chat-text)]"
              plainTextClassName="text-[15px] leading-[1.9] text-[color:var(--chat-text)]"
              text={section.token.text}
            />
          );
        })}
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
  actionsAvailable = false,
  getLiveSearchPanelData,
  liveAssistantDraft,
  onOpenSearchResult
}: {
  actionsAvailable?: boolean;
  liveAssistantDraft: LiveAssistantDraft;
  getLiveSearchPanelData?: (runId: string, toolCallIds: string[]) => ActiveSearchPanelData | null;
  onOpenSearchResult?: (runId: string, toolCallIds: string[]) => void;
}) {
  return (
    <AssistantTranscriptCard
      actionsAvailable={actionsAvailable}
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
  liveAssistantActionsAvailable?: boolean;
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
  liveAssistantActionsAvailable = false,
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
  const renderPlan = useMemo(
    () =>
      buildMessageListRenderPlan({
        activeThreadId,
        answerContainers,
        durableRecoveryState,
        liveAssistantDraft,
        loadingMessages,
        messages,
        meta,
        showLoadingText,
        transcriptBlocks
      }),
    [
      activeThreadId,
      answerContainers,
      durableRecoveryState,
      liveAssistantDraft,
      loadingMessages,
      messages,
      meta,
      showLoadingText,
      transcriptBlocks
    ]
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
      {renderPlan.hasRuntimeWarning ? (
        <div className={clsx(`${maxWithTW} mx-auto mb-4 w-full rounded-xl px-4 py-3 text-sm`, ui.warningBanner)}>
          {renderPlan.runtimeWarningMessage}
        </div>
      ) : null}

      {renderPlan.hasRecoveryNotice ? (
        <div className={clsx(`${maxWithTW} mx-auto mb-4 w-full rounded-xl px-4 py-3 text-sm`, ui.infoBanner)}>
          <div className="flex items-center gap-2">
            {durableRecoveryState.phase === 'recovering' ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            <span>{renderPlan.recoveryNoticeMessage}</span>
          </div>
        </div>
      ) : null}

      {error ? (
        <div className={clsx(`${maxWithTW} mx-auto mb-4 w-full rounded-xl px-4 py-3 text-sm`, ui.errorBanner)}>
          {error}
        </div>
      ) : null}

      {renderPlan.showSilentThreadLoadingPlaceholder ? (
        <div className={`${maxWithTW} mx-auto w-full`} style={messageListMinHeight} aria-busy="true" />
      ) : renderPlan.showEmptyState ? (
        <div className={`${maxWithTW} mx-auto w-full`} style={centeredEmptyState ? undefined : messageListMinHeight}>
          <div className={clsx('flex flex-col items-center gap-3', centeredEmptyState ? 'justify-end' : 'min-h-full justify-center')}>
            {showWelcomeWhenEmpty ? <WelcomeMessage activeThreadId={activeThreadId} /> : null}
            {renderPlan.showEmptyThinkingIndicator ? <ThinkingIndicator /> : null}
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
            {renderPlan.transcriptRenderItems.map((item) => (
              item.type === 'answer-container' ? (
                  <AnswerContainerCard
                    key={item.key}
                    actionContext={
                      answerContainerActionContexts.get(item.container.actionHostId) ?? {
                        copyText: '',
                        hasVisibleOperation: false
                      }
                    }
                    container={item.container}
                    onOpenSearchResult={onOpenSearchResult}
                    showPersistedResearchStatus={showPersistedResearchStatus}
                  />
              ) : (
                  <TranscriptBlockCard
                    key={item.key}
                    actionContext={assistantTurnActionContexts.get(item.block.id)}
                    block={item.block}
                    onOpenSearchResult={onOpenSearchResult}
                    showPersistedResearchStatus={showPersistedResearchStatus}
                  />
              )
            ))}
            {renderPlan.showLiveAssistant && liveAssistantDraft ? (
              <LiveAssistantCard
                actionsAvailable={liveAssistantActionsAvailable}
                getLiveSearchPanelData={getLiveSearchPanelData}
                liveAssistantDraft={liveAssistantDraft}
                onOpenSearchResult={onOpenSearchResult}
              />
            ) : null}
            {renderPlan.showTrailingThinkingIndicator ? <ThinkingIndicator /> : null}
          </div>
        </div>
      )}
    </div>
  );
});
