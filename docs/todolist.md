# Dataset Review and Expected Output Foundation v1 Todo

## 0. Context and Boundary

### 0.1 Confirmed facts
- [x] `Run-to-Dataset Capture v1` is complete.
- [x] `Dataset` and `DatasetExample` shared domain records already exist.
- [x] Dataset/example SQLite and Postgres persistence already exists.
- [x] `app.datasets.captureExampleFromRun` already captures a durable run into a dataset example.
- [x] Captured examples already store `inputJson`, `baselineOutputJson`, `contextSnapshotJson`, `toolInvocationsSnapshotJson`, and `metadataJson`.
- [x] `expectedOutputJson` already exists as a nullable dataset example field.
- [x] `metadataJson.capture.kind` already classifies captures as `normal_example`, `failure_case`, or `debug_case`.
- [x] `metadataJson.evaluation.defaultEligible` already stores capture-time default eligibility.
- [x] Shared run feedback and playground feedback details are copied only as capture-time metadata snapshots.
- [x] `/observability` already has a selected-run capture action.
- [x] Trace and timeline projections are inspection read models, not deterministic replay logs.
- [x] Playground is a validation consumer, not the product boundary.

### 0.2 Goals
- [ ] Stabilize `expectedOutputJson` v1 as a typed expected-output envelope.
- [ ] Stabilize `metadataJson.review` v1 as a typed review metadata envelope.
- [ ] Define effective eval eligibility as a computed future-eval readiness signal, not an eval execution contract or second stored truth.
- [ ] Add app-layer parsing and safe metadata merge helpers so UI cannot overwrite `capture`, `feedback`, `host`, or unrelated metadata namespaces.
- [ ] Add dedicated app use cases for updating expected output and review metadata.
- [ ] Tighten contracts/server/client helpers around expected-output and review payloads.
- [ ] Add authenticated playground routes for example detail, expected-output update, and review update.
- [ ] Add an independent dataset-centric review surface under `/observability/datasets`.
- [ ] Let users inspect captured snapshots, edit expected output, and mark examples as approved or excluded.
- [ ] Keep source refs as lineage links; review must still work from captured snapshots when the source run cannot be opened.

### 0.3 Non-goals
- [x] Do not implement `EvalRun` or `EvalExampleResult` in this track.
- [x] Do not implement an evaluation runner in this track.
- [x] Do not implement eval reports, pass-rate dashboards, or experiment comparison in this track.
- [x] Do not implement LLM-as-judge scoring in this track.
- [x] Do not implement a prompt hub or prompt version manager in this track.
- [x] Do not implement LangSmith, OpenTelemetry, or exporter sinks in this track.
- [x] Do not implement a cost analytics dashboard or usage ledger in this track.
- [x] Do not add automatic historical-run import in this track.
- [x] Do not add full dataset analytics, search, bulk operations, queues, assignments, or multi-reviewer workflow in this track.
- [x] Do not add shared user, org, tenant, billing, or account models in this track.
- [x] Do not promote playground feedback sidecar details into shared runtime state.
- [x] Do not put dataset review controls in `/chat`.
- [x] Do not make dataset review depend on the current `/observability` thread/run selection.

## 1. Definitions First

### 1.1 Source of Truth
- [x] Update `docs/source-of-truth/dataset-example-model.md` with `DatasetExpectedOutputV1`.
- [x] Update `docs/source-of-truth/dataset-example-model.md` with `DatasetExampleReviewMetadataV1`.
- [x] Update `docs/source-of-truth/dataset-example-model.md` with effective eligibility rules as future-eval readiness rules only.
- [x] Document that `metadataJson.review` is post-capture curation metadata, while `metadataJson.capture`, `feedback`, and `host` remain capture-time facts.
- [x] Document that review may explicitly include a `failure_case` or `debug_case`, but capture classification itself is not rewritten.
- [x] Document that expected output is the human/evaluator target, not a copy of baseline output.
- [x] Document that v1 expected output supports only one simple assistant-text target.
- [x] Document that future structured output assertions, tool assertions, rubrics, multiple annotators, and expected-output history are deferred.
- [x] Document that source-run access is optional for review display: dataset access controls example visibility, source-run access controls only lineage navigation.
- [x] Document that expected-output/review attribution is not stored in `expectedOutputJson`; app-layer review metadata owns `reviewedByActorId` and `reviewedAt`.
- [x] Document that tool invocation snapshots may contain captured sensitive tool input/output, no redaction guarantee is implied, and v1 does not add copy/export/download actions for full tool payloads.
- [x] Update `docs/roadmap.md` to mark this track as the selected next infra track.

### 1.2 Expected Output Model
- [x] Define `DatasetExpectedOutputV1.schemaVersion = 1`.
- [x] Define `DatasetExpectedOutputV1.kind = 'assistant_text'`.
- [x] Define `DatasetExpectedOutputV1.text` as required trimmed non-empty expected assistant answer text.
- [x] Define optional `DatasetExpectedOutputV1.notes` as reviewer context only, not evaluator input.
- [x] Define maximum lengths for `DatasetExpectedOutputV1.text` and `DatasetExpectedOutputV1.notes`.
- [x] Keep `expectedOutputJson: null` valid for unreviewed or debug-only examples.
- [x] Use `expectedOutputJson: null` as the only clear operation result.
- [x] Reject invalid expected-output payload shapes at app/server boundaries.
- [x] Tolerate legacy arbitrary stored `expectedOutputJson` when normalizing read models so existing examples do not crash list/detail responses.
- [x] Do not store actor id, timestamps, or edit history inside `expectedOutputJson` in v1.
- [x] Do not add multi-message expected output in v1.
- [x] Do not add structured JSON assertion DSL in v1.
- [x] Do not add tool-call expected output assertions in v1.
- [x] Do not add LLM judge rubric schema in v1.

### 1.3 Review Metadata Model
- [x] Define `DatasetExampleReviewMetadataV1.status = 'unreviewed' | 'needs_expected_output' | 'approved' | 'excluded'`.
- [x] Define `DatasetExampleReviewMetadataV1.evalEligibility = 'default' | 'include' | 'exclude'`.
- [x] Define optional `exclusionReason = 'failure_case' | 'debug_case' | 'missing_expected_output' | 'not_representative' | 'sensitive_or_unsafe' | 'other' | null`.
- [x] Define optional `reviewerNote`.
- [x] Define optional `reviewedByActorId`.
- [x] Define optional `reviewedAt`.
- [x] Default missing review metadata to `status: 'unreviewed'` and `evalEligibility: 'default'` in read-model helpers.
- [x] Define review write payloads as strict whitelists; reject unknown keys and protected metadata namespaces.
- [x] Define that `reviewedByActorId` and `reviewedAt` are assigned by app use cases, not accepted from request bodies.
- [x] Define invalid review combinations and reject them in app-layer validation.
- [x] Do not require a DB migration for review metadata in v1 unless implementation proves JSON metadata cannot safely support the workflow.
- [x] Defer top-level `reviewStatus`, `reviewedAt`, or `evalEligibilityOverride` columns until there is real query/index pressure.

### 1.4 Effective Eligibility
- [x] Define effective eligibility as computed future-eval readiness from `expectedOutputJson`, `metadataJson.review`, and `metadataJson.evaluation.defaultEligible`.
- [x] Treat `review.status = 'approved'` as required for default eval eligibility.
- [x] Treat a non-null valid `expectedOutputJson` as required for default eval eligibility.
- [x] Treat `review.evalEligibility = 'exclude'` as always ineligible.
- [x] Treat `review.evalEligibility = 'include'` as reviewer override, but still require valid expected output unless source-of-truth explicitly changes.
- [x] Treat `review.evalEligibility = 'default'` as eligible only when capture-time `evaluation.defaultEligible === true`.
- [x] Reject or normalize contradictory states such as `excluded + include`, `approved + missing expected output`, and `include + missing expected output`; v1 should reject them at app write boundaries.
- [x] Return eligibility reason codes for UI display and tests: `eligible_default`, `eligible_included_by_review`, `ineligible_unreviewed`, `ineligible_needs_expected_output`, `ineligible_missing_expected_output`, `ineligible_invalid_expected_output`, `ineligible_excluded_by_review`, `ineligible_capture_default`, and `ineligible_contradictory_review_state`.

### 1.5 Types / Interfaces
- [x] Add app-layer `DatasetExpectedOutputV1` type.
- [x] Add app-layer `DatasetExampleReviewMetadataV1` type.
- [x] Add app-layer `DatasetExampleEffectiveEligibilityV1` type.
- [x] Add app-layer parse/normalize helpers for expected output.
- [x] Add app-layer parse/normalize helpers for dataset example metadata.
- [x] Add app-layer merge helper that updates only `metadataJson.review`.
- [x] Normalize `metadataJson: null` and non-object metadata to an empty metadata envelope before adding review metadata.
- [x] Preserve `metadataJson.schemaVersion` when applying review updates.
- [x] Preserve `metadataJson.evaluation.defaultEligible` when applying review updates.
- [x] Preserve unknown metadata namespaces when applying review updates.
- [x] Prevent review updates from overwriting `metadataJson.capture`.
- [x] Prevent review updates from overwriting `metadataJson.feedback`.
- [x] Prevent review updates from overwriting `metadataJson.host`.
- [x] Prevent request bodies from passing `capture`, `feedback`, `host`, `evaluation`, or full `metadataJson` into review update semantics.
- [x] Keep core `DatasetExample.expectedOutputJson` and `metadataJson` as generic JSON fields.
- [x] Keep contract DTO JSON fields wire-compatible while adding stricter request validation where appropriate.

## 2. Backend / Platform

### 2.1 Shared Core
- [x] Avoid adding review-specific top-level fields to `packages/core` in v1 unless source-of-truth changes.
- [x] Avoid adding new repository methods only for querying review status in v1 unless implementation proves they are necessary.
- [x] Keep `DatasetExampleRepository.updateExpectedOutput` usable as the persistence primitive but not as the public app semantics boundary.

### 2.2 App Use Cases
- [x] Add `UpdateDatasetExampleReviewInput`.
- [x] Add `UpdateDatasetExampleReviewResult` if needed by the app boundary.
- [x] Add `GetDatasetExampleInput`.
- [x] Add `GetDatasetExampleResult` if needed by route/UI detail reads.
- [x] Add `app.datasets.getExample`.
- [x] Add `app.datasets.updateExampleReview`.
- [x] Tighten `app.datasets.updateExampleExpectedOutput` to validate `DatasetExpectedOutputV1 | null`.
- [x] Ensure `updateExampleExpectedOutput` can no longer accept arbitrary metadata overwrite from callers.
- [x] Ensure `updateExampleReview` updates only the review namespace.
- [x] Ensure `updateExampleReview` records `reviewedByActorId` from the actor boundary when status changes away from `unreviewed`.
- [x] Ensure `updateExampleReview` records `reviewedAt` from app time when review state changes.
- [x] Ensure `updateExampleReview` rejects request-supplied `reviewedByActorId`, `reviewedAt`, protected namespaces, and unknown review keys.
- [x] Ensure `updateExampleReview` rejects invalid review combinations, including `excluded + include`, `approved + missing expected output`, and `include + missing expected output`.
- [x] Ensure app use cases enforce dataset app boundary and dataset visibility.
- [x] Ensure private datasets remain accessible only to the creating actor.
- [x] Ensure app-visible datasets remain accessible within the app boundary.
- [x] Ensure source run/thread access is not required to read captured snapshots after the user has dataset access.
- [x] Ensure source run/thread access is checked only when building a lineage navigation target if route code needs it.
- [x] Add effective eligibility helper to the app layer.
- [x] Do not call runtime ports from review or expected-output use cases.

### 2.3 Contracts / Server / Client
- [x] Add `DatasetExpectedOutputV1Dto` if contract helpers need a named DTO.
- [x] Add `DatasetExampleReviewDto`.
- [x] Add `DatasetExampleEffectiveEligibilityDto`.
- [x] Add `UpdateDatasetExampleExpectedOutputRequestDto` validation around the v1 expected-output envelope.
- [x] Add `UpdateDatasetExampleReviewRequestDto`.
- [x] Add `DatasetExampleResponseDto` support for example detail if missing.
- [x] Add durable-chat-server parser for expected-output update requests.
- [x] Add durable-chat-server parser for review update requests.
- [x] Add durable-chat-server response helper that includes normalized review metadata and effective eligibility if appropriate.
- [x] Add durable-chat-client normalizer for expected output.
- [x] Add durable-chat-client normalizer for review metadata.
- [x] Add durable-chat-client normalizer for effective eligibility.
- [x] Add durable-chat-client API helper for `GET /api/datasets/:datasetId/examples/:exampleId`.
- [x] Add durable-chat-client API helper for review updates.
- [x] Keep contracts independent of playground feedback detail types.

## 3. Playground Validation Boundary

### 3.1 Routes / Services
- [ ] Add authenticated `GET /api/datasets/[datasetId]/examples/[exampleId]` route for detail reads without relying on list responses or selected run state.
- [ ] Tighten authenticated `PATCH /api/datasets/[datasetId]/examples/[exampleId]/expected-output` route around `DatasetExpectedOutputV1 | null`.
- [ ] Remove or stop accepting arbitrary `metadataJson` from the expected-output patch route.
- [ ] Add authenticated `PATCH /api/datasets/[datasetId]/examples/[exampleId]/review` route.
- [ ] Ensure review route uses `app.datasets.updateExampleReview`.
- [ ] Ensure all dataset review routes use shared app/service boundaries rather than duplicating metadata merge logic in Next routes.
- [ ] Ensure dataset access, not source-run access, controls snapshot review.
- [ ] Ensure source-run lineage links are optional and may resolve to unavailable.
- [ ] Ensure example detail does not require source-run access when dataset access is valid.
- [ ] Ensure inaccessible source lineage renders unavailable without leaking source-run existence outside actor boundary.
- [ ] Preserve playground auth and actor identity boundaries.
- [ ] Keep playground feedback sidecar details read-only display data in review UI.
- [ ] Do not parse playground feedback details in shared packages.

### 3.2 Dataset Review UI
- [ ] Add a dataset-centric management surface under `/observability/datasets`.
- [ ] Add `/observability/datasets/[datasetId]` or an equivalent dataset detail route.
- [ ] Add `/observability/datasets/[datasetId]/examples/[exampleId]` or an equivalent example detail route if separate detail pages are simpler.
- [ ] Ensure `/observability/datasets` does not require `threadId` or `runId` query params.
- [ ] Implement `/observability/datasets` with dedicated dataset-review runtime/state, not `useObservabilityConsole`.
- [ ] Show dataset list with name, visibility, created actor, created date, and updated date.
- [ ] Show dataset example list with source run id, source thread id, capture kind, review status, expected-output presence, and created date.
- [ ] Show effective eligibility state and reason in the example list.
- [ ] Add example detail view for `inputJson`.
- [ ] Add example detail view for `baselineOutputJson`.
- [ ] Add example detail view for `contextSnapshotJson`.
- [ ] Add example detail view for `toolInvocationsSnapshotJson`.
- [ ] Collapse tool invocation payloads by default.
- [ ] Show explicit omitted-by-policy state for tool invocation snapshots.
- [ ] Show shared run feedback snapshot as read-only context when present.
- [ ] Show playground feedback details as read-only host-local context when present.
- [ ] Add expected-output editor for the v1 assistant-text envelope.
- [ ] Support clearing expected output back to `null`.
- [ ] Add review status controls.
- [ ] Add eval eligibility override controls.
- [ ] Add exclusion reason controls when `status = 'excluded'` or `evalEligibility = 'exclude'`.
- [ ] Add reviewer note editor.
- [ ] Link back to `/observability?threadId=...&runId=...` when source lineage is available and accessible.
- [ ] Show source unavailable state without blocking snapshot review.
- [ ] Keep `/chat` unchanged.
- [ ] Keep `/observability` selected-run panel focused on run inspection and capture, not dataset review management.
- [ ] After capture success, optionally link to the captured example review page.
- [ ] Display effective eligibility returned by app/server/client helpers; do not recompute durable eligibility semantics in page-local UI code.
- [ ] Do not send `reviewedByActorId`, `reviewedAt`, protected metadata namespaces, or arbitrary `metadataJson` from the UI.
- [ ] Show tool snapshot safety copy near tool payload inspection and avoid copy/export/download actions for full tool payloads in v1.

### 3.3 UI Implementation Boundaries
- [ ] Create a dedicated feature layer for dataset review UI instead of burying logic in route pages.
- [ ] Keep pages as thin composition roots.
- [ ] Do not reuse chat transcript components if dataset snapshot shapes do not match chat DTO shapes cleanly.
- [ ] Add small snapshot rendering helpers that tolerate unknown JSON fields.
- [ ] Avoid filtering/search/analytics beyond simple local status display in v1.
- [ ] Avoid batch edit/review operations in v1.
- [ ] Avoid rich text expected-output editor in v1.

## 4. Tests

### 4.1 Source / Type Tests
- [x] Add tests for parsing valid `DatasetExpectedOutputV1`.
- [x] Add tests rejecting invalid expected-output shapes.
- [x] Add tests rejecting empty or whitespace-only expected-output text.
- [x] Add tests proving clearing expected output writes `null`.
- [x] Add tests tolerating legacy arbitrary stored `expectedOutputJson` during read normalization.
- [x] Add tests for defaulting missing review metadata.
- [x] Add tests for parsing valid review metadata.
- [x] Add tests for rejecting invalid review statuses, eligibility overrides, and exclusion reasons.
- [x] Add tests rejecting unknown review request keys.
- [x] Add tests rejecting protected review request namespaces: `capture`, `feedback`, `host`, `evaluation`, and full `metadataJson`.
- [x] Add tests rejecting request-supplied `reviewedByActorId` and `reviewedAt`.
- [x] Add tests for effective eligibility reason codes.
- [x] Add tests rejecting invalid review combinations: `excluded + include`, `approved + missing expected output`, and `include + missing expected output`.

### 4.2 App Tests
- [x] Add app tests for `getExample` dataset/app boundary checks.
- [x] Add app tests proving private dataset examples are not readable by another actor.
- [x] Add app tests proving app-visible dataset examples are readable by same-app actors.
- [x] Add app tests for updating expected output with a valid envelope.
- [x] Add app tests for clearing expected output.
- [x] Add app tests proving arbitrary expected-output JSON is rejected.
- [x] Add app tests for updating review metadata.
- [x] Add app tests proving review updates preserve `metadataJson.capture`.
- [x] Add app tests proving review updates preserve `metadataJson.feedback`.
- [x] Add app tests proving review updates preserve `metadataJson.host`.
- [x] Add app tests proving review updates preserve `metadataJson.schemaVersion`.
- [x] Add app tests proving review updates preserve `metadataJson.evaluation.defaultEligible`.
- [x] Add app tests proving review updates preserve unknown metadata namespaces.
- [x] Add app tests proving expected-output updates do not overwrite review metadata.
- [x] Add app tests proving source run access is not required to review captured snapshots.
- [x] Add app tests proving runtime ports are not called.

### 4.3 Contracts / Server / Client Tests
- [x] Add durable-chat-server parser tests for expected-output request payloads.
- [x] Add durable-chat-server parser tests for review request payloads.
- [x] Add durable-chat-server response helper tests for review/effective eligibility if helpers expose them.
- [x] Add durable-chat-client normalizer tests for expected output.
- [x] Add durable-chat-client normalizer tests for review metadata defaults.
- [ ] Add durable-chat-client API helper tests if the existing repo API test style supports them.

### 4.4 Playground Route Tests
- [ ] Add route tests for dataset example detail auth.
- [ ] Add route tests for dataset example detail app boundary.
- [ ] Add route tests proving dataset example detail does not call source-run loading when dataset access is valid.
- [ ] Add route tests for expected-output patch validation.
- [ ] Add route tests proving expected-output patch cannot overwrite metadata.
- [ ] Add route tests proving expected-output patch does not accept `metadataJson`, including `metadataJson: null`.
- [ ] Add route tests for review patch validation.
- [ ] Add route tests for review patch preserving capture/feedback/host metadata.
- [ ] Add route tests proving source run inaccessibility does not block captured snapshot reads when dataset access is valid.
- [ ] Add route tests proving inaccessible source lineage renders unavailable without source-run existence leakage.
- [ ] Add route tests proving private datasets remain private.
- [ ] Add route tests proving app-visible datasets work for same-app actors when allowed.

### 4.5 Playground UI Tests
- [ ] Add UI tests for opening dataset list.
- [ ] Add UI tests for selecting a dataset and seeing examples.
- [ ] Add UI tests for opening an example detail.
- [ ] Add UI tests for rendering input/baseline/context/tool snapshots.
- [ ] Add UI tests for collapsed tool payloads.
- [ ] Add UI tests for editing expected output.
- [ ] Add UI tests for clearing expected output.
- [ ] Add UI tests for review status changes.
- [ ] Add UI tests for effective eligibility display.
- [ ] Add UI tests for source unavailable state.
- [ ] Add UI tests proving dataset review uses `/observability/datasets` state without `threadId` or `runId`.
- [ ] Add UI tests proving `/chat` is not part of this workflow.

### 4.6 Targeted Verification
- [x] Run `pnpm --filter @agent-infra/app test` after app use-case slice.
- [x] Run `pnpm --filter @agent-infra/contracts typecheck` after contract slice if available.
- [x] Run `pnpm --filter @agent-infra/durable-chat-server test` after server helper slice.
- [x] Run `pnpm --filter @agent-infra/durable-chat-client test` after client helper slice.
- [ ] Run `pnpm --filter playground-next-web test` after playground route/UI slices.
- [ ] Run `pnpm --filter playground-next-web typecheck` after playground route/UI slices.
- [ ] Run broader workspace typecheck only if targeted checks leave cross-package uncertainty.

## 5. Recommended Execution Order

### Loop 0: Lock Review Semantics
- [x] Update `docs/source-of-truth/dataset-example-model.md` with expected-output v1 semantics.
- [x] Update `docs/source-of-truth/dataset-example-model.md` with review metadata v1 semantics.
- [x] Update `docs/source-of-truth/dataset-example-model.md` with effective eligibility rules.
- [x] Update `docs/source-of-truth/dataset-example-model.md` with source-run access vs dataset access review boundary.
- [x] Update `docs/source-of-truth/dataset-example-model.md` with review invariants, metadata merge guards, and expected-output legacy read behavior.
- [x] Update `docs/roadmap.md` with `Dataset Review and Expected Output Foundation v1` as the active next track.
- [x] Update this todo if source-of-truth decisions change before implementation starts.
- [x] Run no tests unless executable code changes.
- [x] Run `codex review` for this loop after targeted verification passes.
- [x] Commit Loop 0.

### Loop 1: App Types and Safe Metadata Helpers
- [x] Add app-layer expected-output, review metadata, and effective eligibility types.
- [x] Add expected-output parse/normalize helpers.
- [x] Add metadata parse/normalize helpers.
- [x] Add safe review metadata merge helper.
- [x] Add effective eligibility helper.
- [x] Add strict review request validation helper that rejects protected namespaces, unknown keys, and caller-supplied actor/time fields.
- [x] Add focused helper tests.
- [x] Run `pnpm --filter @agent-infra/app test`.
- [x] Run package typecheck for affected shared packages if needed.
- [x] Run `codex review` for this loop after targeted verification passes.
- [x] Commit Loop 1.

### Loop 2: App Dataset Review Use Cases
- [x] Add `app.datasets.getExample`.
- [x] Tighten `app.datasets.updateExampleExpectedOutput`.
- [x] Add `app.datasets.updateExampleReview`.
- [x] Ensure app use cases enforce dataset app, visibility, and actor boundaries.
- [x] Ensure app use cases do not require source-run access for snapshot review.
- [x] Ensure app use cases do not call runtime ports.
- [x] Add focused app tests for expected output, review metadata, metadata preservation, and access boundaries.
- [x] Run `pnpm --filter @agent-infra/app test`.
- [x] Run package typecheck for affected shared packages if needed.
- [x] Run `codex review` for this loop after targeted verification passes.
- [x] Commit Loop 2.

### Loop 3: Contracts, Server Helpers, and Client Helpers
- [x] Add or tighten dataset expected-output DTOs.
- [x] Add dataset review request/response DTOs.
- [x] Add server-side parsers and response helpers.
- [x] Add client-side normalizers and API helpers.
- [x] Add focused server/client tests.
- [x] Run `pnpm --filter @agent-infra/contracts typecheck`.
- [x] Run `pnpm --filter @agent-infra/durable-chat-server test`.
- [x] Run `pnpm --filter @agent-infra/durable-chat-client test`.
- [x] Run `codex review` for this loop after targeted verification passes.
- [x] Commit Loop 3.

### Loop 4: Playground Review Routes
- [ ] Add dataset example detail route.
- [ ] Tighten expected-output patch route.
- [ ] Add review patch route.
- [ ] Route all review logic through shared app use cases.
- [ ] Preserve playground auth and actor boundaries.
- [ ] Add route tests for auth, access, validation, metadata preservation, and source-unavailable review.
- [ ] Run targeted playground route tests.
- [ ] Run `pnpm --filter playground-next-web typecheck`.
- [ ] Run `codex review` for this loop after targeted verification passes.
- [ ] Commit Loop 4.

### Loop 5: Dataset Review UI
- [ ] Add `/observability/datasets` dataset review surface.
- [ ] Add dataset list and dataset detail/example list views.
- [ ] Add example detail view with snapshot inspectors.
- [ ] Add expected-output editor.
- [ ] Add review controls and effective eligibility display.
- [ ] Add lineage links back to source run when available.
- [ ] Add source unavailable display state.
- [ ] Add capture-success link to example review page if practical.
- [ ] Add focused UI tests.
- [ ] Run targeted playground UI tests.
- [ ] Run `pnpm --filter playground-next-web typecheck`.
- [ ] Run `codex review` for this loop after targeted verification passes.
- [ ] Commit Loop 5.

### Loop 6: Closeout
- [ ] Review source-of-truth docs and remove any parallel long-lived definitions from this todo.
- [ ] Ensure this track still does not include `EvalRun`, `EvalExampleResult`, runner, report, experiment, exporter, prompt hub, or LLM judge work.
- [ ] Run final targeted tests for all changed areas.
- [ ] Run `codex review` for this loop after targeted verification passes.
- [ ] Delete `docs/todolist.md` when every item is complete and stable facts have moved to source-of-truth docs.
- [ ] Commit Loop 6.
