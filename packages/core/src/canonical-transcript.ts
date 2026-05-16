import type { AnswerCandidate, AnswerSelection, Message, Run } from './types.js';

export type CanonicalTranscriptDiagnosticCode =
  | 'missing_cutoff_message'
  | 'missing_selected_run'
  | 'selected_run_from_wrong_trigger'
  | 'no_candidate_ordinal_zero'
  | 'failed_selected_candidate_fallback'
  | 'no_completed_candidate_fallback';

export interface CanonicalTranscriptDiagnostic {
  code: CanonicalTranscriptDiagnosticCode;
  threadId: string;
  triggerMessageId?: string | null;
  runId?: string | null;
  message: string;
}

export interface CanonicalTranscriptProjectionInput<TMessage extends Message = Message> {
  messages: TMessage[];
  runs: Run[];
  answerCandidates: AnswerCandidate[];
  answerSelections: AnswerSelection[];
  cutoffMessageId?: string | null;
  includeCutoffMessage?: boolean;
}

export interface CanonicalTranscriptProjectionResult<TMessage extends Message = Message> {
  messages: TMessage[];
  canonicalRunIds: string[];
  diagnostics: CanonicalTranscriptDiagnostic[];
}

function sortMessages<TMessage extends Message>(messages: TMessage[]) {
  return [...messages].sort((left, right) => left.seq - right.seq);
}

function sortCandidates(candidates: AnswerCandidate[]) {
  return [...candidates].sort((left, right) => left.ordinal - right.ordinal || left.createdAt.getTime() - right.createdAt.getTime());
}

function isTerminalCompleted(run: Run | undefined) {
  return run?.status === 'completed';
}

export function projectCanonicalTranscript<TMessage extends Message>(
  input: CanonicalTranscriptProjectionInput<TMessage>
): CanonicalTranscriptProjectionResult<TMessage> {
  const diagnostics: CanonicalTranscriptDiagnostic[] = [];
  const sortedMessages = sortMessages(input.messages);
  const runById = new Map(input.runs.map((run) => [run.id, run]));
  const candidateByRunId = new Map(input.answerCandidates.map((candidate) => [candidate.runId, candidate]));
  const candidatesByTrigger = new Map<string, AnswerCandidate[]>();
  const selectionByTrigger = new Map(input.answerSelections.map((selection) => [selection.triggerMessageId, selection]));

  for (const candidate of input.answerCandidates) {
    const candidates = candidatesByTrigger.get(candidate.triggerMessageId) ?? [];
    candidates.push(candidate);
    candidatesByTrigger.set(candidate.triggerMessageId, candidates);
  }

  const canonicalRunIds = new Set<string>();

  for (const [triggerMessageId, candidates] of candidatesByTrigger.entries()) {
    const sortedCandidates = sortCandidates(candidates);
    const selection = selectionByTrigger.get(triggerMessageId);
    const selectedCandidate = selection ? candidateByRunId.get(selection.selectedRunId) : null;
    const threadId = sortedCandidates[0]?.threadId ?? selection?.threadId ?? '';

    if (selection && !selectedCandidate) {
      diagnostics.push({
        code: 'missing_selected_run',
        threadId: selection.threadId,
        triggerMessageId,
        runId: selection.selectedRunId,
        message: `selected run ${selection.selectedRunId} is not an answer candidate`
      });
    }

    if (selection && selectedCandidate && selectedCandidate.triggerMessageId !== triggerMessageId) {
      diagnostics.push({
        code: 'selected_run_from_wrong_trigger',
        threadId: selection.threadId,
        triggerMessageId,
        runId: selection.selectedRunId,
        message: `selected run ${selection.selectedRunId} belongs to a different trigger`
      });
    }

    const ordinalZero = sortedCandidates.find((candidate) => candidate.ordinal === 0);
    if (!ordinalZero) {
      diagnostics.push({
        code: 'no_candidate_ordinal_zero',
        threadId,
        triggerMessageId,
        message: `trigger ${triggerMessageId} has no ordinal 0 candidate`
      });
    }

    const completedCandidates = sortedCandidates.filter((candidate) => isTerminalCompleted(runById.get(candidate.runId)));
    let canonicalCandidate =
      selectedCandidate && selectedCandidate.triggerMessageId === triggerMessageId && isTerminalCompleted(runById.get(selectedCandidate.runId))
        ? selectedCandidate
        : null;

    if (!canonicalCandidate && selection && selectedCandidate && selectedCandidate.triggerMessageId === triggerMessageId) {
      const fallback = completedCandidates.find((candidate) => candidate.ordinal === 0) ?? completedCandidates[0] ?? null;
      if (fallback) {
        diagnostics.push({
          code: 'failed_selected_candidate_fallback',
          threadId: selection.threadId,
          triggerMessageId,
          runId: selection.selectedRunId,
          message: `selected run ${selection.selectedRunId} is not completed; falling back to ${fallback.runId}`
        });
        canonicalCandidate = fallback;
      }
    }

    canonicalCandidate ??= completedCandidates.find((candidate) => candidate.ordinal === 0) ?? completedCandidates[0] ?? null;

    if (!canonicalCandidate && sortedCandidates.length > 0) {
      canonicalCandidate = ordinalZero ?? sortedCandidates[0] ?? null;
      diagnostics.push({
        code: 'no_completed_candidate_fallback',
        threadId,
        triggerMessageId,
        runId: canonicalCandidate?.runId ?? null,
        message: `trigger ${triggerMessageId} has no completed candidate`
      });
    }

    if (canonicalCandidate) {
      canonicalRunIds.add(canonicalCandidate.runId);
    }
  }

  const cutoffMessage = input.cutoffMessageId ? sortedMessages.find((message) => message.id === input.cutoffMessageId) : null;
  if (input.cutoffMessageId && !cutoffMessage) {
    diagnostics.push({
      code: 'missing_cutoff_message',
      threadId: sortedMessages[0]?.threadId ?? '',
      triggerMessageId: input.cutoffMessageId,
      message: `cutoff message ${input.cutoffMessageId} was not found`
    });
  }

  const cutoffSeq = cutoffMessage?.seq ?? null;
  const includeCutoffMessage = input.includeCutoffMessage ?? true;

  const projectedMessages = sortedMessages.filter((message) => {
    if (cutoffSeq !== null && (includeCutoffMessage ? message.seq > cutoffSeq : message.seq >= cutoffSeq)) {
      return false;
    }

    if (message.role === 'system' || message.role === 'user') {
      return true;
    }

    if (!message.runId) {
      return true;
    }

    const candidate = candidateByRunId.get(message.runId);
    if (!candidate) {
      return true;
    }

    return canonicalRunIds.has(message.runId);
  });

  return {
    messages: projectedMessages,
    canonicalRunIds: [...canonicalRunIds],
    diagnostics
  };
}
