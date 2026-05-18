import type { EvalExampleResultDto, MessageDto } from '@agent-infra/contracts';

export type EvalResultComparisonOutcomeV1 = 'match' | 'mismatch' | 'not_comparable';

export type EvalResultComparisonReasonV1 =
  | 'normalized_text_equal'
  | 'normalized_text_different'
  | 'result_not_completed'
  | 'result_failed'
  | 'missing_expected_output'
  | 'unsupported_expected_output_shape'
  | 'missing_expected_text'
  | 'empty_expected_text'
  | 'missing_actual_output'
  | 'unsupported_actual_output_shape'
  | 'actual_output_error'
  | 'missing_actual_assistant_messages'
  | 'missing_actual_text'
  | 'empty_actual_text';

export type EvalResultComparisonDiagnosticV1 =
  | 'multiple_actual_assistant_messages'
  | 'non_text_actual_parts_omitted'
  | 'empty_actual_text_parts_omitted';

export type EvalActualTextBlockV1 = {
  messageId: string;
  seq?: number | null;
  text: string;
};

export type EvalExpectedTextProjectionV1 =
  | {
      ok: true;
      text: string;
    }
  | {
      ok: false;
      reason:
        | 'missing_expected_output'
        | 'unsupported_expected_output_shape'
        | 'missing_expected_text'
        | 'empty_expected_text';
    };

export type EvalActualTextProjectionV1 =
  | {
      ok: true;
      text: string;
      blocks: EvalActualTextBlockV1[];
      diagnostics: EvalResultComparisonDiagnosticV1[];
    }
  | {
      ok: false;
      reason:
        | 'missing_actual_output'
        | 'unsupported_actual_output_shape'
        | 'actual_output_error'
        | 'missing_actual_assistant_messages'
        | 'missing_actual_text'
        | 'empty_actual_text';
      text: string | null;
      blocks: EvalActualTextBlockV1[];
      diagnostics: EvalResultComparisonDiagnosticV1[];
    };

export type EvalResultComparisonProjectionV1 = {
  schemaVersion: 1;
  kind: 'eval_result_comparison';
  strategy: 'normalized_text_v1';
  outcome: EvalResultComparisonOutcomeV1;
  reason: EvalResultComparisonReasonV1;
  diagnostics: EvalResultComparisonDiagnosticV1[];
  expectedText?: string | null;
  actualText?: string | null;
  actualTextBlocks: EvalActualTextBlockV1[];
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

export function normalizeComparisonTextV1(text: string) {
  return text.replace(/\r\n?/g, '\n').trim().replace(/\s+/g, ' ');
}

export function extractEvalExpectedTextV1(result: EvalExampleResultDto): EvalExpectedTextProjectionV1 {
  const expectedOutput = asRecord(result.expectedOutputJson);
  if (!expectedOutput) {
    return { ok: false, reason: 'missing_expected_output' };
  }

  if (expectedOutput.schemaVersion !== 1 || expectedOutput.kind !== 'assistant_text') {
    return { ok: false, reason: 'unsupported_expected_output_shape' };
  }

  if (typeof expectedOutput.text !== 'string') {
    return { ok: false, reason: 'missing_expected_text' };
  }

  if (!expectedOutput.text.trim()) {
    return { ok: false, reason: 'empty_expected_text' };
  }

  return { ok: true, text: expectedOutput.text };
}

function orderedMessages(messages: MessageDto[]) {
  return [...messages].sort((left, right) => {
    if (left.seq !== right.seq) {
      return left.seq - right.seq;
    }

    return left.id.localeCompare(right.id);
  });
}

function buildTextBlock(message: MessageDto, diagnostics: Set<EvalResultComparisonDiagnosticV1>) {
  let sawTextPart = false;
  let sawEmptyTextPart = false;
  const textValues: string[] = [];

  for (const part of [...message.parts].sort((left, right) => left.partIndex - right.partIndex)) {
    if (part.type !== 'text') {
      diagnostics.add('non_text_actual_parts_omitted');
      continue;
    }

    sawTextPart = true;
    const textValue = part.textValue ?? '';
    if (!textValue.trim()) {
      sawEmptyTextPart = true;
      diagnostics.add('empty_actual_text_parts_omitted');
      continue;
    }

    textValues.push(textValue);
  }

  return {
    block: textValues.length > 0
      ? {
          messageId: message.id,
          seq: message.seq,
          text: textValues.join('\n')
        }
      : null,
    sawTextPart,
    sawEmptyTextPart
  };
}

export function extractEvalActualTextV1(result: EvalExampleResultDto): EvalActualTextProjectionV1 {
  if (!result.actualOutput) {
    return {
      ok: false,
      reason: result.actualOutputJson ? 'unsupported_actual_output_shape' : 'missing_actual_output',
      text: null,
      blocks: [],
      diagnostics: []
    };
  }

  if (result.actualOutput.error) {
    return {
      ok: false,
      reason: 'actual_output_error',
      text: null,
      blocks: [],
      diagnostics: []
    };
  }

  if (result.actualOutput.assistantMessages.length === 0) {
    return {
      ok: false,
      reason: 'missing_actual_assistant_messages',
      text: null,
      blocks: [],
      diagnostics: []
    };
  }

  const diagnostics = new Set<EvalResultComparisonDiagnosticV1>();
  if (result.actualOutput.assistantMessages.length > 1) {
    diagnostics.add('multiple_actual_assistant_messages');
  }

  let sawTextPart = false;
  let sawEmptyTextPart = false;
  const blocks: EvalActualTextBlockV1[] = [];

  for (const message of orderedMessages(result.actualOutput.assistantMessages)) {
    const blockResult = buildTextBlock(message, diagnostics);
    sawTextPart ||= blockResult.sawTextPart;
    sawEmptyTextPart ||= blockResult.sawEmptyTextPart;
    if (blockResult.block) {
      blocks.push(blockResult.block);
    }
  }

  if (blocks.length === 0) {
    return {
      ok: false,
      reason: sawTextPart || sawEmptyTextPart ? 'empty_actual_text' : 'missing_actual_text',
      text: null,
      blocks,
      diagnostics: [...diagnostics]
    };
  }

  const text = blocks.map((block) => block.text).join('\n\n');
  return {
    ok: true,
    text,
    blocks,
    diagnostics: [...diagnostics]
  };
}

export function projectEvalExampleResultComparisonV1(result: EvalExampleResultDto): EvalResultComparisonProjectionV1 {
  const expected = extractEvalExpectedTextV1(result);
  const actual = extractEvalActualTextV1(result);
  const expectedText = expected.ok ? expected.text : null;
  const actualText = actual.ok ? actual.text : actual.text;
  const actualTextBlocks = actual.blocks;
  const diagnostics = actual.diagnostics;

  if (result.status !== 'completed') {
    const failedReason = !actual.ok && actual.reason === 'actual_output_error' ? 'actual_output_error' : 'result_failed';
    return {
      schemaVersion: 1,
      kind: 'eval_result_comparison',
      strategy: 'normalized_text_v1',
      outcome: 'not_comparable',
      reason: result.status === 'failed' ? failedReason : 'result_not_completed',
      diagnostics,
      expectedText,
      actualText,
      actualTextBlocks
    };
  }

  if (!expected.ok) {
    return {
      schemaVersion: 1,
      kind: 'eval_result_comparison',
      strategy: 'normalized_text_v1',
      outcome: 'not_comparable',
      reason: expected.reason,
      diagnostics,
      expectedText,
      actualText,
      actualTextBlocks
    };
  }

  if (!actual.ok) {
    return {
      schemaVersion: 1,
      kind: 'eval_result_comparison',
      strategy: 'normalized_text_v1',
      outcome: 'not_comparable',
      reason: actual.reason,
      diagnostics,
      expectedText,
      actualText,
      actualTextBlocks
    };
  }

  const matches = normalizeComparisonTextV1(expected.text) === normalizeComparisonTextV1(actual.text);
  return {
    schemaVersion: 1,
    kind: 'eval_result_comparison',
    strategy: 'normalized_text_v1',
    outcome: matches ? 'match' : 'mismatch',
    reason: matches ? 'normalized_text_equal' : 'normalized_text_different',
    diagnostics,
    expectedText: expected.text,
    actualText: actual.text,
    actualTextBlocks
  };
}
