import clsx from 'clsx';

import { ChatHeader } from './components/chat-header';
import { ChatMessageList } from './components/message-list';
import { ReplayControlBar } from './components/replay-control-bar';
import { SearchResultsPanel } from './components/search-results-panel';
import { ChatSidebar } from './components/sidebar';
import { ui } from './components/ui';
import { useReplayConsoleRuntime } from './runtime/use-replay-console-runtime';

const idleDurableRecoveryState = {
  phase: 'idle' as const,
  message: null
};

export function ReplayConsole({ initialThreadId }: { initialThreadId: string | null }) {
  const runtime = useReplayConsoleRuntime({ initialThreadId });
  const {
    sidebarOpen,
    threads,
    activeThreadId,
    currentThreadTitle,
    loading,
    error,
    messagesViewportRef,
    answerContainers,
    transcriptBlocks,
    sourceMessages,
    controlState,
    viewState,
    activeSearchResult,
    searchPanelError,
    searchPanelLoading,
    searchPanelOpen,
    onOpenSidebar,
    onCloseSidebar,
    onOpenThread,
    onNewChat,
    onOpenSearchResult,
    onCloseSearchPanel,
    onPlay,
    onPause,
    onResume,
    onRestart
  } = runtime;

  return (
    <main className={clsx('chat-shell-theme chat-shell-scrollbars flex h-full min-h-0 overflow-hidden', ui.shell)}>
      <ChatSidebar
        sidebarOpen={sidebarOpen}
        threads={threads}
        activeThreadId={activeThreadId}
        onClose={onCloseSidebar}
        onNewChat={onNewChat}
        onOpenThread={onOpenThread}
      />

      <div className="relative flex flex-1 min-h-0 min-w-0 overflow-hidden">
        <div className={clsx('relative flex flex-1 min-h-0 min-w-0 flex-col overflow-hidden', ui.chatPane)}>
          <ChatHeader
            currentThreadTitle={`${currentThreadTitle} · 重放`}
            sidebarOpen={sidebarOpen}
            onOpenSidebar={onOpenSidebar}
          />

          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <div ref={messagesViewportRef} className={clsx('relative flex min-h-0 flex-1 flex-col overflow-y-auto', ui.messageViewport)}>
              <ChatMessageList
                meta={null}
                error={error}
                durableRecoveryState={idleDurableRecoveryState}
                hasOlderMessages={false}
                historyLoading={false}
                loadingMessages={loading}
                activeThreadId={activeThreadId}
                messages={sourceMessages}
                answerContainers={answerContainers}
                transcriptBlocks={transcriptBlocks}
                liveAssistantDraft={null}
                showLoadingText={false}
                centeredEmptyState={false}
                showWelcomeWhenEmpty={false}
                onLoadOlderMessages={() => undefined}
                onOpenSearchResult={onOpenSearchResult}
              />
            </div>

            <ReplayControlBar
              controlState={controlState}
              viewState={viewState}
              onPlay={onPlay}
              onPause={onPause}
              onResume={onResume}
              onRestart={onRestart}
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
    </main>
  );
}
