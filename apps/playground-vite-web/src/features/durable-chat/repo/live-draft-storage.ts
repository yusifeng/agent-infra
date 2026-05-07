import {
  clearPersistedLiveAssistantDraft,
  persistLiveAssistantDraft,
  readPersistedLiveAssistantDraft
} from '@agent-infra/durable-chat-client';
import type { LiveAssistantDraft } from '@agent-infra/durable-chat-client';

function getSessionStorage() {
  return typeof window === 'undefined' ? null : window.sessionStorage;
}

export function readStoredLiveAssistantDraft(threadId: string) {
  return readPersistedLiveAssistantDraft(threadId, getSessionStorage());
}

export function persistStoredLiveAssistantDraft(threadId: string, draft: LiveAssistantDraft) {
  persistLiveAssistantDraft(threadId, draft, getSessionStorage());
}

export function clearStoredLiveAssistantDraft(threadId: string) {
  clearPersistedLiveAssistantDraft(threadId, getSessionStorage());
}
