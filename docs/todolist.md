# Eval Run Compare v1 Todo

## 0. Context and Boundary

### 0.1 Confirmed facts
- [x] The current evaluation foundation can capture dataset examples, maintain expected output, create eval runs, run evals, list eval results, compare one result's expected/actual text, and save human result review.
- [x] `docs/source-of-truth/eval-run-model.md` defines human review as the only result judgment truth.
- [x] Existing expected/actual comparison is a read-time assistive projection and must not auto-write `pass`, `fail`, `needs_review`, or `not_applicable`.
- [x] The current largest evaluation gap is run-to-run regression analysis: baseline eval run vs candidate eval run.
- [x] `/observability/evals` is the current validation surface, but durable compare semantics should not be owned by the Next UI.
- [x] WebGPT agreed the next step should be `Eval Run Compare v1` as a read projection plus management UI validation.

### 0.2 Goals
- [x] Add a typed `Eval Run Compare v1` projection for comparing two eval runs from the same dataset.
- [x] Align baseline and candidate results by `datasetExampleId`, not by result id.
- [x] Preserve human review as the only source for formal regression/improvement judgment.
- [x] Use existing expected/actual text comparison only as an assistive signal for unresolved rows without formal pass/fail review.
- [x] Surface run-level summary counts and row-level outcomes/reasons.
- [x] Add compare mode to `/observability/evals` without introducing a new product taxonomy such as experiments.
- [x] Keep compare v1 shareable through URL query state.
- [ ] Update source-of-truth docs after the projection semantics are implemented and tested.

### 0.3 Non-goals
- [x] Do not add LLM-as-judge.
- [x] Do not add scorer configuration.
- [x] Do not add experiment registry.
- [x] Do not add release gates or CI gating.
- [x] Do not persist compare snapshots.
- [x] Do not add DB tables or migrations.
- [x] Do not add a compare HTTP route in v1.
- [x] Do not compare runs across different datasets.
- [x] Do not implement multi-baseline or multi-candidate matrices.
- [x] Do not implement parallel eval execution, cancellation, retry, or resume.
- [x] Do not use text match/mismatch as automatic `pass`/`fail`.
- [x] Do not move quality-management workflows into `/chat`.

## 1. Definitions First

### 1.1 Source of Truth
- [ ] Keep this todo as the temporary working definition while semantics are still being implemented.
- [ ] Update `docs/source-of-truth/eval-run-model.md` once `projectEvalRunCompareV1` semantics are stable.
- [ ] Document compare v1 as read-time projection, not a durable model.
- [ ] Document that manual review status outranks assistive text comparison.
- [ ] Document future migration triggers for persisted compare snapshots.
- [ ] Delete `docs/todolist.md` when implementation and source-of-truth promotion are complete.

### 1.2 Data Model
- [x] Reuse existing `EvalRunDto` and `EvalExampleResultDto`.
- [x] Reuse existing `projectEvalExampleResultComparisonV1` for per-result assistive comparison.
- [x] Define baseline/candidate compatibility by equal `datasetId`.
- [x] Define row alignment by unique `datasetExampleId`.
- [x] Define defensive handling for duplicate `datasetExampleId` results in either run.
- [x] Define handling for missing baseline/candidate result rows.
- [x] Define null-safe usage and duration aggregate behavior.
- [x] Define how queued/running/failed/skipped results affect row comparability.
- [x] Define that manual `pass`/`fail` review overrides execution status for formal compare outcomes.
- [x] Define that `needs_review`, `not_applicable`, and `unreviewed` are unresolved for compare purposes unless paired with formal `pass`/`fail`.
- [x] Define dataset mismatch as projection-level `not_comparable` with empty rows, not row-level union.
- [x] Define defensive handling for result arrays containing `evalRunId` values that do not match the supplied baseline/candidate run.

### 1.3 Types / Interfaces
- [x] Add `EvalRunCompareOutcomeV1`.
- [x] Add `EvalRunCompareReasonV1`.
- [x] Add `EvalRunCompareResultSignalV1`.
- [x] Add `EvalRunCompareRowV1`.
- [x] Add `EvalRunCompareSummaryV1`.
- [x] Add `EvalRunCompareProjectionV1`.
- [x] Include projection-level `comparable` and optional `error` fields for dataset mismatch or other whole-projection invalid states.
- [x] Add `projectEvalRunCompareV1`.
- [x] Export the compare projection from `packages/durable-chat-client/src/index.ts`.
- [x] Do not add transport contract DTOs in `packages/contracts` for v1.

### 1.4 Outcome Semantics
- [x] `same_pass`: baseline review `pass`, candidate review `pass`.
- [x] `same_fail`: baseline review `fail`, candidate review `fail`.
- [x] `regression`: baseline review `pass`, candidate review `fail`.
- [x] `improvement`: baseline review `fail`, candidate review `pass`.
- [x] `same_unresolved`: both sides lack formal pass/fail and unresolved signals are equivalent.
- [x] `changed_unresolved`: formal pass/fail is unavailable but unresolved signals indicate a meaningful change.
- [x] `baseline_missing`: candidate has an aligned result but baseline does not.
- [x] `candidate_missing`: baseline has an aligned result but candidate does not.
- [x] `not_comparable`: different dataset, duplicate alignment anomaly, incompatible status, or otherwise unsafe comparison.
- [x] Keep `reason` separate from `outcome` so UI can group by outcome and explain classification with reason.
- [x] Use reason values to distinguish `unreviewed`, `needs_review`, `not_applicable`, failed/not-completed status, and text comparison changes inside unresolved outcomes.

### 1.5 Result Signal Priority
- [x] Missing row is handled before result-level signal classification.
- [x] Duplicate row anomaly is handled before result-level signal classification.
- [x] Manual review `pass`/`fail` produces formal judgment even if result execution status is failed or not completed.
- [x] Manual review `needs_review`/`not_applicable` produces unresolved signal, not formal pass/fail.
- [x] Execution status and per-result assistive comparison produce unresolved or not-comparable signals only when formal pass/fail is unavailable.
- [x] Unknown or unsafe input produces `not_comparable` with explicit reason.

## 2. Backend / Platform

### 2.1 Core / Contracts / DB / App
- [x] `packages/core`: no change expected for v1.
- [x] `packages/contracts`: no change expected for v1.
- [x] `packages/db`: no change expected for v1.
- [x] `packages/app`: no change expected for v1.
- [x] Next API routes: no new compare route expected for v1.

### 2.2 Durable Chat Client
- [x] Add `packages/durable-chat-client/src/service/eval-run-comparison.ts`.
- [x] Reuse `projectEvalExampleResultComparisonV1` instead of duplicating expected/actual extraction logic.
- [x] Keep the projection pure and deterministic over DTO inputs.
- [x] Keep browser-safe output suitable for Next and future frontend consumers.
- [x] Add package tests for outcome, reason, row alignment, and summary calculations.

## 3. Frontend Boundary

### 3.1 Runtime / State
- [x] Add compare query state to `/observability/evals`.
- [x] Use `mode=compare` to enter compare mode.
- [x] Use `baselineEvalRunId` and `candidateEvalRunId` for compare run selection.
- [x] Use a row-level query key based on `datasetExampleId` for compare row selection.
- [x] Reuse existing dataset eval runs API.
- [x] Reuse existing eval run results API for both baseline and candidate.
- [x] Do not add a new compare API call.
- [x] Keep existing single-run review mode behavior intact.
- [x] Keep result filters local unless a compare filter becomes part of shareable state intentionally.
- [x] Use `compareDatasetExampleId` as the compare row selection query parameter.

### 3.2 UI Structure
- [ ] Add a small mode toggle inside `/observability/evals`: review run vs compare runs.
- [ ] Keep compare mode under eval management, not a new `/observability/experiments` surface.
- [ ] In compare mode, show baseline and candidate selectors constrained to the selected dataset.
- [ ] Prefer completed eval runs in UI ordering/labels, but do not make projection depend on UI filtering.
- [ ] Show summary counts for regressions, improvements, same pass/fail, unresolved changes, missing, and not comparable.
- [ ] Show null-safe token and duration deltas only when enough data exists.
- [ ] Show a row queue aligned by `datasetExampleId`.
- [ ] Show row detail with baseline and candidate result summaries side by side.
- [ ] Keep links back to source example and output runs/results visible but not dominant.
- [ ] Do not allow compare mode to mutate review truth.
- [ ] Keep outcome classification, result signal priority, duplicate handling, dataset mismatch handling, and summary count semantics out of Next UI code.
- [ ] Let Next UI own only labels, sorting defaults, filters, query state, and layout.

### 3.3 Copy and Visual Language
- [ ] Keep eval-page internal labels in the current Chinese mapping style.
- [ ] Keep shared shell labels unchanged: `Runs`, `Datasets`, `Evals`, `Refresh`, `Log out`.
- [ ] Avoid explanatory product copy inside the page.
- [ ] Use restrained management UI styling.

## 4. Tests

### 4.1 Projection Tests
- [x] `pass -> fail` classifies as `regression`.
- [x] `fail -> pass` classifies as `improvement`.
- [x] `pass -> pass` classifies as `same_pass`.
- [x] `fail -> fail` classifies as `same_fail`.
- [x] both unresolved with same assistive signal classifies as `same_unresolved`.
- [x] unresolved assistive signal change classifies as `changed_unresolved`.
- [x] `needs_review` does not become formal pass/fail.
- [x] `not_applicable` does not become formal pass/fail.
- [x] `needs_review -> pass` and `pass -> needs_review` classify as `changed_unresolved`, not improvement/regression.
- [x] `fail -> needs_review` and `needs_review -> fail` classify as `changed_unresolved`, not improvement/regression.
- [x] `not_applicable -> not_applicable` classifies as `same_unresolved` with reason `both_review_not_applicable`.
- [x] `not_applicable -> pass` and `pass -> not_applicable` classify as `changed_unresolved`.
- [x] `completed pass -> failed fail` classifies as `regression`.
- [x] `failed fail -> failed fail` classifies as `same_fail`.
- [x] `completed pass -> failed unreviewed` classifies as unresolved or not comparable, not regression.
- [x] baseline missing classifies as `baseline_missing`.
- [x] candidate missing classifies as `candidate_missing`.
- [x] different dataset returns projection-level `comparable: false`, `error.reason: different_dataset`, and empty rows.
- [x] duplicate `datasetExampleId` on either side is `not_comparable`.
- [x] baseline/candidate result `evalRunId` mismatch is defensive `not_comparable`.
- [x] failed/not completed rows produce safe non-pass/fail outcomes.
- [x] summary counts equal row outcome counts.
- [x] usage/duration deltas are null-safe.

### 4.2 Runtime / UI Tests
- [x] compare mode fetches baseline and candidate result sets through existing result APIs.
- [x] compare mode does not call a new compare route.
- [x] compare query state is URL-backed.
- [x] selecting a compare row uses `compareDatasetExampleId`.
- [ ] summary renders regression/improvement/missing/not comparable counts.
- [ ] row detail renders baseline and candidate sides.
- [x] switching back to review mode preserves existing single-run behavior.
- [x] review save behavior remains unchanged in review mode.
- [x] mutation errors still surface through toast, not inline page errors.

### 4.3 Verification Commands
- [x] Run focused durable-chat-client compare projection tests.
- [x] Run focused eval console component tests.
- [x] Run `pnpm --filter @agent-infra/durable-chat-client typecheck`.
- [x] Run `pnpm --filter playground-next-web typecheck`.
- [x] Run `git diff --check` for touched files.
- [ ] Run browser smoke for `/observability/evals` compare mode.

## 5. Recommended Execution Order

### Loop 1: Shared Compare Projection
- [x] Add compare projection file under `packages/durable-chat-client/src/service`.
- [x] Define compare outcome/reason/signal/row/summary/projection types.
- [x] Implement dataset compatibility and `datasetExampleId` alignment.
- [x] Implement manual-review-first outcome classification.
- [x] Implement result signal priority, including manual pass/fail overriding execution status.
- [x] Reuse per-result assistive comparison for unresolved signals.
- [x] Implement missing, duplicate, failed, and not-comparable handling.
- [x] Implement projection-level dataset mismatch handling with `comparable: false` and empty rows.
- [x] Implement defensive result `evalRunId` mismatch handling.
- [x] Implement summary counts and null-safe usage/duration aggregate deltas.
- [x] Export compare projection from `packages/durable-chat-client/src/index.ts`.
- [x] Add focused projection tests.
- [x] Run durable-chat-client targeted tests.
- [x] Run durable-chat-client typecheck.
- [x] Run `git diff --check` for touched package files.
- [x] Run `codex review` for this loop.

### Loop 2A: Compare Query And Fetching State
- [x] Extend eval console runtime to support `mode=compare`.
- [x] Add URL-backed `baselineEvalRunId`, `candidateEvalRunId`, and `compareDatasetExampleId`.
- [x] Reuse existing eval run/results fetchers for both sides.
- [x] Keep this loop focused on query state and fetching, with minimal placeholder UI only.
- [x] Keep single-run review mode unchanged.
- [x] Add runtime/component tests proving existing routes are reused.
- [x] Run focused eval console tests.
- [x] Run playground-next-web typecheck.
- [x] Run `git diff --check` for touched Next files.
- [x] Run `codex review` for this loop.

### Loop 2B: Derived Compare State
- [ ] Compute `projectEvalRunCompareV1` from fetched baseline/candidate DTOs.
- [ ] Expose selected compare row by `compareDatasetExampleId`.
- [ ] Expose projection-level non-comparable errors to UI state without reimplementing classification.
- [ ] Preserve review mode selection behavior when switching between review and compare modes.
- [ ] Add runtime/component tests for derived compare state and mode switching.
- [ ] Run focused eval console tests.
- [ ] Run playground-next-web typecheck.
- [ ] Run `git diff --check` for touched Next files.
- [ ] Run `codex review` for this loop.

### Loop 3: Compare UI
- [ ] Add review/compare mode toggle in `/observability/evals`.
- [ ] Add baseline/candidate run selectors in compare mode.
- [ ] Add compare summary section.
- [ ] Add compare row queue with outcome filters.
- [ ] Add compare row detail with baseline/candidate side-by-side result summaries.
- [ ] Keep source example/output run/result links available.
- [ ] Keep compare UI read-only with respect to review truth.
- [ ] Add focused UI tests for summary, queue, row selection, and detail.
- [ ] Run focused eval console tests.
- [ ] Run playground-next-web typecheck.
- [ ] Run `git diff --check` for touched UI files.
- [ ] Run `codex review` for this loop.

### Loop 4: Source Of Truth And Browser Verification
- [ ] Update `docs/source-of-truth/eval-run-model.md` with compare v1 semantics.
- [ ] Document non-goals and future migration triggers.
- [ ] Verify `/observability/evals` review mode still works in browser.
- [ ] Verify `/observability/evals?mode=compare` works in browser.
- [ ] Confirm compare mode is usable at desktop width.
- [ ] Run final targeted tests affected by documentation or UI closeout.
- [ ] Run `git diff --check` for touched docs and UI files.
- [ ] Run `codex review` for this loop if code changed after Loop 3 review.
- [ ] Delete `docs/todolist.md` after all durable facts are promoted and all tasks are complete.
