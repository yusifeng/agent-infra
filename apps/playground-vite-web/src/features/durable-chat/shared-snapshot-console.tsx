import clsx from 'clsx';

import { ChatHeader } from './components/chat-header';
import { ChatMessageList } from './components/message-list';
import { SearchResultsPanel } from './components/search-results-panel';
import { ui } from './components/ui';
import { useSharedSnapshotRuntime } from './runtime/use-shared-snapshot-runtime';

const idleDurableRecoveryState = {
  phase: 'idle' as const,
  message: null
};

export function SharedSnapshotConsole({ initialPublicId }: { initialPublicId: string | null }) {
  const runtime = useSharedSnapshotRuntime({ initialPublicId });
  const {
    loading,
    error,
    currentThreadTitle,
    messagesViewportRef,
    displayedMessages,
    displayedTranscriptBlocks,
    displayedAnswerContainers,
    activeSearchResult,
    searchPanelError,
    searchPanelLoading,
    searchPanelOpen,
    onOpenSearchResult,
    onCloseSearchPanel
  } = runtime;

  return (
    <main className={clsx('chat-shell-theme chat-shell-scrollbars flex h-full min-h-0 overflow-hidden', ui.shell)}>
      <div className="relative flex flex-1 min-h-0 min-w-0 overflow-hidden">
        <div className={clsx('relative flex flex-1 min-h-0 min-w-0 flex-col overflow-hidden', ui.chatPane)}>
          <ChatHeader currentThreadTitle={currentThreadTitle} sidebarOpen={true} onOpenSidebar={() => undefined} />

          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <div ref={messagesViewportRef} className={clsx('relative flex min-h-0 flex-1 flex-col overflow-y-auto', ui.messageViewport)}>
              <ChatMessageList
                meta={null}
                error={error}
                durableRecoveryState={idleDurableRecoveryState}
                hasOlderMessages={false}
                historyLoading={false}
                loadingMessages={loading}
                activeThreadId={null}
                messages={displayedMessages}
                answerContainers={displayedAnswerContainers}
                transcriptBlocks={displayedTranscriptBlocks}
                liveAssistantDraft={null}
                showLoadingText={false}
                centeredEmptyState={false}
                showPersistedResearchStatus
                showWelcomeWhenEmpty={false}
                onLoadOlderMessages={() => undefined}
                onOpenSearchResult={onOpenSearchResult}
              />
            </div>
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
    </main>
  );
}
