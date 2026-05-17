# Run-to-Dataset Capture v1 Todo

## 0. Context and Boundary

### 0.1 Confirmed facts
- [x] Durable run/thread/message/tool invocation persistence already exists in shared packages.
- [x] `Run.triggerMessageId` already links a run back to the user message that triggered it.
- [x] `ToolInvocation` already stores structured `input`, `output`, `error`, status, and timing fields.
- [x] `Run.usage` already stores the versioned run-level usage summary foundation.
- [x] `RunFeedback.value = 'thumbs_up' | 'thumbs_down'` is already a shared durable run-level fact.
- [x] Playground thumbs-down reason tags and comment text are host-local sidecar data, not shared core runtime state.
- [x] `/observability` already provides a thread/run/timeline/trace validation surface for selected runs.
- [x] Trace span projection is a durable read-model foundation, not a deterministic replay log.
- [x] Dataset capture should preserve capture-time snapshots; source ids are lineage references, not the only source of truth.

### 0.2 Goals
- [x] Add shared `Dataset` and `DatasetExample` domain types and repository interfaces.
- [x] Add shared SQLite/Postgres persistence for datasets and dataset examples.
- [x] Add app-layer dataset use cases, including `captureExampleFromRun`.
- [x] Capture an existing run into a dataset example with source refs, input snapshot, baseline output snapshot, context snapshot, tool invocation snapshot, and metadata.
- [x] Allow `expectedOutputJson` to be `null` in v1 so examples can be captured before human annotation.
- [x] Expose minimal contracts/server/client helpers for dataset create/list/read/capture flows.
- [x] Add a minimal `/observability` capture path that validates the shared package capability.
- [x] Copy shared run feedback and playground feedback details into dataset example metadata only as a capture-time snapshot.
- [ ] Document that Dataset Capture v1 is not evaluation, replay, or experiment execution.

### 0.3 Non-goals
- [x] Do not implement an evaluation runner in this track.
- [x] Do not implement experiment comparison in this track.
- [x] Do not implement LLM-as-judge in this track.
- [x] Do not implement live replay in this track.
- [x] Do not implement frozen replay runtime in this track.
- [x] Do not add a generic span/message/tool annotation table in this track.
- [x] Do not promote playground thumbs-down reason/comment details into shared core feedback schema.
- [x] Do not add a prompt hub or prompt version manager in this track.
- [x] Do not add OTEL, LangSmith, or other exporter sinks in this track.
- [x] Do not add a cost analytics dashboard or `run_usage_records` ledger in this track.
- [x] Do not build a full dataset management product UI in this track.
- [x] Do not automatically batch-import all historical runs in this track.

## 1. Definitions First

### 1.1 Source of Truth
- [ ] Review `docs/source-of-truth/run-trace-usage-contract.md` and document that timeline/trace can provide source refs/context for dataset capture but are not replay logs.
- [ ] Review `docs/source-of-truth/answer-container-model.md` only for feedback boundary implications; do not move playground feedback details into shared runtime state.
- [ ] Review `docs/source-of-truth/content-node-model.md` for existing replay/content terminology so dataset snapshots do not conflict with UI replay concepts.
- [ ] Keep evolving dataset definitions in this todo until the model is implemented and stable enough to promote.
- [ ] Promote stable dataset/example semantics to a new `docs/source-of-truth/dataset-example-model.md` before final closeout.
- [ ] Ensure the final source-of-truth doc states that source refs are lineage and snapshots are the durable captured example content.
- [ ] Ensure the final source-of-truth doc states that v1 does not implement eval runner, live replay, frozen replay, or experiment comparison.

### 1.2 Data Model
- [x] Define `Dataset` with `id`, `appId`, `name`, `description`, `visibility`, `metadata`, `createdByActorId`, `createdAt`, and `updatedAt`.
- [x] Define `Dataset.visibility = 'private' | 'app'`, defaulting to `private` for playground-created datasets in v1.
- [x] Define `DatasetExample` with `id`, `datasetId`, nullable `sourceRunId`, nullable `sourceThreadId`, nullable `triggerMessageId`, `inputJson`, nullable `baselineOutputJson`, nullable `expectedOutputJson`, nullable `metadataJson`, nullable `contextSnapshotJson`, nullable `toolInvocationsSnapshotJson`, nullable `createdByActorId`, `createdAt`, and `updatedAt`.
- [x] Treat `datasetId` as the required owning relationship for examples.
- [x] Treat `sourceRunId`, `sourceThreadId`, and `triggerMessageId` as nullable indexed soft lineage refs rather than required truth sources.
- [x] Do not add foreign-key constraints for `sourceRunId`, `sourceThreadId`, or `triggerMessageId` in v1.
- [ ] Validate source run/thread/message existence and app boundary at capture time, not through long-lived source-ref FK constraints.
- [x] Keep `expectedOutputJson` nullable by default.
- [x] Store snapshot fields as structured JSON objects, not ad hoc strings.
- [x] Define `inputJson` v1 as an envelope with `schemaVersion: 1`, `kind: 'chat_turn'`, `contextSource: 'current_canonical_at_capture'`, `triggerMessageId`, `triggerMessage`, `messages`, optional `canonicalRunIds`, and optional `diagnostics`.
- [x] Capture canonical messages up to and including the trigger message in `inputJson.messages`.
- [x] Do not claim `inputJson` is the exact runtime prompt or deterministic replay input in v1.
- [x] Define `baselineOutputJson` v1 as a run output envelope with `schemaVersion: 1`, `runId`, assistant messages for the run, status, and error.
- [x] Define `contextSnapshotJson` v1 as a snapshot of thread/run attribution, provider/model, usage, timing, and optional trace diagnostics.
- [x] Define `toolInvocationsSnapshotJson` v1 as a snapshot of durable tool invocations for the source run.
- [x] Write a non-null empty `toolInvocationsSnapshotJson` envelope for capture-from-run when the source run has no tool invocations.
- [ ] Reserve `toolInvocationsSnapshotJson: null` for manual/import examples or host policy omission.
- [ ] Do not silently truncate tool invocation snapshot JSON in v1.
- [x] Allow hosts to explicitly omit tool invocation payloads by policy and represent the omission in the snapshot envelope.
- [ ] Defer redaction/transformation hooks for sensitive tool payloads; v1 either captures the snapshot or explicitly omits it.
- [x] Define `metadataJson` v1 as a generic envelope with `schemaVersion`, `capture`, optional `feedback`, optional `host`, and optional `evaluation` namespaces.
- [x] Store shared run feedback under `metadataJson.feedback.sharedRunFeedback`.
- [x] Store playground feedback details under `metadataJson.host.playground.runFeedbackDetails`.
- [x] Store capture classification under `metadataJson.capture.kind = 'normal_example' | 'failure_case' | 'debug_case'`.
- [x] Store future eval default inclusion under `metadataJson.evaluation.defaultEligible`.
- [x] Ensure playground feedback details, when copied, are not parsed by shared core/app code.

### 1.3 Types / Interfaces
- [x] Add `Dataset` and `DatasetExample` to `packages/core/src/types.ts`.
- [x] Add `DatasetRepository` and `DatasetExampleRepository` to `packages/core/src/repositories.ts`.
- [x] Add dataset repositories to `AgentInfraAppRepositories`.
- [x] Add dataset use-case inputs/results to `packages/app/src/types.ts`.
- [x] Add `app.datasets` namespace to `AgentInfraApp`.
- [x] Define `CreateDatasetInput`, `ListDatasetsInput`, `GetDatasetInput`, `ListDatasetExamplesInput`, `UpdateDatasetExampleExpectedOutputInput`, and `CaptureDatasetExampleFromRunInput`.
- [x] Include `appId` in dataset list/create boundaries so datasets remain app-scoped.
- [x] Include `visibility` in dataset create/list boundaries so private and app-visible datasets have explicit semantics.
- [x] Include optional `createdByActorId` / `capturedByActorId` without introducing a shared business `user_id` requirement.
- [x] Keep core dataset/example JSON fields generic, and define capture-generated snapshot envelope types in `packages/app`.
- [x] Define DTOs in `packages/contracts` for datasets, examples, create/list/read/capture requests, and responses.
- [x] Keep DTO JSON fields generic `Record<string, unknown>` and nullable where appropriate.
- [x] Add durable-chat-server DTO projector/helper functions for dataset and example responses.
- [x] Add durable-chat-client normalizers/fetch helpers for minimal dataset create/list/example/capture flows.

## 2. Backend / Platform

### 2.1 Shared Core
- [x] Add dataset/example domain types.
- [x] Add dataset/example repository interfaces.
- [x] Export new types and interfaces from the package entrypoint if needed.
- [x] Keep feedback details out of shared core dataset-specific types; only generic metadata is shared.

### 2.2 Shared DB
- [x] Add Postgres `datasets` table.
- [x] Add Postgres `dataset_examples` table.
- [x] Add SQLite/Turso `datasets` table.
- [x] Add SQLite/Turso `dataset_examples` table.
- [x] Add indexes for `datasets.app_id`, `dataset_examples.dataset_id`, `dataset_examples.source_run_id`, `dataset_examples.source_thread_id`, and `dataset_examples.trigger_message_id`.
- [x] Add a foreign key from `dataset_examples.dataset_id` to `datasets.id`.
- [x] Do not add foreign-key constraints from `dataset_examples.source_run_id`, `source_thread_id`, or `trigger_message_id` to source records in v1.
- [x] Add `DrizzleDatasetRepository` and `DrizzleDatasetExampleRepository`.
- [x] Add `SqliteDatasetRepository` and `SqliteDatasetExampleRepository`.
- [x] Add repositories to `createAgentInfraRepositories`.
- [x] Add repositories to `AgentInfraRepositoryBundle`.
- [x] Add bootstrap schema statements for SQLite/Turso.
- [x] Ensure schema bootstrapping remains idempotent.
- [x] Generate or update Drizzle migration artifacts if the repo workflow requires them for shared schema changes.

### 2.3 App Use Cases
- [x] Add `app.datasets.create`.
- [x] Add `app.datasets.list`.
- [x] Add `app.datasets.get`.
- [x] Add `app.datasets.listExamples`.
- [x] Keep repository-level example creation for capture internals without exposing a generic public `createExample` API in v1.
- [x] Add `app.datasets.updateExampleExpectedOutput`.
- [x] Add `app.datasets.captureExampleFromRun`.
- [x] In `captureExampleFromRun`, load the source run and source thread.
- [x] In `captureExampleFromRun`, reject capture when the requested dataset does not exist or is not in the same app boundary.
- [x] In `captureExampleFromRun`, allow completed, failed, and cancelled source runs to be captured.
- [x] In `captureExampleFromRun`, build `inputJson` from canonical messages up to and including `run.triggerMessageId`.
- [x] In `captureExampleFromRun`, build `baselineOutputJson` from assistant messages attached to the source run, or `null` when no assistant output exists.
- [x] In `captureExampleFromRun`, build `toolInvocationsSnapshotJson` from `toolRepo.listByRun(sourceRunId)`.
- [x] In `captureExampleFromRun`, support explicit tool invocation snapshot omission by policy.
- [x] In `captureExampleFromRun`, build `contextSnapshotJson` from thread/run attribution, provider/model, status, usage, error, timing, and optional trace diagnostics.
- [x] In `captureExampleFromRun`, classify completed examples with assistant output as `normal_example` and `evaluation.defaultEligible = true`.
- [x] In `captureExampleFromRun`, classify failed runs as `failure_case` and `evaluation.defaultEligible = false`.
- [x] In `captureExampleFromRun`, classify cancelled or outputless runs as `debug_case` and `evaluation.defaultEligible = false`.
- [x] In `captureExampleFromRun`, accept optional caller-supplied metadata and merge it under a capture metadata boundary without overriding required source refs.
- [x] In `captureExampleFromRun`, keep `expectedOutputJson` nullable unless explicitly provided.
- [x] Make capture persistence transactional where multiple writes are involved.
- [x] Do not call runtime ports from dataset capture use cases.

### 2.4 Contracts / Server / Client
- [x] Add `DatasetDto` and `DatasetExampleDto`.
- [x] Add dataset list/create/read response DTOs.
- [x] Add dataset example list/update-expected-output/capture response DTOs.
- [x] Add request DTOs for dataset creation and capture-from-run.
- [x] Add durable-chat-server projector functions for dataset/example DTOs.
- [x] Add durable-chat-server response builders and error response builders.
- [x] Add durable-chat-client schema normalizers for dataset/example DTOs.
- [x] Add durable-chat-client API helpers for `GET /api/datasets`, `POST /api/datasets`, `GET /api/datasets/:datasetId/examples`, and capture-from-run.
- [x] Keep contracts independent of playground feedback detail types.

## 3. Playground Validation Boundary

### 3.1 Routes / Services
- [x] Add authenticated `GET /api/datasets` route in `apps/playground-next-web`.
- [x] Add authenticated `POST /api/datasets` route.
- [x] Add authenticated `GET /api/datasets/[datasetId]/examples` route.
- [x] Add authenticated `POST /api/datasets/[datasetId]/examples/capture-run` route.
- [x] Add authenticated expected-output patch route only if needed by the minimal validation surface.
- [x] Ensure dataset routes use the shared app/service boundary rather than duplicating persistence logic in Next routes.
- [x] Ensure dataset routes preserve playground auth and thread/run access checks.
- [x] Ensure capture route rejects source runs inaccessible to the current playground user.
- [x] In the capture route, read shared run feedback for the current actor when available.
- [x] In the capture route, read playground feedback details sidecar for the current actor when available.
- [x] In the capture route, pass shared feedback under `metadataJson.feedback.sharedRunFeedback`.
- [x] In the capture route, pass playground feedback details under `metadataJson.host.playground.runFeedbackDetails`.
- [x] Avoid adding playground-only dataset tables unless a field is truly host-local.

### 3.2 Observability UI
- [ ] Add a minimal capture action for the selected run in `/observability`.
- [ ] Add a small dataset picker/create dialog for capture.
- [ ] Show source run id, status, provider/model, and selected dataset in the capture dialog.
- [ ] Show whether current actor feedback will be copied into metadata when available.
- [ ] Submit capture through the dataset capture API.
- [ ] Surface success with dataset/example id and keep the selected observability run unchanged.
- [ ] Surface route validation errors without breaking the observability page.
- [ ] Do not build a full dataset management UI in this track.
- [ ] Do not add heavy capture controls to `/chat` in v1; keep `/chat` as the immediate feedback surface.

### 3.3 Optional Minimal Dataset Read Surface
- [ ] Add only the minimal read surface needed to verify captured examples if API responses are not enough.
- [ ] If a `/datasets` page is added, keep it as a simple validation table, not a product dashboard.
- [ ] Avoid dataset filtering/search/analytics in v1.

## 4. Tests

### 4.1 DB Tests
- [x] Add repository tests for dataset create/get/list by app.
- [x] Add repository tests for dataset example create/get/list/update expected output.
- [x] Add JSON snapshot roundtrip tests for input, baseline output, expected output, context, metadata, and tool invocation snapshots.
- [x] Add tests for nullable source refs.
- [x] Add tests proving source refs can point to missing source run/thread/message ids.
- [x] Add tests proving source refs are indexed soft refs and examples do not require source FK constraints.
- [x] Add bootstrap/idempotency coverage for SQLite/Turso statements where practical.

### 4.2 App Tests
- [x] Add app tests for creating and listing datasets.
- [x] Add app tests for repository-level example creation through capture internals without exposing public manual example creation.
- [x] Add app tests for capturing a completed run.
- [x] Add app tests for capturing a failed run.
- [x] Add app tests for capturing a cancelled run if cancelled run fixtures are available.
- [x] Add app tests proving `inputJson` contains canonical messages up to the trigger message.
- [x] Add app tests proving `inputJson.triggerMessage` is present when the run has a trigger message.
- [x] Add app tests proving `inputJson.contextSource` is `current_canonical_at_capture`.
- [x] Add app tests proving dual-answer capture excludes unselected prior/candidate outputs from `inputJson.messages`.
- [x] Add app tests proving `baselineOutputJson` contains assistant messages for the source run.
- [x] Add app tests proving `baselineOutputJson` can be `null` for a failed run with no assistant output.
- [x] Add app tests proving `toolInvocationsSnapshotJson` captures durable tool invocation input/output/error.
- [x] Add app tests proving `toolInvocationsSnapshotJson` writes an empty envelope for no-tool runs.
- [x] Add app tests proving tool invocation snapshots can be omitted by policy.
- [x] Add app tests proving `contextSnapshotJson` captures provider/model/status/usage/timing/error.
- [x] Add app tests proving failed/cancelled captures set `metadataJson.capture.kind` and `metadataJson.evaluation.defaultEligible`.
- [x] Add app tests proving capture rejects missing run.
- [x] Add app tests proving capture rejects dataset/run app boundary mismatch.

### 4.3 Contracts / Server / Client Tests
- [x] Add contracts compile coverage for dataset/example DTOs.
- [x] Add durable-chat-server DTO projector tests.
- [x] Add durable-chat-server route-helper response/error tests.
- [x] Add durable-chat-client normalizer tests for full and nullable dataset example payloads.
- [x] Add durable-chat-client API helper tests if the existing repo API test style supports them.

### 4.4 Playground Tests
- [x] Add route tests for dataset list/create auth.
- [x] Add route tests for capture-from-run auth and access control.
- [x] Add route tests for capture copying shared feedback value into metadata.
- [x] Add route tests for capture copying playground sidecar feedback details into metadata.
- [x] Add route tests proving playground sidecar details are stored under `metadataJson.host.playground`.
- [x] Add route tests proving inaccessible source runs cannot be captured.
- [x] Add route tests proving private datasets are not listable or capturable by another actor.
- [x] Add route tests proving app-visible datasets can be used by same-app actors when allowed.
- [ ] Add observability UI/runtime tests for opening capture dialog.
- [ ] Add observability UI/runtime tests for selecting or creating a dataset.
- [ ] Add observability UI/runtime tests for successful capture submission.
- [ ] Add observability UI/runtime tests for capture error state.

### 4.5 Targeted Verification
- [x] Run `pnpm --filter @agent-infra/db test` after DB slice.
- [x] Run `pnpm --filter @agent-infra/app test` after app slice.
- [x] Run `pnpm --filter @agent-infra/contracts typecheck` after contracts slice if available.
- [x] Run `pnpm --filter @agent-infra/durable-chat-server test` after server helper slice.
- [x] Run `pnpm --filter @agent-infra/durable-chat-client test` after client helper slice.
- [x] Run `pnpm --filter playground-next-web test` after playground route/UI slice.
- [x] Run `pnpm --filter playground-next-web typecheck` after playground route/UI slice.
- [x] Confirm broader package typecheck is not needed when targeted verification leaves no cross-package uncertainty.

## 5. Recommended Execution Order

### Loop 0: Lock Dataset Capture Semantics
- [x] Confirm track name as `Run-to-Dataset Capture v1`.
- [x] Lock `inputJson` as capture-time canonical context with `triggerMessage` and `contextSource`.
- [x] Lock completed, failed, and cancelled runs as capturable, with metadata classification and default eval eligibility.
- [x] Lock `sourceRunId`, `sourceThreadId`, and `triggerMessageId` as indexed soft lineage refs with no FK constraints in v1.
- [x] Rename `toolOutputsSnapshotJson` to `toolInvocationsSnapshotJson`.
- [x] Lock tool invocation snapshot policy: no silent truncation, explicit omit allowed, redaction hooks deferred.
- [x] Lock playground feedback details under `metadataJson.host.playground.runFeedbackDetails`.
- [x] Lock shared feedback under `metadataJson.feedback.sharedRunFeedback`.
- [x] Lock `Dataset.visibility = 'private' | 'app'`, defaulting to `private` for playground v1.
- [x] Lock public v1 app/contract method set: no generic manual `createExample`; expose capture and expected-output patch only.
- [x] Lock app-level snapshot envelope types while keeping core/contract JSON fields generic.
- [x] Update this todo if any of those assumptions change before implementation.
- [x] Run no tests unless executable code changes.
- [x] Commit Loop 0 if this todo is materially changed before implementation starts.

### Loop 1a: Shared Dataset Model and Interfaces
- [x] Implement shared `Dataset` and `DatasetExample` types.
- [x] Implement shared repository interfaces.
- [x] Define app-level snapshot envelope types.
- [x] Run package typecheck for affected shared packages if needed.
- [x] Run `codex review` for this loop after targeted verification passes.
- [x] Commit Loop 1a.

### Loop 1b: Shared Dataset DB
- [x] Implement Postgres and SQLite/Turso schema definitions.
- [x] Implement Postgres and SQLite/Turso repositories.
- [x] Wire dataset repositories into repository bundle creation and transactions.
- [x] Add DB repository and JSON roundtrip tests.
- [x] Run targeted DB tests.
- [x] Run package typecheck for affected shared packages if needed.
- [x] Run `codex review` for this loop after targeted verification passes.
- [x] Commit Loop 1b.

### Loop 2: App Dataset Use Cases
- [x] Add dataset use-case types to `packages/app`.
- [x] Add `app.datasets` namespace.
- [x] Implement create/list/get/listExamples/updateExampleExpectedOutput.
- [x] Implement `captureExampleFromRun`.
- [x] Build snapshot helpers for messages, baseline output, context, tool invocations, and metadata.
- [x] Add app tests for dataset create/list, expected-output patching, and capture-from-run.
- [x] Run targeted app tests.
- [x] Run package typecheck for affected shared packages if needed.
- [x] Run `codex review` for this loop after targeted verification passes.
- [x] Commit Loop 2.

### Loop 3: Contracts, Server Helpers, and Client Helpers
- [x] Add dataset/example DTOs and request/response contracts.
- [x] Add durable-chat-server projector and response helper functions.
- [x] Add durable-chat-client normalizers.
- [x] Add durable-chat-client fetch helpers.
- [x] Add focused server/client tests.
- [x] Run targeted server/client tests.
- [x] Run package typecheck for affected packages if needed.
- [x] Run `codex review` for this loop after targeted verification passes.
- [x] Commit Loop 3.

### Loop 4: Playground Routes and Feedback Metadata Bridge
- [x] Add Next dataset list/create routes.
- [x] Add Next dataset example list route.
- [x] Add Next capture-from-run route.
- [x] Use existing playground auth and accessible-thread/run checks.
- [x] Read current actor shared run feedback during capture when available.
- [x] Read playground feedback sidecar details during capture when available.
- [x] Pass feedback data into capture metadata under the agreed `feedback` and `host.playground` namespaces.
- [x] Add route/service tests for auth, access, successful capture, and metadata bridging.
- [x] Run targeted playground route tests.
- [x] Run `pnpm --filter playground-next-web typecheck`.
- [x] Run `codex review` for this loop after targeted verification passes.
- [x] Commit Loop 4.

### Loop 5: Observability Capture UI
- [ ] Add minimal capture action to selected run content in `/observability`.
- [ ] Add dataset picker/create dialog.
- [ ] Wire dialog to dataset list/create/capture APIs.
- [ ] Add loading, success, and error states.
- [ ] Keep UI compact and management-oriented; do not build a full dataset dashboard.
- [ ] Add focused UI/runtime tests where practical.
- [ ] Run targeted playground UI tests.
- [ ] Run `pnpm --filter playground-next-web typecheck`.
- [ ] Run `codex review` for this loop after targeted verification passes.
- [ ] Commit Loop 5.

### Loop 6: Source-of-Truth Promotion and Closeout
- [ ] Promote stable dataset/example semantics into `docs/source-of-truth/dataset-example-model.md`.
- [ ] Update `docs/source-of-truth/run-trace-usage-contract.md` with dataset capture source-ref/replay boundary notes.
- [ ] Update `docs/roadmap.md` with completed Dataset Capture v1 foundation and deferred eval/replay/experiment work.
- [ ] Remove parallel long-lived definitions from this todo or reduce them to completed execution notes.
- [ ] Run final targeted tests for all changed areas.
- [ ] Run `codex review` for this loop after targeted verification passes.
- [ ] Delete `docs/todolist.md` when every item is complete and stable facts have moved to source-of-truth docs.
- [ ] Commit Loop 6.
