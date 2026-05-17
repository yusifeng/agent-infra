'use client';

import type { MessageDto, MessagePartDto, RunFeedbackDto } from '@agent-infra/contracts';
import { getMessageRenderKey } from '@agent-infra/durable-chat-client';
import clsx from 'clsx';
import { Atom, Check, ChevronDown, ChevronRight, Copy, FileText, Loader2, RotateCw, Search, ThumbsDown, ThumbsUp, Trash2 } from 'lucide-react';
import { memo, useMemo, useState, type CSSProperties, type ReactNode } from 'react';

import {
  buildAnswerContainerContentSections,
  buildLiveAssistantContentSections,
  buildPersistedAssistantContentSections,
  hasVisiblePersistedAssistantContent,
  type AssistantMessageContentSection
} from '@/features/durable-chat/service/assistant-message-presentation';
import { collectLiveDraftCopyText, hasVisibleLiveAssistantContent } from '@/features/durable-chat/service/live-assistant-presentation';
import { buildResearchActivityViewModel, buildResearchTimelineRowsFromActivity, type ResearchTimelineRow } from '@/features/durable-chat/service/research-activity';
import {
  type LiveSummaryToken,
  type PersistedResearchToken,
  type ReasoningToken
} from '@/features/durable-chat/service/thinking-flow';
import type { AnswerContainer } from '@/features/durable-chat/types/answer-containers';
import type { AnswerCandidateGroup } from '@/features/durable-chat/types/answer-candidate-groups';
import type { LiveAssistantDraft } from '@/features/durable-chat/types/live-assistant-draft';
import type { ActiveSearchPanelData } from '@/features/durable-chat/types/search';
import type { AssistantTurnItem, TranscriptBlock } from '@/features/durable-chat/types/transcript-blocks';
import { copyMessageToClipboard, copyTextToClipboard } from '@/components/chat-shell/helpers';
import { MarkdownRenderer } from '@/components/chat-shell/markdown-renderer';
import { MessageActions } from '@/components/chat-shell/message-actions';
import { ReasoningPanel } from '@/components/chat-shell/reasoning-panel';
import { useRenderDiagnostic } from '@/components/chat-shell/render-diagnostics';
import { SiteIconBadge } from '@/components/chat-shell/site-icon-badge';
import { ui } from '@/components/chat-shell/ui';

const transcriptRowPerformanceStyle: CSSProperties = {
  containIntrinsicSize: '180px',
  contentVisibility: 'auto'
};

const reasoningTimelineTextClassName = 'text-sm leading-7 text-[color:var(--chat-text-secondary)]';
const reasoningMarkdownClassName = reasoningTimelineTextClassName;
const maxInlineBrowsePageCount = 4;

function isActiveReplayTarget(replayBlockId: string | null | undefined, activeReplayBlockId: string | null | undefined) {
  return Boolean(replayBlockId && activeReplayBlockId && replayBlockId === activeReplayBlockId);
}

const TimelineItem = memo(function TimelineItem({
  activeReplayBlockId = null,
  children,
  marker,
  replayBlockId = null
}: {
  activeReplayBlockId?: string | null;
  children: ReactNode;
  marker: ReactNode;
  replayBlockId?: string | null;
}) {
  const replayActive = isActiveReplayTarget(replayBlockId, activeReplayBlockId);

  return (
    <div
      className="grid grid-cols-[24px_minmax(0,1fr)] gap-3"
      data-replay-active={replayActive ? 'true' : undefined}
      data-replay-block-id={replayBlockId ?? undefined}
    >
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

const ResearchSummaryLabel = memo(function ResearchSummaryLabel({
  activeReplayBlockId = null,
  items,
  replayBlockId = null,
  runId,
  showPersistedResearchStatus = false,
  onOpenSearchResult
}: {
  activeReplayBlockId?: string | null;
  items: AssistantTurnItem[];
  replayBlockId?: string | null;
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

  return (
    <ResearchTimelineRows
      activeReplayBlockId={activeReplayBlockId}
      onOpenSearchResult={onOpenSearchResult}
      replayBlockId={replayBlockId}
      rows={rows}
      runId={runId}
    />
  );
});

const ResearchTimelineRows = memo(function ResearchTimelineRows({
  activeReplayBlockId = null,
  replayBlockId = null,
  runId,
  rows,
  onOpenSearchResult
}: {
  activeReplayBlockId?: string | null;
  replayBlockId?: string | null;
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
            <TimelineItem
              activeReplayBlockId={activeReplayBlockId}
              key={row.id}
              marker={marker}
              replayBlockId={replayBlockId}
            >
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
            activeReplayBlockId={activeReplayBlockId}
            key={row.id}
            marker={row.state === 'running' ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
            replayBlockId={replayBlockId}
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
  activeReplayBlockId = null,
  entries,
  getReplayBlockIdForItemId,
  thinking,
  showPersistedResearchStatus = false,
  onOpenSearchResult
}: {
  activeReplayBlockId?: string | null;
  entries: Array<ReasoningToken | PersistedResearchToken | LiveSummaryToken>;
  getReplayBlockIdForItemId?: (itemId: string) => string | null;
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
                <TimelineItem
                  activeReplayBlockId={activeReplayBlockId}
                  key={entry.id}
                  marker={reasoningDotMarker}
                  replayBlockId={getReplayBlockIdForItemId?.(entry.id) ?? null}
                >
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
                  activeReplayBlockId={activeReplayBlockId}
                  key={entry.id}
                  items={entry.items}
                  onOpenSearchResult={onOpenSearchResult}
                  replayBlockId={getReplayBlockIdForItemId?.(entry.id) ?? null}
                  runId={entry.runId}
                  showPersistedResearchStatus={showPersistedResearchStatus}
                />
              );
            }

            return (
              <ResearchTimelineRows
                activeReplayBlockId={activeReplayBlockId}
                key={entry.id}
                onOpenSearchResult={onOpenSearchResult}
                replayBlockId={null}
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

function buildAnswerContainerActions({
  copyAvailable,
  feedback,
  feedbackEnabled,
  feedbackPending
}: {
  copyAvailable: boolean;
  feedback?: RunFeedbackDto | null;
  feedbackEnabled: boolean;
  feedbackPending: boolean;
}) {
  return [
    {
      disabled: !copyAvailable,
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
    },
    {
      active: feedback?.value === 'thumbs_up',
      disabled: !feedbackEnabled || feedbackPending,
      icon: ThumbsUp,
      key: 'thumbs_up',
      label: '点赞这个回答'
    },
    {
      active: feedback?.value === 'thumbs_down',
      disabled: !feedbackEnabled || feedbackPending,
      icon: ThumbsDown,
      key: 'thumbs_down',
      label: '点踩这个回答'
    }
  ];
}

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
    () => buildPersistedAssistantContentSections(items, runId, showPersistedResearchStatus),
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
    () => buildLiveAssistantContentSections(liveAssistantDraft, getLiveSearchPanelData),
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
      variant?: 'standalone' | 'candidate';
      activeReplayBlockId?: string | null;
      onOpenSearchResult?: (runId: string, toolCallIds: string[]) => void;
      }
    | {
        type: 'live';
        liveAssistantDraft: LiveAssistantDraft;
        actionsAvailable?: boolean;
        variant?: 'standalone' | 'candidate';
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
      ? hasVisiblePersistedAssistantContent(props.block.items, props.block.runId, props.showPersistedResearchStatus ?? false)
      : hasVisibleLiveAssistantContent(props.liveAssistantDraft);

  if (!hasVisibleContent) {
    return null;
  }
  const replayBlockId = props.type === 'persisted-turn' ? props.block.id : null;
  const replayActive =
    props.type === 'persisted-turn' &&
    replayBlockId !== null &&
    props.activeReplayBlockId === replayBlockId;

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
      className={clsx(
        'group relative max-w-screen',
        props.variant === 'candidate' ? 'w-full px-0' : 'w-[90%] px-4',
        showActions ? 'pb-8' : 'pb-2'
      )}
      data-message-role="assistant"
      data-message-id={props.type === 'persisted-turn' ? props.block.id : props.liveAssistantDraft.messageId}
      data-replay-active={replayActive ? 'true' : undefined}
      data-replay-block-id={replayBlockId ?? undefined}
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

function getAnswerContainerSectionItemIds(section: AssistantMessageContentSection) {
  if (section.type === 'content') {
    return section.token.kind === 'persisted-text' ? [section.token.part.id] : [];
  }

  if (section.type === 'research') {
    return section.entry.kind === 'persisted-research'
      ? [section.entry.id, ...section.entry.items.map((item) => item.id)]
      : [];
  }

  return section.entries.flatMap((entry) => {
    if (entry.kind === 'reasoning') {
      return [entry.id];
    }

    if (entry.kind === 'persisted-research') {
      return [entry.id, ...entry.items.map((item) => item.id)];
    }

    return [];
  });
}

function resolveAnswerContainerSectionReplayBlockId(
  section: AssistantMessageContentSection,
  getReplayBlockIdForItemId: (itemId: string) => string | null,
  activeReplayBlockId: string | null
) {
  const blockIds = getAnswerContainerSectionItemIds(section)
    .map((itemId) => getReplayBlockIdForItemId(itemId))
    .filter((blockId): blockId is string => Boolean(blockId));

  if (activeReplayBlockId && blockIds.includes(activeReplayBlockId)) {
    return activeReplayBlockId;
  }

  return blockIds[0] ?? null;
}

export const AnswerContainerCard = memo(function AnswerContainerCard({
  container,
  actionContext,
  feedback = null,
  feedbackPending = false,
  feedbackTriggerMessageId = null,
  showPersistedResearchStatus = false,
  activeReplayBlockId = null,
  variant = 'standalone',
  onOpenSearchResult,
  onSetRunFeedback
}: {
  container: AnswerContainer;
  actionContext: {
    copyText: string;
    hasVisibleOperation: boolean;
  };
  feedback?: RunFeedbackDto | null;
  feedbackPending?: boolean;
  feedbackTriggerMessageId?: string | null;
  showPersistedResearchStatus?: boolean;
  activeReplayBlockId?: string | null;
  variant?: 'standalone' | 'candidate';
  onOpenSearchResult?: (runId: string, toolCallIds: string[]) => void;
  onSetRunFeedback?: (runId: string, triggerMessageId: string, value: RunFeedbackDto['value'] | null) => void;
}) {
  const sections = useMemo(
    () => buildAnswerContainerContentSections(container.blocks, showPersistedResearchStatus),
    [container.blocks, showPersistedResearchStatus]
  );
  if (sections.length === 0) {
    return null;
  }
  const replayActive = activeReplayBlockId !== null && container.transcriptBlockIds.includes(activeReplayBlockId);
  const blockIdByItemId = new Map(
    container.blocks.flatMap((block) => block.items.map((item) => [item.id, block.id] as const))
  );
  const getReplayBlockIdForItemId = (itemId: string) => blockIdByItemId.get(itemId) ?? null;
  const feedbackEnabled = Boolean(container.runId && feedbackTriggerMessageId && onSetRunFeedback);
  const actionsAvailable = actionContext.hasVisibleOperation || feedbackEnabled;
  const actionItems = buildAnswerContainerActions({
    copyAvailable: actionContext.hasVisibleOperation,
    feedback,
    feedbackEnabled,
    feedbackPending
  });

  return (
    <div
      className={clsx(
        'group relative max-w-screen',
        variant === 'candidate' ? 'w-full px-0' : 'w-[90%] px-4',
        actionsAvailable ? 'pb-8' : 'pb-2'
      )}
      data-answer-container-id={container.id}
      data-message-role="assistant"
      data-replay-container-active={replayActive ? 'true' : undefined}
      style={transcriptRowPerformanceStyle}
    >
      <div className={clsx('relative flex flex-col gap-3 pt-1.5', ui.assistantBubble)}>
        {sections.map((section) => {
          const sectionReplayBlockId = resolveAnswerContainerSectionReplayBlockId(
            section,
            getReplayBlockIdForItemId,
            activeReplayBlockId
          );
          const sectionContent = (() => {
            if (section.type === 'thinking') {
              return (
                <ThinkingTimelinePanel
                  entries={section.entries}
                  activeReplayBlockId={activeReplayBlockId}
                  getReplayBlockIdForItemId={getReplayBlockIdForItemId}
                  thinking={section.thinking}
                  showPersistedResearchStatus={showPersistedResearchStatus}
                  onOpenSearchResult={onOpenSearchResult}
                />
              );
            }

            if (section.type === 'research') {
              return section.entry.kind === 'persisted-research' ? (
                <ResearchSummaryLabel
                  items={section.entry.items}
                  activeReplayBlockId={activeReplayBlockId}
                  onOpenSearchResult={onOpenSearchResult}
                  replayBlockId={sectionReplayBlockId}
                  runId={section.entry.runId}
                  showPersistedResearchStatus={showPersistedResearchStatus}
                />
              ) : (
                <ResearchTimelineRows
                  activeReplayBlockId={activeReplayBlockId}
                  onOpenSearchResult={onOpenSearchResult}
                  replayBlockId={sectionReplayBlockId}
                  rows={section.entry.rows}
                  runId={section.entry.runId}
                />
              );
            }

            if (section.token.kind === 'persisted-text') {
              return (
                <MessagePartView
                  cacheKey={section.token.part.cacheKey}
                  part={section.token.part.part}
                />
              );
            }

            return (
              <MarkdownRenderer
                cacheKey={section.token.cacheKey}
                animateBlocks={false}
                className="text-[15px] leading-[1.9] text-[color:var(--chat-text)]"
                plainTextClassName="text-[15px] leading-[1.9] text-[color:var(--chat-text)]"
                text={section.token.text}
              />
            );
          })();

          return (
            <div
              key={section.id}
              data-replay-active={
                section.type === 'content' && isActiveReplayTarget(sectionReplayBlockId, activeReplayBlockId)
                  ? 'true'
                  : undefined
              }
              data-replay-block-id={sectionReplayBlockId ?? undefined}
            >
              {sectionContent}
            </div>
          );
        })}
      </div>
      <MessageActions
        available={actionsAvailable}
        items={actionItems}
        onActionClick={(key) => {
          if (key === 'copy') {
            void copyTextToClipboard(actionContext.copyText);
            return;
          }

          if ((key === 'thumbs_up' || key === 'thumbs_down') && container.runId && feedbackTriggerMessageId) {
            onSetRunFeedback?.(
              container.runId,
              feedbackTriggerMessageId,
              feedback?.value === key ? null : key
            );
          }
        }}
      />
    </div>
  );
});

const UserMessageBlockCard = memo(function UserMessageBlockCard({
  message,
  blockId,
  activeReplayBlockId = null
}: {
  message: MessageDto;
  blockId?: string;
  activeReplayBlockId?: string | null;
}) {
  const isOptimistic = message.metadata?.optimistic === true;
  const renderKey = getMessageRenderKey(message);
  const replayActive = activeReplayBlockId !== null && blockId === activeReplayBlockId;
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
      data-replay-active={replayActive ? 'true' : undefined}
      data-replay-block-id={blockId}
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

function formatCandidateLabel(candidate: AnswerCandidateGroup['candidates'][number]) {
  return candidate.candidate.ordinal === 0 ? '回答 A' : `回答 ${String.fromCharCode(65 + candidate.candidate.ordinal)}`;
}

function formatCandidateStatus(candidate: AnswerCandidateGroup['candidates'][number]) {
  if (candidate.status === 'queued') {
    return '排队中';
  }

  if (candidate.status === 'running') {
    return '生成中';
  }

  if (candidate.status === 'failed') {
    return '失败';
  }

  if (candidate.status === 'empty') {
    return '暂无内容';
  }

  return '已完成';
}

export const AnswerCandidateGroupCard = memo(function AnswerCandidateGroupCard({
  actionContexts,
  getLiveSearchPanelData,
  group,
  onOpenSearchResult,
  onChooseAnswerCandidate,
  onSetRunFeedback,
  pendingRunIds = new Set(),
  showPersistedResearchStatus = false
}: {
  actionContexts: Map<string, { copyText: string; hasVisibleOperation: boolean }>;
  getLiveSearchPanelData?: (runId: string, toolCallIds: string[]) => ActiveSearchPanelData | null;
  group: AnswerCandidateGroup;
  onOpenSearchResult?: (runId: string, toolCallIds: string[]) => void;
  onChooseAnswerCandidate?: (runId: string, triggerMessageId: string) => void;
  onSetRunFeedback?: (runId: string, triggerMessageId: string, value: RunFeedbackDto['value'] | null) => void;
  pendingRunIds?: Set<string>;
  showPersistedResearchStatus?: boolean;
}) {
  const hasUserSelection = group.selection?.source === 'user';

  return (
    <div
      className="w-full px-4 py-3"
      data-answer-candidate-group-id={group.id}
      data-trigger-message-id={group.triggerMessageId}
      style={transcriptRowPerformanceStyle}
    >
      <div className="grid gap-3 lg:grid-cols-2">
        {group.candidates.map((candidate) => {
          const actionContext = candidate.answerContainer
            ? actionContexts.get(candidate.answerContainer.actionHostId) ?? { copyText: '', hasVisibleOperation: false }
            : { copyText: '', hasVisibleOperation: false };

          return (
            <section
              key={candidate.id}
              className={clsx(
                'min-w-0 rounded-[28px] border bg-[color:var(--chat-surface)] p-4 shadow-sm transition',
                hasUserSelection && candidate.selected
                  ? 'border-[color:var(--chat-accent)] ring-1 ring-[color:var(--chat-accent)]'
                  : 'border-[color:var(--chat-border)]'
              )}
              data-answer-candidate-run-id={candidate.candidate.runId}
              data-answer-candidate-selected={candidate.selected ? 'true' : undefined}
            >
              <div className="mb-3 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 text-sm font-semibold text-[color:var(--chat-text)]">
                    <span>{formatCandidateLabel(candidate)}</span>
                  </div>
                  <div className="mt-0.5 text-xs text-[color:var(--chat-text-tertiary)]">{formatCandidateStatus(candidate)}</div>
                </div>
                {hasUserSelection && candidate.selected ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-[var(--chat-accent)] px-2.5 py-1 text-xs font-semibold text-white">
                    <Check className="h-3.5 w-3.5" />
                    已选择
                  </span>
                ) : null}
              </div>

              {candidate.answerContainer ? (
                <AnswerContainerCard
                  actionContext={actionContext}
                  container={candidate.answerContainer}
                  feedback={candidate.feedback}
                  feedbackPending={pendingRunIds.has(candidate.candidate.runId)}
                  feedbackTriggerMessageId={candidate.candidate.triggerMessageId}
                  onOpenSearchResult={onOpenSearchResult}
                  onSetRunFeedback={onSetRunFeedback}
                  showPersistedResearchStatus={showPersistedResearchStatus}
                  variant="candidate"
                />
              ) : candidate.liveAssistantDraft ? (
                <LiveAssistantCard
                  getLiveSearchPanelData={getLiveSearchPanelData}
                  liveAssistantDraft={candidate.liveAssistantDraft}
                  onOpenSearchResult={onOpenSearchResult}
                  variant="candidate"
                />
              ) : (
                <div className="rounded-2xl border border-dashed border-[color:var(--chat-border)] px-4 py-8 text-sm text-[color:var(--chat-text-tertiary)]">
                  {candidate.status === 'failed' ? '这个回答生成失败。' : '这个回答暂时没有可展示内容。'}
                </div>
              )}

              <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-[color:var(--chat-border)] pt-3">
                <button
                  type="button"
                  disabled={candidate.status !== 'completed' || pendingRunIds.has(candidate.candidate.runId)}
                  onClick={() => onChooseAnswerCandidate?.(candidate.candidate.runId, candidate.candidate.triggerMessageId)}
                  className={clsx(
                    'rounded-full px-3 py-1.5 text-xs font-semibold transition',
                    'bg-[var(--chat-surface-muted)] text-[color:var(--chat-text-secondary)] hover:text-[color:var(--chat-text)]',
                    (candidate.status !== 'completed' || pendingRunIds.has(candidate.candidate.runId)) &&
                      'cursor-default opacity-60'
                  )}
                >
                  选择这个
                </button>
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
});

export const TranscriptBlockCard = memo(function TranscriptBlockCard({
  block,
  showPersistedResearchStatus = false,
  activeReplayBlockId = null,
  actionContext,
  onOpenSearchResult
}: {
  block: TranscriptBlock;
  showPersistedResearchStatus?: boolean;
  activeReplayBlockId?: string | null;
  actionContext?: {
    copyText: string;
    showActions: boolean;
  };
  onOpenSearchResult?: (runId: string, toolCallIds: string[]) => void;
}) {
  if (block.type === 'user-message') {
    return <UserMessageBlockCard activeReplayBlockId={activeReplayBlockId} blockId={block.id} message={block.message} />;
  }

  return (
    <AssistantTranscriptCard
      actionContext={actionContext ?? { copyText: '', showActions: false }}
      activeReplayBlockId={activeReplayBlockId}
      block={block}
      onOpenSearchResult={onOpenSearchResult}
      showPersistedResearchStatus={showPersistedResearchStatus}
      variant="standalone"
      type="persisted-turn"
    />
  );
});

export const LiveAssistantCard = memo(function LiveAssistantCard({
  actionsAvailable = false,
  getLiveSearchPanelData,
  liveAssistantDraft,
  variant = 'standalone',
  onOpenSearchResult
}: {
  actionsAvailable?: boolean;
  liveAssistantDraft: LiveAssistantDraft;
  variant?: 'standalone' | 'candidate';
  getLiveSearchPanelData?: (runId: string, toolCallIds: string[]) => ActiveSearchPanelData | null;
  onOpenSearchResult?: (runId: string, toolCallIds: string[]) => void;
}) {
  return (
    <AssistantTranscriptCard
      actionsAvailable={actionsAvailable}
      getLiveSearchPanelData={getLiveSearchPanelData}
      liveAssistantDraft={liveAssistantDraft}
      onOpenSearchResult={onOpenSearchResult}
      variant={variant}
      type="live"
    />
  );
});
