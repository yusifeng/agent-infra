// @vitest-environment jsdom

import type { MessageDto, MessagePartDto, RuntimePiMetaDto } from '@agent-infra/contracts';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ChatHeader } from '@/components/chat-shell/chat-header';
import { prepareMarkdownRender } from '@/components/chat-shell/markdown-service';
import { ChatMessageList } from '@/features/durable-chat/ui/messages/message-list';
import { buildChatRuntimeViewModel } from '@/features/durable-chat/runtime/chat-runtime-view-model';
import type { PlaygroundThreadDto } from '@/features/durable-chat/repo/chat-api';
import type { DurableRecoveryState } from '@/features/durable-chat/types/runtime';

const now = '2026-01-01T00:00:00.000Z';
const idleRecovery: DurableRecoveryState = {
  phase: 'idle',
  message: null
};

function createThread(overrides: Partial<PlaygroundThreadDto> & Pick<PlaygroundThreadDto, 'id'>): PlaygroundThreadDto {
  return {
    ...overrides,
    id: overrides.id,
    appId: 'playground',
    title: overrides.title ?? 'Thread title',
    status: 'active',
    createdAt: now,
    updatedAt: now,
    pinned: overrides.pinned ?? false
  };
}

function createPart(overrides: Partial<MessagePartDto> & Pick<MessagePartDto, 'id' | 'messageId' | 'type'>): MessagePartDto {
  return {
    id: overrides.id,
    messageId: overrides.messageId,
    partIndex: overrides.partIndex ?? 0,
    type: overrides.type,
    textValue: overrides.textValue ?? null,
    jsonValue: overrides.jsonValue ?? null,
    createdAt: now
  };
}

function createMessage(overrides: Partial<MessageDto> & Pick<MessageDto, 'id' | 'role' | 'seq'>): MessageDto {
  return {
    ...overrides,
    id: overrides.id,
    threadId: overrides.threadId ?? 'thread-a',
    runId: overrides.runId ?? null,
    role: overrides.role,
    seq: overrides.seq,
    status: overrides.status ?? 'completed',
    metadata: overrides.metadata ?? null,
    createdAt: now,
    parts: overrides.parts ?? []
  };
}

function createMeta(): RuntimePiMetaDto {
  return {
    dbMode: 'sqlite',
    dbConnection: 'local',
    runtimeConfigured: true,
    runtimeProvider: 'deepseek',
    runtimeModel: 'deepseek-chat',
    defaultModelKey: 'deepseek-chat',
    modelOptions: [
      {
        key: 'deepseek-chat',
        provider: 'deepseek',
        model: 'deepseek-chat',
        label: 'DeepSeek',
        description: 'DeepSeek chat'
      }
    ],
    runtimeConfigError: null
  };
}

function render(element: React.ReactNode, root: Root) {
  act(() => {
    root.render(element);
  });
}

describe('chat shell regression smoke', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    vi.restoreAllMocks();
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = false;
  });

  it('keeps known thread titles and avoids a visible loading-message interstitial during thread switch', () => {
    const threadB = createThread({
      id: 'thread-b',
      title: 'Known Thread B'
    });
    const viewModel = buildChatRuntimeViewModel({
      activeResponseRun: null,
      activeThreadId: threadB.id,
      chatPhase: 'idle',
      draft: '',
      liveAssistantDraft: null,
      loadingThreadId: threadB.id,
      messagePageInfo: null,
      messages: [
        createMessage({
          id: 'thread-a:user',
          role: 'user',
          seq: 1,
          threadId: 'thread-a'
        })
      ],
      meta: createMeta(),
      optimisticUserMessage: null,
      pendingNavigationTitle: null,
      pendingNewThreadLoadingId: '__pending-new-thread__',
      persistingTurn: false,
      selectedModelKey: 'deepseek-chat',
      threads: [threadB],
      timeline: null
    });

    render(
      <>
        <ChatHeader
          currentThreadTitle={viewModel.currentThreadTitle}
          threadActionsDisabled={false}
          sidebarOpen
          onOpenSidebar={vi.fn()}
          onNewChat={vi.fn()}
          mode={null}
          onOpenShareDialog={vi.fn()}
        />
        <ChatMessageList
          meta={createMeta()}
          error={null}
          durableRecoveryState={idleRecovery}
          hasOlderMessages={false}
          historyLoading={false}
          loadingMessages
          activeThreadId={threadB.id}
          messages={viewModel.displayedMessages}
          answerContainers={viewModel.displayedAnswerContainers}
          transcriptBlocks={viewModel.displayedTranscriptBlocks}
          liveAssistantDraft={null}
          showLoadingText={false}
          centeredEmptyState={false}
          onLoadOlderMessages={vi.fn()}
          onOpenSearchResult={vi.fn()}
        />
      </>,
      root
    );

    expect(container.textContent).toContain('Known Thread B');
    expect(container.textContent).not.toContain('thread-b');
    expect(container.textContent).not.toContain('Loading messages');
    expect(container.querySelector('[aria-busy="true"]')).not.toBeNull();
  });

  it('shows persisted assistant content after a streaming reconnect clears the live draft', () => {
    const user = createMessage({
      id: 'user-1',
      role: 'user',
      seq: 1,
      parts: [
        createPart({
          id: 'user-1:text',
          messageId: 'user-1',
          type: 'text',
          textValue: 'Explain durable streams.'
        })
      ]
    });
    const assistant = createMessage({
      id: 'assistant-1',
      role: 'assistant',
      runId: 'run-1',
      seq: 2,
      parts: [
        createPart({
          id: 'assistant-1:text',
          messageId: 'assistant-1',
          type: 'text',
          textValue: 'Final persisted answer is still visible.'
        })
      ]
    });
    const viewModel = buildChatRuntimeViewModel({
      activeResponseRun: null,
      activeThreadId: 'thread-a',
      chatPhase: 'idle',
      draft: '',
      liveAssistantDraft: null,
      loadingThreadId: null,
      messagePageInfo: null,
      messages: [user, assistant],
      meta: createMeta(),
      optimisticUserMessage: null,
      pendingNavigationTitle: null,
      pendingNewThreadLoadingId: '__pending-new-thread__',
      persistingTurn: false,
      selectedModelKey: 'deepseek-chat',
      threads: [createThread({ id: 'thread-a', title: 'Thread A' })],
      timeline: null
    });

    render(
      <ChatMessageList
        meta={createMeta()}
        error={null}
        durableRecoveryState={idleRecovery}
        hasOlderMessages={false}
        historyLoading={false}
        loadingMessages={false}
        activeThreadId="thread-a"
        messages={viewModel.displayedMessages}
        answerContainers={viewModel.displayedAnswerContainers}
        transcriptBlocks={viewModel.displayedTranscriptBlocks}
        liveAssistantDraft={null}
        showLoadingText={false}
        centeredEmptyState={false}
        onLoadOlderMessages={vi.fn()}
        onOpenSearchResult={vi.fn()}
      />,
      root
    );

    expect(container.textContent).toContain('Explain durable streams.');
    expect(container.textContent).toContain('Final persisted answer is still visible.');
  });

  it('keeps fenced code block wrappers stable before syntax highlighting finishes', () => {
    const prepared = prepareMarkdownRender({
      text: '```json\n{"ok":true}\n```',
      cacheKey: 'smoke:markdown-code'
    });

    expect(prepared.initialHtml).toContain('data-component="markdown-code"');
    expect(prepared.initialHtml).toContain('data-code-theme="stable-dark"');
    expect(prepared.hasCodeBlocks).toBe(true);
  });
});
