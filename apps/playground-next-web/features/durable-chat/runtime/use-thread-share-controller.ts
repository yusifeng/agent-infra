'use client';

import { useRef, useState } from 'react';
import type { MutableRefObject } from 'react';

import { copyTextToClipboard } from '@/components/chat-shell/helpers';
import {
  createThreadSnapshotShare,
  fetchCurrentThreadShare,
  revokeThreadSnapshotShare
} from '@/features/durable-chat/repo/chat-api';

type ThreadShareControllerOptions = {
  activeThreadIdRef: MutableRefObject<string | null>;
};

function buildShareUrl(publicId: string) {
  if (typeof window === 'undefined') {
    return `/share/${publicId}`;
  }

  return `${window.location.origin}/share/${publicId}`;
}

export function useThreadShareController({ activeThreadIdRef }: ThreadShareControllerOptions) {
  const currentShareRequestIdRef = useRef(0);
  const [shareDialogOpen, setShareDialogOpen] = useState(false);
  const [loadingCurrentShare, setLoadingCurrentShare] = useState(false);
  const [creatingShare, setCreatingShare] = useState(false);
  const [revokingShare, setRevokingShare] = useState(false);
  const [shareCopied, setShareCopied] = useState(false);
  const [shareError, setShareError] = useState<string | null>(null);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [shareThreadId, setShareThreadId] = useState<string | null>(null);
  const [sharePublicId, setSharePublicId] = useState<string | null>(null);

  async function openShareDialogForThread(threadId: string) {
    if (!threadId) {
      return;
    }

    const requestId = currentShareRequestIdRef.current + 1;
    currentShareRequestIdRef.current = requestId;
    setShareDialogOpen(true);
    setShareError(null);
    setShareCopied(false);
    setShareThreadId(threadId);
    setSharePublicId(null);
    setShareUrl(null);
    setLoadingCurrentShare(true);
    try {
      const result = await fetchCurrentThreadShare(threadId);
      if (requestId !== currentShareRequestIdRef.current) {
        return;
      }
      if (!result.ok) {
        throw new Error(result.error ?? 'failed to load current share');
      }

      const publicId = result.data.share?.publicId ?? null;
      setSharePublicId(publicId);
      setShareUrl(publicId ? buildShareUrl(publicId) : null);
    } catch (error) {
      if (requestId !== currentShareRequestIdRef.current) {
        return;
      }
      setShareError(error instanceof Error ? error.message : 'failed to load current share');
    } finally {
      if (requestId === currentShareRequestIdRef.current) {
        setLoadingCurrentShare(false);
      }
    }
  }

  async function openShareDialog() {
    const threadId = activeThreadIdRef.current;
    if (!threadId) {
      return;
    }

    await openShareDialogForThread(threadId);
  }

  function closeShareDialog() {
    currentShareRequestIdRef.current += 1;
    setShareDialogOpen(false);
    setShareError(null);
    setShareCopied(false);
    setShareThreadId(null);
    setSharePublicId(null);
    setShareUrl(null);
  }

  async function createOrCopyShare() {
    const threadId = shareThreadId;
    if (!threadId || loadingCurrentShare || creatingShare) {
      return;
    }

    if (shareUrl) {
      await copyTextToClipboard(shareUrl);
      setShareCopied(true);
      return;
    }

    setCreatingShare(true);
    setShareError(null);
    try {
      const result = await createThreadSnapshotShare(threadId);
      if (!result.ok || !result.data.share?.publicId) {
        throw new Error(result.error ?? 'failed to create share');
      }

      const publicId = result.data.share.publicId;
      const url = buildShareUrl(publicId);
      setSharePublicId(publicId);
      setShareUrl(url);
      await copyTextToClipboard(url);
      setShareCopied(true);
    } catch (error) {
      setShareError(error instanceof Error ? error.message : 'failed to create share');
    } finally {
      setCreatingShare(false);
    }
  }

  async function revokeShare() {
    if (!sharePublicId || !shareThreadId) {
      return;
    }

    setRevokingShare(true);
    setShareError(null);
    try {
      const result = await revokeThreadSnapshotShare(sharePublicId);
      if (!result.ok) {
        throw new Error(result.error ?? 'failed to revoke share');
      }

      setSharePublicId(null);
      setShareUrl(null);
      setShareCopied(false);
    } catch (error) {
      setShareError(error instanceof Error ? error.message : 'failed to revoke share');
    } finally {
      setRevokingShare(false);
    }
  }

  return {
    creatingShare,
    loadingCurrentShare,
    onCloseShareDialog: closeShareDialog,
    onCreateOrCopyShare: createOrCopyShare,
    onOpenShareDialog: openShareDialog,
    onOpenShareDialogForThread: openShareDialogForThread,
    onRevokeShare: revokeShare,
    revokingShare,
    shareCopied,
    shareDialogOpen,
    shareError,
    shareUrl
  };
}
