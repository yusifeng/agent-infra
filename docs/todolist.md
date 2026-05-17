# Playground Run Feedback Details Todo

## 0. Context and Boundary

### 0.1 Confirmed facts
- [x] `RunFeedback.value = 'thumbs_up' | 'thumbs_down'` is already a shared run-level durable fact.
- [x] Existing normal single-answer runs should continue to support thumbs up / thumbs down.
- [x] Dual-answer candidates and normal answer containers should use the same feedback affordance; feedback is independent from whether an answer is a candidate.
- [x] Clicking inactive thumbs down should open a feedback dialog first, not immediately call the set-feedback API.
- [x] The feedback dialog can submit with no selected tags and no text.
- [x] Feedback text is optional and capped at 1000 characters.
- [x] Canceling the feedback dialog should not write any feedback value or feedback details.
- [x] Clicking active thumbs down again should directly clear feedback and delete any stored thumbs-down details.
- [x] Switching from thumbs down to thumbs up should keep the core feedback value as thumbs up and delete any stored thumbs-down details.
- [x] Stored reason tags must be stable codes, not localized UI labels.
- [x] `thread pinned` is implemented as a playground sidecar/catalog table instead of a core `Thread` field.
- [x] Run feedback detail should follow the same sidecar principle: core stores the durable value, playground stores product-specific reason details.
- [x] The existing shared `app.turns.setRunFeedback` and `clearRunFeedback` use the app's configured repositories; wrapping those singleton calls from playground code does not automatically make sidecar writes part of the same transaction.

### 0.2 Goals
- [ ] Add playground-owned run feedback detail persistence without adding `reasonTags` or `commentText` to `packages/core`.
- [ ] Keep shared contracts focused on generic `RunFeedbackDto` unless a consumer-independent detail contract becomes necessary later.
- [ ] Add a thumbs-down dialog in `/chat` that collects optional reason tags and optional comment text.
- [ ] Persist thumbs-down details transactionally with the shared run feedback value.
- [ ] Clear playground feedback details whenever the current feedback is cleared or changed away from thumbs down.
- [ ] Preserve the existing feedback UI placement inside answer operation/actions.
- [ ] Add focused tests around sidecar schema, validation, route/service behavior, and runtime dialog behavior.

### 0.3 Non-goals
- [x] Do not add `reasonTags`, `commentText`, or localized labels to `packages/core`.
- [x] Do not add playground-specific feedback detail fields to `packages/contracts` in v1.
- [x] Do not make feedback details drive runtime, canonical transcript, answer selection, replay, or share behavior.
- [x] Do not implement editing or hydration of previously submitted thumbs-down details in the dialog.
- [x] Do not build analytics, export, model training, moderation workflows, or an admin UI in this slice.
- [x] Do not redesign the existing shared `run_feedback` table except where required by already-existing shared feedback behavior.
- [x] Do not make dual-answer selection imply thumbs up / thumbs down.
- [x] Do not extend `packages/durable-chat-server` or `packages/durable-chat-client` with playground feedback detail parsing or DTOs in v1.
- [x] Do not implement this feature for `apps/playground-vite-web` or `apps/playground-fastify-server` in v1; if another host needs details later, it should use its own host-local sidecar unless the capability becomes shared product surface.

## 1. Definitions First

### 1.1 Source of Truth
- [ ] Review `docs/source-of-truth/answer-container-model.md` and update only the feedback/action boundary if it currently implies candidate-only feedback.
- [ ] Avoid creating a new source-of-truth doc for playground feedback details unless the model becomes long-lived beyond this implementation todo.
- [ ] Document in the relevant source-of-truth note that product-specific feedback details are playground sidecar data, not core runtime state.

### 1.2 Playground Feedback Detail Model
- [x] Route-local request shape is `value` plus optional `details`, where `details` is allowed only for `value: 'thumbs_down'`.
- [ ] Define `PlaygroundRunFeedbackReasonTag` with stable codes: `harmful_or_unsafe`, `false_or_misleading`, `not_helpful`, `other`.
- [ ] Define `PlaygroundRunFeedbackDetails` as `{ reasonTags: PlaygroundRunFeedbackReasonTag[]; commentText: string | null }`.
- [ ] Define tag label mapping in the UI layer so stored codes remain independent from Chinese or English copy.
- [ ] Trim comment text before save.
- [ ] Normalize empty comment text to `null`.
- [ ] Reject comment text over 1000 characters.
- [ ] Reject unknown reason tag codes.
- [ ] Deduplicate reason tags and store them in a stable canonical order: `harmful_or_unsafe`, `false_or_misleading`, `not_helpful`, `other`.
- [ ] Allow empty `reasonTags` and `commentText: null` for thumbs-down submissions.
- [ ] Reject `details` on `value: 'thumbs_up'` requests with a 400-style route error instead of silently ignoring malformed client intent.

### 1.3 Data Model
- [ ] Add playground sidecar table `playground_run_feedback_details`.
- [ ] Include `thread_id`, `run_id`, `feedback_actor_id`, `reason_tags_json`, `comment_text`, `created_at`, and `updated_at`.
- [ ] Add a unique constraint on `(run_id, feedback_actor_id)`.
- [ ] Add an index on `(thread_id, run_id)` if route hydration or cleanup needs it.
- [x] Sidecar foreign-key strategy: reference `threads(id)` and `runs(id)` where the host DB supports them; do not reference `run_feedback` because thumbs-down to thumbs-up updates the feedback row instead of deleting it.
- [ ] Do not rely only on cascade behavior for cleanup because switching thumbs down to thumbs up updates the shared feedback row instead of deleting it.
- [ ] Implement both SQLite and PostgreSQL table definitions for the playground sidecar.
- [ ] Add bootstrap statements for local SQLite/Turso/Postgres playground environments.
- [ ] Do not add this table to `packages/db` shared schema unless the feature becomes package-level.

### 1.4 Service Semantics
- [ ] Submit thumbs down: validate details, set shared run feedback to `thumbs_down`, and upsert playground detail in one transaction using transaction-bound repositories.
- [ ] Submit thumbs up: set shared run feedback to `thumbs_up` and delete any playground detail for the same `(runId, feedbackActorId)` in one transaction using transaction-bound repositories.
- [ ] Clear feedback: clear shared run feedback and delete any playground detail for the same `(runId, feedbackActorId)` in one transaction using transaction-bound repositories.
- [ ] Implement the transaction by using `withDbTransaction` or an equivalent mechanism that creates both shared repos and the sidecar repo against the same `tx`.
- [ ] Do not call the singleton `services.app.turns.setRunFeedback` / `clearRunFeedback` from inside the playground transaction unless the app instance is constructed with transaction-bound repositories.
- [ ] Dialog cancel: perform no API call and no optimistic feedback mutation.
- [ ] Existing feedback rows without playground detail are valid and must continue to hydrate normally.

## 2. Backend / Platform

### 2.1 Shared Packages
- [ ] Keep `packages/core` unchanged for feedback details.
- [ ] Keep `packages/contracts` unchanged for feedback details unless route shape forces a generic transport update.
- [ ] Keep `packages/app` feedback validation centered on run ownership and assistant-output eligibility.
- [ ] Do not add shared `details_json` to `run_feedback` in this version.
- [ ] Do not change `SetRunFeedbackRequestDto`; the thumbs-down detail payload is a Next/playground route-local request shape.
- [ ] Do not add detail normalization to shared durable-chat server/client helpers.

### 2.2 Playground Sidecar Repo / Schema
- [ ] Add playground schema file for `playground_run_feedback_details`.
- [ ] Add repository methods: `upsert`, `deleteByRunAndActor`, and optionally `findByRunAndActor` for tests.
- [ ] Add a bootstrap function and call it from `apps/playground-next-web/scripts/bootstrap-db.ts` or the existing playground service bootstrap path.
- [ ] Ensure sidecar bootstrap is idempotent and handles existing local databases.
- [ ] Ensure relevant tests bootstrap the sidecar explicitly instead of assuming shared durable service bootstrap prepares app-owned tables.
- [ ] Add focused tests for sidecar repository create/update/delete behavior.

### 2.3 Playground Route / Service
- [ ] Add a small playground feedback service that coordinates shared `app.turns.setRunFeedback` / `clearRunFeedback` with sidecar detail writes.
- [ ] Ensure the playground feedback service uses transaction-bound shared repositories, not the singleton shared app instance, when it must coordinate sidecar writes atomically.
- [ ] Update `POST /api/threads/[threadId]/runs/[runId]/feedback` to accept optional playground detail payload only for `thumbs_down`.
- [ ] Parse and validate the detail payload in app-local playground code, while keeping the response compatible with shared `RunFeedbackResponseDto`.
- [ ] Ensure `POST` with `value: 'thumbs_up'` clears sidecar detail.
- [ ] Ensure `POST` with `value: 'thumbs_up'` and any detail payload is rejected.
- [ ] Ensure `POST` with `value: 'thumbs_down'` stores normalized sidecar detail.
- [ ] Ensure `DELETE` clears both shared feedback and sidecar detail.
- [ ] Preserve existing auth and accessible-thread checks.
- [ ] Keep response compatible with the existing `RunFeedbackResponseDto`; do not require detail hydration in v1.

## 3. Frontend Boundary

### 3.1 API / Schema
- [ ] Add playground-side request typing for thumbs-down details in `apps/playground-next-web`.
- [ ] Update the chat API helper so `setRunFeedback` can send optional thumbs-down details.
- [ ] Do not expose playground detail types from shared durable-chat-client packages.

### 3.2 Runtime
- [ ] Change inactive thumbs-down click to open a dialog instead of immediately calling `setRunFeedback`.
- [ ] Keep active thumbs-down click as direct clear feedback.
- [ ] Keep thumbs-up click as direct submit and ensure it clears any pending thumbs-down dialog state.
- [ ] Track pending feedback run id so the clicked answer operation can show busy/disabled state while submitting.
- [ ] Ensure dialog cancel resets local dialog state without API calls.
- [ ] Ensure dialog submit calls the API once with normalized details.

### 3.3 UI
- [ ] Add a shadcn dialog for thumbs-down feedback in the chat UI.
- [ ] Add four tag pills with labels: `有害/不安全`, `虚假信息`, `没有帮助`, `其他`.
- [ ] Store selected tag codes, not labels.
- [ ] Add textarea placeholder copy for optional feedback.
- [ ] Add cancel and submit actions.
- [ ] Disable or surface validation when text exceeds 1000 characters.
- [ ] Preserve the existing filled active thumbs up / thumbs down icon styling.

## 4. Tests

### 4.1 Backend Tests
- [ ] Add playground detail parser/normalizer tests for valid empty detail, valid tags, unknown tag rejection, trimming, and 1000-character limit.
- [ ] Add parser/normalizer tests for duplicate tag dedupe, canonical tag ordering, trim-to-null text, 1000-character acceptance, and 1001-character rejection.
- [ ] Add sidecar repo tests for upsert, replacement, and delete.
- [ ] Add sidecar bootstrap tests or SQL assertion tests for idempotent SQLite and Postgres/Turso statement coverage where practical.
- [ ] Add route/service tests for thumbs-down submit writing shared feedback and sidecar detail.
- [ ] Add route/service tests for thumbs-up clearing sidecar detail.
- [ ] Add route/service tests for thumbs-up with details being rejected.
- [ ] Add route/service tests for DELETE clearing sidecar detail.
- [ ] Add transaction rollback tests proving sidecar write failure does not leave shared feedback behind and shared feedback failure does not leave sidecar detail behind.

### 4.2 Frontend Tests
- [ ] Add runtime/controller tests proving inactive thumbs-down opens the dialog and does not call the API.
- [ ] Add runtime/controller tests proving submit calls the API with reason tag codes and normalized comment text.
- [ ] Add runtime/controller tests proving active thumbs-down clears directly.
- [ ] Add runtime/controller tests proving thumbs-up submits directly and clears pending dialog state.
- [ ] Add runtime/controller tests proving dialog cancel performs no API call.
- [ ] Add UI smoke or component tests if the existing test setup can cover the dialog without excessive harness work.

### 4.3 Targeted Verification
- [ ] Run `pnpm --filter playground-next-web test`.
- [ ] Run `pnpm --filter playground-next-web typecheck`.
- [ ] Run targeted package tests if shared feedback code is touched.

## 5. Recommended Execution Order

### Loop 0: Lock Implementation Semantics
- [x] Lock route-local request shape for thumbs-down details without changing shared contracts.
- [x] Lock normalizer behavior for tag dedupe, canonical order, text trimming, and length validation.
- [x] Lock transaction implementation strategy using transaction-bound shared repos plus sidecar repo.
- [x] Lock sidecar foreign-key and cleanup strategy.
- [x] Run no tests unless this loop changes executable code.
- [x] Commit Loop 0 if this todo is materially changed before implementation starts.

### Loop 1: Sidecar Schema, Parser, and Service
- [ ] Implement playground feedback detail types, parser/normalizer, schema, repo, and bootstrap.
- [ ] Implement the playground service that coordinates shared run feedback with sidecar writes.
- [ ] Ensure the service uses transaction-bound repositories for shared feedback and sidecar detail writes.
- [ ] Add backend parser/repo/service tests.
- [ ] Add transaction rollback tests for shared feedback and sidecar consistency.
- [ ] Run targeted playground backend tests.
- [ ] Run `pnpm --filter playground-next-web typecheck`.
- [ ] Run `codex review` for this loop after targeted verification passes.
- [ ] Commit Loop 1.

### Loop 2: Route and API Wiring
- [ ] Update the run feedback route to accept thumbs-down details and clear sidecar details on thumbs-up/delete.
- [ ] Update playground chat API helper request typing.
- [ ] Add or update route tests.
- [ ] Run targeted route tests.
- [ ] Run `pnpm --filter playground-next-web typecheck`.
- [ ] Run `codex review` for this loop after targeted verification passes.
- [ ] Commit Loop 2.

### Loop 3: Dialog Runtime and UI
- [ ] Add runtime state and handlers for the thumbs-down dialog.
- [ ] Add the shadcn feedback dialog UI.
- [ ] Wire inactive thumbs-down, active thumbs-down, thumbs-up, cancel, and submit behavior.
- [ ] Add runtime/UI tests where practical.
- [ ] Run `pnpm --filter playground-next-web test`.
- [ ] Run `pnpm --filter playground-next-web typecheck`.
- [ ] Run `codex review` for this loop after targeted verification passes.
- [ ] Commit Loop 3.

### Loop 4: Docs and Final Verification
- [ ] Update source-of-truth docs only for stable feedback boundary facts.
- [ ] Run final targeted tests for all changed areas.
- [ ] Run `codex review` for this loop after targeted verification passes.
- [ ] Delete `docs/todolist.md` only after all implementation items are complete and stable facts have been promoted or documented.
- [ ] Commit final docs/cleanup.
