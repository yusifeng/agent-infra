import type { MessageDto, MessagePartDto, SharedMessageDto, SharedThreadSnapshotDto, ToolInvocationDto } from '@agent-infra/contracts';

import { buildAnswerContainers } from '@/features/durable-chat/service/build-answer-containers';
import { buildContentNodes } from '@/features/durable-chat/service/build-content-nodes';
import { projectNormalTranscriptBlocks } from '@/features/durable-chat/service/project-normal-transcript-blocks';
import { buildSearchPanelData } from '@/features/durable-chat/service/search-panel';
import type { AnswerContainer } from '@/features/durable-chat/types/answer-containers';
import type { ContentNode } from '@/features/durable-chat/types/content-nodes';
import type { ActiveSearchPanelData } from '@/features/durable-chat/types/search';
import type { TranscriptBlock } from '@/features/durable-chat/types/transcript-blocks';

export type SharedSnapshotSearchBundle = {
  runId: string | null;
  toolCallId: string;
  toolName: string;
  status: ToolInvocationDto['status'];
  input: Record<string, unknown> | null;
  output: Record<string, unknown> | null;
  error: string | null;
  startedAt: string | null;
  finishedAt: string | null;
};

export type SharedSnapshotPresentation = {
  threadId: string;
  title: string | null;
  messages: MessageDto[];
  contentNodes: ContentNode[];
  transcriptBlocks: TranscriptBlock[];
  answerContainers: AnswerContainer[];
  searchBundles: Record<string, SharedSnapshotSearchBundle>;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

function asNullableString(value: unknown) {
  if (value === null || value === undefined) {
    return null;
  }

  return typeof value === 'string' ? value : null;
}

function asStatus(value: unknown): ToolInvocationDto['status'] | null {
  return value === 'pending' || value === 'running' || value === 'completed' || value === 'failed' ? value : null;
}

function normalizeSharedSearchBundle(value: unknown): SharedSnapshotSearchBundle | null {
  const record = asRecord(value);
  if (!record) {
    return null;
  }

  const toolCallId = asNullableString(record.toolCallId);
  const toolName = asNullableString(record.toolName);
  const status = asStatus(record.status);

  if (!toolCallId || !toolName || !status) {
    return null;
  }

  return {
    runId: asNullableString(record.runId),
    toolCallId,
    toolName,
    status,
    input: asRecord(record.input),
    output: asRecord(record.output),
    error: asNullableString(record.error),
    startedAt: asNullableString(record.startedAt),
    finishedAt: asNullableString(record.finishedAt)
  };
}

export function normalizeSharedSearchBundles(searchBundles: SharedThreadSnapshotDto['searchBundles']): Record<string, SharedSnapshotSearchBundle> {
  if (!searchBundles) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(searchBundles)
      .map(([toolCallId, rawBundle]) => {
        const bundle = normalizeSharedSearchBundle(rawBundle);
        return bundle ? [toolCallId, bundle] : null;
      })
      .filter((entry): entry is [string, SharedSnapshotSearchBundle] => entry !== null)
  );
}

export function createSharedSnapshotThreadId(publicId: string) {
  return `shared-thread:${publicId}`;
}

function adaptSharedPart(messageId: string, part: SharedMessageDto['parts'][number]): MessagePartDto {
  return {
    id: part.id,
    messageId,
    partIndex: part.partIndex,
    type: part.type,
    textValue: part.textValue ?? null,
    jsonValue: part.jsonValue ?? null,
    createdAt: part.createdAt
  };
}

export function adaptSharedMessagesToThreadMessages(args: {
  publicId: string;
  messages: SharedMessageDto[];
}): MessageDto[] {
  const threadId = createSharedSnapshotThreadId(args.publicId);

  return args.messages
    .slice()
    .sort((left, right) => left.seq - right.seq)
    .map((message) => ({
      id: message.id,
      threadId,
      runId: message.runId ?? null,
      role: message.role,
      seq: message.seq,
      status: 'completed' as const,
      metadata: null,
      createdAt: message.createdAt,
      parts: message.parts
        .slice()
        .sort((left, right) => left.partIndex - right.partIndex)
        .map((part) => adaptSharedPart(message.id, part))
    }));
}

function buildSharedToolInvocation(bundle: SharedSnapshotSearchBundle, threadId: string): ToolInvocationDto {
  return {
    id: `shared-invocation:${bundle.toolCallId}`,
    threadId,
    runId: bundle.runId ?? `shared-run:missing:${bundle.toolCallId}`,
    messageId: `shared-message:${bundle.toolCallId}`,
    toolName: bundle.toolName,
    toolCallId: bundle.toolCallId,
    status: bundle.status,
    input: bundle.input,
    output: bundle.output,
    error: bundle.error,
    startedAt: bundle.startedAt,
    finishedAt: bundle.finishedAt,
    createdAt: bundle.startedAt ?? bundle.finishedAt ?? '1970-01-01T00:00:00.000Z'
  };
}

export function buildSharedSearchPanelData(args: {
  publicId: string;
  runId: string;
  toolCallIds: string[];
  searchBundles: Record<string, SharedSnapshotSearchBundle>;
}): ActiveSearchPanelData | null {
  const threadId = createSharedSnapshotThreadId(args.publicId);
  const bundles = [...new Set(args.toolCallIds)]
    .map((toolCallId) => args.searchBundles[toolCallId])
    .filter(
      (bundle): bundle is SharedSnapshotSearchBundle =>
        Boolean(bundle) && bundle.runId === args.runId && bundle.toolName === 'searchWeb'
    );

  if (bundles.length === 0) {
    return null;
  }

  return buildSearchPanelData(bundles.map((bundle) => buildSharedToolInvocation(bundle, threadId)));
}

export function buildSharedSnapshotPresentation(args: {
  publicId: string;
  snapshot: SharedThreadSnapshotDto;
}): SharedSnapshotPresentation {
  const messages = adaptSharedMessagesToThreadMessages({
    publicId: args.publicId,
    messages: args.snapshot.messages
  });
  const contentNodes = buildContentNodes(messages);
  const transcriptBlocks = projectNormalTranscriptBlocks({
    messages,
    contentNodes
  });

  return {
    threadId: createSharedSnapshotThreadId(args.publicId),
    title: args.snapshot.title ?? null,
    messages,
    contentNodes,
    transcriptBlocks,
    answerContainers: buildAnswerContainers(transcriptBlocks),
    searchBundles: normalizeSharedSearchBundles(args.snapshot.searchBundles)
  };
}
