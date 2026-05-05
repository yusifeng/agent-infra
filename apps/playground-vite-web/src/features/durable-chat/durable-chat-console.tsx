import clsx from 'clsx';

import { ChatHeader } from './components/chat-header';
import { ComposerDock } from './components/composer-dock';
import { ChatMessageList } from './components/message-list';
import { ChatSidebar } from './components/sidebar';
import { ui } from './components/ui';
import { useDurableChatRuntime } from './runtime/use-durable-chat-runtime';

export function DurableChatConsole({ initialThreadId }: { initialThreadId: string | null }) {
  const runtime = useDurableChatRuntime({ initialThreadId });

  return (
    <main className={clsx('chat-shell-theme chat-shell-scrollbars flex h-full min-h-0 overflow-hidden', ui.shell)}>
      <ChatSidebar
        sidebarOpen={runtime.sidebarOpen}
        threads={runtime.threads}
        activeThreadId={runtime.activeThreadId}
        onClose={runtime.onCloseSidebar}
        onNewChat={runtime.onNewChat}
        onOpenThread={runtime.onOpenThread}
      />

      <div className="relative flex flex-1 min-h-0 min-w-0 overflow-hidden">
        <div className={clsx('relative flex flex-1 min-h-0 min-w-0 flex-col overflow-hidden', ui.chatPane)}>
          <ChatHeader
            currentThreadTitle={runtime.currentThreadTitle}
            sidebarOpen={runtime.sidebarOpen}
            onOpenSidebar={runtime.onOpenSidebar}
          />

          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <div
              ref={runtime.messagesViewportRef}
              className={clsx('relative flex min-h-0 flex-1 flex-col overflow-y-auto', ui.messageViewport)}
            >
              <ChatMessageList
                meta={runtime.meta}
                error={runtime.error}
                durableRecoveryNotice={runtime.durableRecoveryNotice}
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
      </div>
    </main>
  );
}
