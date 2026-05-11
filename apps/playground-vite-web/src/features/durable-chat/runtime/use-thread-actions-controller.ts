import { useState, type MutableRefObject } from 'react';

import {
  archiveThread,
  pinThread as pinThreadRequest,
  renameThread,
  unpinThread as unpinThreadRequest
} from '@/features/durable-chat/repo/chat-api';
import type { PlaygroundThreadDto } from '@/features/durable-chat/types/thread';

type Updater<T> = T | ((current: T) => T);
type Setter<T> = (next: Updater<T>) => void;

export function useThreadActionsController({
  activeThreadIdRef,
  onOpenShareDialogForThread,
  resetDraftThreadState,
  setDurableRecoveryState,
  setThreads,
  stopTypingTitleAnimation,
  stopViewingLiveResponse,
  threads,
  typingTitleThreadId,
  navigateToNewChat
}: {
  activeThreadIdRef: MutableRefObject<string | null>;
  onOpenShareDialogForThread: (threadId: string) => void;
  resetDraftThreadState: () => void;
  setDurableRecoveryState: (state: { phase: 'idle'; message: null }) => void;
  setThreads: Setter<PlaygroundThreadDto[]>;
  stopTypingTitleAnimation: () => void;
  stopViewingLiveResponse: () => void;
  threads: PlaygroundThreadDto[];
  typingTitleThreadId: string | null;
  navigateToNewChat: () => void;
}) {
  const [openThreadMenuId, setOpenThreadMenuId] = useState<string | null>(null);
  const [renameDialogThreadId, setRenameDialogThreadId] = useState<string | null>(null);
  const [renameDraftTitle, setRenameDraftTitle] = useState('');
  const [archiveDialogThreadId, setArchiveDialogThreadId] = useState<string | null>(null);
  const [threadActionError, setThreadActionError] = useState<string | null>(null);
  const [renamingThreadId, setRenamingThreadId] = useState<string | null>(null);
  const [archivingThreadId, setArchivingThreadId] = useState<string | null>(null);

  function openThreadMenu(threadId: string) {
    setOpenThreadMenuId(threadId);
    setThreadActionError(null);
  }

  function closeThreadMenu() {
    setOpenThreadMenuId(null);
  }

  function beginRenameThread(threadId: string) {
    const thread = threads.find((candidate) => candidate.id === threadId);
    setRenameDialogThreadId(threadId);
    setRenameDraftTitle(thread?.title ?? '');
    setThreadActionError(null);
    setOpenThreadMenuId(null);
  }

  function closeRenameDialog() {
    setRenameDialogThreadId(null);
    setRenameDraftTitle('');
    setThreadActionError(null);
  }

  async function submitRenameThread() {
    const threadId = renameDialogThreadId;
    const title = renameDraftTitle.trim();
    if (!threadId || !title) {
      setThreadActionError('请输入会话标题。');
      return false;
    }

    setRenamingThreadId(threadId);
    setThreadActionError(null);

    try {
      const result = await renameThread(threadId, title);
      if (!result.ok || !result.data.thread) {
        throw new Error(result.error ?? `Failed to rename thread (${result.status})`);
      }

      if (typingTitleThreadId === threadId) {
        stopTypingTitleAnimation();
      }
      setThreads((current) => current.map((thread) => (thread.id === threadId ? result.data.thread ?? thread : thread)));
      closeRenameDialog();
      return true;
    } catch (nextError) {
      setThreadActionError(nextError instanceof Error ? nextError.message : '重命名会话失败。');
      return false;
    } finally {
      setRenamingThreadId(null);
    }
  }

  function beginArchiveThread(threadId: string) {
    setArchiveDialogThreadId(threadId);
    setThreadActionError(null);
    setOpenThreadMenuId(null);
  }

  function closeArchiveDialog() {
    setArchiveDialogThreadId(null);
    setThreadActionError(null);
  }

  async function submitArchiveThread() {
    const threadId = archiveDialogThreadId;
    if (!threadId) {
      return false;
    }

    setArchivingThreadId(threadId);
    setThreadActionError(null);

    try {
      const result = await archiveThread(threadId);
      if (!result.ok) {
        throw new Error(result.error ?? `Failed to archive thread (${result.status})`);
      }

      setThreads((current) => current.filter((thread) => thread.id !== threadId));
      closeArchiveDialog();

      if (activeThreadIdRef.current === threadId) {
        stopViewingLiveResponse();
        setDurableRecoveryState({
          phase: 'idle',
          message: null
        });
        resetDraftThreadState();
        navigateToNewChat();
      }

      return true;
    } catch (nextError) {
      setThreadActionError(nextError instanceof Error ? nextError.message : '删除会话失败。');
      return false;
    } finally {
      setArchivingThreadId(null);
    }
  }

  function pinThread(threadId: string) {
    void (async () => {
      try {
        const result = await pinThreadRequest(threadId);
        if (!result.ok || !result.data.thread) {
          throw new Error(result.error ?? 'Failed to pin thread');
        }

        setThreads((current) => [
          result.data.thread as (typeof current)[number],
          ...current
            .map((thread) => (thread.id === threadId ? result.data.thread ?? thread : thread))
            .filter((thread) => thread.id !== threadId)
        ]);
        setOpenThreadMenuId(null);
      } catch (error) {
        setThreadActionError(error instanceof Error ? error.message : '置顶会话失败。');
      }
    })();
  }

  function unpinThread(threadId: string) {
    void (async () => {
      try {
        const result = await unpinThreadRequest(threadId);
        if (!result.ok || !result.data.thread) {
          throw new Error(result.error ?? 'Failed to unpin thread');
        }

        setThreads((current) => current.map((thread) => (thread.id === threadId ? result.data.thread ?? thread : thread)));
        setOpenThreadMenuId(null);
      } catch (error) {
        setThreadActionError(error instanceof Error ? error.message : '取消置顶失败。');
      }
    })();
  }

  function openShareThread(threadId: string) {
    setOpenThreadMenuId(null);
    onOpenShareDialogForThread(threadId);
  }

  return {
    archiveDialogThreadId,
    archivingThreadId,
    closeArchiveDialog,
    closeRenameDialog,
    closeThreadMenu,
    onConfirmArchiveThread: () => {
      void submitArchiveThread();
    },
    onConfirmRenameThread: () => {
      void submitRenameThread();
    },
    onOpenArchiveThread: beginArchiveThread,
    onOpenRenameThread: beginRenameThread,
    onOpenShareThread: openShareThread,
    onOpenThreadMenu: openThreadMenu,
    onPinThread: pinThread,
    onRenameDraftTitleChange: setRenameDraftTitle,
    onUnpinThread: unpinThread,
    openThreadMenuId,
    renameDialogThreadId,
    renameDraftTitle,
    renamingThreadId,
    threadActionError
  };
}
