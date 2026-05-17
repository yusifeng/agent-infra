# Dataset Regression Runner v1 Todo

## 0. Context and Boundary

### 0.1 Confirmed facts
- [x] `Run Trace And Usage Contract v1` is complete.
- [x] `Run-to-Dataset Capture v1` is complete.
- [x] `Dataset Review And Expected Output Foundation v1` is complete.
- [x] `Dataset` and `DatasetExample` shared domain records already exist.
- [x] Dataset examples already capture `inputJson`, `baselineOutputJson`, `contextSnapshotJson`, `toolInvocationsSnapshotJson`, `metadataJson`, and nullable `expectedOutputJson`.
- [x] `DatasetExpectedOutputV1` currently supports one assistant-text target.
- [x] `metadataJson.review` already stores post-capture curation metadata.
- [x] Effective eligibility already computes future-eval readiness from expected output, review metadata, and capture-time default eligibility.
- [x] Dataset access controls captured example review; source run/thread access controls only lineage navigation.
- [x] `inputJson` is a captured canonical chat context, not an exact runtime prompt and not a deterministic replay input.
- [x] Trace and timeline projections are inspection read models, not deterministic replay logs.
- [x] Playground is a validation consumer, not the product boundary.

### 0.2 Goals
- [x] Add `EvalRun` as a durable dataset regression batch model.
- [x] Add `EvalExampleResult` as a durable per-example regression execution result model.
- [x] Run only dataset examples whose effective eligibility is `eligible = true`.
- [x] Execute eligible examples against the current runtime using captured canonical context.
- [x] Do not mutate or append to the original source thread during eval execution.
- [x] Persist actual output, expected output snapshot, runtime status, runtime run refs, usage, duration, and errors for each result.
- [x] Let each example fail independently without losing the whole eval run.
- [ ] Add manual result review with `pass`, `fail`, `needs_review`, and `not_applicable`.
- [ ] Add shared contracts/server/client helpers for eval runs and eval results.
- [ ] Add authenticated playground routes for creating, running, listing, reading, and reviewing eval runs.
- [ ] Add an independent eval validation surface, preferably `/observability/evals`, linked from dataset review.
- [ ] Keep v1 useful as a regression foundation without implementing LangSmith-scale evaluation products.

### 0.3 Non-goals
- [x] Do not implement deterministic replay in this track.
- [x] Do not claim captured `inputJson` exactly reproduces the original runtime prompt.
- [x] Do not replay frozen tool outputs in this track.
- [x] Do not implement LLM-as-judge scoring in this track.
- [x] Do not implement prompt hub or prompt version management in this track.
- [x] Do not implement experiment comparison in this track.
- [x] Do not implement CI gates in this track.
- [x] Do not implement eval reports, pass-rate dashboards, or alerting in this track.
- [x] Do not implement OpenTelemetry, LangSmith, or exporter sinks in this track.
- [x] Do not implement cost analytics dashboard or usage ledger in this track.
- [x] Do not implement dataset search, bulk operations, assignment queues, or multi-reviewer workflow in this track.
- [x] Do not add shared user, org, tenant, billing, or account models in this track.
- [x] Do not put eval execution controls in `/chat`.
- [x] Do not make eval execution depend on the current `/observability` thread/run selection.

## 1. Definitions First

### 1.1 Source of Truth
- [x] Add `docs/source-of-truth/eval-run-model.md`.
- [x] Define `EvalRun` as one dataset regression batch.
- [x] Define `EvalExampleResult` as one dataset example execution within an eval run.
- [x] Define v1 as current-runtime regression execution using captured canonical context, not deterministic replay.
- [x] Define that eval execution must not mutate the original source thread.
- [x] Define v1 as using isolated eval threads; defer a narrower runtime eval primitive until isolated-thread limitations are proven.
- [x] Define expected-output snapshot semantics on `EvalExampleResult`.
- [x] Define actual-output snapshot semantics on `EvalExampleResult`.
- [x] Define `EvalActualOutputSnapshotV1` as a versioned `eval_run_output` envelope, not as a reused baseline `run_output` envelope.
- [x] Define result review semantics and actor/time attribution.
- [x] Define eval run summary semantics as a derived summary, not a replacement for result rows.
- [x] Define the summary update invariant: persisted summaries must refresh transactionally when result status or result review changes, or be explicitly recomputed on read.
- [x] Define that source run/thread access is not required to run or inspect eval results once dataset access is valid.
- [x] Define that ineligible examples do not create result rows in v1; selection counts and reason histograms belong in eval run summary.
- [x] Define that `app.evals.create` creates the durable batch definition and queued result rows, while `app.evals.run` only executes existing queued rows.
- [x] Define that LLM judge, experiment comparison, prompt versions, CI gates, and reports are deferred.
- [x] Update `docs/source-of-truth/dataset-example-model.md` only where it needs to point to the new eval-run source of truth.
- [x] Update `docs/roadmap.md` to mark Dataset Review as completed and select Dataset Regression Runner v1 as the next infra track.

### 1.2 EvalRun Data Model
- [x] Define `EvalRun.id`.
- [x] Define `EvalRun.appId`.
- [x] Define `EvalRun.datasetId`.
- [x] Define `EvalRun.status = 'queued' | 'running' | 'completed' | 'failed'`.
- [x] Define optional `EvalRun.name`.
- [x] Define `EvalRun.configJson` as a versioned envelope for provider/model/runtime options, selection policy, and execution mode.
- [x] Define `EvalRun.summaryJson` as a versioned envelope for selected/eligible/ineligible counts, eligibility reason counts, result status counts, review status counts, aggregate usage, and duration.
- [x] Define optional `EvalRun.error`.
- [x] Define optional `EvalRun.createdByActorId`.
- [x] Define optional `EvalRun.startedAt`.
- [x] Define optional `EvalRun.finishedAt`.
- [x] Define `EvalRun.createdAt` and `EvalRun.updatedAt`.
- [x] Define `EvalRun.status = 'completed'` as batch orchestration completed, even when some per-example results failed.
- [x] Define `EvalRun.status = 'failed'` as batch-level failure before or during orchestration, not as per-example runtime failure.
- [x] Remove `EvalRun.status = 'cancelled'` from v1 because no cancel route or runtime abort producer exists.
- [x] Define no-eligible-example behavior as a successful empty eval run: `status = 'completed'`, zero eligible examples in summary, and no result rows.

### 1.3 EvalExampleResult Data Model
- [x] Define `EvalExampleResult.id`.
- [x] Define `EvalExampleResult.evalRunId`.
- [x] Define `EvalExampleResult.datasetExampleId`.
- [x] Define `EvalExampleResult.exampleOrdinal` for deterministic result ordering within an eval run.
- [x] Define `EvalExampleResult.status = 'queued' | 'running' | 'completed' | 'failed' | 'skipped'`.
- [x] Keep `EvalExampleResult.status = 'skipped'` only for selected rows that are created but never attempted because of batch-level orchestration abort after the batch has started.
- [x] Define `skipped` as never used for ineligible examples, invalid triggers, runtime failures, or outputless completed runtime runs.
- [x] Define optional `EvalExampleResult.evalThreadId` for isolated eval threads.
- [x] Define optional `EvalExampleResult.outputRunId` for the runtime run created during eval execution.
- [x] Define `EvalExampleResult.expectedOutputJson` as a snapshot copied from the dataset example when `app.evals.create` creates queued result rows.
- [x] Define `EvalExampleResult.actualOutputJson` as `EvalActualOutputSnapshotV1`.
- [x] Define `EvalExampleResult.inputJson` snapshot only if result-level replay/debug value justifies duplicating dataset input.
- [x] Define `EvalExampleResult.usageJson` as the eval output run usage snapshot only, not a usage ledger or cost analytics surface.
- [x] Define `EvalExampleResult.metadataJson` with stable namespaces: `selection`, `execution`, `review`, and `host`.
- [x] Define `metadataJson.selection` snapshots enough create-time context to explain selection later, including dataset example timestamps where useful.
- [x] Define DB-enforced unique result expectation for `(evalRunId, datasetExampleId)`.
- [x] Define DB-enforced unique ordering expectation for `(evalRunId, exampleOrdinal)`.
- [x] Define optional `EvalExampleResult.error`.
- [x] Define optional `EvalExampleResult.startedAt`.
- [x] Define optional `EvalExampleResult.finishedAt`.
- [x] Define `EvalExampleResult.createdAt` and `EvalExampleResult.updatedAt`.
- [x] Define ineligible examples as excluded from result-row creation in v1.

### 1.4 Actual Output Model
- [x] Define `EvalActualOutputSnapshotV1.schemaVersion = 1`.
- [x] Define `EvalActualOutputSnapshotV1.kind = 'eval_run_output'`.
- [x] Define `EvalActualOutputSnapshotV1.outputRunId`.
- [x] Define `EvalActualOutputSnapshotV1.evalThreadId`.
- [x] Define `EvalActualOutputSnapshotV1.status` from the eval runtime output run status.
- [x] Define optional `EvalActualOutputSnapshotV1.error`.
- [x] Define `EvalActualOutputSnapshotV1.assistantMessages` using dataset message snapshot shape where possible.
- [x] Define `EvalActualOutputSnapshotV1.assistantMessages` as allowed to be an empty array.
- [x] Define completed runtime runs with no assistant messages as preserving the actual-output snapshot but producing `EvalExampleResult.status = 'failed'` with an outputless-run error.
- [x] Define behavior for multiple assistant messages.

### 1.5 Input Materialization Semantics
- [x] Define how captured `DatasetInputSnapshotV1.messages` map into eval execution context.
- [x] Define how the trigger message is selected from `inputJson`: `inputJson.triggerMessageId` must exist and match exactly one captured message.
- [x] Define a mismatch between `DatasetExample.triggerMessageId` and `inputJson.triggerMessageId` as a failed result.
- [x] Materialize only pre-trigger history into the isolated eval thread.
- [x] Sort captured messages by `seq` and materialize only messages whose `seq` is lower than the trigger message `seq`.
- [x] Create the trigger as a new eval user message instead of duplicating it in materialized history.
- [x] Use new eval message ids; do not reuse source message ids.
- [x] Do not reuse source run ids for materialized eval messages; prefer `runId = null` and preserve source run/message/part ids only in metadata.
- [x] Preserve source snapshot references in metadata for materialized eval messages where useful.
- [x] Define v1 as supporting text triggers only.
- [x] Define unsupported trigger behavior as a per-result `failed` row after selection, never as selection exclusion and never as `skipped`.
- [x] Define behavior when trigger message is missing as `failed` with no eval thread, no output run, no actual output, and no usage.
- [x] Define behavior when trigger message is not a user message as `failed`.
- [x] Define behavior when trigger message has no executable text as `failed`.
- [x] Define trigger extraction as exactly one text part whose trimmed text is non-empty.
- [x] Define multi-text-part, text-plus-non-text, and pure non-text trigger inputs as `failed`; do not silently concatenate.
- [x] Define whether runtime execution relies on durable eval-thread state, explicit `RunTextRuntimeInput.historyMessages`, or both; if `historyMessages` is used, pass eval-thread materialized messages, not source snapshot messages.
- [x] Prove source thread message count remains unchanged after eval execution.

### 1.6 Execution Semantics
- [x] Define how provider/model/runtime config is chosen for an eval run.
- [x] Define that eval execution uses current runtime behavior and may differ from baseline output.
- [x] Define that eval execution creates isolated eval threads with metadata linking `evalRunId`, `evalExampleResultId`, `datasetId`, and `datasetExampleId`.
- [x] Define eval threads as execution artifacts, not user conversation threads.
- [x] Define normal thread listings and chat thread catalogs as hiding eval-only threads by default at the app/use-case boundary; explicit eval lineage reads by eval thread id remain allowed.
- [x] Define that original source thread, source run, and source messages are never modified.
- [x] Define invalid legacy expected output as ineligible during create-time selection; if snapshot construction somehow fails after selection, fail the create transaction before committing partial rows unless source-of-truth chooses a different recovery path.
- [x] Define behavior when no examples are eligible.
- [x] Define behavior when runtime execution fails for one result.
- [x] Define behavior when the whole eval run cannot start.
- [x] Define double-run behavior so the same eval run cannot be executed concurrently or twice after terminal status.
- [x] Define whether v1 execution is synchronous/serial or background/queued; prefer synchronous serial in v1 unless implementation proves it is unsafe.

### 1.7 Result Review Semantics
- [x] Define `EvalExampleResultReview.status = 'unreviewed' | 'pass' | 'fail' | 'needs_review' | 'not_applicable'`.
- [x] Define optional `reviewerNote`.
- [x] Define optional `reviewedByActorId`.
- [x] Define optional `reviewedAt`.
- [x] Define review writes as strict whitelists.
- [x] Reject caller-supplied `reviewedByActorId` and `reviewedAt`.
- [x] Assign review actor/time from the app boundary.
- [x] Preserve execution metadata when review metadata changes.
- [x] Keep automatic comparator or LLM judge data out of the review truth in v1.
- [x] Do not add workflow states such as `blocked` in v1.

### 1.8 Types / Interfaces
- [x] Add core `EvalRun` type.
- [x] Add core `EvalExampleResult` type.
- [x] Add core `EvalRunRepository` interface.
- [x] Add core `EvalExampleResultRepository` interface.
- [x] Add app-layer eval run input/result types.
- [x] Add app-layer eval result review types.
- [x] Add app-layer `EvalRunConfigV1` envelope, parser, and builder helpers.
- [x] Add app-layer `EvalRunSummaryV1` envelope, parser, and builder helpers.
- [x] Add parse/normalize helpers for eval result review metadata.
- [x] Add helper for selecting eligible examples from dataset examples.
- [x] Add helper for summarizing eval run results.
- [x] Add helper for calculating selection summary and eligibility reason histogram.
- [x] Add helper for building actual-output snapshot from a runtime output run.
- [x] Add helper for building expected-output snapshot from a dataset example.
- [x] Add helper for input materialization from dataset input snapshots.
- [ ] Keep DTOs wire-compatible and versioned where JSON envelopes are introduced.

## 2. Backend / Platform

### 2.1 Shared Core
- [x] Add `EvalRun` and `EvalExampleResult` to `packages/core/src/types.ts`.
- [x] Add repository interfaces to `packages/core/src/repositories.ts`.
- [x] Export new types and repository interfaces from package entry points.
- [x] Avoid adding judge/report/prompt concepts to core in v1.

### 2.2 Database
- [x] Add SQLite schema for `eval_runs`.
- [x] Add SQLite schema for `eval_example_results`.
- [x] Add Postgres schema for `eval_runs`.
- [x] Add Postgres schema for `eval_example_results`.
- [x] Add indexes for `eval_runs.appId`, `eval_runs.datasetId`, and `eval_runs.status`.
- [x] Add indexes for `eval_example_results.evalRunId`, `datasetExampleId`, `status`, and `exampleOrdinal` if needed for ordering.
- [x] Add DB unique constraint for `(evalRunId, datasetExampleId)`.
- [x] Add DB unique constraint for `(evalRunId, exampleOrdinal)`.
- [x] Add foreign-key relationships where existing DB patterns support them.
- [x] Add Drizzle migrations.
- [x] Add SQLite repository implementation.
- [x] Add Postgres/Drizzle repository implementation.
- [x] Wire repositories into DB bootstrap/client helpers.
- [x] Ensure JSON fields round-trip across SQLite and Postgres.
- [x] Ensure list ordering is deterministic.
- [x] Ensure eval-only thread metadata JSON round-trips if stored in thread metadata.

### 2.3 App Use Cases
- [x] Add `app.evals.create`.
- [x] Add `app.evals.listByDataset`.
- [x] Add `app.evals.get`.
- [x] Add `app.evals.listResults`.
- [x] Add `app.evals.run`.
- [x] Add `app.evals.updateResultReview`.
- [x] Ensure eval use cases enforce dataset app boundary.
- [x] Ensure private datasets remain accessible only to the creating actor.
- [x] Ensure app-visible datasets remain accessible within the app boundary.
- [x] Ensure eval execution uses effective eligibility and excludes ineligible examples.
- [x] Ensure no result rows are created for ineligible examples in v1.
- [x] Ensure `app.evals.create` transactionally creates the `EvalRun` and all selected eligible examples' queued `EvalExampleResult` rows.
- [x] Ensure `app.evals.create` snapshots expected output, example ordinal, selection metadata, and relevant dataset example timestamps.
- [x] Ensure `app.evals.run` executes only existing queued result rows and does not create replacement rows.
- [x] Ensure eval run summary records eligible, ineligible, and eligibility reason counts.
- [x] Ensure no source run/thread access is required for eval execution.
- [x] Ensure eval execution does not mutate the original source thread.
- [x] Ensure eval execution materializes only pre-trigger history and creates a fresh trigger message.
- [x] Ensure expected output is not re-snapshotted during `app.evals.run`.
- [x] Ensure expected output snapshots remain immutable when the source dataset example is edited later.
- [x] Ensure result errors are persisted per example.
- [x] Ensure invalid triggers update selected result rows to `failed` with no eval thread, no output run, no actual output, and no usage.
- [x] Ensure outputless completed runtime runs persist an actual-output snapshot but mark the result `failed`.
- [x] Ensure eval run status and summary update after execution.
- [x] Ensure eval run summary refreshes transactionally after result review updates, or explicitly recomputes on read.
- [x] Ensure `completed` eval runs can contain failed example results.
- [x] Ensure batch-level failures use `EvalRun.status = 'failed'`.
- [x] Ensure the same eval run cannot be executed concurrently or rerun after a terminal state.
- [x] Ensure normal thread listing use cases hide eval-only threads by default while explicit eval lineage reads still work.
- [x] Ensure runtime ports are called only by execution use cases, not by create/list/read/review use cases.

### 2.4 Execution Implementation
- [x] Implement isolated eval thread creation as the v1 execution strategy.
- [x] Persist eval thread metadata linking it to eval run/result.
- [x] Materialize captured pre-trigger canonical context into the isolated eval thread without treating it as exact historical prompt replay.
- [x] Create a fresh trigger user message in the eval thread.
- [x] Pass canonical eval history through `RunTextRuntimeInput.historyMessages` when appropriate, using eval-thread materialized messages rather than source snapshot messages.
- [x] Run current runtime for the trigger input.
- [x] Capture runtime output run id.
- [x] Capture actual assistant output snapshot.
- [x] Capture usage snapshot from the eval output run.
- [x] Capture duration from result start/finish or run timestamps.
- [x] Capture actual output edge cases including no assistant message, multiple assistant messages, failed runtime output, and usage without message.
- [x] Handle runtime failure without aborting remaining eligible examples.
- [x] Keep v1 serial execution unless source-of-truth explicitly chooses parallel execution.

### 2.5 Contracts / Server / Client
- [ ] Add `EvalRunDto`.
- [ ] Add `EvalExampleResultDto`.
- [ ] Add `EvalRunStatusDto`.
- [ ] Add `EvalExampleResultStatusDto`.
- [ ] Add `EvalExampleResultReviewDto`.
- [ ] Add `EvalActualOutputSnapshotV1Dto`.
- [ ] Add versioned eval run config and summary DTOs if they cross the wire.
- [ ] Add `CreateEvalRunRequestDto`.
- [ ] Add `UpdateEvalExampleResultReviewRequestDto`.
- [ ] Add eval run list/detail/result response DTOs.
- [ ] Add durable-chat-server parsers for create eval run and result review requests.
- [ ] Add durable-chat-server response builders.
- [ ] Add durable-chat-client normalizers.
- [ ] Add durable-chat-client API helpers.
- [ ] Keep contracts independent of playground-only UI state.

## 3. Playground Validation Boundary

### 3.1 Routes / Services
- [ ] Add authenticated `POST /api/datasets/[datasetId]/eval-runs` route for creating eval runs.
- [ ] Add authenticated `GET /api/datasets/[datasetId]/eval-runs` route for listing eval runs by dataset.
- [ ] Add authenticated `POST /api/eval-runs/[evalRunId]/run` route for executing already-created queued results.
- [ ] Add authenticated `GET /api/eval-runs/[evalRunId]` route for eval detail.
- [ ] Add authenticated `GET /api/eval-runs/[evalRunId]/results` route for result list/detail data.
- [ ] Add authenticated `PATCH /api/eval-runs/[evalRunId]/results/[resultId]/review` route.
- [ ] Ensure routes use shared app use cases and shared server parsers.
- [ ] Ensure eval execution routes use playground services with a configured runtime port.
- [ ] Ensure read/list/detail/review routes do not require a configured runtime port.
- [ ] Preserve playground auth and actor identity boundaries.
- [ ] Ensure routes do not duplicate eval state transitions in Next route handlers.
- [ ] Add explicit route behavior for unavailable runtime configuration.

### 3.2 Eval UI
- [ ] Add an eval-centric validation surface, preferably `/observability/evals`.
- [ ] Link to eval runs from `/observability/datasets` dataset detail.
- [ ] Add create/run eval action for the selected dataset.
- [ ] Show eval run list with dataset, status, created actor, created date, started/finished, and summary counts.
- [ ] Show eval result list with example id, status, review state, expected-output presence, actual-output presence, error state, usage, and duration.
- [ ] Show eval result detail with expected output snapshot.
- [ ] Show eval result detail with actual output snapshot.
- [ ] Show baseline output snapshot for context without treating it as expected output.
- [ ] Show source dataset example link.
- [ ] Show output run lineage link when available.
- [ ] Add manual result review controls: pass/fail/needs_review/not_applicable and reviewer note.
- [ ] Avoid LLM judge controls in v1.
- [ ] Avoid report/dashboard UI in v1.
- [ ] Keep `/chat` unchanged.
- [ ] Keep `/observability` selected-run panel focused on run inspection and capture.

### 3.3 UI Implementation Boundaries
- [ ] Create a dedicated feature layer for eval UI instead of burying logic in route pages.
- [ ] Keep pages as thin composition roots.
- [ ] Reuse shared client helpers for API calls.
- [ ] Keep page-local logic limited to selection, display state, and form drafts.
- [ ] Do not compute durable eval semantics in UI code.
- [ ] Avoid batch operations beyond a single create/run action in v1.

## 4. Tests

### 4.1 Source / Type Tests
- [ ] Add tests for eval run status validation if helpers are introduced.
- [ ] Add tests for eval result status validation if helpers are introduced.
- [x] Add tests for result review metadata defaults.
- [x] Add tests rejecting invalid result review statuses.
- [x] Add tests rejecting unknown result review request keys.
- [x] Add tests rejecting caller-supplied review actor/time.
- [x] Add tests for expected output snapshot construction.
- [x] Add tests proving expected output snapshots are immutable after the dataset example expected output changes.
- [x] Add tests for actual output snapshot construction.
- [x] Add tests for actual output edge cases: no assistant message, multiple assistant messages, runtime failed output, and usage without message.
- [x] Add tests for eval run summary calculation.
- [x] Add tests for selection summary and eligibility reason histogram calculation.
- [x] Add tests for typed eval run config envelope parsing/building.
- [x] Add tests for typed eval run summary envelope parsing/building.

### 4.2 DB Tests
- [x] Add SQLite repository tests for eval run create/find/list/update.
- [x] Add SQLite repository tests for eval result create/find/list/update.
- [x] Add tests for deterministic ordering.
- [x] Add tests for DB-enforced `(evalRunId, datasetExampleId)` uniqueness.
- [x] Add tests for DB-enforced `(evalRunId, exampleOrdinal)` uniqueness.
- [x] Add tests for JSON round-trip of config, summary, expected output, actual output, usage, and metadata.
- [x] Add tests for eval-only thread metadata round-trip if stored through existing thread metadata.
- [x] Add bootstrap tests proving new repositories are wired.
- [x] Add migration generation and schema checks.

### 4.3 App Tests
- [x] Add app tests for creating eval runs with dataset access boundaries.
- [x] Add app tests proving private dataset evals are not readable by another actor.
- [x] Add app tests proving app-visible dataset evals are readable by same-app actors.
- [x] Add app tests for selecting only eligible dataset examples.
- [x] Add app tests proving `app.evals.create` creates queued result rows and create-time expected output snapshots.
- [x] Add app tests for no eligible examples.
- [x] Add app tests proving source run access is not required for eval execution.
- [x] Add app tests proving source thread is not mutated.
- [x] Add app tests proving eval creates isolated execution state.
- [x] Add app tests proving eval thread metadata links `evalRunId`, `evalExampleResultId`, `datasetId`, and `datasetExampleId`.
- [x] Add app tests proving only pre-trigger history is materialized.
- [x] Add app tests proving trigger message is not duplicated in history and is created as a fresh eval user message.
- [x] Add app tests proving source message ids are not reused for eval messages.
- [x] Add app tests for invalid trigger behavior: missing trigger, trigger not user, trigger without executable text, and unsupported non-text or multi-part trigger.
- [x] Add app tests proving invalid triggers create failed selected result rows, not skipped rows and not selection exclusions.
- [x] Add app tests proving expected output is snapshotted.
- [x] Add app tests proving editing dataset example expected output after eval creation but before eval run does not change result expected snapshot.
- [x] Add app tests proving actual output is persisted.
- [x] Add app tests for actual output edge cases: outputless completed run fails the result while preserving snapshot, runtime throws after writing failed run, usage with no message, and multiple assistant messages.
- [x] Add app tests proving usage and duration are persisted.
- [x] Add app tests proving one failed example does not abort remaining examples.
- [x] Add app tests for eval run status transitions.
- [x] Add app tests proving `completed` eval runs can include failed result rows.
- [x] Add app tests proving batch-level failures use `EvalRun.status = 'failed'`.
- [x] Add app tests proving the same eval run cannot run concurrently or rerun after terminal status.
- [x] Add app tests for eval run summary updates.
- [x] Add app tests for summary correctness: eligible/ineligible counts, eligibility reason counts, result status counts, review status counts, aggregate usage, and duration.
- [x] Add app tests proving no eligible examples creates a completed empty eval run with no result rows.
- [x] Add app tests for result review updates and actor/time assignment.
- [x] Add app tests proving result review updates refresh summary review counts.
- [x] Add app tests proving normal thread listing excludes eval-only threads by default.
- [x] Add app tests proving runtime receives or reads eval-thread messages rather than source-thread messages.
- [x] Add app tests proving non-execution use cases do not call runtime ports.

### 4.4 Contracts / Server / Client Tests
- [ ] Add contract typecheck coverage for new DTOs.
- [ ] Add durable-chat-server parser tests for create eval run requests.
- [ ] Add durable-chat-server parser tests for result review requests.
- [ ] Add durable-chat-server response helper tests for eval run/result normalization.
- [ ] Add durable-chat-client normalizer tests.
- [ ] Add durable-chat-client API helper tests if the package test style supports them.

### 4.5 Playground Route Tests
- [ ] Add route tests for eval create auth.
- [ ] Add route tests for eval create dataset access.
- [ ] Add route tests for eval run execution route auth/access.
- [ ] Add route tests proving eval execution uses configured runtime services rather than unavailable app services.
- [ ] Add route tests for unavailable runtime configuration behavior.
- [ ] Add route tests for eval run detail auth/access.
- [ ] Add route tests for result list auth/access.
- [ ] Add route tests for result review patch validation.
- [ ] Add route tests proving review patches cannot reference a result from another eval run.
- [ ] Add route tests proving review patch cannot spoof actor/time.
- [ ] Add route tests proving source run inaccessibility does not block eval result reads.
- [ ] Add route tests proving read/list/detail/review routes do not require configured runtime services.

### 4.6 Playground UI Tests
- [ ] Add UI tests for opening eval run list.
- [ ] Add UI tests for starting an eval from a dataset.
- [ ] Add UI tests for opening eval result detail.
- [ ] Add UI tests for expected vs actual display.
- [ ] Add UI tests for marking result pass/fail/needs_review/not_applicable.
- [ ] Add UI tests proving eval UI does not require `threadId` or `runId`.
- [ ] Add UI tests proving `/chat` is not part of this workflow.

### 4.7 Targeted Verification
- [x] Run `pnpm --filter @agent-infra/core typecheck` after core type changes.
- [x] Run `pnpm --filter @agent-infra/db test` after DB slice.
- [x] Run `pnpm --filter @agent-infra/app test` after app slice.
- [ ] Run `pnpm --filter @agent-infra/contracts typecheck` after contract slice.
- [ ] Run `pnpm --filter @agent-infra/durable-chat-server test` after server helper slice.
- [ ] Run `pnpm --filter @agent-infra/durable-chat-client test` after client helper slice.
- [ ] Run `pnpm --filter playground-next-web test` after route/UI slices.
- [ ] Run `pnpm --filter playground-next-web typecheck` after route/UI slices.
- [ ] Run broader workspace typecheck only if targeted checks leave cross-package uncertainty.
- [ ] Run browser smoke test after UI implementation.

## 5. Recommended Execution Order

### Loop 0: Lock Eval Semantics
- [x] Add `docs/source-of-truth/eval-run-model.md`.
- [x] Update `docs/source-of-truth/dataset-example-model.md` with a pointer to the eval-run source of truth.
- [x] Update `docs/roadmap.md` selected/completed track state.
- [x] Lock v1 to isolated eval threads and explicitly defer a narrower runtime eval primitive.
- [x] Lock input materialization rules for pre-trigger history, trigger extraction, fresh eval messages, and unsupported trigger behavior.
- [x] Lock unsupported trigger behavior as selected-result `failed`, not selection exclusion or `skipped`.
- [x] Lock `EvalActualOutputSnapshotV1` envelope.
- [x] Lock `EvalRun.status` semantics, including completed-with-failed-results behavior.
- [x] Lock whether `cancelled` and `skipped` have real v1 producers; remove them before DB implementation if they do not.
- [x] Lock no-eligible-example behavior and ineligible-result-row policy.
- [x] Lock create/run split so create builds queued result rows and expected snapshots, while run only executes existing queued rows.
- [x] Lock DB unique constraints for result identity and result ordinal.
- [x] Lock normal thread listing behavior so eval-only threads are hidden by default in package/app use cases.
- [x] Lock persisted summary refresh behavior after execution and review updates.
- [x] Lock eval result review statuses, including whether `not_applicable` remains in v1.
- [x] Update this todo if source-of-truth decisions change before implementation starts.
- [x] Run no tests unless executable code changes.
- [x] Run `codex review` for this loop after targeted verification passes.
- [x] Commit Loop 0.

### Loop 1: Core, DB Schema, and Repositories
- [x] Add core eval run/result types.
- [x] Add core repository interfaces.
- [x] Add DB schemas, migrations, indexes, and DB unique constraints.
- [x] Add SQLite and Postgres repository implementations.
- [x] Wire repositories through DB bootstrap/client helpers.
- [x] Add DB repository tests and bootstrap tests.
- [x] Run `pnpm --filter @agent-infra/db test`.
- [x] Run `pnpm --filter @agent-infra/core typecheck`.
- [x] Run `codex review` for this loop after targeted verification passes.
- [x] Commit Loop 1.

### Loop 2: App Eval Records and Review Semantics
- [x] Add app-layer eval types and helpers.
- [x] Add app eval create/list/get/listResults use cases.
- [x] Make app eval create create queued result rows and expected snapshots transactionally.
- [x] Add app result review update use case.
- [x] Make result review updates refresh summary review counts or use an explicit read-time recompute path.
- [x] Add helpers for eligible example selection, expected output snapshots, typed eval config/summary envelopes, result review metadata, and summary calculation.
- [x] Add focused app tests for access, eligibility, no-eligible behavior, create-time result rows, expected snapshots, summaries, and result review.
- [x] Run `pnpm --filter @agent-infra/app test`.
- [x] Run package typechecks for affected shared packages if needed.
- [x] Run `codex review` for this loop after targeted verification passes.
- [x] Commit Loop 2.

### Loop 3: App Eval Execution
- [x] Add app eval run execution use case.
- [x] Execute only queued result rows created by `app.evals.create`.
- [x] Implement isolated eval thread creation and metadata.
- [x] Implement input materialization and fresh trigger creation.
- [x] Persist actual output snapshots, usage, duration, and errors.
- [x] Mark invalid trigger results as `failed` without eval thread/output run/actual output/usage.
- [x] Mark outputless completed runtime runs as failed results while preserving the actual-output snapshot.
- [x] Hide eval-only threads from normal thread listing use cases by default.
- [x] Implement runtime failure isolation and eval run terminal summary updates.
- [x] Add focused app tests for execution, isolation, invalid triggers, failure isolation, actual output edge cases, concurrency, and source thread immutability.
- [x] Run `pnpm --filter @agent-infra/app test`.
- [x] Run package typechecks for affected shared packages if needed.
- [x] Run `codex review` for this loop after targeted verification passes.
- [x] Commit Loop 3.

### Loop 4: Contracts, Server Helpers, and Client Helpers
- [ ] Add eval run/result DTOs.
- [ ] Add request/response DTOs.
- [ ] Add durable-chat-server parsers and response builders.
- [ ] Add durable-chat-client normalizers and API helpers.
- [ ] Add focused server/client tests.
- [ ] Run `pnpm --filter @agent-infra/contracts typecheck`.
- [ ] Run `pnpm --filter @agent-infra/durable-chat-server test`.
- [ ] Run `pnpm --filter @agent-infra/durable-chat-client test`.
- [ ] Run `codex review` for this loop after targeted verification passes.
- [ ] Commit Loop 4.

### Loop 5: Playground Eval Routes
- [ ] Add eval create/list/detail/result/review routes.
- [ ] Ensure eval execution route uses configured runtime services.
- [ ] Ensure read/list/detail/review routes work without configured runtime services.
- [ ] Route all eval logic through shared app use cases.
- [ ] Preserve playground auth and actor boundaries.
- [ ] Add route tests for auth, access, validation, runtime wiring, source-unavailable behavior, and review actor/time assignment.
- [ ] Run targeted playground route tests.
- [ ] Run `pnpm --filter playground-next-web typecheck`.
- [ ] Run `codex review` for this loop after targeted verification passes.
- [ ] Commit Loop 5.

### Loop 6: Eval Validation UI
- [ ] Add `/observability/evals` eval validation surface or final agreed route.
- [ ] Add dataset-to-eval entry point from `/observability/datasets`.
- [ ] Add eval run list and detail views.
- [ ] Add result list and result detail views.
- [ ] Add expected vs actual display.
- [ ] Add manual result review controls.
- [ ] Add focused UI tests.
- [ ] Run targeted playground UI tests.
- [ ] Run `pnpm --filter playground-next-web typecheck`.
- [ ] Run browser smoke test.
- [ ] Run `codex review` for this loop after targeted verification passes.
- [ ] Commit Loop 6.

### Loop 7: Closeout
- [ ] Review source-of-truth docs and remove any parallel long-lived definitions from this todo.
- [ ] Ensure this track still does not include deterministic replay, LLM judge, reports, experiment comparison, exporter, prompt hub, or CI gate work.
- [ ] Run final targeted tests for all changed areas.
- [ ] Run broader workspace typecheck if warranted.
- [ ] Run final browser smoke test if UI changed.
- [ ] Run `codex review` for this loop after targeted verification passes.
- [ ] Delete `docs/new-todolist.md` when every item is complete and stable facts have moved to source-of-truth docs.
- [ ] Commit Loop 7.
