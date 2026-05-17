import type { DatasetExampleDto, EvalExampleResultDto, EvalRunDto } from '@agent-infra/contracts';

export function formatCountMap(value: Record<string, number> | null | undefined) {
  if (!value) {
    return 'none';
  }

  const entries = Object.entries(value).filter(([, count]) => count > 0);
  return entries.length > 0 ? entries.map(([key, count]) => `${key}: ${count}`).join(', ') : 'none';
}

export function readEvalRunTotal(evalRun: EvalRunDto | null | undefined) {
  return evalRun?.summary?.selection.selectedCount ?? 0;
}

export function readEvalRunCompleted(evalRun: EvalRunDto | null | undefined) {
  return evalRun?.summary?.results.statusCounts.completed ?? 0;
}

export function readEvalRunFailed(evalRun: EvalRunDto | null | undefined) {
  return evalRun?.summary?.results.statusCounts.failed ?? 0;
}

export function readEvalResultDuration(result: EvalExampleResultDto | null | undefined) {
  if (!result?.startedAt || !result.finishedAt) {
    return 'n/a';
  }

  const started = Date.parse(result.startedAt);
  const finished = Date.parse(result.finishedAt);
  if (!Number.isFinite(started) || !Number.isFinite(finished) || finished < started) {
    return 'n/a';
  }

  return `${finished - started}ms`;
}

export function readEvalResultUsage(result: EvalExampleResultDto | null | undefined) {
  const usage = result?.usageJson;
  if (!usage) {
    return 'n/a';
  }

  const tokens = usage.tokens;
  if (tokens && typeof tokens === 'object' && 'total' in tokens && typeof tokens.total === 'number') {
    return `${tokens.total} tokens`;
  }

  if ('totalTokens' in usage && typeof usage.totalTokens === 'number') {
    return `${usage.totalTokens} tokens`;
  }

  return 'usage captured';
}

export function buildDatasetExampleHref(input: { datasetId?: string | null; exampleId?: string | null }) {
  if (!input.datasetId || !input.exampleId) {
    return null;
  }

  const params = new URLSearchParams({ datasetId: input.datasetId, exampleId: input.exampleId });
  return `/observability/datasets?${params.toString()}`;
}

export function buildOutputRunHref(result: EvalExampleResultDto | null | undefined) {
  if (!result?.evalThreadId || !result.outputRunId) {
    return null;
  }

  const params = new URLSearchParams({ threadId: result.evalThreadId, runId: result.outputRunId });
  return `/observability?${params.toString()}`;
}

export function readBaselineOutput(example: DatasetExampleDto | null | undefined) {
  return example?.baselineOutputJson ?? null;
}
