# Run Trace & Usage Contract v1 Todo

## 0. Context and Boundary

### 0.1 Confirmed facts

- [x] The next infra direction has been discussed from local code/docs and a repomix/WebGPT static review.
- [x] The selected mainline is `Run Trace & Usage Contract v1`, not a general billing product.
- [x] `packages/core` already has durable `Thread`, `Run`, `Message`, `MessagePart`, `ToolInvocation`, and `RunEvent` domain records.
- [x] `Run.usage` currently exists as `Record<string, unknown> | null`.
- [x] `packages/db` currently stores run usage in `runs.usage_json`.
- [x] `run_events` currently use append-only `type + payload_json + seq`.
- [x] `runtime-pi` currently writes a terminal usage summary at `agent_end`.
- [x] `runtime-pi` currently does not persist assistant `message_update` as a `run_event`.
- [x] `docs/runtime-observability.md` currently says `message_update` is persisted into `run_events`, so docs and implementation need alignment.
- [x] Playground auth and ownership are host-local concerns.
- [x] Shared packages must not introduce a generic `User` or make `threads.userId` the playground owner source.
- [x] Playground should remain a validation surface, not the product boundary.

### 0.2 Goals

- [x] Define a stable v1 contract for run trace and usage semantics before adding new UI or billing-like features.
- [x] Make run usage shape versioned, parseable, and test-covered while preserving current durable run behavior.
- [x] Define the boundary between raw `run_events` and typed timeline/read projections.
- [x] Resolve the `message_update` durable trace discrepancy explicitly in code and docs.
- [x] Keep token/usage attribution at durable `run/thread/app` level in shared infra, with `appId` resolved outside `runtime-pi`.
- [x] Leave host user attribution to consumer hosts such as `playground-fastify-server`.
- [ ] Create a foundation that later supports one-row-per-run usage records, server-side cancel, replay/eval fixtures, and adapter contract hardening.

### 0.3 Non-goals

- [x] Do not build billing, invoices, credits, quota, payments, subscription plans, or budget enforcement in this slice.
- [x] Do not add shared `User`, auth, session, account, tenant, or organization models.
- [x] Do not make `threads.userId` the ownership source for playground auth.
- [x] Do not add a full replay engine or deterministic rerun support.
- [x] Do not add provider-level stream resume.
- [x] Do not persist every token or stream delta into SQL unless this is explicitly re-decided.
- [x] Do not add server-side cancel in the first slice; keep it as a follow-up that depends on trace/usage semantics.
- [x] Do not introduce artifact/file lifecycle work in this todo.
- [x] Do not turn playground usage display into a product dashboard.
- [x] Do not remove raw `run_events` payloads when adding typed projections.

## 1. Definitions First

### 1.1 Source-of-truth impact

- [x] Treat this todo as the working definition area until the model stabilizes.
- [ ] Promote only stable, cross-layer facts into `docs/source-of-truth/run-trace-usage-contract.md`; keep unresolved alternatives in this todo until decided.
- [x] Update `docs/runtime-observability.md` to match the chosen `message_update` durable/live boundary.
- [ ] Update `docs/roadmap.md` only after the first slice confirms the selected v1 track.
- [ ] Do not duplicate unresolved todo definitions in source-of-truth docs; source-of-truth docs should contain decisions, not alternatives.

### 1.2 Trace semantics

- [x] Treat assistant `message_update` as live-only for this first v1 slice.
- [x] Update observability docs to say assistant `message_update` is not a durable `run_event` in this slice.
- [x] Record summarized durable assistant checkpoints as a deferred option requiring exact payload, checkpoint cadence, and event volume constraints.
- [x] Preserve raw `run_events` as append-only process facts.
- [x] Define typed timeline projection as a read model over durable `run`, `run_events`, and `tool_invocations`, not as a replacement for raw events.
- [x] Define how unknown event types and payload fields are preserved and surfaced.
- [x] Define terminal trace expectations for `completed` and `failed` runs now, and reserve `cancelled` semantics for the follow-up cancel slice.

### 1.3 Usage summary model

- [x] Define `RunUsageSummaryV1` as the first stable usage summary shape.
- [x] Include `schemaVersion: 1`.
- [x] Include `provider` and `model` fields or define why they remain only on `Run`.
- [x] Include normalized token fields for input, output, cache read, cache write, and total tokens without defaulting unknown values to zero.
- [x] Include reasoning tokens as optional now if provider raw usage exposes them; otherwise leave absent.
- [x] Define optional estimated cost fields as best-effort estimates only; omit normalized cost if pricing source/version is unavailable.
- [x] Include pricing source/version only if cost estimates are emitted.
- [x] Preserve raw provider usage in `RunUsageSummaryV1.rawProviderUsage` when available.
- [x] Do not defer raw usage preservation to future usage records.
- [x] Include `normalizationStatus: complete | partial | missing | malformed`.
- [x] Define whether `Run.usage` is `null` only when provider usage is entirely absent, or whether missing usage is represented as a versioned summary with `normalizationStatus: missing`.
- [x] Define behavior when provider usage is missing or malformed.
- [x] Ensure usage summary failure never changes an otherwise truthful terminal run status.

### 1.4 Attribution model

- [x] Define shared attribution in terms of `runId`, `threadId`, and `appId`.
- [x] Default decision: `runtime-pi` does not resolve or write `appId`.
- [x] For Loop 2, do not require `appId` inside `RunUsageSummaryV1`.
- [x] For typed timeline/accounting reads, resolve `appId` at app/read boundary from `run.threadId -> thread.appId` when needed.
- [x] For future usage records, define `appId` resolution at app/service or repository boundary, not in the runtime adapter.
- [x] Keep host user attribution outside shared packages.
- [x] Document that playground can aggregate by joining `playground_thread_catalog.owner_user_id -> thread_id -> runs`.
- [x] Do not add shared user-level usage APIs in this todo.

### 1.5 Follow-up boundaries

- [x] Record `run_usage_records` or ledger table as a follow-up after summary and typed trace semantics are stable.
- [x] Prefer a one-row-per-run usage record first only after queryable aggregation by app/thread/run becomes a demonstrated need.
- [x] Defer metric-per-row ledger design until multiple usage-producing events per run, post-run adjustments, or immutable accounting history are real requirements.
- [x] Record server-side cancel as a follow-up that depends on terminal trace and partial usage semantics.

## 2. Backend / Platform

### 2.1 `packages/core`

- [x] Add or expose `RunUsageSummaryV1` type.
- [x] Do not put the timeline projector in core for Loop 1.
- [x] Add only the shared usage summary type needed by `Run.usage`.
- [x] Keep `Run.usage` backward-compatible enough for existing consumers.
- [x] Keep `RunEvent.payload` raw and flexible.
- [x] Do not add user/auth/account domain types.

### 2.2 `packages/runtime-pi`

- [x] Replace the current unversioned usage summary with `RunUsageSummaryV1`.
- [x] Preserve current terminal run update behavior at `agent_end`.
- [x] Ensure missing provider usage follows the chosen missing-usage contract without fabricating zero-token usage.
- [x] Ensure malformed usage does not throw after the run has otherwise completed.
- [x] Keep assistant `message_update` live-only in this slice and preserve current attach-stream live behavior.
- [x] Keep live assistant stream behavior compatible with attach-stream semantics.
- [x] Keep `runtime_error` durable failure writes intact.

### 2.3 `packages/app`

- [x] Build typed timeline projection in `packages/app`, either directly in `runs.getTimeline` or in a pure helper used by it.
- [x] Keep raw `runEvents` and `toolInvocations` available alongside the typed projection.
- [x] Ensure each typed timeline item can reference its source raw event or tool invocation when applicable.
- [x] Keep `runs.getTimeline` durable-first and independent from SSE/live stream state.
- [x] Ensure completed, failed, and future cancelled runs can all be represented by the typed timeline projection.
- [x] Do not add usage aggregation or user-scoped APIs in Loop 1.

### 2.4 `packages/contracts`

- [x] Export a `RunUsageDto` that accepts `RunUsageSummaryV1` while preserving backward-compatible unknown usage objects.
- [x] Add typed timeline DTOs only after app-level projection shape is fixed.
- [x] Preserve raw run events in timeline responses.
- [x] Ensure unknown raw payload fields continue to round-trip safely.

### 2.5 `packages/durable-chat-server`

- [x] Serialize versioned `Run.usage` without losing fields.
- [x] Extend timeline response builders only after app-level typed projection and contracts DTOs are defined.
- [x] Do not implement projection semantics in route helper code.
- [x] Keep protected route access checks host-owned in playground routes, not in shared server helpers.

### 2.6 `packages/db`

- [x] Keep `runs.usage_json` as the Loop 1 persistence location.
- [x] Do not add `run_usage_records` in this todo unless this todo is explicitly revised; Loop 1/2 persistence remains `runs.usage_json`.
- [x] Preserve versioned usage JSON round-trip without schema changes.
- [ ] If future usage records are introduced, support SQLite and PostgreSQL/Turso paths together.
- [x] Preserve raw JSON fields for run events and tool invocations.

## 3. Frontend / Consumer Boundary

### 3.1 Durable chat client

- [x] Update schema normalization to accept `RunUsageSummaryV1` without treating live stream state as usage truth.
- [x] Keep terminal reconcile behavior durable-first.
- [x] Do not add usage dashboards or product analytics UI in this todo.

### 3.2 Playground Fastify host

- [x] Keep user access and ownership checks based on host auth and thread catalog.
- [x] Do not write playground owner ids into shared durable thread or run records.
- [x] If an existing timeline route response expands to include usage/projection, keep the existing `loadAccessibleRun`/catalog ownership access model.
- [x] Do not add a new user-scoped usage aggregation route in this todo.

### 3.3 Playground UI validation

- [x] Add only minimal inspector or display changes needed to validate the contract.
- [x] Do not make UI display the source of truth for usage or trace semantics.
- [x] Keep screenshots out of scope unless the validation surface visibly changes.

## 4. Tests

### 4.1 Runtime tests

- [x] Add `runtime-pi` tests for `RunUsageSummaryV1` on completed runs.
- [x] Cover missing provider usage.
- [ ] Cover malformed or partial provider usage if the adapter can observe it.
- [x] Cover failed runtime path still writes `runtime_error` and terminal failed run state.
- [x] Cover the chosen `message_update` durable/live behavior.

### 4.2 App / contract / server tests

- [x] Add or update app tests for typed timeline projection if implemented there.
- [x] Add contract/server DTO tests for versioned usage serialization.
- [x] Ensure raw run events remain available when typed projections are present.
- [x] Ensure unknown event payloads do not break timeline response building.

### 4.3 DB tests

- [x] Keep existing `runs.usage_json` round-trip coverage valid for versioned usage.
- [x] Add DB tests only if persistence behavior changes beyond JSON shape.
- [x] Defer usage record table tests until the follow-up record/ledger slice.

### 4.4 Client / playground tests

- [x] Add durable-chat-client schema tests if `RunDto.usage` parsing changes.
- [x] Add Fastify host access tests only if new protected usage/timeline route behavior is introduced.
- [x] Avoid broad UI tests unless a visible validation UI is added.

### 4.5 Review and verification

- [x] Define expected verification coverage for each loop as package/layer-level acceptance, not command text.
- [x] Keep verification scoped to changed behavior and touched package boundaries.
- [x] Use the repository Review Profile as a gate without redefining command details in this todo.
- [x] Keep commit/batching policy outside this architecture todo.

## 5. Recommended Execution Order

### Loop 1: Contract Scope and Documentation Alignment

- [x] Define the trace/usage contract in this todo first.
- [x] Decide `message_update` durable/live semantics.
- [x] Update `docs/runtime-observability.md` to remove the current mismatch with runtime-pi implementation.
- [x] Decide whether stable definitions should be promoted into a new source-of-truth doc now or after Loop 2.
- [x] Add no schema tables in this loop.
- [x] Capture documentation acceptance evidence for changed facts.
- [x] Complete repository review workflow without expanding the slice scope.
- [x] Close the slice only after acceptance evidence and review are clean.

### Loop 2: Usage Summary v1 in Runtime and Contracts

- [x] Add `RunUsageSummaryV1` types.
- [x] Update `runtime-pi` usage summary creation.
- [x] Update DTO/schema normalization as needed.
- [x] Add focused runtime and DTO/client tests.
- [x] Verify missing usage and failure paths.
- [x] Capture package-level acceptance evidence for touched behavior.
- [x] Complete repository review workflow without expanding the slice scope.
- [x] Close the slice only after acceptance evidence and review are clean.

### Loop 3: Typed Timeline Projection

- [x] Define typed timeline projection shape.
- [x] Build projection over existing durable run, raw run events, and tool invocations.
- [x] Preserve raw `runEvents` in responses.
- [x] Add app/contract/server tests around known and unknown events.
- [x] Validate failed run timeline behavior.
- [x] Capture package-level acceptance evidence for touched behavior.
- [x] Complete repository review workflow without expanding the slice scope.
- [x] Close the slice only after acceptance evidence and review are clean.

### Loop 4: Source-of-Truth Promotion and Closeout

- [ ] Promote stable trace/usage definitions to `docs/source-of-truth/run-trace-usage-contract.md` if the model is now stable.
- [ ] Update `docs/source-of-truth/README.md` if a new source-of-truth doc is added.
- [ ] Update `docs/roadmap.md` to mark `Run Trace & Usage Contract v1` as the selected next infra track if still accurate.
- [ ] Record follow-up tasks for usage records/ledger and server-side cancel.
- [ ] Capture final package/layer acceptance evidence.
- [ ] Complete repository review workflow without expanding the slice scope.
- [ ] Close the slice only after acceptance evidence and review are clean.
- [ ] Delete this temporary todo when all work is complete and stable facts live in source-of-truth docs.

## 6. Deferred Follow-ups

- [ ] Add `run_usage_records` for queryable app/thread/run usage aggregation after summary semantics stabilize.
- [ ] Add host-local usage aggregation in `playground-fastify-server` only after shared run-level usage is stable.
- [ ] Add server-side `runs.cancel` and runtime abort semantics after terminal trace/partial usage behavior is defined.
- [ ] Add replay/eval fixtures after typed timeline projection stabilizes.
- [ ] Revisit runtime adapter contract hardening after usage and trace semantics are no longer runtime-pi-specific.
