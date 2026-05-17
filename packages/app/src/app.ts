import crypto from 'node:crypto';

import {
  projectCanonicalTranscript,
  type Dataset,
  type EvalExampleResult,
  type EvalRun,
  type Message,
  type MessagePart,
  type Run,
  type RunEvent,
  type Thread,
  type ToolInvocation
} from '@agent-infra/core';

import {
  ActiveChatShareExistsError,
  AgentInfraAppError,
  ChatShareNotFoundError,
  ChatShareRevokedError,
  DatasetNotFoundError,
  InvalidDatasetCaptureError,
  InvalidDatasetInputError,
  InvalidEvalInputError,
  InvalidThreadTitleError,
  EvalExampleResultNotFoundError,
  EvalRunNotFoundError,
  InvalidAnswerCandidateSelectionError,
  InvalidRunFeedbackError,
  InvalidTurnTextError,
  RunNotFoundError,
  RuntimeUnavailableError,
  SharePersistenceError,
  ShareSnapshotBuildError,
  ThreadNotActiveError,
  ThreadHasActiveRunError,
  ThreadNotFoundError,
  TurnPersistenceError,
  TurnProjectionError
} from './errors.js';
import {
  mergeDatasetExampleReviewMetadataV1,
  parseDatasetExampleReviewUpdateV1,
  parseDatasetExpectedOutputV1
} from './dataset-review.js';
import {
  buildEvalRunConfigV1,
  buildEvalRunSummaryV1,
  buildExpectedOutputSnapshotFromDatasetExample,
  mergeEvalExampleResultReviewMetadataV1,
  parseEvalExampleResultReviewUpdateV1,
  parseEvalRunSummaryV1,
  selectEligibleDatasetExamplesV1
} from './eval-run.js';
import { buildTraceSpanProjection } from './trace-span-projection.js';
import type {
  AgentInfraApp,
  AgentInfraAppDependencies,
  AgentInfraAppRepositories,
  CreateThreadInput,
  DatasetBaselineOutputSnapshotV1,
  DatasetContextSnapshotV1,
  DatasetExampleMetadataSnapshotV1,
  DatasetInputSnapshotV1,
  DatasetMessagePartSnapshotV1,
  DatasetMessageSnapshotV1,
  DatasetToolInvocationsSnapshotV1,
  EvalRunSummaryV1,
  PublicChatShareResult,
  RunTraceResult,
  RunTextTurnInput,
  RunTimelineItemV1,
  RunTimelineProjectionV1,
  RuntimeSelection,
  StartTextCandidatesInput,
  SharedMessagePartSnapshot,
  SharedMessageSnapshot,
  SharedSearchBundle,
  SharedThreadSnapshotPayload
} from './types.js';

function toErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return fallback;
}

async function resolveRuntimeSelection(dependencies: AgentInfraAppDependencies, input: Pick<RunTextTurnInput, 'provider' | 'model'>): Promise<RuntimeSelection> {
  try {
    return await dependencies.runtime.prepare(input);
  } catch (error) {
    if (error instanceof AgentInfraAppError) {
      throw error;
    }

    throw new RuntimeUnavailableError(toErrorMessage(error, 'runtime is unavailable'), error);
  }
}

async function loadThreadOrThrow(repositories: AgentInfraAppRepositories, threadId: string) {
  const thread = await repositories.threadRepo.findById(threadId);
  if (!thread) {
    throw new ThreadNotFoundError(threadId);
  }

  return thread;
}

function trimTurnText(text: string) {
  const trimmed = text.trim();
  if (!trimmed) {
    throw new InvalidTurnTextError();
  }

  return trimmed;
}

function trimThreadTitle(title: string) {
  const trimmed = title.trim();
  if (!trimmed) {
    throw new InvalidThreadTitleError();
  }

  return trimmed;
}

async function loadRunOrThrow(repositories: AgentInfraAppRepositories, runId: string) {
  const run = await repositories.runRepo.findById(runId);
  if (!run) {
    throw new RunNotFoundError(runId);
  }

  return run;
}

async function loadDatasetForAppOrThrow(
  repositories: AgentInfraAppRepositories,
  input: { appId: string; datasetId: string; actorId?: string | null }
): Promise<Dataset> {
  const dataset = await repositories.datasetRepo.findById(input.datasetId);
  if (!dataset || dataset.appId !== input.appId) {
    throw new DatasetNotFoundError(input.datasetId);
  }

  if (dataset.visibility === 'private' && (typeof input.actorId !== 'string' || dataset.createdByActorId !== input.actorId)) {
    throw new DatasetNotFoundError(input.datasetId);
  }

  return dataset;
}

async function loadDatasetExampleForDatasetOrThrow(
  repositories: AgentInfraAppRepositories,
  input: { datasetId: string; exampleId: string }
) {
  const example = await repositories.datasetExampleRepo.findById(input.exampleId);
  if (!example || example.datasetId !== input.datasetId) {
    throw new DatasetNotFoundError(input.datasetId);
  }

  return example;
}

async function loadEvalRunForAppOrThrow(
  repositories: AgentInfraAppRepositories,
  input: { appId: string; evalRunId: string; actorId?: string | null }
): Promise<EvalRun> {
  const evalRun = await repositories.evalRunRepo.findById(input.evalRunId);
  if (!evalRun) {
    throw new EvalRunNotFoundError(input.evalRunId);
  }

  await loadDatasetForAppOrThrow(repositories, {
    appId: input.appId,
    datasetId: evalRun.datasetId,
    actorId: input.actorId ?? null
  });

  return evalRun;
}

async function loadEvalExampleResultForRunOrThrow(
  repositories: AgentInfraAppRepositories,
  input: { evalRunId: string; resultId: string }
): Promise<EvalExampleResult> {
  const result = await repositories.evalExampleResultRepo.findById(input.resultId);
  if (!result || result.evalRunId !== input.evalRunId) {
    throw new EvalExampleResultNotFoundError(input.resultId);
  }

  return result;
}

async function buildCanonicalThreadMessages(repositories: AgentInfraAppRepositories, threadId: string, cutoffMessageId?: string | null) {
  const [messages, runs, answerCandidates, answerSelections] = await Promise.all([
    repositories.messageRepo.listByThread(threadId),
    repositories.runRepo.listByThread(threadId),
    repositories.answerCandidateRepo.listByThread(threadId),
    repositories.answerSelectionRepo.listByThread(threadId)
  ]);

  return projectCanonicalTranscript({
    messages,
    runs,
    answerCandidates,
    answerSelections,
    cutoffMessageId
  });
}

async function buildCanonicalThreadMessagesPage(
  repositories: AgentInfraAppRepositories,
  input: { threadId: string; limit?: number; beforeSeq?: number; afterSeq?: number }
) {
  const [page, runs, answerCandidates, answerSelections] = await Promise.all([
    repositories.messageRepo.listPageByThread(input.threadId, {
      limit: input.limit,
      beforeSeq: input.beforeSeq,
      afterSeq: input.afterSeq
    }),
    repositories.runRepo.listByThread(input.threadId),
    repositories.answerCandidateRepo.listByThread(input.threadId),
    repositories.answerSelectionRepo.listByThread(input.threadId)
  ]);

  const projection = projectCanonicalTranscript({
    messages: page.messages,
    runs,
    answerCandidates,
    answerSelections
  });

  return {
    messages: projection.messages,
    pageInfo: page.pageInfo,
    canonicalRunIds: projection.canonicalRunIds,
    diagnostics: projection.diagnostics
  };
}

async function loadCandidateForSelectionOrThrow(
  repositories: AgentInfraAppRepositories,
  input: { threadId: string; triggerMessageId: string; runId: string }
) {
  const candidates = await repositories.answerCandidateRepo.listByTriggerMessage(input.threadId, input.triggerMessageId);
  const candidate = candidates.find((item) => item.runId === input.runId) ?? null;
  if (!candidate) {
    throw new InvalidAnswerCandidateSelectionError('selected run is not a candidate for this turn', input);
  }

  return candidate;
}

async function ensureSelectionIsMutable(repositories: AgentInfraAppRepositories, input: { threadId: string; triggerMessageId: string }) {
  const messages = await repositories.messageRepo.listByThread(input.threadId);
  const triggerMessage = messages.find((message) => message.id === input.triggerMessageId);
  if (!triggerMessage) {
    throw new InvalidAnswerCandidateSelectionError('trigger message was not found', input);
  }

  const laterUserMessage = messages.find((message) => message.role === 'user' && message.seq > triggerMessage.seq);
  if (laterUserMessage) {
    throw new InvalidAnswerCandidateSelectionError('answer selection is immutable after a later user message exists', {
      ...input,
      laterUserMessageId: laterUserMessage.id
    });
  }
}

async function ensureRunIsFeedbackTarget(
  repositories: AgentInfraAppRepositories,
  input: { threadId: string; triggerMessageId?: string | null; runId: string }
): Promise<string> {
  const run = await repositories.runRepo.findById(input.runId);
  if (!run || run.threadId !== input.threadId || !run.triggerMessageId) {
    throw new InvalidRunFeedbackError('feedback run is not part of the requested turn', { ...input });
  }

  if (input.triggerMessageId && run.triggerMessageId !== input.triggerMessageId) {
    throw new InvalidRunFeedbackError('feedback run is not part of the requested turn', { ...input });
  }

  const messages = await repositories.messageRepo.listByThread(input.threadId);
  const hasAssistantOutput = messages.some((message) => message.role === 'assistant' && message.runId === input.runId);
  if (!hasAssistantOutput) {
    throw new InvalidRunFeedbackError('feedback run has no assistant output', { ...input });
  }

  return run.triggerMessageId;
}

async function loadShareByPublicIdOrThrow(repositories: AgentInfraAppRepositories, publicId: string) {
  const share = await repositories.chatShareRepo.findByPublicId(publicId);
  if (!share) {
    throw new ChatShareNotFoundError(publicId);
  }

  return share;
}

async function readProjectedTurnOutcome(repositories: AgentInfraAppRepositories, threadId: string, runId: string) {
  try {
    const [run, messages, runEvents, toolInvocations] = await Promise.all([
      repositories.runRepo.findById(runId),
      repositories.messageRepo.listByThread(threadId),
      repositories.runEventRepo.listByRun(runId),
      repositories.toolRepo.listByRun(runId)
    ]);

    if (!run) {
      throw new TurnProjectionError('run projection is missing', { threadId, runId });
    }

    return {
      run,
      messages,
      debug: {
        runEventCount: runEvents.length,
        toolInvocationCount: toolInvocations.length
      }
    };
  } catch (error) {
    if (error instanceof TurnProjectionError) {
      throw error;
    }

    throw new TurnProjectionError('failed to read turn projection', { threadId, runId }, error);
  }
}

function toIsoString(value: Date | null | undefined) {
  return value ? value.toISOString() : null;
}

function trimDatasetName(name: string) {
  const trimmed = name.trim();
  if (!trimmed) {
    throw new InvalidDatasetInputError('dataset name is required');
  }

  return trimmed;
}

function toDatasetMessagePartSnapshot(part: MessagePart): DatasetMessagePartSnapshotV1 {
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

function toDatasetMessageSnapshot(message: Message & { parts: MessagePart[] }): DatasetMessageSnapshotV1 {
  return {
    id: message.id,
    threadId: message.threadId,
    runId: message.runId ?? null,
    role: message.role,
    seq: message.seq,
    status: message.status,
    metadata: message.metadata ?? null,
    createdAt: message.createdAt.toISOString(),
    parts: [...message.parts].sort((left, right) => left.partIndex - right.partIndex).map(toDatasetMessagePartSnapshot)
  };
}

function buildDatasetInputSnapshot(
  triggerMessageId: string | null | undefined,
  projection: Awaited<ReturnType<typeof buildCanonicalThreadMessages>>
): DatasetInputSnapshotV1 {
  const messages = projection.messages.map(toDatasetMessageSnapshot);
  return {
    schemaVersion: 1,
    kind: 'chat_turn',
    contextSource: 'current_canonical_at_capture',
    triggerMessageId: triggerMessageId ?? null,
    triggerMessage: triggerMessageId ? messages.find((message) => message.id === triggerMessageId) ?? null : null,
    messages,
    canonicalRunIds: projection.canonicalRunIds,
    diagnostics: projection.diagnostics
  };
}

function buildDatasetBaselineOutputSnapshot(run: Run, messages: Array<Message & { parts: MessagePart[] }>): DatasetBaselineOutputSnapshotV1 | null {
  const assistantMessages = messages
    .filter((message) => message.runId === run.id && message.role === 'assistant')
    .sort((left, right) => left.seq - right.seq)
    .map(toDatasetMessageSnapshot);

  if (assistantMessages.length === 0) {
    return null;
  }

  return {
    schemaVersion: 1,
    kind: 'run_output',
    runId: run.id,
    status: run.status,
    error: run.error ?? null,
    assistantMessages
  };
}

function buildDatasetContextSnapshot(
  thread: Thread,
  run: Run,
  traceDiagnostics: DatasetContextSnapshotV1['traceDiagnostics']
): DatasetContextSnapshotV1 {
  return {
    schemaVersion: 1,
    kind: 'run_context',
    appId: thread.appId,
    threadId: thread.id,
    runId: run.id,
    triggerMessageId: run.triggerMessageId ?? null,
    provider: run.provider ?? null,
    model: run.model ?? null,
    status: run.status,
    usage: run.usage ?? null,
    error: run.error ?? null,
    runCreatedAt: run.createdAt.toISOString(),
    startedAt: toIsoString(run.startedAt),
    finishedAt: toIsoString(run.finishedAt),
    traceDiagnostics
  };
}

function buildDatasetToolInvocationsSnapshot(
  run: Run,
  toolInvocations: ToolInvocation[],
  input: { omitToolInvocations?: boolean; toolInvocationOmissionReason?: string | null }
): DatasetToolInvocationsSnapshotV1 {
  if (input.omitToolInvocations) {
    return {
      schemaVersion: 1,
      kind: 'tool_invocations',
      sourceRunId: run.id,
      state: 'omitted_by_policy',
      omissionReason: input.toolInvocationOmissionReason ?? 'omitted_by_policy',
      toolInvocations: []
    };
  }

  return {
    schemaVersion: 1,
    kind: 'tool_invocations',
    sourceRunId: run.id,
    state: 'captured',
    omissionReason: null,
    toolInvocations: toolInvocations.map((invocation) => ({
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
      startedAt: toIsoString(invocation.startedAt),
      finishedAt: toIsoString(invocation.finishedAt),
      createdAt: invocation.createdAt.toISOString()
    }))
  };
}

function classifyCapturedExample(run: Run, baselineOutputJson: DatasetBaselineOutputSnapshotV1 | null) {
  if (run.status === 'failed') {
    return { kind: 'failure_case' as const, defaultEligible: false };
  }

  if (run.status === 'cancelled' || !baselineOutputJson) {
    return { kind: 'debug_case' as const, defaultEligible: false };
  }

  return { kind: 'normal_example' as const, defaultEligible: true };
}

function buildDatasetExampleMetadata(
  input: {
    run: Run;
    thread: Thread;
    capturedAt: Date;
    capturedByActorId?: string | null;
    callerMetadata?: Partial<DatasetExampleMetadataSnapshotV1> & Record<string, unknown>;
    classification: ReturnType<typeof classifyCapturedExample>;
  }
): DatasetExampleMetadataSnapshotV1 {
  const caller = input.callerMetadata ?? {};
  return {
    ...caller,
    schemaVersion: 1,
    capture: {
      ...caller.capture,
      kind: input.classification.kind,
      capturedAt: input.capturedAt.toISOString(),
      capturedByActorId: input.capturedByActorId ?? null,
      sourceRunId: input.run.id,
      sourceThreadId: input.thread.id,
      triggerMessageId: input.run.triggerMessageId ?? null
    },
    feedback: caller.feedback,
    host: caller.host,
    evaluation: {
      ...caller.evaluation,
      defaultEligible: input.classification.defaultEligible
    }
  };
}

function toSnapshotPayloadJson(payload: SharedThreadSnapshotPayload): Record<string, unknown> {
  return payload as unknown as Record<string, unknown>;
}

function fromSnapshotPayloadJson(payload: Record<string, unknown>): SharedThreadSnapshotPayload {
  return payload as unknown as SharedThreadSnapshotPayload;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function readString(value: unknown) {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function readBoolean(value: unknown) {
  return typeof value === 'boolean' ? value : null;
}

function findToolInvocationByCallId(toolInvocations: ToolInvocation[], toolCallId: string | null) {
  return toolCallId ? toolInvocations.find((invocation) => invocation.toolCallId === toolCallId) ?? null : null;
}

function readTerminalRunPhase(run: Run): 'completed' | 'failed' | 'cancelled' {
  if (run.status === 'failed' || run.status === 'cancelled') {
    return run.status;
  }

  return 'completed';
}

function readToolEndPhase(isError: boolean | null, invocation: ToolInvocation | null): 'completed' | 'failed' {
  if (isError === true || invocation?.status === 'failed') {
    return 'failed';
  }

  return 'completed';
}

function buildRunTimelineProjection(
  run: Awaited<ReturnType<typeof loadRunOrThrow>>,
  runEvents: RunEvent[],
  toolInvocations: ToolInvocation[]
): RunTimelineProjectionV1 {
  const items: RunTimelineItemV1[] = [];

  for (const event of runEvents) {
    const payload = asRecord(event.payload);

    if (event.type === 'agent_start') {
      items.push({
        kind: 'run_lifecycle',
        phase: 'started',
        runEventId: event.id,
        seq: event.seq
      });
      continue;
    }

    if (event.type === 'agent_end') {
      items.push({
        kind: 'run_lifecycle',
        phase: readTerminalRunPhase(run),
        runEventId: event.id,
        seq: event.seq
      });
      continue;
    }

    if (event.type === 'message_start' && payload?.role === 'assistant') {
      items.push({
        kind: 'assistant_message',
        phase: 'started',
        runEventId: event.id,
        seq: event.seq
      });
      continue;
    }

    if (event.type === 'message_end' && payload?.role === 'assistant') {
      const stopReason = readString(payload.stopReason);
      items.push({
        kind: 'assistant_message',
        phase: stopReason === 'error' || stopReason === 'aborted' ? 'failed' : 'completed',
        runEventId: event.id,
        seq: event.seq
      });
      continue;
    }

    if (event.type === 'tool_execution_start' || event.type === 'tool_execution_end') {
      const toolCallId = readString(payload?.toolCallId);
      const invocation = findToolInvocationByCallId(toolInvocations, toolCallId);
      const toolName = readString(payload?.toolName) ?? invocation?.toolName ?? 'unknown';
      const isError = readBoolean(payload?.isError);
      items.push({
        kind: 'tool_invocation',
        phase: event.type === 'tool_execution_start' ? 'started' : readToolEndPhase(isError, invocation),
        toolCallId: toolCallId ?? invocation?.toolCallId ?? 'unknown',
        toolName,
        toolInvocationId: invocation?.id ?? null,
        runEventId: event.id,
        seq: event.seq
      });
      continue;
    }

    if (event.type === 'runtime_error') {
      items.push({
        kind: 'runtime_error',
        message: readString(payload?.message) ?? run.error ?? 'runtime error',
        runEventId: event.id,
        seq: event.seq
      });
      continue;
    }

    items.push({
      kind: 'unknown_event',
      type: event.type,
      runEventId: event.id,
      seq: event.seq
    });
  }

  return {
    schemaVersion: 1,
    items
  };
}

function sanitizeShareToolPartJson(
  part: MessagePart,
  sharedToolCallId: string
): Record<string, unknown> | null {
  const value = part.jsonValue ?? {};

  if (part.type === 'tool-call') {
    const toolName = typeof value.toolName === 'string' ? value.toolName : 'unknown';
    const input = typeof value.input === 'object' && value.input !== null ? structuredClone(value.input) : null;

    return {
      toolName,
      toolCallId: sharedToolCallId,
      input
    };
  }

  if (part.type === 'tool-result') {
    const toolName = typeof value.toolName === 'string' ? value.toolName : 'unknown';
    const content = Array.isArray(value.content) ? structuredClone(value.content) : [];
    const details = typeof value.details === 'object' && value.details !== null ? structuredClone(value.details) : null;
    const isError = value.isError === true;

    return {
      toolName,
      toolCallId: sharedToolCallId,
      content,
      details,
      isError
    };
  }

  return null;
}

function buildSharedThreadSnapshotPayload(
  thread: Awaited<ReturnType<typeof loadThreadOrThrow>>,
  messages: Array<Message & { parts: MessagePart[] }>,
  toolInvocations: ToolInvocation[]
): SharedThreadSnapshotPayload {
  try {
    const runIdMap = new Map<string, string>();
    const toolCallIdMap = new Map<string, string>();
    let sharedRunSeq = 1;
    let sharedToolCallSeq = 1;

    const getSharedRunId = (runId: string | null | undefined) => {
      if (!runId) {
        return null;
      }

      const existing = runIdMap.get(runId);
      if (existing) {
        return existing;
      }

      const next = `shared-run-${sharedRunSeq++}`;
      runIdMap.set(runId, next);
      return next;
    };

    const getSharedToolCallId = (toolCallId: string | null | undefined) => {
      if (!toolCallId) {
        return null;
      }

      const existing = toolCallIdMap.get(toolCallId);
      if (existing) {
        return existing;
      }

      const next = `shared-tool-call-${sharedToolCallSeq++}`;
      toolCallIdMap.set(toolCallId, next);
      return next;
    };

    const sharedMessages: SharedMessageSnapshot[] = messages.map((message, messageIndex) => {
      const sharedMessageId = `shared-message-${messageIndex + 1}`;
      const sharedRunId = getSharedRunId(message.runId);
      const parts: SharedMessagePartSnapshot[] = message.parts
        .slice()
        .sort((left, right) => left.partIndex - right.partIndex)
        .map((part, partIndex) => {
          const sharedPartId = `shared-part-${messageIndex + 1}-${partIndex + 1}`;
          const toolCallId =
            typeof part.jsonValue?.toolCallId === 'string'
              ? getSharedToolCallId(part.jsonValue.toolCallId)
              : null;

          const jsonValue =
            part.type === 'tool-call' || part.type === 'tool-result'
              ? sanitizeShareToolPartJson(part, toolCallId ?? `shared-tool-call-${sharedToolCallSeq++}`)
              : part.type === 'data' && part.jsonValue
                ? structuredClone(part.jsonValue)
                : null;

          return {
            id: sharedPartId,
            messageId: sharedMessageId,
            partIndex: part.partIndex,
            type: part.type,
            textValue: part.textValue ?? null,
            jsonValue,
            createdAt: part.createdAt.toISOString()
          };
        });

      return {
        id: sharedMessageId,
        runId: sharedRunId,
        role: message.role,
        seq: message.seq,
        createdAt: message.createdAt.toISOString(),
        parts
      };
    });

    const searchBundles = Object.fromEntries(
      toolInvocations
        .filter((invocation) => invocation.toolName === 'searchWeb')
        .map((invocation) => {
          const sharedToolCallId = getSharedToolCallId(invocation.toolCallId) ?? `shared-tool-call-${sharedToolCallSeq++}`;
          const bundle: SharedSearchBundle = {
            runId: getSharedRunId(invocation.runId),
            toolCallId: sharedToolCallId,
            toolName: invocation.toolName,
            status: invocation.status,
            input: invocation.input ? structuredClone(invocation.input) : null,
            output: invocation.output ? structuredClone(invocation.output) : null,
            error: invocation.error ?? null,
            startedAt: toIsoString(invocation.startedAt),
            finishedAt: toIsoString(invocation.finishedAt)
          };

          return [sharedToolCallId, bundle];
        })
    );

    return {
      payloadFormat: 'messages_v1',
      payloadVersion: 1,
      title: thread.title ?? null,
      messages: sharedMessages,
      searchBundles: Object.keys(searchBundles).length > 0 ? searchBundles : null
    };
  } catch (error) {
    throw new ShareSnapshotBuildError('failed to build share snapshot payload', { threadId: thread.id }, error);
  }
}

async function queueTextTurn(
  dependencies: AgentInfraAppDependencies,
  input: RunTextTurnInput,
  generateId: () => string,
  getNow: () => Date
): Promise<{
  thread: Awaited<ReturnType<typeof loadThreadOrThrow>>;
  text: string;
  run: Run;
  userMessage: Message & { parts: MessagePart[] };
  runtimeSelection: RuntimeSelection;
}> {
  const text = trimTurnText(input.text);
  const thread = await loadThreadOrThrow(dependencies.repositories, input.threadId);
  if (thread.status !== 'active') {
    throw new ThreadNotActiveError(thread.id, thread.status);
  }

  const runtimeSelection = await resolveRuntimeSelection(dependencies, input);
  let queuedRunId = '';
  let queuedRun: Run | null = null;
  let queuedMessage: (Message & { parts: MessagePart[] }) | null = null;

  try {
    await dependencies.transaction(async (repositories) => {
      await repositories.threadRepo.touch(thread.id, getNow());
      const messageId = generateId();
      const runId = generateId();
      queuedRunId = runId;

      const userMessage = await repositories.messageRepo.createWithNextSeq({
        id: messageId,
        threadId: thread.id,
        runId: null,
        role: 'user',
        status: 'completed',
        metadata: null
      });

      const firstPart = await repositories.messageRepo.createPart({
        id: generateId(),
        messageId: userMessage.id,
        partIndex: 0,
        type: 'text',
        textValue: text,
        jsonValue: null
      });

      const run = await repositories.runRepo.create({
        id: runId,
        threadId: thread.id,
        triggerMessageId: userMessage.id,
        provider: runtimeSelection.provider,
        model: runtimeSelection.model,
        status: 'queued',
        usage: null,
        error: null,
        startedAt: null,
        finishedAt: null
      });

      queuedMessage = {
        ...userMessage,
        parts: [firstPart]
      };
      queuedRun = run;
    });
  } catch (error) {
    throw new TurnPersistenceError('failed to persist queued turn state', { threadId: thread.id, runId: queuedRunId }, error);
  }

  if (!queuedRun || !queuedMessage) {
    throw new TurnPersistenceError('queued turn state was not committed', { threadId: thread.id, runId: queuedRunId });
  }

  return {
    thread,
    text,
    run: queuedRun,
    userMessage: queuedMessage,
    runtimeSelection
  };
}

async function queueTextCandidatesTurn(
  dependencies: AgentInfraAppDependencies,
  input: StartTextCandidatesInput,
  generateId: () => string,
  getNow: () => Date
) {
  if (input.candidateCount !== 2) {
    throw new InvalidAnswerCandidateSelectionError('candidateCount must be 2 for candidate turns', {
      threadId: input.threadId,
      candidateCount: input.candidateCount
    });
  }

  const text = trimTurnText(input.text);
  const thread = await loadThreadOrThrow(dependencies.repositories, input.threadId);
  if (thread.status !== 'active') {
    throw new ThreadNotActiveError(thread.id, thread.status);
  }

  const runtimeSelection = await resolveRuntimeSelection(dependencies, input);
  let triggerMessageId = '';
  let queuedMessage: (Message & { parts: MessagePart[] }) | null = null;
  let queuedCandidates: Array<{ candidate: Awaited<ReturnType<AgentInfraAppRepositories['answerCandidateRepo']['create']>>; run: Run }> = [];
  let queuedSelection: Awaited<ReturnType<AgentInfraAppRepositories['answerSelectionRepo']['upsert']>> | null = null;

  try {
    await dependencies.transaction(async (repositories) => {
      await repositories.threadRepo.touch(thread.id, getNow());
      const messageId = generateId();
      triggerMessageId = messageId;

      const userMessage = await repositories.messageRepo.createWithNextSeq({
        id: messageId,
        threadId: thread.id,
        runId: null,
        role: 'user',
        status: 'completed',
        metadata: null
      });

      const firstPart = await repositories.messageRepo.createPart({
        id: generateId(),
        messageId: userMessage.id,
        partIndex: 0,
        type: 'text',
        textValue: text,
        jsonValue: null
      });

      const candidates: Array<{ candidate: Awaited<ReturnType<AgentInfraAppRepositories['answerCandidateRepo']['create']>>; run: Run }> = [];
      for (const ordinal of [0, 1]) {
        const runId = generateId();
        const run = await repositories.runRepo.create({
          id: runId,
          threadId: thread.id,
          triggerMessageId: userMessage.id,
          provider: runtimeSelection.provider,
          model: runtimeSelection.model,
          status: 'queued',
          usage: null,
          error: null,
          startedAt: null,
          finishedAt: null
        });

        const candidate = await repositories.answerCandidateRepo.create({
          id: generateId(),
          threadId: thread.id,
          triggerMessageId: userMessage.id,
          runId,
          ordinal,
          kind: ordinal === 0 ? 'primary' : 'alternative'
        });

        candidates.push({ candidate, run });
      }

      queuedSelection = await repositories.answerSelectionRepo.upsert({
        threadId: thread.id,
        triggerMessageId: userMessage.id,
        selectedRunId: candidates[0]!.run.id,
        source: 'default',
        selectedByUserId: null
      });

      queuedMessage = {
        ...userMessage,
        parts: [firstPart]
      };
      queuedCandidates = candidates;
    });
  } catch (error) {
    throw new TurnPersistenceError('failed to persist queued candidate turn state', { threadId: thread.id, triggerMessageId }, error);
  }

  if (!queuedMessage || queuedCandidates.length !== 2 || !queuedSelection) {
    throw new TurnPersistenceError('queued candidate turn state was not committed', { threadId: thread.id, triggerMessageId });
  }

  return {
    triggerMessageId,
    userMessage: queuedMessage,
    candidates: queuedCandidates,
    answerSelection: queuedSelection,
    runtimeSelection
  };
}

export function createAgentInfraApp(dependencies: AgentInfraAppDependencies): AgentInfraApp {
  const generateId = dependencies.idGenerator ?? crypto.randomUUID;
  const now = dependencies.now ?? (() => new Date());

  return {
    threads: {
      async create(input: CreateThreadInput) {
        return dependencies.repositories.threadRepo.create({
          id: generateId(),
          appId: input.appId,
          userId: input.userId ?? null,
          title: input.title?.trim() ? input.title.trim() : null,
          status: 'active',
          metadata: input.metadata ?? null,
          archivedAt: null
        });
      },
      async list(input) {
        return dependencies.repositories.threadRepo.listByApp(input.appId);
      },
      async rename(input) {
        const thread = await loadThreadOrThrow(dependencies.repositories, input.threadId);
        const title = trimThreadTitle(input.title);
        return dependencies.repositories.threadRepo.rename(thread.id, title, now());
      },
      async archive(input) {
        const thread = await loadThreadOrThrow(dependencies.repositories, input.threadId);
        if (thread.status === 'archived') {
          return thread;
        }

        const activeRuns = await dependencies.repositories.runRepo.listActiveByThread(thread.id);
        if (activeRuns.length > 0) {
          throw new ThreadHasActiveRunError(thread.id, activeRuns[0]!.id);
        }

        return dependencies.repositories.threadRepo.archive(thread.id, now());
      },
      async getMessages(input) {
        await loadThreadOrThrow(dependencies.repositories, input.threadId);
        return dependencies.repositories.messageRepo.listByThread(input.threadId);
      },
      async getMessagesPage(input) {
        await loadThreadOrThrow(dependencies.repositories, input.threadId);
        return dependencies.repositories.messageRepo.listPageByThread(input.threadId, {
          limit: input.limit,
          beforeSeq: input.beforeSeq,
          afterSeq: input.afterSeq
        });
      },
      async getCanonicalMessages(input) {
        await loadThreadOrThrow(dependencies.repositories, input.threadId);
        return buildCanonicalThreadMessages(dependencies.repositories, input.threadId, input.cutoffMessageId);
      },
      async getCanonicalMessagesPage(input) {
        await loadThreadOrThrow(dependencies.repositories, input.threadId);
        return buildCanonicalThreadMessagesPage(dependencies.repositories, input);
      },
      async getMessagesWithAnswerCandidates(input) {
        await loadThreadOrThrow(dependencies.repositories, input.threadId);
        const hasPagination = typeof input.beforeSeq === 'number' || typeof input.afterSeq === 'number' || typeof input.limit === 'number';
        const messagesPromise = hasPagination
          ? dependencies.repositories.messageRepo.listPageByThread(input.threadId, {
              limit: input.limit,
              beforeSeq: input.beforeSeq,
              afterSeq: input.afterSeq
            })
          : dependencies.repositories.messageRepo.listByThread(input.threadId).then((messages) => ({ messages, pageInfo: undefined }));

        const [messageResult, activeRuns, answerCandidates, answerSelections] = await Promise.all([
          messagesPromise,
          dependencies.repositories.runRepo.listActiveByThread(input.threadId),
          dependencies.repositories.answerCandidateRepo.listByThread(input.threadId),
          dependencies.repositories.answerSelectionRepo.listByThread(input.threadId)
        ]);
        const messages = messageResult.messages;
        const visibleMessageIds = new Set(messages.map((message) => message.id));
        const visibleRunIds = new Set(messages.map((message) => message.runId).filter((runId): runId is string => typeof runId === 'string'));
        const relevantCandidates = hasPagination
          ? answerCandidates.filter((candidate) => visibleMessageIds.has(candidate.triggerMessageId) || visibleRunIds.has(candidate.runId))
          : answerCandidates;
        const relevantTriggerIds = new Set(relevantCandidates.map((candidate) => candidate.triggerMessageId));
        const relevantSelections = hasPagination
          ? answerSelections.filter((selection) => relevantTriggerIds.has(selection.triggerMessageId))
          : answerSelections;
        const runIds = [
          ...new Set([
            ...relevantCandidates.map((candidate) => candidate.runId),
            ...visibleRunIds
          ])
        ];
        const feedbackActorId = input.feedbackActorId?.trim() || null;
        const runFeedback = runIds.length > 0 && feedbackActorId
          ? await dependencies.repositories.runFeedbackRepo.listByRunIds(runIds, feedbackActorId)
          : [];

        return {
          messages,
          pageInfo: messageResult.pageInfo,
          activeRuns,
          activeRun: activeRuns[0] ?? null,
          answerCandidates: relevantCandidates,
          answerSelections: relevantSelections,
          runFeedback
        };
      }
    },
    turns: {
      async startText(input) {
        const queued = await queueTextTurn(dependencies, input, generateId, now);
        return {
          run: queued.run,
          userMessage: queued.userMessage,
          runtimeSelection: queued.runtimeSelection
        };
      },
      async startTextCandidates(input) {
        return queueTextCandidatesTurn(dependencies, input, generateId, now);
      },
      async selectAnswerCandidate(input) {
        await loadThreadOrThrow(dependencies.repositories, input.threadId);
        return dependencies.transaction(async (repositories) => {
          await loadCandidateForSelectionOrThrow(repositories, input);
          await ensureSelectionIsMutable(repositories, input);
          return repositories.answerSelectionRepo.upsert({
            threadId: input.threadId,
            triggerMessageId: input.triggerMessageId,
            selectedRunId: input.runId,
            source: 'user',
            selectedByUserId: input.selectedByUserId ?? null
          });
        });
      },
      async setRunFeedback(input) {
        await loadThreadOrThrow(dependencies.repositories, input.threadId);
        const triggerMessageId = await ensureRunIsFeedbackTarget(dependencies.repositories, input);

        return dependencies.repositories.runFeedbackRepo.set({
          id: generateId(),
          threadId: input.threadId,
          triggerMessageId,
          runId: input.runId,
          feedbackActorId: input.feedbackActorId,
          value: input.value
        });
      },
      async clearRunFeedback(input) {
        await loadThreadOrThrow(dependencies.repositories, input.threadId);
        const run = await dependencies.repositories.runRepo.findById(input.runId);
        if (!run || run.threadId !== input.threadId) {
          throw new InvalidRunFeedbackError('feedback run is not part of the thread', { ...input });
        }

        await dependencies.repositories.runFeedbackRepo.clear(input);
      },
      async runText(input) {
        const queued = await queueTextTurn(dependencies, input, generateId, now);
        const runId = queued.run.id;

        let executionError: string | undefined;
        try {
          await dependencies.runtime.runTextTurn(dependencies.repositories, {
            threadId: queued.thread.id,
            runId,
            provider: queued.runtimeSelection.provider,
            model: queued.runtimeSelection.model,
            thinkingEnabled: input.thinkingEnabled,
            reasoningEffort: input.reasoningEffort,
            webSearchEnabled: input.webSearchEnabled
          });
        } catch (error) {
          executionError = toErrorMessage(error, 'runtime execution failed');
        }

        const projection = await readProjectedTurnOutcome(dependencies.repositories, queued.thread.id, runId);
        return {
          ...projection,
          executionError
        };
      }
    },
    runs: {
      async getTimeline(input) {
        const run = await loadRunOrThrow(dependencies.repositories, input.runId);
        const [runEvents, toolInvocations] = await Promise.all([
          dependencies.repositories.runEventRepo.listByRun(input.runId),
          dependencies.repositories.toolRepo.listByRun(input.runId)
        ]);

        return {
          run,
          runEvents,
          toolInvocations,
          projection: buildRunTimelineProjection(run, runEvents, toolInvocations)
        };
      },
      async getTrace(input): Promise<RunTraceResult> {
        const run = await loadRunOrThrow(dependencies.repositories, input.runId);
        const [thread, runEvents, toolInvocations] = await Promise.all([
          loadThreadOrThrow(dependencies.repositories, run.threadId),
          dependencies.repositories.runEventRepo.listByRun(input.runId),
          dependencies.repositories.toolRepo.listByRun(input.runId)
        ]);

        return {
          run,
          projection: buildTraceSpanProjection({
            run,
            thread,
            runEvents,
            toolInvocations
          })
        };
      },
      async listByThread(input) {
        await loadThreadOrThrow(dependencies.repositories, input.threadId);
        return dependencies.repositories.runRepo.listByThread(input.threadId, {
          limit: input.limit
        });
      },
      async getActiveByThread(input) {
        await loadThreadOrThrow(dependencies.repositories, input.threadId);
        return dependencies.repositories.runRepo.findLatestActiveByThread(input.threadId);
      },
      async listActiveByThread(input) {
        await loadThreadOrThrow(dependencies.repositories, input.threadId);
        return dependencies.repositories.runRepo.listActiveByThread(input.threadId);
      }
    },
    datasets: {
      async create(input) {
        const visibility = input.visibility ?? 'private';
        if (visibility === 'private' && !input.createdByActorId) {
          throw new InvalidDatasetInputError('private dataset requires createdByActorId', {
            appId: input.appId
          });
        }

        return dependencies.repositories.datasetRepo.create({
          id: generateId(),
          appId: input.appId,
          name: trimDatasetName(input.name),
          description: input.description?.trim() ? input.description.trim() : null,
          visibility,
          metadata: input.metadata ?? null,
          createdByActorId: input.createdByActorId ?? null
        });
      },
      async list(input) {
        return dependencies.repositories.datasetRepo.listByApp({
          appId: input.appId,
          actorId: input.actorId ?? null,
          includeAppVisible: input.includeAppVisible
        });
      },
      async get(input) {
        return loadDatasetForAppOrThrow(dependencies.repositories, input);
      },
      async listExamples(input) {
        await loadDatasetForAppOrThrow(dependencies.repositories, input);
        return dependencies.repositories.datasetExampleRepo.listByDataset(input.datasetId);
      },
      async getExample(input) {
        await loadDatasetForAppOrThrow(dependencies.repositories, input);
        return loadDatasetExampleForDatasetOrThrow(dependencies.repositories, input);
      },
      async updateExampleExpectedOutput(input) {
        await loadDatasetForAppOrThrow(dependencies.repositories, input);
        await loadDatasetExampleForDatasetOrThrow(dependencies.repositories, input);
        const expectedOutputJson = parseDatasetExpectedOutputV1(input.expectedOutputJson);
        return dependencies.repositories.datasetExampleRepo.updateExpectedOutput(
          input.exampleId,
          { expectedOutputJson: expectedOutputJson as unknown as Record<string, unknown> | null },
          now()
        );
      },
      async updateExampleReview(input) {
        const rawInput = input as unknown as Record<string, unknown>;
        if (Object.hasOwn(rawInput, 'reviewedByActorId')) {
          throw new InvalidDatasetInputError('reviewedByActorId is assigned from actor context');
        }
        if (Object.hasOwn(rawInput, 'reviewedAt')) {
          throw new InvalidDatasetInputError('reviewedAt is assigned from app time');
        }

        return dependencies.transaction(async (repositories) => {
          await loadDatasetForAppOrThrow(repositories, input);
          const example = await loadDatasetExampleForDatasetOrThrow(repositories, input);
          const update = parseDatasetExampleReviewUpdateV1(input.review);
          const metadataJson = mergeDatasetExampleReviewMetadataV1({
            metadataJson: example.metadataJson,
            update,
            expectedOutputJson: example.expectedOutputJson ?? null,
            reviewedByActorId: input.actorId ?? null,
            reviewedAt: now()
          });

          return repositories.datasetExampleRepo.updateExpectedOutput(input.exampleId, { metadataJson }, now());
        });
      },
      async captureExampleFromRun(input) {
        const dataset = await loadDatasetForAppOrThrow(dependencies.repositories, input);
        const run = await loadRunOrThrow(dependencies.repositories, input.sourceRunId);
        const thread = await loadThreadOrThrow(dependencies.repositories, run.threadId);
        if (thread.appId !== input.appId || dataset.appId !== thread.appId) {
          throw new InvalidDatasetCaptureError('source run is outside the dataset app boundary', {
            appId: input.appId,
            datasetId: dataset.id,
            sourceRunId: run.id,
            sourceThreadId: thread.id
          });
        }
        if (run.status !== 'completed' && run.status !== 'failed' && run.status !== 'cancelled') {
          throw new InvalidDatasetCaptureError('only completed, failed, or cancelled runs can be captured', {
            datasetId: dataset.id,
            sourceRunId: run.id,
            status: run.status
          });
        }

        const [canonicalProjection, allMessages, runEvents, toolInvocations] = await Promise.all([
          buildCanonicalThreadMessages(dependencies.repositories, thread.id, run.triggerMessageId),
          dependencies.repositories.messageRepo.listByThread(thread.id),
          dependencies.repositories.runEventRepo.listByRun(run.id),
          dependencies.repositories.toolRepo.listByRun(run.id)
        ]);
        const traceProjection = buildTraceSpanProjection({ run, thread, runEvents, toolInvocations });
        const inputJson = buildDatasetInputSnapshot(run.triggerMessageId, canonicalProjection);
        const baselineOutputJson = buildDatasetBaselineOutputSnapshot(run, allMessages);
        const contextSnapshotJson = buildDatasetContextSnapshot(thread, run, traceProjection.diagnostics.warnings);
        const toolInvocationsSnapshotJson = buildDatasetToolInvocationsSnapshot(run, toolInvocations, input);
        const classification = classifyCapturedExample(run, baselineOutputJson);
        const capturedAt = now();
        const metadataJson = buildDatasetExampleMetadata({
          run,
          thread,
          capturedAt,
          capturedByActorId: input.capturedByActorId ?? input.actorId ?? null,
          callerMetadata: input.metadataJson,
          classification
        });

        const example = await dependencies.transaction(async (repositories) =>
          repositories.datasetExampleRepo.create({
            id: generateId(),
            datasetId: dataset.id,
            sourceRunId: run.id,
            sourceThreadId: thread.id,
            triggerMessageId: run.triggerMessageId ?? null,
            inputJson: inputJson as unknown as Record<string, unknown>,
            baselineOutputJson: baselineOutputJson as unknown as Record<string, unknown> | null,
            expectedOutputJson: input.expectedOutputJson ?? null,
            metadataJson: metadataJson as unknown as Record<string, unknown>,
            contextSnapshotJson: contextSnapshotJson as unknown as Record<string, unknown>,
            toolInvocationsSnapshotJson: toolInvocationsSnapshotJson as unknown as Record<string, unknown>,
            createdByActorId: input.capturedByActorId ?? input.actorId ?? null
          })
        );

        return {
          dataset,
          example
        };
      }
    },
    evals: {
      async create(input) {
        return dependencies.transaction(async (repositories) => {
          const dataset = await loadDatasetForAppOrThrow(repositories, input);
          const examples = await repositories.datasetExampleRepo.listByDataset(dataset.id);
          const selection = selectEligibleDatasetExamplesV1(examples);
          const configJson = buildEvalRunConfigV1({
            provider: input.provider ?? null,
            model: input.model ?? null,
            runtimeOptions: input.runtimeOptions ?? null
          });
          const summaryJson = buildEvalRunSummaryV1({ selection: selection.summary });
          const evalRun = await repositories.evalRunRepo.create({
            id: generateId(),
            appId: dataset.appId,
            datasetId: dataset.id,
            status: selection.selected.length === 0 ? 'completed' : 'queued',
            name: input.name?.trim() ? input.name.trim() : null,
            configJson: configJson as unknown as Record<string, unknown>,
            summaryJson: summaryJson as unknown as Record<string, unknown>,
            error: null,
            createdByActorId: input.createdByActorId ?? input.actorId ?? null,
            startedAt: null,
            finishedAt: selection.selected.length === 0 ? now() : null
          });

          await repositories.evalExampleResultRepo.createMany(
            selection.selected.map((item, index) => ({
              id: generateId(),
              evalRunId: evalRun.id,
              datasetExampleId: item.example.id,
              exampleOrdinal: index + 1,
              status: 'queued',
              evalThreadId: null,
              outputRunId: null,
              expectedOutputJson: buildExpectedOutputSnapshotFromDatasetExample(item.example) as unknown as Record<string, unknown>,
              actualOutputJson: null,
              inputJson: null,
              usageJson: null,
              metadataJson: {
                selection: {
                  policy: 'effective_eligible_v1',
                  eligibilityReason: item.eligibilityReason,
                  selectedAt: evalRun.createdAt.toISOString(),
                  datasetExampleCreatedAt: item.example.createdAt.toISOString(),
                  datasetExampleUpdatedAt: item.example.updatedAt.toISOString()
                }
              },
              error: null,
              startedAt: null,
              finishedAt: null
            }))
          );

          return evalRun;
        });
      },
      async listByDataset(input) {
        await loadDatasetForAppOrThrow(dependencies.repositories, input);
        return dependencies.repositories.evalRunRepo.listByDataset(input.datasetId);
      },
      async get(input) {
        return loadEvalRunForAppOrThrow(dependencies.repositories, input);
      },
      async listResults(input) {
        const evalRun = await loadEvalRunForAppOrThrow(dependencies.repositories, input);
        return dependencies.repositories.evalExampleResultRepo.listByEvalRun(evalRun.id);
      },
      async updateResultReview(input) {
        const rawInput = input as unknown as Record<string, unknown>;
        if (Object.hasOwn(rawInput, 'reviewedByActorId')) {
          throw new InvalidEvalInputError('reviewedByActorId is assigned from actor context');
        }
        if (Object.hasOwn(rawInput, 'reviewedAt')) {
          throw new InvalidEvalInputError('reviewedAt is assigned from app time');
        }

        return dependencies.transaction(async (repositories) => {
          const evalRun = await loadEvalRunForAppOrThrow(repositories, input);
          const result = await loadEvalExampleResultForRunOrThrow(repositories, {
            evalRunId: evalRun.id,
            resultId: input.resultId
          });
          const update = parseEvalExampleResultReviewUpdateV1(input.review);
          const metadataJson = mergeEvalExampleResultReviewMetadataV1({
            metadataJson: result.metadataJson ?? null,
            update,
            reviewedByActorId: input.actorId ?? null,
            reviewedAt: now()
          });
          const updated = await repositories.evalExampleResultRepo.update(result.id, { metadataJson }, now());
          const results = await repositories.evalExampleResultRepo.listByEvalRun(evalRun.id);
          const previousSummary = parseEvalRunSummaryV1(evalRun.summaryJson);
          const nextSummary: EvalRunSummaryV1 = buildEvalRunSummaryV1({
            selection: previousSummary.selection,
            results
          });
          await repositories.evalRunRepo.update(
            evalRun.id,
            { summaryJson: nextSummary as unknown as Record<string, unknown> },
            now()
          );

          return updated;
        });
      }
    },
    shares: {
      async createThreadSnapshot(input) {
        const shareId = generateId();
        const snapshotId = generateId();
        const publicId = generateId();
        let shareCreatedAt: Date | undefined;
        let snapshotCreatedAt: Date | undefined;
        let payload: SharedThreadSnapshotPayload | undefined;

        try {
          await dependencies.transaction(async (repositories) => {
            const thread = await loadThreadOrThrow(repositories, input.threadId);
            await repositories.threadRepo.touch(thread.id, now());

            const activeRuns = await repositories.runRepo.listActiveByThread(thread.id);
            if (activeRuns.length > 0) {
              throw new ThreadHasActiveRunError(thread.id, activeRuns[0]!.id);
            }

            const existingActiveShare = await repositories.chatShareRepo.findActiveByThread(thread.id);
            if (existingActiveShare) {
              throw new ActiveChatShareExistsError(thread.id, existingActiveShare.publicId);
            }

            const { messages } = await buildCanonicalThreadMessages(repositories, thread.id);
            const runIds = [
              ...new Set(messages.map((message) => message.runId).filter((runId): runId is string => typeof runId === 'string' && runId.length > 0))
            ];
            const toolInvocations = (await Promise.all(runIds.map((runId) => repositories.toolRepo.listByRun(runId)))).flat();

            payload = buildSharedThreadSnapshotPayload(thread, messages, toolInvocations);

            const share = await repositories.chatShareRepo.create({
              id: shareId,
              publicId,
              sourceThreadId: input.threadId,
              scopeType: 'thread',
              status: 'active',
              snapshotId,
              revokedAt: null
            });
            shareCreatedAt = share.createdAt;

            const snapshot = await repositories.chatShareSnapshotRepo.create({
              id: snapshotId,
              shareId,
              payloadFormat: 'messages_v1',
              payloadVersion: 1,
              payloadJson: toSnapshotPayloadJson(payload),
              messageCount: payload.messages.length,
              startSeq: payload.messages[0]?.seq ?? null,
              endSeq: payload.messages.at(-1)?.seq ?? null
            });
            snapshotCreatedAt = snapshot.createdAt;
          });
        } catch (error) {
          if (error instanceof AgentInfraAppError) {
            throw error;
          }

          throw new SharePersistenceError('failed to persist thread snapshot share', { threadId: input.threadId, shareId, snapshotId }, error);
        }

        if (!payload) {
          throw new SharePersistenceError('thread snapshot payload was not committed', { threadId: input.threadId, shareId, snapshotId });
        }

        return {
          share: {
            id: shareId,
            publicId,
            sourceThreadId: input.threadId,
            scopeType: 'thread',
            status: 'active',
            snapshotId,
            createdAt: shareCreatedAt ?? now(),
            revokedAt: null
          },
          snapshot: {
            id: snapshotId,
            shareId,
            payloadFormat: 'messages_v1',
            payloadVersion: 1,
            payloadJson: toSnapshotPayloadJson(payload),
            messageCount: payload.messages.length,
            startSeq: payload.messages[0]?.seq ?? null,
            endSeq: payload.messages.at(-1)?.seq ?? null,
            createdAt: snapshotCreatedAt ?? now()
          }
        };
      },
      async getCurrentByThread(input) {
        await loadThreadOrThrow(dependencies.repositories, input.threadId);
        return dependencies.repositories.chatShareRepo.findActiveByThread(input.threadId);
      },
      async getPublic(input): Promise<PublicChatShareResult> {
        const share = await loadShareByPublicIdOrThrow(dependencies.repositories, input.publicId);
        if (share.status === 'revoked') {
          throw new ChatShareRevokedError(input.publicId);
        }

        const snapshot = await dependencies.repositories.chatShareSnapshotRepo.findById(share.snapshotId);
        if (!snapshot || !snapshot.payloadJson) {
          throw new ChatShareNotFoundError(input.publicId);
        }

        return {
          share,
          snapshot: fromSnapshotPayloadJson(snapshot.payloadJson)
        };
      },
      async revoke(input) {
        const share = await loadShareByPublicIdOrThrow(dependencies.repositories, input.publicId);
        if (share.status === 'revoked') {
          return share;
        }

        return dependencies.repositories.chatShareRepo.updateStatus(share.id, 'revoked', {
          revokedAt: now()
        });
      }
    }
  };
}
