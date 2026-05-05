'use client';

import clsx from 'clsx';
import { usePathname } from 'next/navigation';
import { useMemo } from 'react';

import { ChatHeader } from './chat-shell/chat-header';
import { ChatMessageList } from './chat-shell/message-list';
import { ComposerDock } from './chat-shell/composer-dock';
import { DurableLogPane } from './chat-shell/durable-log-pane';
import { ChatSidebar } from './chat-shell/sidebar';
import { ui } from './chat-shell/ui';
import { useDurableChatRuntime } from '@/features/durable-chat/runtime/use-durable-chat-runtime';

function readThreadIdFromPathname(pathname: string | null) {
  if (!pathname) {
    return null;
  }

  const match = pathname.match(/^\/chat\/([^/]+)$/);
  if (!match?.[1]) {
    return null;
  }

  try {
    return decodeURIComponent(match[1]);
  } catch {
    return null;
  }
}

export function DurableChatConsole() {
  const pathname = usePathname();
  const initialThreadId = useMemo(() => readThreadIdFromPathname(pathname), [pathname]);
  const runtime = useDurableChatRuntime({ initialThreadId });

  return (
    <main className={clsx('flex h-full min-h-0 overflow-hidden', ui.shell)}>
      <ChatSidebar
        sidebarOpen={runtime.sidebarOpen}
        threads={runtime.threads}
        activeThreadId={runtime.activeThreadId}
        onClose={runtime.onCloseSidebar}
        onNewChat={runtime.onNewChat}
        onOpenThread={runtime.onOpenThread}
      />

      <div className="flex flex-1 min-h-0 min-w-0 relative overflow-hidden">
        <div className={clsx('flex flex-1 min-h-0 min-w-0 relative flex-col overflow-hidden', ui.chatPane)}>
          <ChatHeader
            currentThreadTitle={runtime.currentThreadTitle}
            sidebarOpen={runtime.sidebarOpen}
            onOpenSidebar={runtime.onOpenSidebar}
            onToggleLog={runtime.onToggleLog}
          />

          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
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
                liveAssistantDraft={runtime.liveAssistantDraft}
                isThinking={runtime.showResponseLoading}
                onLoadOlderMessages={runtime.onLoadOlderMessages}
              />
            </div>
            <ComposerDock
              activeThreadId={runtime.activeThreadId}
              draft={runtime.draft}
              isResponding={runtime.isChatResponding}
              sendDisabled={runtime.sendDisabled}
              inputLocked={runtime.inputLocked}
              selectedModelKey={runtime.selectedModelKey}
              selectedModelOption={runtime.selectedModelOption}
              meta={runtime.meta}
              showScrollToBottom={runtime.showScrollToBottom}
              textareaRef={runtime.textareaRef}
              sendAbortControllerRef={runtime.sendAbortControllerRef}
              onDraftChange={runtime.onDraftChange}
              onSelectedModelKeyChange={runtime.onSelectedModelKeyChange}
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
    </main>
  );
}
