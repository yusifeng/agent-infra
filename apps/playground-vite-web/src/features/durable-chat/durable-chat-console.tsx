import clsx from 'clsx';

import { ChatHeader } from './components/chat-header';
import { ComposerDock } from './components/composer-dock';
import { ChatMessageList } from './components/message-list';
import { ChatSidebar } from './components/sidebar';
import { ui } from './components/ui';
import { useDurableChatRuntime } from './runtime/use-durable-chat-runtime';

export function DurableChatConsole({ initialThreadId }: { initialThreadId: string | null }) {
  const runtime = useDurableChatRuntime({ initialThreadId });
  const {
    sidebarOpen,
    threads,
    activeThreadId,
    onCloseSidebar,
    onNewChat,
    onOpenThread,
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
    liveAssistantDraft,
    onLoadOlderMessages,
    draft,
    isChatResponding,
    sendDisabled,
    inputLocked,
    selectedModelKey,
    selectedModelOption,
    showScrollToBottom,
    textareaRef,
    sendAbortControllerRef,
    onDraftChange,
    onSelectedModelKeyChange,
    onSend,
    onStop,
    onScrollToBottom,
    showResponseLoading
  } = runtime;
  const showLoadingText =
    showResponseLoading &&
    liveAssistantDraft !== null &&
    liveAssistantDraft.eventType === 'start' &&
    liveAssistantDraft.partialText.length === 0;

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
            currentThreadTitle={currentThreadTitle}
            sidebarOpen={sidebarOpen}
            onOpenSidebar={onOpenSidebar}
          />

          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <div
              ref={messagesViewportRef}
              className={clsx('relative flex min-h-0 flex-1 flex-col overflow-y-auto', ui.messageViewport)}
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
                liveAssistantDraft={liveAssistantDraft}
                showLoadingText={showLoadingText}
                onLoadOlderMessages={onLoadOlderMessages}
              />
            </div>

            <ComposerDock
              activeThreadId={activeThreadId}
              draft={draft}
              isResponding={isChatResponding}
              sendDisabled={sendDisabled}
              inputLocked={inputLocked}
              selectedModelKey={selectedModelKey}
              selectedModelOption={selectedModelOption}
              meta={meta}
              showScrollToBottom={showScrollToBottom}
              textareaRef={textareaRef}
              sendAbortControllerRef={sendAbortControllerRef}
              onDraftChange={onDraftChange}
              onSelectedModelKeyChange={onSelectedModelKeyChange}
              onSend={onSend}
              onStop={onStop}
              onScrollToBottom={onScrollToBottom}
            />
          </div>
        </div>
      </div>
    </main>
  );
}
