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

- [ ] Add an independent durable compare triage model keyed by `(baselineEvalRunId, candidateEvalRunId, datasetExampleId)`.
- [ ] Let reviewers persist a compare-row triage status and optional note.
- [ ] Let reviewers clear a triage row back to computed `untriaged` by deleting the durable triage row.
- [ ] Preserve compare triage after refresh, query it by run pair, and overlay it onto compare UI rows.
- [ ] Keep compare triage separate from eval result review and eval run review summary counts.
- [ ] Store a minimal observed compare fingerprint so stale triage can be detected when underlying compare signals change.
- [ ] Keep implementation slices small enough for targeted verification, `codex review`, and commit after each functional loop.

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

- [ ] Add a durable `EvalRunCompareTriage` domain shape.
- [ ] Include stable identity and scope fields:
  - `id`
  - `appId`
  - `datasetId`
  - `baselineEvalRunId`
  - `candidateEvalRunId`
  - `datasetExampleId`
- [ ] Include review fields:
  - `triageStatus`
  - `reviewerNote`
  - `triagedByActorId`
  - `triagedAt`
- [ ] Include observed fingerprint fields:
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
- [ ] Include timestamps:
  - `createdAt`
  - `updatedAt`
- [ ] Keep `untriaged` as a computed absence state, not a persisted status.
- [ ] Normalize empty or whitespace-only reviewer notes to `null` at the app/server boundary.

### 1.4 Interfaces

- [ ] Add a compare triage repository contract in the package layer.
- [ ] Repository must support lookup by pair/example.
- [ ] Repository must support listing all triage rows for a baseline/candidate pair.
- [ ] Repository must support create-or-update by pair/example.
- [ ] Repository must support deleting by pair/example to clear back to computed `untriaged`.
- [ ] App layer must expose an update use case that owns actor/time assignment.
- [ ] App layer must expose a delete use case that clears triage without touching result review.
- [ ] App layer must reject caller-supplied `triagedByActorId` and `triagedAt`.
- [ ] App layer must compute or validate the observed fingerprint from server-side compare semantics, not trust UI-provided observed fields as durable truth.

## 2. Backend / Platform

### 2.1 DB

- [ ] Add compare triage table to SQLite schema.
- [ ] Add compare triage table to Postgres schema.
- [ ] Add unique constraint on `(baseline_eval_run_id, candidate_eval_run_id, dataset_example_id)`.
- [ ] Add pair lookup index.
- [ ] Add app/dataset lookup index if app-level listing or debugging needs it.
- [ ] Add status index only if cheap and consistent with local schema style; do not expose server-side status filters in v1.
- [ ] Add repository implementation for SQLite.
- [ ] Add repository implementation for Postgres.
- [ ] Add repository delete implementation for SQLite/Postgres.
- [ ] Ensure bootstrap/migration behavior is idempotent.
- [ ] Keep the table narrow: do not persist full compare row payloads or full text snapshots.

### 2.2 App Layer

- [ ] Add compare triage use case, either in `eval-run.ts` or a focused `eval-run-compare-triage.ts`.
- [ ] Validate baseline and candidate eval runs both exist.
- [ ] Reject `baselineEvalRunId === candidateEvalRunId`.
- [ ] Validate baseline and candidate eval runs belong to the same `appId`.
- [ ] Validate baseline and candidate eval runs belong to the same `datasetId`.
- [ ] Validate `datasetExampleId` belongs to that dataset.
- [ ] Allow triage for missing-row compare outcomes such as `baseline_missing` and `candidate_missing`.
- [ ] Assign `triagedByActorId` and `triagedAt` at the app boundary.
- [ ] Trim and normalize reviewer notes at the app/server boundary.
- [ ] Clear triage by deleting the triage row and returning the row to computed `untriaged`.
- [ ] Preserve eval result review metadata and eval run review summary counts.
- [ ] Return a DTO/read model that includes whether the stored triage is stale against the current projection.

### 2.3 Contracts And Client Schema

- [ ] Add `EvalRunCompareTriageStatusV1`.
- [ ] Add `EvalRunCompareTriageDto`.
- [ ] Add list response DTO for pair triage rows.
- [ ] Add update request DTO with only `status` and optional `reviewerNote`.
- [ ] Add strict request parser that rejects unknown keys.
- [ ] Add normalizers that tolerate nullable note, actor, timestamps, observed result ids, and stale flag.
- [ ] Use explicit DTO/UI field names such as `triageStatus`, `triagedByActorId`, and `triagedAt` to avoid confusing compare triage with result review or compare outcome.
- [ ] Add durable-chat-client repo methods for listing, updating, and deleting compare triage.
- [ ] Ensure client-side compare overlay does not mutate `EvalRunCompareProjectionV1.outcome`.

### 2.4 Next Validation Routes

- [ ] Add `GET /api/eval-runs/:baselineEvalRunId/compare/:candidateEvalRunId/triage`.
- [ ] Add `PATCH /api/eval-runs/:baselineEvalRunId/compare/:candidateEvalRunId/triage/:datasetExampleId`.
- [ ] Add `DELETE /api/eval-runs/:baselineEvalRunId/compare/:candidateEvalRunId/triage/:datasetExampleId`.
- [ ] Prefer Next route segment names `[baselineEvalRunId]` and `[candidateEvalRunId]` so baseline/candidate direction is obvious.
- [ ] Use app services, not runtime services, for compare triage routes.
- [ ] Validate auth/session before loading services.
- [ ] Reject spoofed actor/time fields.
- [ ] Reject same-run pair requests.
- [ ] Return clear 400/404 errors for cross-dataset or missing dataset-example cases.
- [ ] Keep route handlers thin and delegate durable semantics to package/app code.

## 3. Frontend Boundary

### 3.1 Runtime / Data Loading

- [ ] Load triage rows when compare mode has baseline and candidate eval run ids.
- [ ] Scope triage cache/state by pair key to avoid leaking rows across pair switches.
- [ ] Refresh triage after save without refetching unrelated eval run data unless needed.
- [ ] Clear triage by calling the delete endpoint and removing the row from local triage state.
- [ ] Treat missing triage row as `untriaged` in UI read models.

### 3.2 Compare Queue

- [ ] Overlay triage status onto compare rows.
- [ ] Add triage counts:
  - `untriaged`
  - `accepted`
  - `regression`
  - `expected_changed`
  - `needs_review`
  - `ignored`
- [ ] Add triage filters.
- [ ] Default queue ordering should prioritize unresolved or risky rows before accepted/ignored rows.
- [ ] Do not hide raw compare outcome; triage is a reviewer workflow layer on top of compare outcome.

### 3.3 Compare Detail

- [ ] Add triage editor to selected compare row detail.
- [ ] Provide status select and reviewer note input.
- [ ] Use a clear primary save action for triage.
- [ ] Provide a clear action to remove triage and return the row to computed `untriaged`.
- [ ] Show stale warning when persisted observed fingerprint no longer matches the current compare row.
- [ ] Make it visually clear that `expected_changed` is a follow-up label, not an automatic expected-output edit.
- [ ] Do not call result review APIs from compare triage controls.

### 3.4 UI Boundary

- [ ] Keep compare triage inside `/observability/evals`.
- [ ] Do not require `/observability` thread/run selection.
- [ ] Do not add `/chat` entry points for triage in this phase.
- [ ] Keep labels/local ordering/filter presentation app-owned, but keep durable status semantics package-owned.

## 4. Tests

### 4.1 Source / Helper Tests

- [x] Existing eval-run-comparison tests continue to pass after any projection helper ownership move.
- [x] Shared/server-safe compare helper tests cover the same row outcomes as durable-chat-client compare tests.
- [x] Source-of-truth docs describe ordered pair, same-run guard, clear semantics, and stale fingerprint fields.

### 4.2 DB Tests

- [ ] SQLite test for table bootstrap and idempotence.
- [ ] SQLite test for unique `(baselineEvalRunId, candidateEvalRunId, datasetExampleId)`.
- [ ] SQLite test for create-or-update behavior.
- [ ] SQLite test for delete-by-pair/example behavior.
- [ ] SQLite test for deterministic `listByPair` ordering; app/UI must not rely on it for compare queue order.
- [ ] Verify SQLite and Postgres schema fields stay aligned.

### 4.3 App Tests

- [ ] Update succeeds for same-app, same-dataset eval run pair.
- [ ] Update rejects same-run eval run pair.
- [ ] Update rejects cross-dataset eval run pair.
- [ ] Update rejects dataset example outside the pair dataset.
- [ ] Update stores app-assigned actor/time.
- [ ] Delete removes the triage row and makes the row computed `untriaged`.
- [ ] Update does not modify `EvalExampleResult.review`.
- [ ] Delete does not modify `EvalExampleResult.review`.
- [ ] Update does not modify eval run review summary counts.
- [ ] Delete does not modify eval run review summary counts.
- [ ] Stale detection returns false for unchanged observed fingerprint.
- [ ] Stale detection returns true when outcome, reason, result ids, result statuses, review statuses, signals, or result-comparison fields diverge.

### 4.4 Client / Service Tests

- [ ] Normalizers accept valid triage DTOs with nullable optional fields.
- [ ] Normalizers reject invalid status values.
- [ ] Request parser accepts valid status/note update.
- [ ] Request parser rejects unknown keys.
- [ ] Request parser rejects caller-supplied actor/time.
- [ ] Triage overlay preserves original compare projection outcome.
- [ ] Pair-key state separation prevents stale triage rows from appearing after switching baseline/candidate.

### 4.5 Route Tests

- [ ] Unauthenticated GET/PATCH short-circuit before service loading.
- [ ] GET route uses app services and not runtime services.
- [ ] PATCH route trims reviewer notes.
- [ ] PATCH route rejects spoofed actor/time.
- [ ] PATCH route rejects same-run pair.
- [ ] PATCH route rejects cross-dataset pair.
- [ ] PATCH success returns triage DTO.
- [ ] PATCH does not call result review use case.
- [ ] DELETE route removes triage and does not call result review use case.

### 4.6 Component Tests

- [ ] Compare mode fetches triage rows.
- [ ] Queue displays triage badge/counts.
- [ ] Save `regression` calls compare triage update client method.
- [ ] Clear triage calls compare triage delete client method and restores computed `untriaged`.
- [ ] Save triage does not call result review update client method.
- [ ] Triage filter works for `untriaged`, `regression`, and `expected_changed`.
- [ ] Mutation errors show a toast or equivalent notification, not an inline permanent error block.
- [ ] Stale triage warning is visible.

### 4.7 Browser Smoke

- [ ] Open `/observability/evals` compare mode with a dataset and two eval runs.
- [ ] Mark one compare row as `regression`.
- [ ] Refresh the page and confirm triage persists.
- [ ] Filter to `untriaged` and confirm the triaged row is excluded.
- [ ] Clear the triage row and confirm it returns to `untriaged`.
- [ ] Return to result review mode and confirm result review status is unchanged.
- [ ] Follow source example link and confirm it stays within observability/datasets management surface.

## 5. Recommended Execution Order

### Loop 1: Source Of Truth And Projection Ownership

- [x] Update `docs/source-of-truth/eval-run-model.md` with Compare Triage v1 semantics.
- [x] Inspect package dependencies around compare projection helpers.
- [x] Decide one explicit projection ownership option: shared helper move, server-safe helper with identical tests, or documented temporary UI-local stale comparison.
- [x] Implement the smallest safe projection helper ownership change needed by server/app code.
- [x] Record the selected ownership option in source-of-truth docs.
- [x] Keep durable semantics out of `apps/playground-next-web`.
- [x] Run targeted typecheck/tests for packages touched by helper movement.
- [ ] Run `codex review` for this loop after targeted verification passes.
- [ ] Commit Loop 1.

### Loop 2: Durable Triage Persistence

- [ ] Add compare triage domain types and repository contract.
- [ ] Add SQLite/Postgres schema and repository implementations.
- [ ] Add DB tests for uniqueness, upsert, delete, deterministic list, and schema alignment.
- [ ] Run targeted DB/package tests.
- [ ] Run `codex review` for this loop after targeted verification passes.
- [ ] Commit Loop 2.

### Loop 3: App Use Case And API/Client Surface

- [ ] Add app-layer compare triage update/list use cases.
- [ ] Add app-layer compare triage delete use case.
- [ ] Add validation for app, dataset, dataset example, and run-pair boundaries.
- [ ] Add strict request/response DTOs and normalizers.
- [ ] Add request parser tests for update/delete/list DTOs.
- [ ] Add durable-chat-client methods for compare triage list/update/delete.
- [ ] Add Next validation routes for GET/PATCH/DELETE.
- [ ] Add app, client, and route tests.
- [ ] Run targeted app/client/route tests.
- [ ] Run `codex review` for this loop after targeted verification passes.
- [ ] Commit Loop 3.

### Loop 4: Observability Compare UI Overlay

- [ ] Load triage rows in compare mode.
- [ ] Overlay triage badges, counts, filters, and stale warning.
- [ ] Add triage editor with status/note/save/clear.
- [ ] Ensure compare triage save does not call result review update.
- [ ] Add component tests.
- [ ] Run targeted component tests.
- [ ] Run browser smoke for compare triage persistence.
- [ ] Run `codex review` for this loop after targeted verification passes.
- [ ] Commit Loop 4.

### Loop 5: Closeout

- [ ] Re-read `docs/source-of-truth/eval-run-model.md` and remove any duplicate truth from this todo.
- [ ] Run final targeted test set covering changed packages/routes/components.
- [ ] Run final browser smoke if UI changed in Loop 4.
- [ ] Run `codex review` for closeout only if final cleanup changes code.
- [ ] Delete `docs/todolist.md` after all stable facts are promoted and all tasks are complete.
- [ ] Commit closeout.

## 6. Open Questions To Re-check During Implementation

- [ ] Is there a clean dependency-safe home for compare projection semantics outside `durable-chat-client`, or should server-side read model be introduced instead?
- [ ] Should stale detection be computed only on read, or also stored as a DTO-only derived flag after update?
- [ ] Should run compare strategy remain implicit in schema version 1, or should a non-key `observedCompareStrategy` field be added now?
- [ ] Should the API return only persisted triage rows in v1, or does projection ownership force a merged compare read model?
