import type { ChatShareDto } from '@agent-infra/contracts';
import { useEffect, useMemo, useRef, useState } from 'react';

import { copyTextToClipboard } from '@/features/durable-chat/components/helpers';
import {
  createThreadSnapshotShare,
  fetchCurrentThreadShare,
  revokeThreadSnapshotShare
} from '@/features/durable-chat/repo/share-api';

function buildShareUrl(publicId: string) {
  if (typeof window === 'undefined') {
    return `/share/${publicId}`;
  }

  return new URL(`/share/${publicId}`, window.location.origin).toString();
}

type UseShareDialogStateArgs = {
  activeThreadId: string | null;
  enabled: boolean;
};

export function useShareDialogState(args: UseShareDialogStateArgs) {
  const { activeThreadId, enabled } = args;
  const [open, setOpen] = useState(false);
  const [loadingCurrentShare, setLoadingCurrentShare] = useState(false);
  const [creatingShare, setCreatingShare] = useState(false);
  const [revokingShare, setRevokingShare] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentShare, setCurrentShare] = useState<ChatShareDto | null>(null);
  const requestIdRef = useRef(0);
  const mutationIdRef = useRef(0);
  const activeThreadIdRef = useRef<string | null>(activeThreadId);
  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    activeThreadIdRef.current = activeThreadId;
  }, [activeThreadId]);

  useEffect(() => {
    setOpen(false);
    setCopied(false);
    setError(null);

    if (!activeThreadId) {
      setCurrentShare(null);
      setLoadingCurrentShare(false);
      abortControllerRef.current?.abort();
      return;
    }

    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;
    setCurrentShare(null);
    setLoadingCurrentShare(true);

    void fetchCurrentThreadShare(activeThreadId, controller.signal)
      .then((result) => {
        if (requestIdRef.current !== requestId || controller.signal.aborted) {
          return;
        }

        if (!result.ok) {
          setCurrentShare(null);
          setError(result.error ?? `Failed to load share state (${result.status})`);
          return;
        }

        setCurrentShare(result.data.share ?? null);
      })
      .catch((nextError) => {
        if (requestIdRef.current !== requestId || controller.signal.aborted) {
          return;
        }

        setCurrentShare(null);
        setError(nextError instanceof Error ? nextError.message : 'Failed to load share state.');
      })
      .finally(() => {
        if (requestIdRef.current === requestId && !controller.signal.aborted) {
          setLoadingCurrentShare(false);
        }
      });

    return () => {
      controller.abort();
    };
  }, [activeThreadId]);

  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
    };
  }, []);

  const shareUrl = useMemo(() => (currentShare ? buildShareUrl(currentShare.publicId) : null), [currentShare]);
  const canOpen = enabled && Boolean(activeThreadId);

  async function copyCurrentShareUrl(url: string) {
    await copyTextToClipboard(url);
    setCopied(true);
    setError(null);
  }

  async function createOrCopy() {
    if (!activeThreadId || !enabled) {
      return;
    }

    const threadId = activeThreadId;
    const mutationId = mutationIdRef.current + 1;
    mutationIdRef.current = mutationId;
    setCopied(false);

    if (shareUrl) {
      await copyCurrentShareUrl(shareUrl);
      return;
    }

    setCreatingShare(true);
    setError(null);

    try {
      const result = await createThreadSnapshotShare(threadId);
      if (mutationIdRef.current !== mutationId || activeThreadIdRef.current !== threadId) {
        return;
      }

      if (!result.ok || !result.data.share) {
        throw new Error(result.error ?? `Failed to create share (${result.status})`);
      }

      setCurrentShare(result.data.share);
      await copyCurrentShareUrl(buildShareUrl(result.data.share.publicId));
    } catch (nextError) {
      if (mutationIdRef.current !== mutationId || activeThreadIdRef.current !== threadId) {
        return;
      }

      setError(nextError instanceof Error ? nextError.message : 'Failed to create share.');
      setCopied(false);
    } finally {
      if (mutationIdRef.current === mutationId && activeThreadIdRef.current === threadId) {
        setCreatingShare(false);
      }
    }
  }

  async function revoke() {
    if (!currentShare) {
      return;
    }

    const threadId = activeThreadIdRef.current;
    const mutationId = mutationIdRef.current + 1;
    mutationIdRef.current = mutationId;
    setRevokingShare(true);
    setError(null);
    setCopied(false);

    try {
      const result = await revokeThreadSnapshotShare(currentShare.publicId);
      if (mutationIdRef.current !== mutationId || activeThreadIdRef.current !== threadId) {
        return;
      }

      if (!result.ok) {
        throw new Error(result.error ?? `Failed to revoke share (${result.status})`);
      }

      setCurrentShare(null);
    } catch (nextError) {
      if (mutationIdRef.current !== mutationId || activeThreadIdRef.current !== threadId) {
        return;
      }

      setError(nextError instanceof Error ? nextError.message : 'Failed to revoke share.');
    } finally {
      if (mutationIdRef.current === mutationId && activeThreadIdRef.current === threadId) {
        setRevokingShare(false);
      }
    }
  }

  return {
    open,
    canOpen,
    copied,
    error,
    creatingShare,
    revokingShare,
    loadingCurrentShare,
    currentShare,
    shareUrl,
    onOpen: () => {
      if (canOpen) {
        setOpen(true);
      }
    },
    onClose: () => {
      setOpen(false);
      setCopied(false);
      setError(null);
    },
    onCreateOrCopy: () => {
      void createOrCopy();
    },
    onRevoke: () => {
      void revoke();
    }
  };
}
