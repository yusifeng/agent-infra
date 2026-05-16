'use client';

import type { ThreadDto } from '@agent-infra/contracts';
import { useState } from 'react';
import type { Dispatch, MutableRefObject, SetStateAction } from 'react';

import {
  archiveThread,
  pinThread,
  renameThread,
  unpinThread
} from '@/features/durable-chat/repo/chat-api';

type ThreadActionControllerOptions = {
  activeThreadIdRef: MutableRefObject<string | null>;
  currentThreadPinned: boolean;
  refreshThreads: () => Promise<ThreadDto[]>;
  setError: Dispatch<SetStateAction<string | null>>;
  setThreads: Dispatch<SetStateAction<ThreadDto[]>>;
  threads: ThreadDto[];
  onArchivedActiveThread: () => void;
};

function updateThreadInList(
  setThreads: Dispatch<SetStateAction<ThreadDto[]>>,
  thread: ThreadDto
) {
  setThreads((current) =>
    current.map((candidate) =>
      candidate.id === thread.id
        ? {
            ...candidate,
            ...thread
          }
        : candidate
    )
  );
}

export function useThreadActionController({
  activeThreadIdRef,
  currentThreadPinned,
  refreshThreads,
  setError,
  setThreads,
  threads,
  onArchivedActiveThread
}: ThreadActionControllerOptions) {
  const [threadActionBusy, setThreadActionBusy] = useState(false);
  const [renameDialogThreadId, setRenameDialogThreadId] = useState<string | null>(null);
  const [renameDraftTitle, setRenameDraftTitle] = useState('');
  const [archiveDialogThreadId, setArchiveDialogThreadId] = useState<string | null>(null);
  const [threadActionError, setThreadActionError] = useState<string | null>(null);
  const [renamingThreadId, setRenamingThreadId] = useState<string | null>(null);
  const [archivingThreadId, setArchivingThreadId] = useState<string | null>(null);

  function onRenameThreadById(threadId: string) {
    if (!threadId || threadActionBusy || renamingThreadId !== null) {
      return;
    }

    const currentTitle = threads.find((thread) => thread.id === threadId)?.title ?? '';
    setRenameDialogThreadId(threadId);
    setRenameDraftTitle(currentTitle);
    setThreadActionError(null);
  }

  function onCloseRenameDialog() {
    setRenameDialogThreadId(null);
    setRenameDraftTitle('');
    setThreadActionError(null);
  }

  async function onConfirmRenameThread() {
    const threadId = renameDialogThreadId;
    const normalizedTitle = renameDraftTitle.trim();
    if (!threadId) {
      return false;
    }

    if (!normalizedTitle) {
      setThreadActionError('请输入会话标题。');
      return false;
    }

    setRenamingThreadId(threadId);
    setThreadActionError(null);
    try {
      const result = await renameThread(threadId, normalizedTitle);
      if (!result.ok || !result.data.thread) {
        throw new Error(result.error ?? 'failed to rename thread');
      }

      updateThreadInList(setThreads, result.data.thread);
      await refreshThreads();
      onCloseRenameDialog();
      return true;
    } catch (error) {
      setThreadActionError(error instanceof Error ? error.message : '重命名会话失败。');
      return false;
    } finally {
      setRenamingThreadId(null);
    }
  }

  function onRenameActiveThread() {
    const threadId = activeThreadIdRef.current;
    if (!threadId) {
      return;
    }

    onRenameThreadById(threadId);
  }

  async function onToggleThreadPinById(threadId: string, pinned: boolean) {
    if (!threadId || threadActionBusy) {
      return;
    }

    setThreadActionBusy(true);
    setError(null);
    try {
      const result = pinned ? await unpinThread(threadId) : await pinThread(threadId);
      if (!result.ok || !result.data.thread) {
        throw new Error(result.error ?? 'failed to update thread pin');
      }

      updateThreadInList(setThreads, result.data.thread);
      await refreshThreads();
    } catch (error) {
      setError(error instanceof Error ? error.message : 'failed to update thread pin');
    } finally {
      setThreadActionBusy(false);
    }
  }

  async function onToggleActiveThreadPin() {
    const threadId = activeThreadIdRef.current;
    if (!threadId) {
      return;
    }

    await onToggleThreadPinById(threadId, currentThreadPinned);
  }

  function onArchiveThreadById(threadId: string) {
    if (!threadId || threadActionBusy || archivingThreadId !== null) {
      return;
    }

    setArchiveDialogThreadId(threadId);
    setThreadActionError(null);
  }

  function onCloseArchiveDialog() {
    setArchiveDialogThreadId(null);
    setThreadActionError(null);
  }

  async function onConfirmArchiveThread() {
    const threadId = archiveDialogThreadId;
    if (!threadId) {
      return false;
    }

    setArchivingThreadId(threadId);
    setThreadActionError(null);
    try {
      const result = await archiveThread(threadId);
      if (!result.ok) {
        throw new Error(result.error ?? 'failed to archive thread');
      }

      await refreshThreads();
      onCloseArchiveDialog();
      if (threadId === activeThreadIdRef.current) {
        onArchivedActiveThread();
      }
      return true;
    } catch (error) {
      setThreadActionError(error instanceof Error ? error.message : '删除会话失败。');
      return false;
    } finally {
      setArchivingThreadId(null);
    }
  }

  function onArchiveActiveThread() {
    const threadId = activeThreadIdRef.current;
    if (!threadId) {
      return;
    }

    onArchiveThreadById(threadId);
  }

  return {
    archiveDialogThreadId,
    archivingThreadId,
    renameDialogThreadId,
    renameDraftTitle,
    renamingThreadId,
    threadActionBusy,
    threadActionError,
    onArchiveActiveThread,
    onArchiveThreadById,
    onCloseArchiveDialog,
    onCloseRenameDialog,
    onConfirmArchiveThread,
    onConfirmRenameThread,
    onRenameActiveThread,
    onRenameDraftTitleChange: setRenameDraftTitle,
    onRenameThreadById,
    onToggleActiveThreadPin,
    onToggleThreadPinById
  };
}
