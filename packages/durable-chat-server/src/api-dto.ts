import type {
  AnswerCandidate,
  AnswerSelection,
  ChatShare,
  ChatShareSnapshot,
  Dataset,
  DatasetExample,
  EvalExampleResult,
  EvalRun,
  Message,
  MessagePart,
  Run,
  RunEvent,
  RunFeedback,
  Thread,
  ToolInvocation
} from '@agent-infra/core';
import type {
  AnswerCandidateDto,
  AnswerSelectionDto,
  ChatShareDto,
  ChatShareSnapshotDto,
  DatasetDto,
  DatasetExampleDto,
  DatasetExpectedOutputNormalizationDto,
  EvalActualOutputSnapshotV1Dto,
  EvalExampleResultDto,
  EvalRunDto,
  MessageDto,
  MessagePartDto,
  PublicChatShareDto,
  RunDto,
  RunEventDto,
  RunEventSummaryDto,
  RunFeedbackDto,
  RuntimePiMetaDto,
  SharedMessageDto,
  SharedMessagePartDto,
  SharedThreadSnapshotDto,
  ThreadDto,
  ToolInvocationDto,
  ToolInvocationSummaryDto
} from '@agent-infra/contracts';
import {
  computeDatasetExampleEffectiveEligibilityV1,
  normalizeDatasetExampleReviewMetadataV1,
  normalizeDatasetExpectedOutputV1,
  normalizeEvalExampleResultReviewV1,
  parseEvalRunConfigV1,
  parseEvalRunSummaryV1
} from '@agent-infra/app';
import type { PublicChatShareResult, SharedThreadSnapshotPayload } from '@agent-infra/app';

export type RuntimeMetaDtoInput = {
  dbMode: string;
  dbConnection: string;
  runtimeConfigured: boolean;
  runtimeProvider: string;
  runtimeModel: string;
  defaultModelKey: string | null;
  modelOptions: RuntimePiMetaDto['modelOptions'];
  runtimeConfigError: string | null;
};

function serializeDate(value: Date | null | undefined): string | null {
  if (!value) {
    return null;
  }

  return value.toISOString();
}

export function toThreadDto(thread: Thread): ThreadDto {
  return {
    id: thread.id,
    appId: thread.appId,
    userId: thread.userId ?? null,
    title: thread.title ?? null,
    status: thread.status,
    metadata: thread.metadata ?? null,
    createdAt: thread.createdAt.toISOString(),
    updatedAt: thread.updatedAt.toISOString(),
    archivedAt: serializeDate(thread.archivedAt)
  };
}

export function toMessagePartDto(part: MessagePart): MessagePartDto {
  return {
    id: part.id,
    messageId: part.messageId,
    partIndex: part.partIndex,
    type: part.type,
    textValue: part.textValue ?? null,
    jsonValue: part.jsonValue ?? null,
    createdAt: part.createdAt.toISOString()
  };
}

export function toMessageDto(message: Message & { parts: MessagePart[] }): MessageDto {
  return {
    id: message.id,
    threadId: message.threadId,
    runId: message.runId ?? null,
    role: message.role,
    seq: message.seq,
    status: message.status,
    metadata: message.metadata ?? null,
    createdAt: message.createdAt.toISOString(),
    parts: message.parts.map(toMessagePartDto)
  };
}

export function toRunDto(run: Run | null): RunDto | null {
  if (!run) {
    return null;
  }

  return {
    id: run.id,
    threadId: run.threadId,
    triggerMessageId: run.triggerMessageId ?? null,
    provider: run.provider ?? null,
    model: run.model ?? null,
    status: run.status,
    usage: run.usage ?? null,
    error: run.error ?? null,
    startedAt: serializeDate(run.startedAt),
    finishedAt: serializeDate(run.finishedAt),
    createdAt: run.createdAt.toISOString()
  };
}

export function toRunEventSummaryDto(event: RunEvent): RunEventSummaryDto {
  return {
    seq: event.seq,
    type: event.type
  };
}

export function toRunEventDto(event: RunEvent): RunEventDto {
  return {
    id: event.id,
    threadId: event.threadId,
    runId: event.runId,
    seq: event.seq,
    type: event.type,
    payload: event.payload,
    createdAt: event.createdAt.toISOString()
  };
}

export function toToolInvocationSummaryDto(invocation: ToolInvocation): ToolInvocationSummaryDto {
  return {
    id: invocation.id,
    toolName: invocation.toolName,
    status: invocation.status
  };
}

export function toToolInvocationDto(invocation: ToolInvocation): ToolInvocationDto {
  return {
    id: invocation.id,
    threadId: invocation.threadId,
    runId: invocation.runId,
    messageId: invocation.messageId,
    toolName: invocation.toolName,
    toolCallId: invocation.toolCallId,
    status: invocation.status,
    input: invocation.input ?? null,
    output: invocation.output ?? null,
    error: invocation.error ?? null,
    startedAt: serializeDate(invocation.startedAt),
    finishedAt: serializeDate(invocation.finishedAt),
    createdAt: invocation.createdAt.toISOString()
  };
}

export function toRuntimeMetaDto(input: RuntimeMetaDtoInput): RuntimePiMetaDto {
  return {
    dbMode: input.dbMode,
    dbConnection: input.dbConnection,
    runtimeConfigured: input.runtimeConfigured,
    runtimeProvider: input.runtimeProvider,
    runtimeModel: input.runtimeModel,
    defaultModelKey: input.defaultModelKey,
    modelOptions: input.modelOptions,
    runtimeConfigError: input.runtimeConfigError
  };
}

export function toChatShareDto(share: ChatShare): ChatShareDto {
  return {
    id: share.id,
    publicId: share.publicId,
    sourceThreadId: share.sourceThreadId,
    scopeType: share.scopeType,
    status: share.status,
    snapshotId: share.snapshotId,
    createdAt: share.createdAt.toISOString(),
    revokedAt: serializeDate(share.revokedAt)
  };
}

export function toChatShareSnapshotDto(snapshot: ChatShareSnapshot): ChatShareSnapshotDto {
  return {
    id: snapshot.id,
    shareId: snapshot.shareId,
    payloadFormat: snapshot.payloadFormat,
    payloadVersion: snapshot.payloadVersion,
    payloadJson: snapshot.payloadJson ?? null,
    messageCount: snapshot.messageCount,
    startSeq: snapshot.startSeq ?? null,
    endSeq: snapshot.endSeq ?? null,
    createdAt: snapshot.createdAt.toISOString()
  };
}

export function toAnswerCandidateDto(candidate: AnswerCandidate): AnswerCandidateDto {
  return {
    id: candidate.id,
    threadId: candidate.threadId,
    triggerMessageId: candidate.triggerMessageId,
    runId: candidate.runId,
    ordinal: candidate.ordinal,
    kind: candidate.kind,
    createdAt: candidate.createdAt.toISOString()
  };
}

export function toAnswerSelectionDto(selection: AnswerSelection): AnswerSelectionDto {
  return {
    threadId: selection.threadId,
    triggerMessageId: selection.triggerMessageId,
    selectedRunId: selection.selectedRunId,
    source: selection.source,
    selectedByUserId: selection.selectedByUserId ?? null,
    createdAt: selection.createdAt.toISOString(),
    updatedAt: selection.updatedAt.toISOString()
  };
}

export function toRunFeedbackDto(feedback: RunFeedback): RunFeedbackDto {
  return {
    id: feedback.id,
    threadId: feedback.threadId,
    triggerMessageId: feedback.triggerMessageId,
    runId: feedback.runId,
    feedbackActorId: feedback.feedbackActorId,
    value: feedback.value,
    createdAt: feedback.createdAt.toISOString(),
    updatedAt: feedback.updatedAt.toISOString()
  };
}

export function toDatasetDto(dataset: Dataset): DatasetDto {
  return {
    id: dataset.id,
    appId: dataset.appId,
    name: dataset.name,
    description: dataset.description ?? null,
    visibility: dataset.visibility,
    metadata: dataset.metadata ?? null,
    createdByActorId: dataset.createdByActorId ?? null,
    createdAt: dataset.createdAt.toISOString(),
    updatedAt: dataset.updatedAt.toISOString()
  };
}

export function toDatasetExampleDto(example: DatasetExample): DatasetExampleDto {
  const expectedOutput = normalizeDatasetExpectedOutputV1(example.expectedOutputJson ?? null) as DatasetExpectedOutputNormalizationDto;

  return {
    id: example.id,
    datasetId: example.datasetId,
    sourceRunId: example.sourceRunId ?? null,
    sourceThreadId: example.sourceThreadId ?? null,
    triggerMessageId: example.triggerMessageId ?? null,
    inputJson: example.inputJson,
    baselineOutputJson: example.baselineOutputJson ?? null,
    expectedOutputJson: example.expectedOutputJson ?? null,
    expectedOutput,
    metadataJson: example.metadataJson ?? null,
    review: normalizeDatasetExampleReviewMetadataV1(example.metadataJson?.review),
    effectiveEligibility: computeDatasetExampleEffectiveEligibilityV1({
      expectedOutputJson: example.expectedOutputJson ?? null,
      metadataJson: example.metadataJson ?? null
    }),
    contextSnapshotJson: example.contextSnapshotJson ?? null,
    toolInvocationsSnapshotJson: example.toolInvocationsSnapshotJson ?? null,
    createdByActorId: example.createdByActorId ?? null,
    createdAt: example.createdAt.toISOString(),
    updatedAt: example.updatedAt.toISOString()
  };
}

function parseEvalRunConfigDto(value: Record<string, unknown>): EvalRunDto['config'] {
  try {
    return parseEvalRunConfigV1(value);
  } catch {
    return null;
  }
}

function parseEvalRunSummaryDto(value: Record<string, unknown>): EvalRunDto['summary'] {
  try {
    return parseEvalRunSummaryV1(value);
  } catch {
    return null;
  }
}

function toEvalActualOutputSnapshotDto(value: Record<string, unknown> | null | undefined): EvalActualOutputSnapshotV1Dto | null {
  if (!value || value.schemaVersion !== 1 || value.kind !== 'eval_run_output') {
    return null;
  }

  if (typeof value.outputRunId !== 'string' || typeof value.evalThreadId !== 'string' || typeof value.status !== 'string') {
    return null;
  }

  return {
    schemaVersion: 1,
    kind: 'eval_run_output',
    outputRunId: value.outputRunId,
    evalThreadId: value.evalThreadId,
    status: value.status as EvalActualOutputSnapshotV1Dto['status'],
    error: typeof value.error === 'string' ? value.error : null,
    assistantMessages: Array.isArray(value.assistantMessages) ? (value.assistantMessages as MessageDto[]) : []
  };
}

export function toEvalRunDto(evalRun: EvalRun): EvalRunDto {
  return {
    id: evalRun.id,
    appId: evalRun.appId,
    datasetId: evalRun.datasetId,
    status: evalRun.status,
    name: evalRun.name ?? null,
    configJson: evalRun.configJson,
    config: parseEvalRunConfigDto(evalRun.configJson),
    summaryJson: evalRun.summaryJson,
    summary: parseEvalRunSummaryDto(evalRun.summaryJson),
    error: evalRun.error ?? null,
    createdByActorId: evalRun.createdByActorId ?? null,
    startedAt: serializeDate(evalRun.startedAt),
    finishedAt: serializeDate(evalRun.finishedAt),
    createdAt: evalRun.createdAt.toISOString(),
    updatedAt: evalRun.updatedAt.toISOString()
  };
}

export function toEvalExampleResultDto(result: EvalExampleResult): EvalExampleResultDto {
  return {
    id: result.id,
    evalRunId: result.evalRunId,
    datasetExampleId: result.datasetExampleId,
    exampleOrdinal: result.exampleOrdinal,
    status: result.status,
    evalThreadId: result.evalThreadId ?? null,
    outputRunId: result.outputRunId ?? null,
    expectedOutputJson: result.expectedOutputJson,
    actualOutputJson: result.actualOutputJson ?? null,
    actualOutput: toEvalActualOutputSnapshotDto(result.actualOutputJson),
    inputJson: result.inputJson ?? null,
    usageJson: result.usageJson ?? null,
    metadataJson: result.metadataJson ?? null,
    review: normalizeEvalExampleResultReviewV1(result.metadataJson ?? null),
    error: result.error ?? null,
    startedAt: serializeDate(result.startedAt),
    finishedAt: serializeDate(result.finishedAt),
    createdAt: result.createdAt.toISOString(),
    updatedAt: result.updatedAt.toISOString()
  };
}

export function toSharedMessagePartDto(part: SharedThreadSnapshotPayload['messages'][number]['parts'][number]): SharedMessagePartDto {
  return {
    id: part.id,
    messageId: part.messageId,
    partIndex: part.partIndex,
    type: part.type,
    textValue: part.textValue ?? null,
    jsonValue: part.jsonValue ?? null,
    createdAt: part.createdAt
  };
}

export function toSharedMessageDto(message: SharedThreadSnapshotPayload['messages'][number]): SharedMessageDto {
  return {
    id: message.id,
    runId: message.runId ?? null,
    role: message.role,
    seq: message.seq,
    createdAt: message.createdAt,
    parts: message.parts.map(toSharedMessagePartDto)
  };
}

export function toSharedThreadSnapshotDto(snapshot: SharedThreadSnapshotPayload): SharedThreadSnapshotDto {
  return {
    payloadFormat: snapshot.payloadFormat,
    payloadVersion: snapshot.payloadVersion,
    title: snapshot.title ?? null,
    messages: snapshot.messages.map(toSharedMessageDto),
    searchBundles: snapshot.searchBundles ?? null
  };
}

export function toPublicChatShareDto(result: PublicChatShareResult): PublicChatShareDto {
  return {
    publicId: result.share.publicId,
    scopeType: result.share.scopeType,
    status: 'active',
    createdAt: result.share.createdAt.toISOString(),
    snapshot: toSharedThreadSnapshotDto(result.snapshot)
  };
}
