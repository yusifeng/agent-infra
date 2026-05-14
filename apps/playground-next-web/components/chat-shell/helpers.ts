'use client';

export { assistantMessageHasVisibleContent, messagePartHasVisibleContent } from '@agent-infra/durable-chat-client';
import type { MessageDto, RunDto, ToolInvocationDto } from '@agent-infra/contracts';

export function formatDateTime(value?: string | null) {
  if (!value) {
    return '';
  }

  return new Intl.DateTimeFormat(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    month: 'short',
    day: 'numeric'
  }).format(new Date(value));
}

export function formatDuration(startedAt?: string | null, finishedAt?: string | null) {
  if (!startedAt) {
    return 'Not started';
  }

  const start = new Date(startedAt).getTime();
  const end = finishedAt ? new Date(finishedAt).getTime() : Date.now();
  const durationMs = Math.max(0, end - start);

  if (durationMs < 1000) {
    return `${durationMs} ms`;
  }

  const seconds = durationMs / 1000;
  if (seconds < 60) {
    return `${seconds.toFixed(seconds < 10 ? 1 : 0)} s`;
  }

  const roundedSeconds = Math.round(seconds);
  const minutes = Math.floor(roundedSeconds / 60);
  const remainingSeconds = roundedSeconds % 60;
  return `${minutes}m ${remainingSeconds}s`;
}

export function statusBadgeTone(status: RunDto['status'] | ToolInvocationDto['status'] | MessageDto['status'] | 'idle') {
  switch (status) {
    case 'running':
      return 'bg-[var(--chat-status-running-bg)] text-[color:var(--chat-status-running-text)]';
    case 'queued':
    case 'created':
      return 'bg-[var(--chat-status-pending-bg)] text-[color:var(--chat-status-pending-text)]';
    case 'completed':
      return 'bg-[var(--chat-status-success-bg)] text-[color:var(--chat-status-success-text)]';
    case 'failed':
      return 'bg-[var(--chat-status-danger-bg)] text-[color:var(--chat-status-danger-text)]';
    default:
      return 'bg-[var(--chat-status-idle-bg)] text-[color:var(--chat-status-idle-text)]';
  }
}

function buildMessageCopyText(message: MessageDto) {
  return message.parts
    .flatMap((part) => {
      if (part.type === 'text' || part.type === 'reasoning') {
        return part.textValue ? [part.textValue] : [];
      }

      if (part.type === 'tool-result') {
        return part.textValue ? [part.textValue] : [];
      }

      return [];
    })
    .join('\n\n')
    .trim();
}

export async function copyTextToClipboard(text: string) {
  const normalizedText = text.trim();
  if (!normalizedText || typeof navigator === 'undefined' || !navigator.clipboard) {
    return;
  }

  await navigator.clipboard.writeText(normalizedText);
}

export async function copyMessageToClipboard(message: MessageDto) {
  const text = buildMessageCopyText(message);
  await copyTextToClipboard(text);
}
