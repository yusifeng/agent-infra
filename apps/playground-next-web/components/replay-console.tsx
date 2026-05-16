'use client';

import clsx from 'clsx';

import { ChatHeader } from './chat-shell/chat-header';
import { ChatMessageList } from '@/features/durable-chat/ui/messages/message-list';
import { ReplayDock } from './chat-shell/replay-dock';
import { SearchResultsPanel } from './chat-shell/search-results-panel';
import { ChatSidebar } from './chat-shell/sidebar';
import { ui } from './chat-shell/ui';
import type { AuthUserDto } from '@/features/auth/dto/project-auth-user-dto';
import { useReplayConsoleRuntime } from '@/features/durable-chat/runtime/use-replay-console-runtime';

const idleDurableRecoveryState = {
  phase: 'idle' as const,
  message: null
};
const replayPinnedThreadIds: string[] = [];

export function ReplayConsole({
  initialThreadId,
  currentUser,
  onLogout
}: {
  initialThreadId: string | null;
  currentUser: AuthUserDto;
  onLogout: () => void | Promise<void>;
}) {
  const runtime = useReplayConsoleRuntime({ initialThreadId });
  const {
    sidebarOpen,
    threads,
    activeThreadId,
    currentThreadTitle,
    loading,
    error,
    messagesViewportRef,
    replaySpotlightRect,
    answerContainers,
    transcriptBlocks,
    sourceMessages,
    controlState,
    viewState,
    activeReplayBlockId,
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
    onTogglePlayback,
    onPreviousStep,
    onNextStep,
    onInspectStep,
    onRestart
  } = runtime;

  return (
    <main className={clsx('chat-shell-theme chat-shell-scrollbars flex h-full min-h-0 overflow-hidden', ui.shell)}>
      <ChatSidebar
        sidebarOpen={sidebarOpen}
        currentUser={currentUser}
        threads={threads}
        pinnedThreadIds={replayPinnedThreadIds}
        activeThreadId={activeThreadId}
        openThreadMenuId={null}
        onClose={onCloseSidebar}
        onLogout={onLogout}
        onNewChat={onNewChat}
        onOpenThread={onOpenThread}
        onOpenThreadMenu={() => undefined}
        onCloseThreadMenu={() => undefined}
        onRenameThread={() => undefined}
        onTogglePinThread={() => undefined}
        onShareThread={() => undefined}
        onArchiveThread={() => undefined}
      />

      <div className="relative flex flex-1 min-h-0 min-w-0 overflow-hidden">
        <div className={clsx('relative flex flex-1 min-h-0 min-w-0 flex-col overflow-hidden', ui.chatPane)}>
          <ChatHeader
            currentThreadTitle={`${currentThreadTitle} · 重放`}
            threadActionsDisabled
            sidebarOpen={sidebarOpen}
            onOpenSidebar={onOpenSidebar}
            onNewChat={onNewChat}
            onOpenShareDialog={() => undefined}
          />

          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <div ref={messagesViewportRef} className={clsx('relative flex min-h-0 flex-1 flex-col overflow-y-auto', ui.messageViewport)}>
              {replaySpotlightRect ? (
                <div className="pointer-events-none absolute inset-0 z-[1]" aria-hidden="true">
                  <div
                    key={replaySpotlightRect.nonce}
                    className="absolute rounded-2xl border border-[color:color-mix(in_srgb,var(--chat-reasoning-accent)_30%,transparent)] bg-[color:color-mix(in_srgb,var(--chat-reasoning-accent)_6%,transparent)] opacity-35 shadow-[0_18px_48px_rgba(15,23,42,0.10)] transition-[transform,width,height,opacity] duration-200"
                    style={{
                      transform: `translate3d(${replaySpotlightRect.left}px, ${replaySpotlightRect.top}px, 0)`,
                      width: replaySpotlightRect.width,
                      height: replaySpotlightRect.height
                    }}
                  />
                </div>
              ) : null}
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
                activeReplayBlockId={activeReplayBlockId}
                transcriptBlocks={transcriptBlocks}
                liveAssistantDraft={null}
                showLoadingText={false}
                centeredEmptyState={false}
                showPersistedResearchStatus
                showWelcomeWhenEmpty={false}
                onLoadOlderMessages={() => undefined}
                onOpenSearchResult={onOpenSearchResult}
              />
            </div>

            <ReplayDock
              controlState={controlState}
              viewState={viewState}
              onTogglePlayback={onTogglePlayback}
              onPreviousStep={onPreviousStep}
              onNextStep={onNextStep}
              onInspectStep={onInspectStep}
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
