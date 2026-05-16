'use client';

import type { MessageDto, RuntimePiMetaDto } from '@agent-infra/contracts';
import clsx from 'clsx';
import { Loader2 } from 'lucide-react';
import { memo, useMemo } from 'react';

import { buildAnswerContainerActionContexts } from '@/features/durable-chat/service/build-answer-container-actions';
import { buildAssistantTurnActionContexts } from '@/features/durable-chat/service/assistant-turn-actions';
import { buildMessageListRenderPlan } from '@/features/durable-chat/service/message-list-presentation';
import type { AnswerContainer } from '@/features/durable-chat/types/answer-containers';
import type { LiveAssistantDraft } from '@/features/durable-chat/types/live-assistant-draft';
import type { DurableRecoveryState } from '@/features/durable-chat/types/runtime';
import type { ActiveSearchPanelData } from '@/features/durable-chat/types/search';
import type { TranscriptBlock } from '@/features/durable-chat/types/transcript-blocks';
import {
  AnswerContainerCard,
  LiveAssistantCard,
  ThinkingIndicator,
  TranscriptBlockCard,
  WelcomeMessage
} from './message-list-components';
import { useRenderDiagnostic } from '@/components/chat-shell/render-diagnostics';
import { maxWithTW, messageListMinHeight, ui } from '@/components/chat-shell/ui';

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
