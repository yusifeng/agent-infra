'use client';

import clsx from 'clsx';
import { useCallback, useRef, useState } from 'react';

import { ChatHeader } from './chat-shell/chat-header';
import { ChatMessageList } from './chat-shell/message-list';
import { ComposerDock } from './chat-shell/composer-dock';
import { SearchResultsPanel } from './chat-shell/search-results-panel';
import { ShareDialog } from './chat-shell/share-dialog';
import { ChatSidebar } from './chat-shell/sidebar';
import { ThreadArchiveDialog } from './chat-shell/thread-archive-dialog';
import { ThreadRenameDialog } from './chat-shell/thread-rename-dialog';
import { ui } from './chat-shell/ui';
import type { AuthUserDto } from '@/features/auth/dto/project-auth-user-dto';
import { useDurableChatRuntime } from '@/features/durable-chat/runtime/use-durable-chat-runtime';

type DurableChatConsoleProps = {
  currentUser?: AuthUserDto | null;
  initialThreadId?: string | null;
  onLogout?: () => void;
};

function useStableCallback<TArgs extends unknown[], TResult>(callback: (...args: TArgs) => TResult) {
  const callbackRef = useRef(callback);
  callbackRef.current = callback;

  return useCallback((...args: TArgs) => callbackRef.current(...args), []);
}

export function DurableChatConsole({ currentUser = null, initialThreadId = null, onLogout }: DurableChatConsoleProps) {
  const runtime = useDurableChatRuntime({ initialThreadId });
  const [openThreadMenuId, setOpenThreadMenuId] = useState<string | null>(null);
  const closeThreadMenu = useCallback(() => setOpenThreadMenuId(null), []);
  const handleCloseSidebar = useStableCallback(runtime.onCloseSidebar);
  const handleNewChat = useStableCallback(runtime.onNewChat);
  const handleOpenThread = useStableCallback(runtime.onOpenThread);
  const handleRenameThread = useStableCallback(runtime.onRenameThreadById);
  const handleTogglePinThread = useStableCallback(runtime.onToggleThreadPinById);
  const handleShareThread = useStableCallback(runtime.onOpenThreadShareDialog);
  const handleArchiveThread = useStableCallback(runtime.onArchiveThreadById);
  const handleLoadOlderMessages = useStableCallback(runtime.onLoadOlderMessages);
  const handleOpenSearchResult = useStableCallback(runtime.onOpenSearchResult);
  const getLiveSearchPanelData = useStableCallback(runtime.getLiveSearchPanelData);
  const centeredEmptyState =
    !runtime.activeThreadId &&
    runtime.displayedMessages.length === 0 &&
    runtime.liveAssistantDraft === null &&
    !runtime.loadingMessages;
  const showCenteredComposerLayout =
    centeredEmptyState &&
    !runtime.error &&
    runtime.durableRecoveryState.phase === 'idle' &&
    !(runtime.meta?.runtimeConfigured === false && runtime.meta.runtimeConfigError) &&
    !runtime.showResponseLoading;
  const renderComposerDock = (centered: boolean) => (
    <ComposerDock
      draft={runtime.draft}
      isResponding={runtime.isChatResponding}
      sendDisabled={runtime.sendDisabled}
      inputLocked={runtime.inputLocked}
      selectedWebSearchEnabled={runtime.selectedWebSearchEnabled}
      selectedThinkingEnabled={runtime.selectedThinkingEnabled}
      selectedModelOption={runtime.selectedModelOption}
      deepseekModePresentation={runtime.deepseekModePresentation}
      onSelectedModelKeyChange={runtime.onSelectedModelKeyChange}
      meta={runtime.meta}
      showScrollToBottom={runtime.showScrollToBottom}
      centered={centered}
      textareaRef={runtime.textareaRef}
      sendAbortControllerRef={runtime.sendAbortControllerRef}
      onDraftChange={runtime.onDraftChange}
      onSelectedWebSearchEnabledChange={runtime.onSelectedWebSearchEnabledChange}
      onSelectedThinkingEnabledChange={runtime.onSelectedThinkingEnabledChange}
      onSend={runtime.onSend}
      onStop={runtime.onStop}
      onScrollToBottom={runtime.onScrollToBottom}
    />
  );

  return (
    <main className={clsx('flex h-full min-h-0 overflow-hidden', ui.shell)}>
      <ChatSidebar
        sidebarOpen={runtime.sidebarOpen}
        threads={runtime.threads}
        activeThreadId={runtime.activeThreadId}
        openThreadMenuId={openThreadMenuId}
        currentUser={currentUser}
        onClose={handleCloseSidebar}
        onNewChat={handleNewChat}
        onOpenThread={handleOpenThread}
        onOpenThreadMenu={setOpenThreadMenuId}
        onCloseThreadMenu={closeThreadMenu}
        onRenameThread={handleRenameThread}
        onTogglePinThread={handleTogglePinThread}
        onShareThread={handleShareThread}
        onArchiveThread={handleArchiveThread}
        onLogout={onLogout}
      />

      <div className="flex flex-1 min-h-0 min-w-0 relative overflow-hidden">
        <div className={clsx('flex flex-1 min-h-0 min-w-0 relative flex-col overflow-hidden', ui.chatPane)}>
          <ChatHeader
            currentThreadTitle={runtime.currentThreadTitle}
            threadActionsDisabled={runtime.threadActionsDisabled}
            sidebarOpen={runtime.sidebarOpen}
            onOpenSidebar={runtime.onOpenSidebar}
            onNewChat={runtime.onNewChat}
            mode={runtime.deepseekModePresentation.selectedMode}
            onOpenShareDialog={runtime.onOpenShareDialog}
          />

          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            {showCenteredComposerLayout ? (
              <div
                ref={runtime.messagesViewportRef}
                className={clsx('flex min-h-0 flex-1 flex-col justify-center overflow-hidden pb-16', ui.messageViewport)}
              >
                {renderComposerDock(true)}
              </div>
            ) : (
              <>
                <div
                  ref={runtime.messagesViewportRef}
                  className={clsx('relative flex min-h-0 flex-1 flex-col overflow-y-auto', ui.messageViewport)}
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
                    answerContainers={runtime.displayedAnswerContainers}
                    transcriptBlocks={runtime.displayedTranscriptBlocks}
                    liveAssistantDraft={runtime.liveAssistantDraft}
                    liveAssistantActionsAvailable={runtime.liveAssistantActionsAvailable}
                    showLoadingText={
                      runtime.showResponseLoading &&
                      (
                        !runtime.liveAssistantDraft ||
                        (
                          runtime.liveAssistantDraft.eventType === 'start' &&
                          runtime.liveAssistantDraft.partialText.length === 0 &&
                          runtime.liveAssistantDraft.partialReasoning === null &&
                          runtime.liveAssistantDraft.activeTools.length === 0
                        )
                      )
                    }
                    centeredEmptyState={false}
                    getLiveSearchPanelData={getLiveSearchPanelData}
                    onLoadOlderMessages={handleLoadOlderMessages}
                    onOpenSearchResult={handleOpenSearchResult}
                  />
                </div>
                {renderComposerDock(false)}
              </>
            )}
          </div>
        </div>
        <SearchResultsPanel
          open={runtime.searchPanelOpen}
          loading={runtime.searchPanelLoading}
          error={runtime.searchPanelError}
          result={runtime.activeSearchResult}
          onClose={runtime.onCloseSearchPanel}
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
      <ThreadRenameDialog
        open={runtime.renameDialogThreadId !== null}
        title={runtime.renameDraftTitle}
        loading={runtime.renamingThreadId !== null}
        error={runtime.renameDialogThreadId !== null ? runtime.threadActionError : null}
        onClose={runtime.onCloseRenameDialog}
        onTitleChange={runtime.onRenameDraftTitleChange}
        onConfirm={runtime.onConfirmRenameThread}
      />
      <ThreadArchiveDialog
        open={runtime.archiveDialogThreadId !== null}
        loading={runtime.archivingThreadId !== null}
        error={runtime.archiveDialogThreadId !== null ? runtime.threadActionError : null}
        onClose={runtime.onCloseArchiveDialog}
        onConfirm={runtime.onConfirmArchiveThread}
      />
    </main>
  );
}
