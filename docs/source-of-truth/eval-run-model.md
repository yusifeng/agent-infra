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
