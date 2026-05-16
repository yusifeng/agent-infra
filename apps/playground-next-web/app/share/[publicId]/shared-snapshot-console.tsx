'use client';

import type { SharedThreadSnapshotDto } from '@agent-infra/contracts';
import clsx from 'clsx';
import { useMemo, useRef, useState } from 'react';

import { ChatThemeProvider } from '@/components/chat-theme-provider';
import { ChatHeader } from '@/components/chat-shell/chat-header';
import { ChatMessageList } from '@/features/durable-chat/ui/messages/message-list';
import { SearchResultsPanel } from '@/components/chat-shell/search-results-panel';
import { ui } from '@/components/chat-shell/ui';
import {
  buildSharedSearchPanelData,
  buildSharedSnapshotPresentation
} from '@/features/durable-chat/service/shared-snapshot-presentation';
import type { ActiveSearchPanelData } from '@/features/durable-chat/types/search';

type SharedSnapshotConsoleProps = {
  publicId: string;
  snapshot: SharedThreadSnapshotDto;
};

const idleDurableRecoveryState = {
  phase: 'idle' as const,
  message: null
};

export function SharedSnapshotConsole({ publicId, snapshot }: SharedSnapshotConsoleProps) {
  const messagesViewportRef = useRef<HTMLDivElement>(null);
  const [searchPanelOpen, setSearchPanelOpen] = useState(false);
  const [searchPanelLoading, setSearchPanelLoading] = useState(false);
  const [searchPanelError, setSearchPanelError] = useState<string | null>(null);
  const [activeSearchResult, setActiveSearchResult] = useState<ActiveSearchPanelData | null>(null);
  const presentation = useMemo(
    () =>
      buildSharedSnapshotPresentation({
        publicId,
        snapshot
      }),
    [publicId, snapshot]
  );
  const currentThreadTitle = presentation.title?.trim() || '来自分享的对话';

  function openSearchResult(runId: string, toolCallIds: string[]) {
    setSearchPanelLoading(true);
    setSearchPanelError(null);

    const panelData = buildSharedSearchPanelData({
      publicId,
      runId,
      toolCallIds,
      searchBundles: presentation.searchBundles
    });

    if (!panelData) {
      setActiveSearchResult(null);
      setSearchPanelError('Search results are no longer available for this shared snapshot.');
      setSearchPanelOpen(true);
      setSearchPanelLoading(false);
      return;
    }

    setActiveSearchResult(panelData);
    setSearchPanelOpen(true);
    setSearchPanelError(null);
    setSearchPanelLoading(false);
  }

  return (
    <ChatThemeProvider>
      <main className={clsx('chat-shell-theme chat-shell-scrollbars flex h-dvh min-h-0 overflow-hidden', ui.shell)}>
        <div className="relative flex flex-1 min-h-0 min-w-0 overflow-hidden">
          <div className={clsx('relative flex flex-1 min-h-0 min-w-0 flex-col overflow-hidden', ui.chatPane)}>
            <ChatHeader
              currentThreadTitle={currentThreadTitle}
              threadActionsDisabled
              sidebarOpen
              onOpenSidebar={() => undefined}
              onOpenShareDialog={() => undefined}
            />

            <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
              <div ref={messagesViewportRef} className={clsx('relative flex min-h-0 flex-1 flex-col overflow-y-auto', ui.messageViewport)}>
                <ChatMessageList
                  meta={null}
                  error={null}
                  durableRecoveryState={idleDurableRecoveryState}
                  hasOlderMessages={false}
                  historyLoading={false}
                  loadingMessages={false}
                  activeThreadId={presentation.threadId}
                  messages={presentation.messages}
                  answerContainers={presentation.answerContainers}
                  transcriptBlocks={presentation.transcriptBlocks}
                  liveAssistantDraft={null}
                  showLoadingText={false}
                  centeredEmptyState={false}
                  showPersistedResearchStatus
                  showWelcomeWhenEmpty={false}
                  onLoadOlderMessages={() => undefined}
                  onOpenSearchResult={openSearchResult}
                />
              </div>
            </div>
          </div>

          <SearchResultsPanel
            open={searchPanelOpen}
            loading={searchPanelLoading}
            error={searchPanelError}
            result={activeSearchResult}
            onClose={() => setSearchPanelOpen(false)}
          />
        </div>
      </main>
    </ChatThemeProvider>
  );
}
