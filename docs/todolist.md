# Eval Review Ergonomics And Comparator Assist v1 Todo

## 0. Context and Boundary

### 0.1 Confirmed facts

- [x] `Dataset Regression Runner v1` is complete.
- [x] `EvalRun` and `EvalExampleResult` are durable records.
- [x] `app.evals.create` creates an eval batch and queued result rows from eligible dataset examples.
- [x] `app.evals.run` executes existing queued result rows against current runtime behavior.
- [x] Eval execution uses isolated eval threads and does not mutate the original source thread.
- [x] `EvalExampleResult.expectedOutputJson` is a create-time immutable snapshot.
- [x] `EvalExampleResult.actualOutputJson` is a versioned `eval_run_output` snapshot.
- [x] `EvalExampleResult.review` is the human review truth.
- [x] `/observability/evals` exists as an independent validation surface.
- [x] Playground is a validation consumer, not the product boundary.
- [x] WebGPT recommended prioritizing review ergonomics, compare/diff, filters/review queue, and a read-time deterministic comparator before persisted comparison, reports, LLM judge, or CI gates.
- [x] WebGPT second pass recommended narrowing the first implementation round: no `EvalExampleResultDto` comparison field, no API response comparison, and no server-side comparison projection yet.
- [x] WebGPT second pass recommended a browser-safe shared helper in `packages/durable-chat-client`, so playground UI can consume shared projection semantics without owning them.
- [x] WebGPT second pass recommended comparator outcome `not_comparable`, not `not_applicable`, because `not_applicable` is already a manual review status.

### 0.2 Goals

- [ ] Make eval result review faster without changing eval execution semantics.
- [ ] Add an expected-vs-actual compare projection that is defined outside playground UI code.
- [ ] Add an assistive deterministic comparator projection for simple assistant-text expected outputs.
- [ ] Keep comparator output as a read-time projection in v1, not durable review truth.
- [ ] Keep comparison projection out of API response DTOs in the first implementation round.
- [ ] Implement comparison projection in a browser-safe shared client package helper.
- [ ] Improve `/observability/evals` result detail so reviewers can inspect expected text, actual text, diff, status, error, usage, and lineage without reading raw JSON first.
- [ ] Add result filters / review queue affordances for common review tasks.
- [ ] Fix or avoid stale eval run summary display after result review updates.

### 0.3 Non-goals

- [x] Do not add DB columns or tables for persisted comparison in this track.
- [x] Do not add LLM-as-judge scoring in this track.
- [x] Do not add experiment comparison in this track.
- [x] Do not add prompt hub or prompt version management in this track.
- [x] Do not add CI gates in this track.
- [x] Do not add global reports, pass-rate dashboards, alerting, or cost analytics in this track.
- [x] Do not add assignment queues, bulk operations, or multi-reviewer workflow in this track.
- [x] Do not move eval execution or review controls into `/chat`.
- [x] Do not treat comparator output as `pass` / `fail` review truth.
- [x] Do not mutate existing eval result expected-output snapshots when dataset examples are edited later.
- [x] Do not add `comparison` to `EvalExampleResultDto` in the first implementation round.
- [x] Do not add server-side result filtering or pagination in the first implementation round.
- [x] Do not put filter state into the URL in the first implementation round.

## 1. Definitions First

### 1.1 Source of Truth

- [x] Update `docs/source-of-truth/eval-run-model.md` with `Eval Review Ergonomics And Comparator Assist v1`.
- [x] Define human review as the only result judgment truth.
- [x] Define comparator output as an assistive read-time projection.
- [x] Define that v1 comparator projection is not persisted.
- [x] Define the conditions that would justify persisted comparison later: DB filtering/pagination, historical audit, multiple comparator strategies, expensive async comparators, or run-level persisted comparison summaries.
- [x] Define expected text extraction from `DatasetExpectedOutputV1` with `kind = 'assistant_text'`.
- [x] Define actual text extraction from `EvalActualOutputSnapshotV1.assistantMessages`.
- [x] Define behavior for missing expected output.
- [x] Define behavior for missing actual output.
- [x] Define behavior for failed result rows.
- [x] Define behavior for outputless completed runtime runs.
- [x] Define behavior for multiple assistant messages.
- [x] Define comparison display copy as `text match`, `text differs`, and `not comparable`, not `pass`, `fail`, `auto pass`, or `auto fail`.
- [x] Define that `contains_text` is deferred unless expected output becomes assertion-oriented.
- [x] Define `normalized_text_v1` as the first comparator strategy.
- [x] Define filter/review queue scope for v1 as local component state, not URL query params or server filters.
- [x] Define that review save refreshes selected eval run summary by refetching the eval run in v1.
- [x] Define upgrade triggers for putting comparison into DTO/API responses later: second consumer, server-side filtering/sorting/pagination, server-only comparator complexity, or returned run-level comparison summary.
- [x] Update `docs/roadmap.md` selected next track if needed.

### 1.2 Projection Model

- [x] Define `EvalResultComparisonProjectionV1`.
- [x] Define `schemaVersion = 1`.
- [x] Define `kind = 'eval_result_comparison'`.
- [x] Define `strategy = 'normalized_text_v1'`.
- [x] Define `outcome = 'match' | 'mismatch' | 'not_comparable'`.
- [x] Define reason codes:
  - [x] `normalized_text_equal`
  - [x] `normalized_text_different`
  - [x] `result_not_completed`
  - [x] `result_failed`
  - [x] `missing_expected_output`
  - [x] `unsupported_expected_output_shape`
  - [x] `missing_expected_text`
  - [x] `empty_expected_text`
  - [x] `missing_actual_output`
  - [x] `unsupported_actual_output_shape`
  - [x] `actual_output_error`
  - [x] `missing_actual_assistant_messages`
  - [x] `missing_actual_text`
  - [x] `empty_actual_text`
- [x] Define diagnostics:
  - [x] `multiple_actual_assistant_messages`
  - [x] `non_text_actual_parts_omitted`
  - [x] `empty_actual_text_parts_omitted`
- [x] Define optional `expectedText`.
- [x] Define optional `actualText`.
- [x] Define actual text blocks for UI display with message id, sequence, and text.
- [x] Define normalization rules: trim, normalize line endings, collapse whitespace.
- [x] Define assistant-message text flattening order by message order and part order.
- [x] Define multiple assistant messages as comparable by joined text while displayed as separate blocks.

### 1.3 Types / Interfaces

- [ ] Add durable-chat-client comparison projection type and helper exports.
- [ ] Add `projectEvalExampleResultComparisonV1`.
- [ ] Add `extractEvalExpectedTextV1`.
- [ ] Add `extractEvalActualTextV1`.
- [ ] Add `normalizeComparisonTextV1`.
- [x] Do not add contract DTO for comparison projection in the first implementation round.
- [x] Do not add durable-chat-server DTO builder support for comparison projection in the first implementation round.
- [x] Keep durable-chat-client normalizer shape unchanged except for exported helper availability.
- [x] Keep `EvalExampleResultRepository` unchanged.
- [x] Keep DB schema unchanged.
- [x] Keep eval run create/run/review request contracts semantically unchanged.

## 2. Backend / Platform

### 2.1 Browser-Safe Shared Projection

- [ ] Add browser-safe projection helpers under `packages/durable-chat-client`.
- [ ] Add pure helper to project expected text from an `EvalExampleResultDto`.
- [ ] Add pure helper to project actual text from an `EvalExampleResultDto`.
- [ ] Add pure helper to normalize comparator text.
- [ ] Add pure helper to build `EvalResultComparisonProjectionV1`.
- [ ] Ensure helper does not mutate result records.
- [ ] Ensure helper does not read live source dataset examples.
- [ ] Ensure helper uses only eval result snapshots and status/error fields.
- [ ] Ensure helper treats human review as separate from comparator projection.
- [ ] Ensure helper returns no `review` field and never infers review status.
- [ ] Ensure helper uses `not_comparable` for comparison non-applicability instead of review `not_applicable`.

### 2.2 Contracts / Server / Client

- [x] Keep `EvalExampleResultDto` unchanged in the first implementation round.
- [x] Keep durable-chat-server response builders unchanged in the first implementation round.
- [x] Keep durable-chat-client API normalizers compatible with current result DTOs.
- [x] Avoid adding request DTOs for comparator configuration in v1.
- [x] Avoid adding route query parameters for server-side filters in v1.
- [x] Document future DTO/API upgrade triggers if comparison must cross the wire later.

### 2.3 Playground Routes

- [ ] Keep existing eval result list route shape.
- [ ] Do not duplicate comparison semantics in Next route handlers.
- [ ] Do not require runtime services for read/list/detail/review routes.
- [ ] Preserve auth and dataset/eval access boundaries.
- [ ] Fix stale eval run summary after review updates by refetching the selected eval run after review save.
- [ ] Do not change the review route response shape in the first implementation round.

## 3. Frontend Boundary

### 3.1 Eval UI Data Flow

- [ ] Keep `/observability/evals` as the main eval review surface.
- [ ] Keep `/chat` unchanged.
- [ ] Keep `/observability` run panel focused on run inspection and capture.
- [ ] Use shared client helpers for API calls.
- [ ] Use durable-chat-client comparison projection helper.
- [ ] Keep page-local state limited to selection, filters, and form drafts.
- [ ] Do not compute durable comparison semantics only inside React components.
- [ ] Keep filter state local to the component in v1.
- [ ] Keep URL state limited to `datasetId`, `evalRunId`, and `resultId` in v1.

### 3.2 Compare / Diff View

- [ ] Add a compare panel above raw JSON snapshots in result detail.
- [ ] Show expected assistant text.
- [ ] Show actual assistant text.
- [ ] Show comparison outcome badge.
- [ ] Show comparison reason.
- [ ] Show comparison diagnostics.
- [ ] Show result status.
- [ ] Show result error when present.
- [ ] Show usage and duration near compare context.
- [ ] Show output run lineage link when available.
- [ ] Show source dataset example link.
- [ ] Preserve baseline output as context, not expected truth.
- [ ] Keep raw snapshots available but visually secondary.
- [ ] Add joined text diff view for expected vs actual text.
- [ ] Handle multiple assistant messages without silently dropping content.
- [ ] Display multiple assistant messages as separate actual text blocks.
- [ ] Handle missing expected output.
- [ ] Handle missing actual output.
- [ ] Handle failed result rows.
- [ ] Avoid UI labels that imply automatic pass/fail review.

### 3.3 Filters / Review Queue

- [ ] Add result status filter.
- [ ] Add review status filter.
- [ ] Add comparison outcome filter.
- [ ] Add error-only filter.
- [ ] Add missing-actual filter.
- [ ] Add unreviewed queue shortcut.
- [ ] Add mismatch queue shortcut.
- [ ] Add failed / not-comparable queue shortcut.
- [ ] Make filtered counts visible enough for review progress.
- [ ] Preserve selected result where possible when filters change.
- [ ] If selected result becomes hidden by filters, either preserve detail with a hidden-by-filter notice or select the first visible result.
- [ ] Avoid bulk review actions in v1.
- [ ] Avoid assignment / multi-reviewer workflow in v1.

### 3.4 Review Save UX

- [ ] Preserve existing manual review statuses.
- [ ] Preserve reviewer note save flow.
- [ ] Ensure save updates selected result.
- [ ] Ensure save refetches eval run summary counts.
- [ ] Keep comparator outcome unchanged by manual review.
- [ ] Avoid auto-writing `pass` / `fail` from comparator.

## 4. Tests

### 4.1 Source / Type Tests

- [ ] Add tests for expected text extraction.
- [ ] Add tests for actual text extraction.
- [ ] Add tests for text normalization.
- [ ] Add tests for `normalized_text_equal`.
- [ ] Add tests for `normalized_text_different`.
- [ ] Add tests for `result_failed`.
- [ ] Add tests for `missing_expected_output`.
- [ ] Add tests for `missing_expected_text`.
- [ ] Add tests for `empty_expected_text`.
- [ ] Add tests for `missing_actual_output`.
- [ ] Add tests for `missing_actual_text`.
- [ ] Add tests for `empty_actual_text`.
- [ ] Add tests for `result_not_completed`.
- [ ] Add tests for `actual_output_error`.
- [ ] Add tests for `missing_actual_assistant_messages`.
- [ ] Add tests for comparison diagnostics.
- [ ] Add tests for multiple assistant messages.
- [ ] Add tests proving comparison does not mutate review metadata.
- [ ] Add tests proving comparison helper returns no review field.

### 4.2 Contracts / Server / Client Tests

- [ ] Run durable-chat-client tests for browser-safe comparison projection.
- [ ] Run durable-chat-client typecheck after helper exports.
- [ ] No contract DTO tests are required in the first implementation round because result DTO shape stays unchanged.
- [ ] No server response helper tests are required in the first implementation round because server response builders stay unchanged.

### 4.3 Playground Route Tests

- [ ] Add tests proving read/list/detail/review routes still do not require runtime services.
- [ ] Add tests proving review patch cannot spoof comparator output or review actor/time.
- [ ] Add tests proving review patch rejects unknown comparator-related keys if route/parser coverage is touched.
- [ ] No route response shape tests are required in the first implementation round because review route response stays unchanged.

### 4.4 Playground UI Tests

- [ ] Add UI tests for compare panel expected text.
- [ ] Add UI tests for compare panel actual text.
- [ ] Add UI tests for comparison outcome badge.
- [ ] Add UI tests for missing actual / failed result display.
- [ ] Add UI tests for result status filter.
- [ ] Add UI tests for review status filter.
- [ ] Add UI tests for comparison outcome filter.
- [ ] Add UI tests for queue shortcuts.
- [ ] Add UI tests proving review save updates result row and summary/progress display.
- [ ] Add UI tests proving comparison match does not auto-select manual review `pass`.
- [ ] Add UI tests proving review save payload does not include comparator fields.
- [ ] Add UI tests for local filter state without URL filter query params.
- [ ] Add UI tests proving `/chat` is not part of this workflow.

### 4.5 Targeted Verification

- [ ] Run `pnpm --filter @agent-infra/durable-chat-client test` after comparison helper changes.
- [ ] Run `pnpm --filter @agent-infra/durable-chat-client typecheck` after helper exports.
- [ ] Run `pnpm --filter @agent-infra/contracts typecheck` only if contracts change later.
- [ ] Run `pnpm --filter @agent-infra/durable-chat-server test` only if server helpers change later.
- [ ] Run targeted `playground-next-web` route/UI tests after playground changes.
- [ ] Run `pnpm --filter playground-next-web typecheck` after UI changes.
- [ ] Run broader workspace typecheck only if targeted checks leave cross-package uncertainty.
- [ ] Run browser smoke test after UI implementation.

## 5. Recommended Execution Order

### Loop 0: Lock Review / Comparator Semantics

- [x] Update `docs/source-of-truth/eval-run-model.md`.
- [x] Update `docs/roadmap.md` selected next track if warranted.
- [x] Lock comparator as read-time assistive projection.
- [x] Lock `normalized_text_v1` as first comparator strategy.
- [x] Lock comparison outcome `not_comparable`, not review `not_applicable`.
- [x] Lock comparison helper home in `packages/durable-chat-client`.
- [x] Lock no `EvalExampleResultDto` comparison field in the first implementation round.
- [x] Lock no DB schema changes in v1.
- [x] Lock human review as final truth.
- [x] Lock filter/review queue v1 scope as local UI state.
- [x] Lock review-save summary freshness as eval run refetch, not response-shape change.
- [x] Run no tests unless executable code changes.
- [x] Run `codex review` for this loop after targeted verification passes.
- [ ] Commit Loop 0.

### Loop 1: Durable Chat Client Projection Helper

- [ ] Add durable-chat-client comparison projection types and helpers.
- [ ] Add expected text extraction helper.
- [ ] Add actual text extraction helper with joined text, display blocks, and diagnostics.
- [ ] Add normalized text comparator helper.
- [ ] Add focused durable-chat-client helper tests.
- [ ] Export browser-safe helpers from durable-chat-client entry points.
- [ ] Run `pnpm --filter @agent-infra/durable-chat-client test`.
- [ ] Run `pnpm --filter @agent-infra/durable-chat-client typecheck`.
- [ ] Run `codex review` for this loop after targeted verification passes.
- [ ] Commit Loop 1.

### Loop 2: Eval Compare UI

- [ ] Add compare panel to `/observability/evals` result detail.
- [ ] Add expected / actual text rendering.
- [ ] Add diff rendering.
- [ ] Add comparison badge and reason display.
- [ ] Relegate raw JSON snapshots to secondary detail.
- [ ] Add focused UI tests for compare panel and edge cases.
- [ ] Run targeted `playground-next-web` UI tests.
- [ ] Run `pnpm --filter playground-next-web typecheck`.
- [ ] Run browser smoke test for compare panel.
- [ ] Run `codex review` for this loop after targeted verification passes.
- [ ] Commit Loop 2.

### Loop 3: Filters, Review Queue, And Summary Freshness

- [ ] Add result status filter.
- [ ] Add review status filter.
- [ ] Add comparison outcome filter.
- [ ] Add error / missing actual filters.
- [ ] Add queue shortcuts.
- [ ] Fix stale eval run summary display after review saves.
- [ ] Add focused UI tests for filters, queue behavior, and summary freshness.
- [ ] Run targeted `playground-next-web` UI tests.
- [ ] Run `pnpm --filter playground-next-web typecheck`.
- [ ] Run browser smoke test for review queue.
- [ ] Run `codex review` for this loop after targeted verification passes.
- [ ] Commit Loop 3.

### Loop 4: Closeout

- [ ] Review source-of-truth docs and remove any parallel long-lived definitions from this todo.
- [ ] Ensure this track still does not include persisted comparison, LLM judge, reports, experiment comparison, prompt hub, CI gate, billing, or `/chat` workflow changes.
- [ ] Run final targeted tests for all changed areas.
- [ ] Run broader workspace typecheck if warranted.
- [ ] Run final browser smoke test if UI changed.
- [ ] Run `codex review` for this loop after targeted verification passes.
- [ ] Delete `docs/todolist.md` when every item is complete and stable facts have moved to source-of-truth docs.
- [ ] Commit Loop 4.
