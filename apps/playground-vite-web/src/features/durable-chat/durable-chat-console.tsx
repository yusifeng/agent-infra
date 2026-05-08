import clsx from 'clsx';
import { Share2 } from 'lucide-react';

import { ChatHeader } from './components/chat-header';
import { ComposerDock } from './components/composer-dock';
import { ShareDialog } from './components/share-dialog';
import { ThreadArchiveDialog } from './components/thread-archive-dialog';
import { ThreadRenameDialog } from './components/thread-rename-dialog';
import { IconButton } from './components/shared';
import { ChatMessageList } from './components/message-list';
import { SearchResultsPanel } from './components/search-results-panel';
import { ChatSidebar } from './components/sidebar';
import { ui } from './components/ui';
import { useDurableChatRuntime } from './runtime/use-durable-chat-runtime';

export function DurableChatConsole({ initialThreadId }: { initialThreadId: string | null }) {
  const runtime = useDurableChatRuntime({ initialThreadId });
  const {
    sidebarOpen,
    threads,
    pinnedThreadIds,
    activeThreadId,
    openThreadMenuId,
    renameDialogThreadId,
    renameDraftTitle,
    renamingThreadId,
    archiveDialogThreadId,
    archivingThreadId,
    threadActionError,
    onCloseSidebar,
    onNewChat,
    onOpenThread,
    onOpenThreadMenu,
    closeThreadMenu: onCloseThreadMenu,
    onOpenRenameThread,
    onRenameDraftTitleChange,
    onConfirmRenameThread,
    onOpenArchiveThread,
    onConfirmArchiveThread,
    onPinThread,
    onUnpinThread,
    currentThreadTitle,
    onOpenSidebar,
    messagesViewportRef,
    meta,
    error,
    durableRecoveryState,
    hasOlderMessages,
    historyLoading,
    loadingMessages,
    displayedMessages,
    displayedAnswerContainers,
    displayedTranscriptBlocks,
    liveAssistantDraft,
    onLoadOlderMessages,
    draft,
    isChatResponding,
    sendDisabled,
    inputLocked,
    selectedWebSearchEnabled,
    selectedThinkingEnabled,
    selectedReasoningEffort,
    selectedModelOption,
    activeSearchResult,
    searchPanelError,
    searchPanelLoading,
    searchPanelOpen,
    showScrollToBottom,
    textareaRef,
    sendAbortControllerRef,
    onDraftChange,
    onSelectedWebSearchEnabledChange,
    onSelectedThinkingEnabledChange,
    onSelectedReasoningEffortChange,
    onOpenSearchResult,
    onCloseSearchPanel,
    onSend,
    onStop,
    onScrollToBottom,
    showResponseLoading,
    shareDialog,
    onOpenShareThread
  } = runtime;
  const showLoadingText =
    showResponseLoading &&
    liveAssistantDraft !== null &&
    liveAssistantDraft.eventType === 'start' &&
    liveAssistantDraft.partialText.length === 0 &&
    liveAssistantDraft.partialReasoning === null &&
    liveAssistantDraft.activeTools.length === 0;
  const centeredEmptyState = !activeThreadId && displayedMessages.length === 0 && liveAssistantDraft === null && !loadingMessages;

  return (
    <main className={clsx('chat-shell-theme chat-shell-scrollbars flex h-full min-h-0 overflow-hidden', ui.shell)}>
      <ChatSidebar
        sidebarOpen={sidebarOpen}
        threads={threads}
        pinnedThreadIds={pinnedThreadIds}
        activeThreadId={activeThreadId}
        openThreadMenuId={openThreadMenuId}
        onClose={onCloseSidebar}
        onNewChat={onNewChat}
        onOpenThread={onOpenThread}
        onOpenThreadMenu={onOpenThreadMenu}
        onCloseThreadMenu={onCloseThreadMenu}
        onRenameThread={onOpenRenameThread}
        onTogglePinThread={(threadId, pinned) => {
          if (pinned) {
            onUnpinThread(threadId);
          } else {
            onPinThread(threadId);
          }
        }}
        onShareThread={onOpenShareThread}
        onArchiveThread={onOpenArchiveThread}
      />

      <div className="relative flex flex-1 min-h-0 min-w-0 overflow-hidden">
        <div className={clsx('relative flex flex-1 min-h-0 min-w-0 flex-col overflow-hidden', ui.chatPane)}>
          <ChatHeader
              currentThreadTitle={currentThreadTitle}
              sidebarOpen={sidebarOpen}
              onOpenSidebar={onOpenSidebar}
              trailingContent={
                activeThreadId && !isChatResponding && displayedMessages.length > 0 ? (
                  <IconButton icon={Share2} onClick={() => onOpenShareThread(activeThreadId)} size="small" title="分享对话" />
                ) : null
              }
            />

          <div className={clsx('flex min-h-0 flex-1 flex-col overflow-hidden', centeredEmptyState && 'justify-center')}>
            <div
              ref={messagesViewportRef}
              className={clsx(
                'relative flex min-h-0 flex-1 flex-col overflow-y-auto',
                centeredEmptyState && 'flex-none overflow-visible',
                ui.messageViewport
              )}
            >
              <ChatMessageList
                meta={meta}
                error={error}
                durableRecoveryState={durableRecoveryState}
                hasOlderMessages={hasOlderMessages}
                historyLoading={historyLoading}
                loadingMessages={loadingMessages}
                activeThreadId={activeThreadId}
                messages={displayedMessages}
                answerContainers={displayedAnswerContainers}
                transcriptBlocks={displayedTranscriptBlocks}
                liveAssistantDraft={liveAssistantDraft}
                showLoadingText={showLoadingText}
                centeredEmptyState={centeredEmptyState}
                onLoadOlderMessages={onLoadOlderMessages}
                onOpenSearchResult={onOpenSearchResult}
              />
            </div>

            <ComposerDock
              activeThreadId={activeThreadId}
              draft={draft}
              isResponding={isChatResponding}
              sendDisabled={sendDisabled}
              inputLocked={inputLocked}
              selectedWebSearchEnabled={selectedWebSearchEnabled}
              selectedThinkingEnabled={selectedThinkingEnabled}
              selectedReasoningEffort={selectedReasoningEffort}
              selectedModelOption={selectedModelOption}
              meta={meta}
              showScrollToBottom={showScrollToBottom}
              centered={centeredEmptyState}
              textareaRef={textareaRef}
              sendAbortControllerRef={sendAbortControllerRef}
              onDraftChange={onDraftChange}
              onSelectedWebSearchEnabledChange={onSelectedWebSearchEnabledChange}
              onSelectedThinkingEnabledChange={onSelectedThinkingEnabledChange}
              onSelectedReasoningEffortChange={onSelectedReasoningEffortChange}
              onSend={onSend}
              onStop={onStop}
              onScrollToBottom={onScrollToBottom}
            />
          </div>
        </div>

        <SearchResultsPanel
          open={searchPanelOpen}
          loading={searchPanelLoading}
          error={searchPanelError}
          result={activeSearchResult}
          onClose={onCloseSearchPanel}
        />
      </div>

      <ShareDialog
        open={shareDialog.open}
        loadingCurrentShare={shareDialog.loadingCurrentShare}
        creatingShare={shareDialog.creatingShare}
        revokingShare={shareDialog.revokingShare}
        copied={shareDialog.copied}
        error={shareDialog.error}
        shareUrl={shareDialog.shareUrl}
        onClose={shareDialog.onClose}
        onCreateOrCopy={shareDialog.onCreateOrCopy}
        onRevoke={shareDialog.onRevoke}
      />

      <ThreadRenameDialog
        open={Boolean(renameDialogThreadId)}
        title={renameDraftTitle}
        loading={Boolean(renamingThreadId)}
        error={threadActionError}
        onClose={runtime.closeRenameDialog}
        onTitleChange={onRenameDraftTitleChange}
        onConfirm={onConfirmRenameThread}
      />

      <ThreadArchiveDialog
        open={Boolean(archiveDialogThreadId)}
        loading={Boolean(archivingThreadId)}
        error={threadActionError}
        onClose={runtime.closeArchiveDialog}
        onConfirm={onConfirmArchiveThread}
      />
    </main>
  );
}
