# Eval Run Model

This document is the source of truth for Dataset Regression Runner v1.

Dataset Regression Runner v1 turns curated `DatasetExample` records into durable
current-runtime regression batches. It executes eligible examples through the
current runtime behavior, captures actual output and usage, and lets humans
review each result.

It is not deterministic replay. It does not freeze tool outputs, reconstruct the
original prompt exactly, compare experiments, score with an LLM judge, gate CI,
or provide analytics/reporting dashboards.

## Product Boundary

The durable product surface belongs in the package layer:

- `packages/core` defines `EvalRun`, `EvalExampleResult`, and repository
  contracts.
- `packages/db` persists eval runs and results for supported database backends.
- `packages/app` owns selection, execution orchestration, result review, access
  checks, summary updates, and thread-listing isolation semantics.
- `packages/contracts`, `packages/durable-chat-server`, and
  `packages/durable-chat-client` expose the serialized adoption surface.

`apps/playground-next-web` is a validation consumer. It may expose routes and an
`/observability/evals` surface, but it must not own eval state transitions,
selection semantics, or result review truth.

## Relationship To Datasets

Dataset Regression Runner v1 consumes `Dataset` and `DatasetExample` records
defined in [`dataset-example-model.md`](./dataset-example-model.md).

Effective eligibility remains a computed dataset read model. It reads
`expectedOutputJson`, normalized dataset review metadata, and
`metadataJson.evaluation.defaultEligible`. It is not stored as a second truth.

An eval run selects only examples whose effective eligibility is `eligible =
true`.

Ineligible examples do not create `EvalExampleResult` rows in v1. Eval run
summary data records eligible, ineligible, and ineligible reason counts so users
can understand why examples were not selected.

Invalid legacy expected output makes an example ineligible during create-time
selection. If result-row creation somehow reaches an example whose expected
output cannot be snapshotted, the create transaction must fail before committing
partial rows.

## EvalRun

`EvalRun` is one durable dataset regression batch.

Stable fields:

- `id`
- `appId`
- `datasetId`
- `status`
- `name`
- `configJson`
- `summaryJson`
- `error`
- `createdByActorId`
- `startedAt`
- `finishedAt`
- `createdAt`
- `updatedAt`

`status` is:

- `queued`: the batch definition and queued result rows exist, but execution has
  not started.
- `running`: execution is in progress.
- `completed`: batch orchestration finished, even if some per-example results
  failed.
- `failed`: batch-level orchestration failed before or during execution.

`cancelled` is not part of v1 because v1 does not define a cancel route or a
runtime abort producer. Cancellation can be added later only with a concrete
producer and terminal-state semantics.

`EvalRun.status = 'failed'` is reserved for batch-level failure. A runtime error
for one example writes a failed `EvalExampleResult` and does not by itself make
the whole eval run failed.

## EvalRun Config

`configJson` is a versioned app-layer envelope:

```ts
interface EvalRunConfigV1 {
  schemaVersion: 1;
  kind: 'eval_run_config';
  selection: {
    policy: 'effective_eligible_v1';
  };
  execution: {
    mode: 'current_runtime';
    strategy: 'isolated_eval_thread';
    concurrency: 'serial';
  };
  runtime?: {
    provider?: string | null;
    model?: string | null;
    options?: Record<string, unknown> | null;
  } | null;
}
```

App code must use typed parser and builder helpers for this envelope. Contracts
may expose a DTO, but app logic must not write arbitrary untyped config JSON.

Provider, model, and runtime options are current-runtime choices. They do not
make the eval run deterministic and do not imply frozen tool output replay.

## EvalRun Summary

`summaryJson` is a versioned derived summary:

```ts
interface EvalRunSummaryV1 {
  schemaVersion: 1;
  kind: 'eval_run_summary';
  selection: {
    eligibleCount: number;
    ineligibleCount: number;
    ineligibleReasonCounts: Record<string, number>;
    selectedCount: number;
  };
  results: {
    statusCounts: Record<EvalExampleResultStatus, number>;
    reviewStatusCounts: Record<EvalExampleResultReviewStatus, number>;
    aggregateUsage?: RunUsageSummaryV1 | null;
    durationMs?: number | null;
  };
}
```

Summary rows do not replace result rows. They exist to make list and detail
responses efficient and explainable.

If summaries are persisted, writes that change result status or result review
must update `summaryJson` transactionally. If a package chooses read-time
recompute instead, that choice must be explicit and consistently applied.

## EvalExampleResult

`EvalExampleResult` is one selected dataset example execution within an eval
run.

Stable fields:

- `id`
- `evalRunId`
- `datasetExampleId`
- `exampleOrdinal`
- `status`
- `evalThreadId`
- `outputRunId`
- `expectedOutputJson`
- `actualOutputJson`
- `inputJson`
- `usageJson`
- `metadataJson`
- `error`
- `startedAt`
- `finishedAt`
- `createdAt`
- `updatedAt`

`status` is:

- `queued`: selected and durable, but not attempted.
- `running`: currently being materialized or executed.
- `completed`: current-runtime execution produced at least one assistant
  message and persisted the actual-output snapshot.
- `failed`: materialization or runtime execution failed for this example, or the
  runtime completed without assistant output.
- `skipped`: selected and durable, but never attempted because the batch was
  already running and then hit a batch-level orchestration abort before reaching
  this row.

`skipped` is never used for ineligible examples, invalid trigger input, runtime
failure, or outputless completed runtime runs.

The database must enforce uniqueness for:

- `(evalRunId, datasetExampleId)`
- `(evalRunId, exampleOrdinal)`

Repository checks may add clearer errors, but they do not replace DB unique
constraints.

## Result Creation Timing

`app.evals.create` defines the durable batch. In one transaction it creates:

- the `EvalRun`
- one queued `EvalExampleResult` row per selected eligible dataset example
- create-time expected-output snapshots
- deterministic `exampleOrdinal` values
- selection metadata and useful dataset-example timestamps
- initial `summaryJson`

`app.evals.run` executes existing queued result rows. It must not create
replacement rows, select additional examples, or re-snapshot expected output.

This split makes it possible to create an eval run, edit dataset examples later,
and still explain the eval run using the create-time expected-output snapshots.

No eligible examples is a successful empty eval run: `status = 'completed'`,
zero eligible examples in summary, and no result rows.

## Expected Output Snapshot

`expectedOutputJson` on `EvalExampleResult` is copied from the dataset example
when `app.evals.create` creates result rows.

It is immutable for that result. Later edits to the dataset example's expected
output do not change existing eval results.

The v1 expected-output shape is `DatasetExpectedOutputV1`, currently a single
assistant-text target. Multi-message targets, tool-call assertions, structured
JSON assertions, rubrics, and LLM judge schemas are deferred.

## Actual Output Snapshot

`actualOutputJson` is a versioned eval-output envelope, not a reused dataset
baseline output envelope:

```ts
interface EvalActualOutputSnapshotV1 {
  schemaVersion: 1;
  kind: 'eval_run_output';
  outputRunId: string;
  evalThreadId: string;
  status: Run['status'];
  error?: string | null;
  assistantMessages: DatasetMessageSnapshotV1[];
}
```

`assistantMessages` may be empty. If the current runtime completes but produces
no assistant messages, the actual-output snapshot is still preserved, while the
`EvalExampleResult.status` becomes `failed` with an outputless-run error.

If the runtime produces multiple assistant messages, v1 preserves all of them
in deterministic message order. Automatic comparison remains out of scope; human
review decides whether the output is acceptable.

## Input Materialization

`DatasetInputSnapshotV1` is captured canonical chat context. It is not the exact
runtime prompt and not a deterministic replay input.

V1 execution uses isolated eval threads:

1. Read `inputJson.triggerMessageId`.
2. Require it to match exactly one message in `inputJson.messages`.
3. Require `DatasetExample.triggerMessageId`, when present, to match
   `inputJson.triggerMessageId`.
4. Sort captured messages by `seq`.
5. Materialize only messages with `seq < trigger.seq` into the isolated eval
   thread.
6. Create the trigger as a fresh eval user message.
7. Use new eval message ids.
8. Do not reuse source run ids for materialized messages. Prefer
   `runId = null`, and preserve source run/message/part ids only in metadata.

V1 supports text triggers only. The trigger must be a user message containing
exactly one text part whose trimmed text is non-empty.

These trigger cases fail the selected result:

- missing `inputJson.triggerMessageId`
- trigger id not found in captured messages
- mismatch between `DatasetExample.triggerMessageId` and
  `inputJson.triggerMessageId`
- trigger role is not `user`
- no text part
- empty trimmed text
- multiple text parts
- mixed text and non-text parts
- pure non-text input

Unsupported trigger failures produce `EvalExampleResult.status = 'failed'`.
They do not exclude the example from selected results and do not produce
`skipped`. They create no eval thread, no output run, no actual-output snapshot,
and no usage snapshot.

If execution passes `RunTextRuntimeInput.historyMessages`, it must pass
eval-thread materialized messages, not source snapshot messages. Implementations
must define whether the runtime reads durable eval-thread state, explicit
`historyMessages`, or both before execution code is written.

Eval execution must never mutate the original source thread, source run, source
messages, or source message parts.

## Eval Threads

Eval threads are execution artifacts, not user conversation threads.

Each eval thread must include metadata linking:

- `evalRunId`
- `evalExampleResultId`
- `datasetId`
- `datasetExampleId`

Normal thread-listing and chat-catalog use cases must hide eval-only threads by
default at the app/use-case boundary. This is package behavior, not just UI
filtering. Explicit eval lineage reads by `evalThreadId` remain allowed for eval
detail and debugging surfaces.

## Execution Semantics

V1 execution is synchronous serial unless implementation evidence proves that a
background or parallel runner is required.

Runtime execution uses current runtime behavior and may differ from the captured
baseline output. Tool outputs are not replayed or frozen.

Per-result runtime failures are isolated. One failed result should not abort the
remaining selected results.

`EvalRun.status = 'completed'` can contain failed result rows. Use
`EvalRun.status = 'failed'` only for batch-level orchestration failure, such as
invalid configuration, unavailable runtime services before execution can start,
or a batch abort that prevents the runner from continuing safely.

The same eval run must not execute concurrently and must not be rerun after a
terminal status.

## Result Review

Result review is human-curated result judgment.

```ts
interface EvalExampleResultReviewV1 {
  status: 'unreviewed' | 'pass' | 'fail' | 'needs_review' | 'not_applicable';
  reviewerNote?: string | null;
  reviewedByActorId?: string | null;
  reviewedAt?: string | null;
}
```

`not_applicable` is used when a result is not meaningfully judgeable by a human,
for example invalid trigger input, runtime failure, outputless completion, or
incompatible expected/actual shape.

Review writes are strict app-layer operations:

- callers may update only whitelisted review fields
- request bodies must not include unknown review keys
- callers must not provide `reviewedByActorId` or `reviewedAt`
- the app boundary assigns reviewer actor and time
- review updates preserve execution metadata
- review updates must refresh persisted summary review counts or use the
  explicit read-time recompute path

Automatic comparators, LLM judge outputs, assignments, and workflow states such
as `blocked` are not part of v1 review truth.

## Review Ergonomics And Comparator Assist

`Eval Review Ergonomics And Comparator Assist v1` improves how humans inspect
and review eval results. It does not change eval execution semantics, result
truth, or persisted review semantics.

Human review remains the only result judgment truth. Assistive comparison data
must not auto-write `pass`, `fail`, `needs_review`, or `not_applicable`, and UI
copy must avoid labels such as `auto pass`, `auto fail`, or `grade`.

The first comparator is a read-time projection over an `EvalExampleResult` or
its DTO. It is not persisted in v1 and is not part of `EvalExampleResultDto` in
the first implementation round. A browser-safe shared helper in
`packages/durable-chat-client` owns the projection so validation UIs can consume
shared semantics without making playground code the source of truth.

The initial strategy is `normalized_text_v1`:

- extract expected text only from `DatasetExpectedOutputV1` with
  `kind = 'assistant_text'`
- extract actual text from `EvalActualOutputSnapshotV1.assistantMessages`
- trim text
- normalize line endings
- collapse whitespace

`contains_text` is deferred because expected output v1 is a target assistant
answer, not an assertion fragment.

The projection shape is:

```ts
interface EvalResultComparisonProjectionV1 {
  schemaVersion: 1;
  kind: 'eval_result_comparison';
  strategy: 'normalized_text_v1';
  outcome: 'match' | 'mismatch' | 'not_comparable';
  reason: EvalResultComparisonReasonV1;
  diagnostics: EvalResultComparisonDiagnosticV1[];
  expectedText?: string | null;
  actualText?: string | null;
  actualTextBlocks: Array<{
    messageId: string;
    seq?: number | null;
    text: string;
  }>;
}
```

`not_comparable` is intentionally separate from the manual review status
`not_applicable`.

Reason codes are:

- `normalized_text_equal`
- `normalized_text_different`
- `result_not_completed`
- `result_failed`
- `missing_expected_output`
- `unsupported_expected_output_shape`
- `missing_expected_text`
- `empty_expected_text`
- `missing_actual_output`
- `unsupported_actual_output_shape`
- `actual_output_error`
- `missing_actual_assistant_messages`
- `missing_actual_text`
- `empty_actual_text`

Diagnostics are:

- `multiple_actual_assistant_messages`
- `non_text_actual_parts_omitted`
- `empty_actual_text_parts_omitted`

Multiple assistant messages remain comparable by joined text. The UI should also
show separate actual text blocks so reviewers can inspect how the runtime
produced the joined body.

Result filters and review queue controls are local review-surface state in v1:
result status, review status, comparison outcome, error-only, missing actual,
unreviewed, mismatch, and failed or not-comparable shortcuts. They do not change
the eval result list route, do not add server-side filtering or pagination, and
do not add URL query params beyond the selected `datasetId`, `evalRunId`, and
`resultId`.

After a manual review update, the validation UI should refresh the selected eval
run summary by refetching the eval run. The review route response shape stays
unchanged in the first implementation round.

Persisted comparison should be considered only after concrete pressure appears,
such as:

- DB-level filtering, sorting, or pagination by comparison outcome
- historical audit of a specific comparator strategy result
- multiple comparator strategies or versions
- expensive or server-only comparator execution
- returned run-level comparison summaries

## Eval Run Compare

`Eval Run Compare v1` compares two eval runs from the same dataset. It is a
read-time projection, not a durable model. It does not add database tables,
migrations, persisted snapshots, or a compare HTTP route in v1.

The projection lives in `packages/durable-chat-client` so validation UIs can
consume shared browser-safe semantics without making `apps/playground-next-web`
the source of truth. `/observability/evals` may expose compare mode as a
management workflow, but it owns only labels, layout, local filters, sorting
defaults, and URL query state.

Compare v1 reuses existing DTOs:

- `EvalRunDto`
- `EvalExampleResultDto`
- `EvalResultComparisonProjectionV1` for per-result expected/actual text assist

Two eval runs are projection-compatible only when `baselineRun.datasetId ===
candidateRun.datasetId`. A dataset mismatch returns a projection-level
`not_comparable` error with no rows. V1 must not compare runs across datasets.

Rows are aligned by unique `datasetExampleId`, not result id or ordinal. Result
arrays that contain duplicate `datasetExampleId` values are classified as
row-level `not_comparable`. Result arrays that contain an `evalRunId` different
from the supplied baseline or candidate run are also defensive
`not_comparable` rows.

The projection shape is:

```ts
interface EvalRunCompareProjectionV1 {
  schemaVersion: 1;
  kind: 'eval_run_compare';
  comparable: boolean;
  datasetId: string | null;
  baselineRunId: string;
  candidateRunId: string;
  summary: EvalRunCompareSummaryV1;
  rows: EvalRunCompareRowV1[];
  error?: {
    outcome: 'not_comparable';
    reason: 'different_dataset';
  } | null;
}
```

Row outcomes are:

- `same_pass`
- `same_fail`
- `regression`
- `improvement`
- `same_unresolved`
- `changed_unresolved`
- `baseline_missing`
- `candidate_missing`
- `not_comparable`

Manual human review is the only formal judgment truth:

- baseline `pass` and candidate `fail` is `regression`
- baseline `fail` and candidate `pass` is `improvement`
- both `pass` is `same_pass`
- both `fail` is `same_fail`

Manual `pass` and `fail` outrank execution status and expected/actual text
assistive comparison. A failed result that a human reviewed as `fail` can
participate in formal `same_fail` or `regression` classification.

Manual `needs_review`, manual `not_applicable`, unreviewed results, failed
unreviewed results, and not-completed unreviewed results are unresolved for
compare purposes. They must not become formal pass/fail, improvement, or
regression outcomes. Existing text comparison may distinguish unchanged
unresolved rows from changed unresolved rows, but it must not auto-write review
truth.

Missing rows are handled before result-level signal classification:

- candidate present and baseline absent is `baseline_missing`
- baseline present and candidate absent is `candidate_missing`

The summary is derived from rows. `summary.outcomeCounts` must equal row outcome
counts. Usage and duration deltas are null-safe: when either side has no finite
aggregate value, the delta and percentage delta are `null`.

V1 compare mode is intentionally not an experiment system. It does not define:

- LLM-as-judge scoring
- scorer configuration
- experiment registry
- release gates or CI gating
- persisted compare snapshots
- multi-baseline or multi-candidate matrices
- parallel eval execution, cancellation, retry, or resume

Persisted compare snapshots, server-side compare routes, or compare-specific
query APIs should be considered only after concrete pressure appears, such as:

- DB-level filtering, sorting, pagination, or historical reporting by compare
  outcome
- audit requirements for a specific compare projection version
- expensive or server-only comparison work
- multiple compare strategies or versions
- CI/release workflows that need immutable comparison evidence
- cross-run matrices or experiment-level aggregation

## Public V1 Surface

The public app/contract surface is intentionally narrow:

- create eval run for a dataset
- list eval runs by dataset
- get eval run detail
- list eval results
- run an already-created eval run
- update result review

The preferred route split for validation hosts is:

```text
POST /api/datasets/:datasetId/eval-runs
POST /api/eval-runs/:evalRunId/run
```

Read, list, detail, and review routes must not require a configured runtime
port. Only the execution route needs configured runtime services.

Review routes must validate that the result belongs to the eval run in the URL.
A result from another eval run must not be patchable through the wrong eval-run
route.

The playground eval UI should live outside `/chat`, preferably under
`/observability/evals`, and must not depend on the current `/observability`
`threadId` or `runId` selection.

## Deferred

Deferred until real pressure proves the need:

- deterministic replay
- frozen tool output replay
- narrower runtime eval primitive that avoids isolated eval threads
- LLM-as-judge scoring
- automatic comparison or grading
- experiment comparison
- prompt hub or prompt version management
- CI gates
- reports, pass-rate dashboards, and alerting
- OpenTelemetry, LangSmith, or exporter sinks
- usage ledger or cost analytics dashboard
- dataset search, bulk operations, assignments, and multi-reviewer workflow
- shared user, org, tenant, billing, or account models
