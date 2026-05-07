import type { LiveAssistantDraft, LiveAssistantSegment, LiveAssistantToolState } from '../types/live-assistant-draft.js';
import type { StorageLike } from '../inspector/run-selection-storage.js';

const LIVE_DRAFT_STORAGE_PREFIX = 'durable-chat:live-assistant-draft:';

function isToolState(value: unknown): value is LiveAssistantToolState {
  return Boolean(
    value &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      typeof (value as LiveAssistantToolState).toolCallId === 'string' &&
      typeof (value as LiveAssistantToolState).toolName === 'string' &&
      ((value as LiveAssistantToolState).phase === 'start' ||
        (value as LiveAssistantToolState).phase === 'completed' ||
        (value as LiveAssistantToolState).phase === 'failed')
  );
}

function isSegment(value: unknown): value is LiveAssistantSegment {
  return Boolean(
    value &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      typeof (value as LiveAssistantSegment).id === 'string' &&
      typeof (value as LiveAssistantSegment).messageId === 'string' &&
      typeof (value as LiveAssistantSegment).text === 'string' &&
      (((value as LiveAssistantSegment).reasoning === null) || typeof (value as LiveAssistantSegment).reasoning === 'string') &&
      Array.isArray((value as LiveAssistantSegment).tools) &&
      (value as LiveAssistantSegment).tools.every(isToolState)
  );
}

function isLiveAssistantDraft(value: unknown): value is LiveAssistantDraft {
  return Boolean(
    value &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      typeof (value as LiveAssistantDraft).runId === 'string' &&
      typeof (value as LiveAssistantDraft).messageId === 'string' &&
      typeof (value as LiveAssistantDraft).committedText === 'string' &&
      typeof (value as LiveAssistantDraft).partialText === 'string' &&
      typeof (value as LiveAssistantDraft).segmentText === 'string' &&
      (((value as LiveAssistantDraft).segmentTextMessageId === null) || typeof (value as LiveAssistantDraft).segmentTextMessageId === 'string') &&
      (((value as LiveAssistantDraft).partialReasoning === null) || typeof (value as LiveAssistantDraft).partialReasoning === 'string') &&
      (((value as LiveAssistantDraft).segmentReasoningMessageId === null) || typeof (value as LiveAssistantDraft).segmentReasoningMessageId === 'string') &&
      Array.isArray((value as LiveAssistantDraft).activeTools) &&
      (value as LiveAssistantDraft).activeTools.every(isToolState) &&
      Array.isArray((value as LiveAssistantDraft).segments) &&
      (value as LiveAssistantDraft).segments.every(isSegment)
  );
}

export function getLiveDraftStorageKey(threadId: string) {
  return `${LIVE_DRAFT_STORAGE_PREFIX}${threadId}`;
}

export function readPersistedLiveAssistantDraft(threadId: string, storage: StorageLike | null | undefined): LiveAssistantDraft | null {
  if (!storage || !threadId) {
    return null;
  }

  try {
    const rawValue = storage.getItem(getLiveDraftStorageKey(threadId));
    if (!rawValue) {
      return null;
    }

    const parsed = JSON.parse(rawValue);
    return isLiveAssistantDraft(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function persistLiveAssistantDraft(threadId: string, draft: LiveAssistantDraft, storage: StorageLike | null | undefined) {
  if (!storage || !threadId) {
    return;
  }

  try {
    storage.setItem(getLiveDraftStorageKey(threadId), JSON.stringify(draft));
  } catch {
    // best-effort cache only
  }
}

export function clearPersistedLiveAssistantDraft(threadId: string, storage: StorageLike | null | undefined) {
  if (!storage || !threadId) {
    return;
  }

  try {
    storage.removeItem(getLiveDraftStorageKey(threadId));
  } catch {
    // best-effort cache only
  }
}
