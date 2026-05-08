import type { PublicChatShareDto } from '@agent-infra/contracts';
import { useEffect, useMemo, useRef, useState } from 'react';

import { fetchThreadSnapshotShare } from '@/features/durable-chat/repo/share-api';
import {
  buildSharedSearchPanelData,
  buildSharedSnapshotPresentation,
  type SharedSnapshotPresentation
} from '@/features/durable-chat/service/shared-snapshot-presentation';
import type { ActiveSearchPanelData } from '@/features/durable-chat/types/search';

export function useSharedSnapshotRuntime({ initialPublicId }: { initialPublicId: string | null }) {
  const [loading, setLoading] = useState(Boolean(initialPublicId));
  const [error, setError] = useState<string | null>(null);
  const [share, setShare] = useState<PublicChatShareDto | null>(null);
  const [presentation, setPresentation] = useState<SharedSnapshotPresentation | null>(null);
  const [searchPanelOpen, setSearchPanelOpen] = useState(false);
  const [searchPanelLoading, setSearchPanelLoading] = useState(false);
  const [searchPanelError, setSearchPanelError] = useState<string | null>(null);
  const [activeSearchResult, setActiveSearchResult] = useState<ActiveSearchPanelData | null>(null);
  const requestIdRef = useRef(0);
  const abortControllerRef = useRef<AbortController | null>(null);
  const messagesViewportRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const publicId = initialPublicId;
    if (!publicId) {
      setLoading(false);
      setError('Missing share id.');
      setShare(null);
      setPresentation(null);
      return;
    }

    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;

    setLoading(true);
    setError(null);
    setSearchPanelOpen(false);
    setSearchPanelLoading(false);
    setSearchPanelError(null);
    setActiveSearchResult(null);

    void fetchThreadSnapshotShare(publicId, controller.signal)
      .then((result) => {
        if (requestIdRef.current !== requestId || controller.signal.aborted) {
          return;
        }

        if (!result.ok || !result.data.share) {
          setShare(null);
          setPresentation(null);
          setError(result.error ?? `Failed to load share (${result.status})`);
          return;
        }

        setShare(result.data.share);
        setPresentation(
          buildSharedSnapshotPresentation({
            publicId,
            snapshot: result.data.share.snapshot
          })
        );
      })
      .catch((nextError) => {
        if (requestIdRef.current !== requestId || controller.signal.aborted) {
          return;
        }

        setShare(null);
        setPresentation(null);
        setError(nextError instanceof Error ? nextError.message : 'Failed to load share.');
      })
      .finally(() => {
        if (requestIdRef.current === requestId && !controller.signal.aborted) {
          setLoading(false);
        }
      });

    return () => {
      controller.abort();
    };
  }, [initialPublicId]);

  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    if (!presentation) {
      return;
    }

    const viewport = messagesViewportRef.current;
    if (!viewport) {
      return;
    }

    window.requestAnimationFrame(() => {
      viewport.scrollTo({
        top: 0,
        behavior: 'auto'
      });
    });
  }, [presentation]);

  const currentThreadTitle = useMemo(() => {
    if (presentation?.title?.trim()) {
      return presentation.title.trim();
    }

    return '来自分享的对话';
  }, [presentation]);

  function openSearchResult(runId: string, toolCallIds: string[]) {
    if (!presentation || !share) {
      return;
    }

    setSearchPanelLoading(true);
    setSearchPanelError(null);

    const panelData = buildSharedSearchPanelData({
      publicId: share.publicId,
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

  return {
    loading,
    error,
    share,
    currentThreadTitle,
    messagesViewportRef,
    displayedMessages: presentation?.messages ?? [],
    displayedTranscriptBlocks: presentation?.transcriptBlocks ?? [],
    displayedAnswerContainers: presentation?.answerContainers ?? [],
    activeSearchResult,
    searchPanelError,
    searchPanelLoading,
    searchPanelOpen,
    onOpenSearchResult: openSearchResult,
    onCloseSearchPanel: () => setSearchPanelOpen(false)
  };
}
