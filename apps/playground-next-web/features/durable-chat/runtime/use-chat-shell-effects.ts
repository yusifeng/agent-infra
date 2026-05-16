'use client';

import { installChatRenderDiagnostics } from '@agent-infra/durable-chat-client';
import { useEffect, useRef } from 'react';
import type { Dispatch, SetStateAction } from 'react';

import { collectCompletedLiveSearchToolCallIds } from '@/features/durable-chat/service/research-activity';
import type { LiveAssistantDraft } from '@/features/durable-chat/types/live-assistant-draft';

const DEFAULT_DOCUMENT_TITLE = 'playground-next-web';
const MOBILE_SIDEBAR_BREAKPOINT = 1024;

type ChatShellEffectsOptions = {
  currentVisibleThreadTitle: string;
  liveAssistantDraft: LiveAssistantDraft | null;
  prefetchSearchResult: (runId: string, toolCallIds: string[]) => Promise<unknown>;
  setSidebarOpen: Dispatch<SetStateAction<boolean>>;
};

function shouldUseMobileSidebarBehavior() {
  return typeof window !== 'undefined' && window.innerWidth < MOBILE_SIDEBAR_BREAKPOINT;
}

export function useChatShellEffects({
  currentVisibleThreadTitle,
  liveAssistantDraft,
  prefetchSearchResult,
  setSidebarOpen
}: ChatShellEffectsOptions) {
  const previousDocumentTitleRef = useRef<string | null>(null);

  useEffect(() => {
    installChatRenderDiagnostics();
  }, []);

  useEffect(() => {
    previousDocumentTitleRef.current = document.title;

    return () => {
      document.title = previousDocumentTitleRef.current || DEFAULT_DOCUMENT_TITLE;
      previousDocumentTitleRef.current = null;
    };
  }, []);

  useEffect(() => {
    document.title = currentVisibleThreadTitle || DEFAULT_DOCUMENT_TITLE;
  }, [currentVisibleThreadTitle]);

  useEffect(() => {
    const runId = liveAssistantDraft?.runId;
    if (!runId) {
      return;
    }

    const completedSearchToolCallIdGroups = liveAssistantDraft.segments
      .map((segment) => collectCompletedLiveSearchToolCallIds(segment.tools))
      .filter((toolCallIds) => toolCallIds.length > 0);
    if (completedSearchToolCallIdGroups.length === 0) {
      return;
    }

    void Promise.all(
      completedSearchToolCallIdGroups.map((toolCallIds) => prefetchSearchResult(runId, toolCallIds).catch(() => null))
    );
  }, [liveAssistantDraft, prefetchSearchResult]);

  useEffect(() => {
    if (shouldUseMobileSidebarBehavior()) {
      setSidebarOpen(false);
    }
  }, []);

  return {
    closeSidebarForMobile: () => {
      if (shouldUseMobileSidebarBehavior()) {
        setSidebarOpen(false);
      }
    }
  };
}
