'use client';

import clsx from 'clsx';

import { ChatHeader } from './chat-shell/chat-header';
import { ChatMessageList } from './chat-shell/message-list';
import { ComposerDock } from './chat-shell/composer-dock';
import { DurableLogPane } from './chat-shell/durable-log-pane';
import { ShareDialog } from './chat-shell/share-dialog';
import { ChatSidebar } from './chat-shell/sidebar';
import { ui } from './chat-shell/ui';
import type { AuthUserDto } from '@/features/auth/dto/project-auth-user-dto';
import { useDurableChatRuntime } from '@/features/durable-chat/runtime/use-durable-chat-runtime';

type DurableChatConsoleProps = {
  currentUser?: AuthUserDto | null;
  initialThreadId?: string | null;
  onLogout?: () => void;
};

export function DurableChatConsole({ currentUser = null, initialThreadId = null, onLogout }: DurableChatConsoleProps) {
  const runtime = useDurableChatRuntime({ initialThreadId });
  const centeredEmptyState =
    !runtime.activeThreadId &&
    runtime.displayedMessages.length === 0 &&
    runtime.liveAssistantDraft === null &&
    !runtime.loadingMessages;

  return (
    <main className={clsx('flex h-full min-h-0 overflow-hidden', ui.shell)}>
      <ChatSidebar
        sidebarOpen={runtime.sidebarOpen}
        threads={runtime.threads}
        activeThreadId={runtime.activeThreadId}
        currentUser={currentUser}
        onClose={runtime.onCloseSidebar}
        onNewChat={runtime.onNewChat}
        onOpenThread={runtime.onOpenThread}
        onLogout={onLogout}
      />

      <div className="flex flex-1 min-h-0 min-w-0 relative overflow-hidden">
        <div className={clsx('flex flex-1 min-h-0 min-w-0 relative flex-col overflow-hidden', ui.chatPane)}>
          <ChatHeader
            currentThreadTitle={runtime.currentThreadTitle}
            currentThreadPinned={runtime.currentThreadPinned}
            threadActionsDisabled={runtime.threadActionsDisabled}
            sidebarOpen={runtime.sidebarOpen}
            onOpenSidebar={runtime.onOpenSidebar}
            onRenameThread={runtime.onRenameThread}
            onToggleThreadPin={runtime.onToggleThreadPin}
            onArchiveThread={runtime.onArchiveThread}
            onOpenShareDialog={runtime.onOpenShareDialog}
            onToggleLog={runtime.onToggleLog}
          />

          <div className={clsx('flex min-h-0 flex-1 flex-col overflow-hidden', centeredEmptyState && 'justify-center')}>
            <div
              ref={runtime.messagesViewportRef}
              className={clsx(
                'relative flex min-h-0 flex-1 flex-col overflow-y-auto',
                centeredEmptyState && 'flex-none overflow-visible',
                ui.messageViewport
              )}
            >
              <ChatMessageList
                meta={runtime.meta}
                error={runtime.error}
                durableRecoveryState={runtime.durableRecoveryState}
                hasOlderMessages={runtime.hasOlderMessages}
                historyLoading={runtime.historyLoading}
                loadingMessages={runtime.loadingMessages}
                activeThreadId={runtime.activeThreadId}
                messages={runtime.displayedMessages}
                liveAssistantDraft={runtime.liveAssistantDraft}
                showLoadingText={
                  runtime.showResponseLoading &&
                  runtime.liveAssistantDraft?.eventType === 'start' &&
                  runtime.liveAssistantDraft.partialText.length === 0 &&
                  runtime.liveAssistantDraft.partialReasoning === null &&
                  runtime.liveAssistantDraft.activeTools.length === 0
                }
                centeredEmptyState={centeredEmptyState}
                onLoadOlderMessages={runtime.onLoadOlderMessages}
              />
            </div>
            <ComposerDock
              activeThreadId={runtime.activeThreadId}
              draft={runtime.draft}
              isResponding={runtime.isChatResponding}
              sendDisabled={runtime.sendDisabled}
              inputLocked={runtime.inputLocked}
              selectedThinkingEnabled={runtime.selectedThinkingEnabled}
              selectedReasoningEffort={runtime.selectedReasoningEffort}
              selectedModelOption={runtime.selectedModelOption}
              meta={runtime.meta}
              showScrollToBottom={runtime.showScrollToBottom}
              centered={centeredEmptyState}
              textareaRef={runtime.textareaRef}
              sendAbortControllerRef={runtime.sendAbortControllerRef}
              onDraftChange={runtime.onDraftChange}
              onSelectedThinkingEnabledChange={runtime.onSelectedThinkingEnabledChange}
              onSelectedReasoningEffortChange={runtime.onSelectedReasoningEffortChange}
              onSend={runtime.onSend}
              onStop={runtime.onStop}
              onScrollToBottom={runtime.onScrollToBottom}
            />
          </div>
        </div>

        <DurableLogPane
          logOpen={runtime.logOpen}
          meta={runtime.meta}
          recentRuns={runtime.recentRuns}
          recentRunsLoading={runtime.recentRunsLoading}
          recentRunsError={runtime.recentRunsError}
          activeThreadId={runtime.activeThreadId}
          selectedRunId={runtime.selectedRunId}
          selectedRun={runtime.selectedRun}
          runEvents={runtime.runEvents}
          toolInvocations={runtime.toolInvocations}
          liveStreamRunId={runtime.liveStreamRunId}
          persistingTurn={runtime.persistingTurn}
          timelineLoading={runtime.timelineLoading}
          timelineError={runtime.timelineError}
          onSelectRun={runtime.onSelectRun}
        />
      </div>
      <ShareDialog
        open={runtime.shareDialogOpen}
        loadingCurrentShare={runtime.loadingCurrentShare}
        creatingShare={runtime.creatingShare}
        revokingShare={runtime.revokingShare}
        copied={runtime.shareCopied}
        error={runtime.shareError}
        shareUrl={runtime.shareUrl}
        onClose={runtime.onCloseShareDialog}
        onCreateOrCopy={runtime.onCreateOrCopyShare}
        onRevoke={runtime.onRevokeShare}
      />
    </main>
  );
}
