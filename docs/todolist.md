# Compare Triage Persistence v1 Todo

## 0. Context and Boundary

### 0.1 Confirmed facts

- [x] `Eval Run Compare v1` already exists as a read-time projection over two eval runs from the same dataset.
- [x] Compare rows are aligned by `datasetExampleId`, not by result id, ordinal, or UI list position.
- [x] Compare pairs are ordered: `(A baseline, B candidate)` and `(B baseline, A candidate)` are different compare contexts.
- [x] `EvalExampleResult.review` is a single-result human judgment against expected output.
- [x] Compare triage is a run-pair workflow judgment and must not overwrite or reuse `EvalExampleResult.review`.
- [x] `/observability/evals` is a validation/management consumer, not the durable product boundary.
- [x] Shared durable semantics should live in source-of-truth docs and `packages/*`, not in playground-only UI code.
- [x] This phase does not need a separate `analysis-task`; WebGPT's review plus current source-of-truth docs are sufficient to write a loop-ready todo.

### 0.2 Goals

- [x] Add an independent durable compare triage model keyed by `(baselineEvalRunId, candidateEvalRunId, datasetExampleId)`.
- [x] Let reviewers persist a compare-row triage status and optional note.
- [x] Let reviewers clear a triage row back to computed `untriaged` by deleting the durable triage row.
- [x] Preserve compare triage after refresh, query it by run pair, and overlay it onto compare UI rows.
- [x] Keep compare triage separate from eval result review and eval run review summary counts.
- [x] Store a minimal observed compare fingerprint so stale triage can be detected when underlying compare signals change.
- [x] Keep implementation slices small enough for targeted verification, `codex review`, and commit after each functional loop.

### 0.3 Non-goals

- [x] Do not persist full compare projection snapshots in this phase.
- [x] Do not build an experiment registry, release gate, CI blocker, or run matrix.
- [x] Do not add LLM-as-judge, scorer configuration, rubric schema, or automatic grading.
- [x] Do not add eval runner background jobs, retry, cancel, resume, or parallel execution unless later evidence makes runner lifecycle the bottleneck.
- [x] Do not move evaluation workflows into `/chat`.
- [x] Do not introduce shared user/org/tenant/billing models.
- [x] Do not treat trace/timeline records as deterministic replay logs.

## 1. Definitions First

### 1.1 Source Of Truth

- [x] Update `docs/source-of-truth/eval-run-model.md` with a `Compare Triage v1` section.
- [x] Define compare triage as a durable run-pair workflow state, not a result review.
- [x] Define the stable triage key as `(baselineEvalRunId, candidateEvalRunId, datasetExampleId)`.
- [x] Define baseline/candidate as an ordered pair and forbid pair canonicalization.
- [x] Define same-run compare triage as invalid: `baselineEvalRunId !== candidateEvalRunId`.
- [x] Define absence of a triage row as `untriaged`.
- [x] Define clearing triage as deleting the row, not writing an `untriaged` status.
- [x] Define v1 triage statuses:
  - `accepted`
  - `regression`
  - `expected_changed`
  - `needs_review`
  - `ignored`
- [x] Document status semantics:
  - `accepted`: candidate behavior is acceptable for this compare row.
  - `regression`: candidate behavior is unacceptable compared with baseline and needs action.
  - `expected_changed`: expected output may be stale and should be handled through dataset expected-output workflow.
  - `needs_review`: reviewer cannot decide from current context.
  - `ignored`: row is intentionally excluded from current compare conclusion.
- [x] Document that compare triage writes must not change `EvalExampleResult.metadataJson.review`.
- [x] Document that compare triage writes must not update eval run result review summary counts.
- [x] Document minimal observed fingerprint fields and stale detection semantics.
- [x] Document that v1 run compare strategy is implicit in `eval_run_compare` schema version 1 unless implementation adds a non-key observed strategy field.
- [x] Document that full persisted compare snapshots remain deferred until audit/reporting/CI pressure exists.

### 1.2 Projection Helper Ownership

- [x] Inspect current package dependency graph before moving compare projection code.
- [x] Decide where shared server-safe compare projection semantics should live, choosing one explicit option:
  - move pure compare projection helpers to a package usable by app/server and durable-chat-client
  - keep durable-chat-client helper and add a server-safe package helper with identical tests
  - defer server stale computation and document UI-local stale comparison as temporary
- [x] Avoid making app/server logic depend on UI-local or Next-only compare semantics.
- [x] Prefer extracting pure compare projection helpers into a package usable by both server/app code and durable-chat-client, if dependency boundaries allow it.
- [x] Keep `packages/durable-chat-client` as a consumer or re-exporter of shared compare semantics, not the only source of server-needed compare truth.
- [x] Record the chosen projection ownership option in source-of-truth docs.

### 1.3 Data Model

- [x] Add a durable `EvalRunCompareTriage` domain shape.
- [x] Include stable identity and scope fields:
  - `id`
  - `appId`
  - `datasetId`
  - `baselineEvalRunId`
  - `candidateEvalRunId`
  - `datasetExampleId`
- [x] Include review fields:
  - `triageStatus`
  - `reviewerNote`
  - `triagedByActorId`
  - `triagedAt`
- [x] Include observed fingerprint fields:
  - `observedProjectionKind`
  - `observedProjectionSchemaVersion`
  - `observedCompareStrategy` if implementation needs an explicit non-key strategy field
  - `observedOutcome`
  - `observedReason`
  - `observedBaselineResultId`
  - `observedCandidateResultId`
  - `observedBaselineResultStatus`
  - `observedCandidateResultStatus`
  - `observedBaselineReviewStatus`
  - `observedCandidateReviewStatus`
  - `observedBaselineSignal`
  - `observedCandidateSignal`
  - `observedBaselineComparisonOutcome`
  - `observedCandidateComparisonOutcome`
  - `observedBaselineComparisonReason`
  - `observedCandidateComparisonReason`
  - `observedResultComparisonStrategy`
- [x] Include timestamps:
  - `createdAt`
  - `updatedAt`
- [x] Keep `untriaged` as a computed absence state, not a persisted status.
- [x] Normalize empty or whitespace-only reviewer notes to `null` at the app/server boundary.

### 1.4 Interfaces

- [x] Add a compare triage repository contract in the package layer.
- [x] Repository must support lookup by pair/example.
- [x] Repository must support listing all triage rows for a baseline/candidate pair.
- [x] Repository must support create-or-update by pair/example.
- [x] Repository must support deleting by pair/example to clear back to computed `untriaged`.
- [x] App layer must expose an update use case that owns actor/time assignment.
- [x] App layer must expose a delete use case that clears triage without touching result review.
- [x] App layer must reject caller-supplied `triagedByActorId` and `triagedAt`.
- [x] App layer must compute or validate the observed fingerprint from server-side compare semantics, not trust UI-provided observed fields as durable truth.

## 2. Backend / Platform

### 2.1 DB

- [x] Add compare triage table to SQLite schema.
- [x] Add compare triage table to Postgres schema.
- [x] Add unique constraint on `(baseline_eval_run_id, candidate_eval_run_id, dataset_example_id)`.
- [x] Add pair lookup index.
- [x] Add app/dataset lookup index if app-level listing or debugging needs it.
- [x] Add status index only if cheap and consistent with local schema style; do not expose server-side status filters in v1.
- [x] Add repository implementation for SQLite.
- [x] Add repository implementation for Postgres.
- [x] Add repository delete implementation for SQLite/Postgres.
- [x] Ensure bootstrap/migration behavior is idempotent.
- [x] Keep the table narrow: do not persist full compare row payloads or full text snapshots.

### 2.2 App Layer

- [x] Add compare triage use case, either in `eval-run.ts` or a focused `eval-run-compare-triage.ts`.
- [x] Validate baseline and candidate eval runs both exist.
- [x] Reject `baselineEvalRunId === candidateEvalRunId`.
- [x] Validate baseline and candidate eval runs belong to the same `appId`.
- [x] Validate baseline and candidate eval runs belong to the same `datasetId`.
- [x] Validate `datasetExampleId` belongs to that dataset.
- [x] Allow triage for missing-row compare outcomes such as `baseline_missing` and `candidate_missing`.
- [x] Assign `triagedByActorId` and `triagedAt` at the app boundary.
- [x] Trim and normalize reviewer notes at the app/server boundary.
- [x] Clear triage by deleting the triage row and returning the row to computed `untriaged`.
- [x] Preserve eval result review metadata and eval run review summary counts.
- [x] Return a DTO/read model that includes whether the stored triage is stale against the current projection.

### 2.3 Contracts And Client Schema

- [x] Add `EvalRunCompareTriageStatusV1`.
- [x] Add `EvalRunCompareTriageDto`.
- [x] Add list response DTO for pair triage rows.
- [x] Add update request DTO with only `status` and optional `reviewerNote`.
- [x] Add strict request parser that rejects unknown keys.
- [x] Add normalizers that tolerate nullable note, actor, timestamps, observed result ids, and stale flag.
- [x] Use explicit DTO/UI field names such as `triageStatus`, `triagedByActorId`, and `triagedAt` to avoid confusing compare triage with result review or compare outcome.
- [x] Add durable-chat-client repo methods for listing, updating, and deleting compare triage.
- [x] Ensure client-side compare overlay does not mutate `EvalRunCompareProjectionV1.outcome`.

### 2.4 Next Validation Routes

- [x] Add `GET /api/eval-runs/:baselineEvalRunId/compare/:candidateEvalRunId/triage`.
- [x] Add `PATCH /api/eval-runs/:baselineEvalRunId/compare/:candidateEvalRunId/triage/:datasetExampleId`.
- [x] Add `DELETE /api/eval-runs/:baselineEvalRunId/compare/:candidateEvalRunId/triage/:datasetExampleId`.
- [x] Keep the public route path direction obvious while using Next-compatible segment names: `[evalRunId]` is interpreted as baseline and `[candidateEvalRunId]` remains explicit, because Next forbids sibling dynamic segments with different names at the same path depth.
- [x] Use app services, not runtime services, for compare triage routes.
- [x] Validate auth/session before loading services.
- [x] Reject spoofed actor/time fields.
- [x] Reject same-run pair requests.
- [x] Return clear 400/404 errors for cross-dataset or missing dataset-example cases.
- [x] Keep route handlers thin and delegate durable semantics to package/app code.

## 3. Frontend Boundary

### 3.1 Runtime / Data Loading

- [x] Load triage rows when compare mode has baseline and candidate eval run ids.
- [x] Scope triage cache/state by pair key to avoid leaking rows across pair switches.
- [x] Refresh triage after save without refetching unrelated eval run data unless needed.
- [x] Clear triage by calling the delete endpoint and removing the row from local triage state.
- [x] Treat missing triage row as `untriaged` in UI read models.

### 3.2 Compare Queue

- [x] Overlay triage status onto compare rows.
- [x] Add triage counts:
  - `untriaged`
  - `accepted`
  - `regression`
  - `expected_changed`
  - `needs_review`
  - `ignored`
- [x] Add triage filters.
- [x] Default queue ordering should prioritize unresolved or risky rows before accepted/ignored rows.
- [x] Do not hide raw compare outcome; triage is a reviewer workflow layer on top of compare outcome.

### 3.3 Compare Detail

- [x] Add triage editor to selected compare row detail.
- [x] Provide status select and reviewer note input.
- [x] Use a clear primary save action for triage.
- [x] Provide a clear action to remove triage and return the row to computed `untriaged`.
- [x] Show stale warning when persisted observed fingerprint no longer matches the current compare row.
- [x] Make it visually clear that `expected_changed` is a follow-up label, not an automatic expected-output edit.
- [x] Do not call result review APIs from compare triage controls.

### 3.4 UI Boundary

- [x] Keep compare triage inside `/observability/evals`.
- [x] Do not require `/observability` thread/run selection.
- [x] Do not add `/chat` entry points for triage in this phase.
- [x] Keep labels/local ordering/filter presentation app-owned, but keep durable status semantics package-owned.

## 4. Tests

### 4.1 Source / Helper Tests

- [x] Existing eval-run-comparison tests continue to pass after any projection helper ownership move.
- [x] Shared/server-safe compare helper tests cover the same row outcomes as durable-chat-client compare tests.
- [x] Source-of-truth docs describe ordered pair, same-run guard, clear semantics, and stale fingerprint fields.

### 4.2 DB Tests

- [x] SQLite test for table bootstrap and idempotence.
- [x] SQLite test for unique `(baselineEvalRunId, candidateEvalRunId, datasetExampleId)`.
- [x] SQLite test for create-or-update behavior.
- [x] SQLite test for delete-by-pair/example behavior.
- [x] SQLite test for deterministic `listByPair` ordering; app/UI must not rely on it for compare queue order.
- [x] Verify SQLite and Postgres schema fields stay aligned.

### 4.3 App Tests

- [x] Update succeeds for same-app, same-dataset eval run pair.
- [x] Update rejects same-run eval run pair.
- [x] Update rejects cross-dataset eval run pair.
- [x] Update rejects dataset example outside the pair dataset.
- [x] Update stores app-assigned actor/time.
- [x] Delete removes the triage row and makes the row computed `untriaged`.
- [x] Update does not modify `EvalExampleResult.review`.
- [x] Delete does not modify `EvalExampleResult.review`.
- [x] Update does not modify eval run review summary counts.
- [x] Delete does not modify eval run review summary counts.
- [x] Stale detection returns false for unchanged observed fingerprint.
- [x] Stale detection returns true when outcome, reason, result ids, result statuses, review statuses, signals, or result-comparison fields diverge.

### 4.4 Client / Service Tests

- [x] Normalizers accept valid triage DTOs with nullable optional fields.
- [x] Normalizers reject invalid status values.
- [x] Request parser accepts valid status/note update.
- [x] Request parser rejects unknown keys.
- [x] Request parser rejects caller-supplied actor/time.
- [x] Triage overlay preserves original compare projection outcome.
- [x] Pair-key state separation prevents stale triage rows from appearing after switching baseline/candidate.

### 4.5 Route Tests

- [x] Unauthenticated GET/PATCH short-circuit before service loading.
- [x] GET route uses app services and not runtime services.
- [x] PATCH route trims reviewer notes.
- [x] PATCH route rejects spoofed actor/time.
- [x] PATCH route rejects same-run pair.
- [x] PATCH route rejects cross-dataset pair.
- [x] PATCH success returns triage DTO.
- [x] PATCH does not call result review use case.
- [x] DELETE route removes triage and does not call result review use case.

### 4.6 Component Tests

- [x] Compare mode fetches triage rows.
- [x] Queue displays triage badge/counts.
- [x] Save `regression` calls compare triage update client method.
- [x] Clear triage calls compare triage delete client method and restores computed `untriaged`.
- [x] Save triage does not call result review update client method.
- [x] Triage filter works for `untriaged`, `regression`, and `expected_changed`.
- [x] Mutation errors show a toast or equivalent notification, not an inline permanent error block.
- [x] Stale triage warning is visible.

### 4.7 Browser Smoke

- [x] Open `/observability/evals` compare mode with a dataset and two eval runs.
- [x] Mark one compare row as `regression`.
- [x] Refresh the page and confirm triage persists.
- [x] Filter to `untriaged` and confirm the triaged row is excluded.
- [x] Clear the triage row and confirm it returns to `untriaged`.
- [x] Return to result review mode and confirm result review status is unchanged.
- [x] Follow source example link and confirm it stays within observability/datasets management surface.

## 5. Recommended Execution Order

### Loop 1: Source Of Truth And Projection Ownership

- [x] Update `docs/source-of-truth/eval-run-model.md` with Compare Triage v1 semantics.
- [x] Inspect package dependencies around compare projection helpers.
- [x] Decide one explicit projection ownership option: shared helper move, server-safe helper with identical tests, or documented temporary UI-local stale comparison.
- [x] Implement the smallest safe projection helper ownership change needed by server/app code.
- [x] Record the selected ownership option in source-of-truth docs.
- [x] Keep durable semantics out of `apps/playground-next-web`.
- [x] Run targeted typecheck/tests for packages touched by helper movement.
- [x] Run `codex review` for this loop after targeted verification passes.
- [x] Commit Loop 1.

### Loop 2: Durable Triage Persistence

- [x] Add compare triage domain types and repository contract.
- [x] Add SQLite/Postgres schema and repository implementations.
- [x] Add DB tests for uniqueness, upsert, delete, deterministic list, and schema alignment.
- [x] Run targeted DB/package tests.
- [x] Run `codex review` for this loop after targeted verification passes.
- [x] Commit Loop 2.

### Loop 3: App Use Case And API/Client Surface

- [x] Add app-layer compare triage update/list use cases.
- [x] Add app-layer compare triage delete use case.
- [x] Add validation for app, dataset, dataset example, and run-pair boundaries.
- [x] Add strict request/response DTOs and normalizers.
- [x] Add request parser tests for update/delete/list DTOs.
- [x] Add durable-chat-client methods for compare triage list/update/delete.
- [x] Add Next validation routes for GET/PATCH/DELETE.
- [x] Add app, client, and route tests.
- [x] Run targeted app/client/route tests.
- [x] Run `codex review` for this loop after targeted verification passes.
- [x] Commit Loop 3.

### Loop 4: Observability Compare UI Overlay

- [x] Load triage rows in compare mode.
- [x] Overlay triage badges, counts, filters, and stale warning.
- [x] Add triage editor with status/note/save/clear.
- [x] Ensure compare triage save does not call result review update.
- [x] Add component tests.
- [x] Run targeted component tests.
- [x] Run browser smoke for compare triage persistence.
- [x] Run `codex review` for this loop after targeted verification passes.
- [x] Commit Loop 4.

### Loop 5: Closeout

- [x] Re-read `docs/source-of-truth/eval-run-model.md` and remove any duplicate truth from this todo.
- [x] Run final targeted test set covering changed packages/routes/components.
- [x] Run final browser smoke if UI changed in Loop 4.
- [x] Run `codex review` for closeout only if final cleanup changes code.
- [x] Keep `docs/todolist.md` as the completed execution record for this loop after stable facts are promoted and all tasks are complete.
- [x] Commit closeout.

## 6. Open Questions To Re-check During Implementation

- [x] Is there a clean dependency-safe home for compare projection semantics outside `durable-chat-client`, or should server-side read model be introduced instead?
- [x] Should stale detection be computed only on read, or also stored as a DTO-only derived flag after update?
- [x] Should run compare strategy remain implicit in schema version 1, or should a non-key `observedCompareStrategy` field be added now?
- [x] Should the API return only persisted triage rows in v1, or does projection ownership force a merged compare read model?
