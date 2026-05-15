# Trace Span Observability v1 Todo

## 0. Context and Boundary

### 0.1 Confirmed facts

- [x] The current task is to borrow from LangSmith as an agent observability product reference model, not to integrate LangSmith as an internal source of truth.
- [x] LangSmith-like observability should be interpreted as tracing/span inspection, trace context, feedback, datasets/evals, prompt attribution, and optional external export.
- [x] `agent-infra` is TypeScript-first and already has durable `Thread`, `Run`, `Message`, `MessagePart`, `ToolInvocation`, and `RunEvent` records.
- [x] `run_events` are append-only raw process facts with flexible payloads.
- [x] `RunUsageSummaryV1` exists and is stored in `runs.usage_json`.
- [x] `packages/app` already builds `RunTimelineProjectionV1` over durable `run`, raw `run_events`, and `tool_invocations`.
- [x] Timeline responses preserve raw `runEvents` and `toolInvocations` alongside typed projection.
- [x] Assistant `message_update` is live-only in the current contract and is not persisted as a durable `run_event`.
- [x] `docs/source-of-truth/run-trace-usage-contract.md` is the governing source-of-truth document for trace and usage semantics.
- [x] WebGPT agreed that the next mainline should be projection-only `Trace Span Projection v1`.
- [x] WebGPT agreed that durable `trace_spans` should not be added before the span contract is proven.
- [x] WebGPT's second review accepted the todo's main direction and accepted the adjustments from `llm_message` to `assistant_message`, nullable `appId` to non-null `appId`, deferred tags, deferred message source refs, and non-duplicated tool input/output.
- [x] Shared packages must not introduce generic `User`, auth, account, organization, tenant, billing, quota, or invoice models.
- [x] Playground routes and UI are validation surfaces, not the platform/product boundary.

### 0.2 Goals

- [x] Define `Trace Span Projection v1` as the machine-readable observability read model that complements raw `run_events` and human-readable timeline projection.
- [ ] Build trace span projection in `packages/app` from durable records without adding new DB tables.
- [ ] Expose trace span projection through contracts, durable-chat server helpers, durable-chat client normalization, and host route validation.
- [ ] Keep projection logic out of route helpers and UI code.
- [ ] Preserve raw event truth and do not mutate current run/message/tool persistence behavior.
- [ ] Establish a stable subject model for later feedback, dataset/eval, prompt attribution, and LangSmith/OpenTelemetry exporter work.
- [ ] Capture follow-up boundaries for trace context/metadata/tags, feedback, dataset/eval, prompt attribution, and exporters without implementing them in this slice.

### 0.3 Non-goals

- [x] Do not add a durable `trace_spans` table in this slice.
- [x] Do not make runtime adapters write span rows.
- [x] Do not integrate LangSmith SDK or LangSmith SaaS as internal source of truth.
- [x] Do not add OpenTelemetry export in this slice.
- [x] Do not add feedback, annotation queues, datasets, eval examples, experiments, or LLM-as-judge flows in this slice.
- [x] Do not add prompt hub, prompt registry, prompt commit, or prompt promotion workflows in this slice.
- [x] Do not add billing, invoices, quota, payments, credits, or budget enforcement.
- [x] Do not add shared user/auth/org/tenant/account models.
- [x] Do not persist assistant `message_update` stream deltas.
- [x] Do not add server-side cancel or runtime abort mechanics.
- [x] Do not build a LangSmith-like full UI in playground.
- [x] Do not convert raw `run_events` into a typed-only model or remove raw payloads.
- [x] Do not make `Trace Span Projection v1` a deterministic replay engine.

## 1. Definitions First

### 1.1 Source of truth

- [x] Update `docs/source-of-truth/run-trace-usage-contract.md` with a `Trace Span Projection v1` section.
- [x] Define the three trace layers explicitly:
  - raw event log: append-only durable process facts
  - timeline projection: human-readable ordered inspection model
  - span projection: machine-readable observability tree/read model
- [x] State that span projection is durable-first and rebuildable from persisted records.
- [x] State that span projection does not persist or reconstruct live-only assistant `message_update` deltas.
- [x] State that external exporters are sinks and never replace internal durable truth.
- [ ] Keep evolving implementation details in this todo until stable, then promote only durable facts into source-of-truth docs.
- [x] Do not create a new parallel source-of-truth doc unless `run-trace-usage-contract.md` becomes too broad.

### 1.2 Data model

- [x] Keep Phase 1 persistence unchanged: no DB migration, no `trace_spans`, no `runs.metadata_json`.
- [x] Treat `Run`, `Thread`, `RunEvent`, and `ToolInvocation` as the minimum durable inputs for trace projection.
- [x] Resolve `appId` by loading `run.threadId -> thread.appId` in the app boundary.
- [x] Do not represent `appId` as nullable in `TraceSpanProjectionV1`; missing thread/app attribution should be an app-layer load error.
- [x] Use deterministic span ids so repeat reads of the same durable records produce stable span identities.
- [x] Use `run.id` as the default `traceId` for Phase 1.
- [x] Use deterministic span ids by source type:
  - root: `span:run:${run.id}`
  - tool with durable invocation: `span:tool:${toolInvocation.id}`
  - assistant message with start event: `span:assistant_message:${messageStartEvent.id}`
  - event-only spans: `span:event:${event.id}`
- [x] Make the root agent span source reference the durable `run` and related `agent_start` / `agent_end` events when available.
- [x] Build assistant-message spans from assistant `message_start` / `message_end` events, not from live `message_update`.
- [x] Build tool spans primarily from durable `tool_invocations`, enriched with matching `tool_execution_start` / `tool_execution_end` events by `toolCallId`.
- [x] In Phase 1, make every tool span a direct child of the root agent span.
- [x] Do not infer tool parentage from event ordering or assistant-message seq windows.
- [x] Build runtime-error spans from `runtime_error` events.
- [x] Surface unknown durable event types without failing the projection.
- [x] Track structured projection diagnostics for unknown, orphaned, unpaired, and duration-normalization cases.
- [x] Define trace endpoint v1 response as `run + projection`, not raw `runEvents` / `toolInvocations` arrays.
- [x] Keep raw `runEvents` and `toolInvocations` available through timeline APIs; trace source refs point back to those durable facts.

### 1.3 Types / interfaces

- [x] Define `TraceSpanKindV1` with conservative current-fact names:
  - `agent`
  - `assistant_message`
  - `tool_invocation`
  - `runtime_error`
  - `unknown_event`
- [x] Do not name the assistant span `llm_message` in Phase 1; current durable facts prove assistant message lifecycle, not provider LLM-call lifecycle.
- [x] Define `TraceSpanStatusV1`:
  - `queued`
  - `running`
  - `completed`
  - `failed`
  - `cancelled`
  - `unknown`
- [x] Define `TraceSpanSourceRefV1` for durable source references:
  - `run`
  - `run_event`
  - `tool_invocation`
- [x] Defer `message` source refs unless the projection can obtain stable message ids without inference.
- [x] Define `TraceSpanV1` stable fields:
  - `schemaVersion`
  - `id`
  - `traceId`
  - `parentSpanId`
  - `kind`
  - `name`
  - `status`
  - `appId`
  - `threadId`
  - `runId`
  - `order`
  - `startedAt`
  - `finishedAt`
  - `durationMs`
  - `sourceRefs`
- [x] Define optional `TraceSpanV1` fields:
  - `provider`
  - `model`
  - `usageRef`
  - `tool`
  - `error`
  - `metadata`
- [x] Treat Phase 1 `metadata` as a forward-compatible optional field that should be `null` unless derived from already-stable durable fields.
- [x] Do not introduce trace metadata or tags semantics in Phase 1.
- [x] Define `TraceSpanProjectionV1` stable fields:
  - `schemaVersion`
  - `traceId`
  - `rootSpanId`
  - `appId`
  - `threadId`
  - `runId`
  - `status`
  - `startedAt`
  - `finishedAt`
  - `durationMs`
  - `spans`
  - `diagnostics`
- [x] Define `TraceProjectionDiagnosticCodeV1`:
  - `unknown_event`
  - `orphan_event`
  - `missing_tool_invocation`
  - `unpaired_message_start`
  - `unpaired_message_end`
  - `unpaired_tool_start`
  - `unpaired_tool_end`
  - `nonterminal_child_on_terminal_run`
  - `negative_duration_clamped`
- [x] Define `TraceProjectionDiagnosticV1` with stable `code`, `message`, and `sourceRefs`.
- [x] Define `TraceSpanProjectionDiagnosticsV1` with `unknownEventCount`, `orphanEventCount`, and `warnings`.
- [x] Avoid stable `tags` in Phase 1 unless trace context/tags are also defined; placeholder empty tags should not imply a supported filter model.
- [ ] Define DTO equivalents in `packages/contracts` only after the app-layer shape is fixed.

### 1.4 Span construction rules

- [x] Root agent span id should be deterministic, for example `span:run:${run.id}`.
- [x] Root agent span status should map directly from `run.status`, including `cancelled`.
- [x] Root agent span timestamps should prefer `run.startedAt` / `run.finishedAt`, with event timestamp fallback only if needed.
- [x] Compute `durationMs` only when both timestamps are known.
- [x] Clamp negative durations to `0` and add a `negative_duration_clamped` diagnostic.
- [x] Root agent span should include `provider`, `model`, and `usageRef` when run-level data exists.
- [x] Assistant-message span parent should be the root agent span.
- [x] `assistant_message` is not a provider call span; it represents durable assistant message lifecycle only.
- [x] Assistant-message span should use `assistant_message` kind until durable provider LLM-call facts exist.
- [x] Assistant-message span status should map `message_end.stopReason` values such as `error` or `aborted` to `failed`; otherwise completed.
- [x] Assistant span with missing end should record a structured diagnostic and derive status from root terminal state:
  - `running` when root is `queued` or `running`
  - `failed` when root is `failed`
  - `cancelled` when root is `cancelled`
  - `unknown` only when terminal state cannot be interpreted
- [x] Event-only spans should use `event.createdAt` for both start and finish and `durationMs: 0`.
- [x] Tool span parent should always be the root agent span in Phase 1.
- [x] Revisit nested tool parentage only after message source refs or explicit assistant segment ids are part of the contract.
- [x] Tool span status should prefer durable `tool_invocation.status`; event `isError` can enrich or fallback when needed.
- [x] Tool span should not duplicate full tool input/output as stable top-level fields; raw tool records remain available through existing durable reads.
- [x] Runtime-error span parent should be the root agent span.
- [x] Unknown durable events should project to `unknown_event` spans and increment diagnostics.
- [x] Orphaned event pairs or missing tool matches should not fail the entire projection; diagnostics should record the issue.

### 1.5 WebGPT feedback adopted

- [x] Adopt WebGPT's recommendation to build projection-only `Trace Span Projection v1` first.
- [x] Adopt WebGPT's recommendation to keep durable spans out of Phase 1.
- [x] Adopt WebGPT's recommendation that route helpers serialize app output only.
- [x] Adopt WebGPT's recommendation that trace context / metadata / tags should follow span projection.
- [x] Adopt WebGPT's recommendation that feedback, dataset/eval, and exporters depend on stable span subjects.
- [x] Adjust WebGPT's proposed `llm_message` kind to `assistant_message` for Phase 1 because current durable facts are message lifecycle facts, not stable provider LLM-call facts.
- [x] Adjust WebGPT's nullable `appId` suggestion to non-null `appId` because `Thread.appId` is required and should be resolved in `packages/app`.
- [x] Defer WebGPT's stable `tags` field until trace context/tags are actually defined.
- [x] Defer WebGPT's `message` source ref unless stable message ids are available without inference.
- [x] Adopt WebGPT's second-review recommendation to fix tool spans as root children in Phase 1.
- [x] Adopt WebGPT's second-review recommendation to define `/trace` response as `run + projection`.
- [x] Adopt WebGPT's second-review recommendation to use source-type-specific deterministic span ids.
- [x] Adopt WebGPT's second-review recommendation to make diagnostics structured rather than string-only.

## 2. Backend / Platform

### 2.1 `packages/core`

- [ ] Do not change core durable domain types in Phase 1 unless implementation proves an unavoidable type gap.
- [ ] Do not add `TraceSpan` as a durable core entity in Phase 1.
- [ ] Do not add `Run.metadata` or `runs.metadata_json` in Phase 1.
- [ ] Do not add repository interfaces for spans in Phase 1.
- [ ] Keep `RunEvent.payload` raw and flexible.

### 2.2 `packages/app`

- [ ] Add app-layer trace types to `packages/app/src/types.ts`.
- [ ] Add a small pure projection module, for example `packages/app/src/trace-span-projection.ts`.
- [ ] Keep new projection logic out of the already-large `packages/app/src/app.ts` except for orchestration.
- [ ] Add `runs.getTrace(input: GetRunTraceInput): Promise<RunTraceResult>`.
- [ ] Define `RunTraceResult` as `{ run: Run; projection: TraceSpanProjectionV1 }`.
- [ ] Load run by id and throw existing `RunNotFoundError` semantics if missing.
- [ ] Load thread to resolve non-null `appId`.
- [ ] Load run events and tool invocations from durable repositories.
- [ ] Build `TraceSpanProjectionV1` from durable state only.
- [ ] Keep projection independent from SSE/live stream state.
- [ ] Keep timeline projection behavior unchanged.
- [ ] Keep raw `runEvents` and `toolInvocations` available through existing timeline route; trace endpoint v1 returns only `run + projection`.

### 2.3 `packages/contracts`

- [ ] Add `TraceSpanKindDto`, `TraceSpanStatusDto`, or equivalent inline literal DTO types.
- [ ] Add `TraceSpanSourceRefDto`.
- [ ] Add `TraceSpanDto`.
- [ ] Add `TraceSpanProjectionDto`.
- [ ] Add `RunTraceResponseDto`.
- [ ] Define `RunTraceResponseDto` as `{ run: RunDto | null; projection?: TraceSpanProjectionDto | null; error?: string }`.
- [ ] Keep DTO backward-compatible with unknown future metadata.
- [ ] Do not move runtime codec/helper logic into `packages/contracts`.

### 2.4 `packages/durable-chat-server`

- [ ] Add `buildRunTraceResponse` helper.
- [ ] Add `buildRunTraceErrorResponse` helper if needed for route consistency.
- [ ] Serialize app-provided trace projection only.
- [ ] Do not implement span construction or source-ref matching in server helpers.
- [ ] Add route-helper tests for successful and error responses.

### 2.5 `packages/durable-chat-client`

- [ ] Add `normalizeRunTraceResponse`.
- [ ] Add normalizers for trace projection, spans, source refs, diagnostics, optional tool/error/usage metadata.
- [ ] Invalid projection schema should normalize to `null` or an error-safe response, following existing timeline schema conventions.
- [ ] Invalid individual span/source-ref items should be filtered without failing the entire response when safe.
- [ ] Unknown-event spans should be accepted.
- [ ] Missing or invalid root span/rootSpanId should normalize projection to `null`.
- [ ] Do not treat trace projection as live stream state.

### 2.6 `packages/db`

- [ ] Do not add migrations in Phase 1.
- [ ] Do not add `trace_spans`.
- [ ] Do not add `runs.metadata_json`.
- [ ] Keep existing run event and run usage persistence tests passing.

### 2.7 `packages/runtime-pi`

- [ ] Do not add runtime span writes in Phase 1.
- [ ] Do not persist assistant `message_update`.
- [ ] Do not change usage summary creation in Phase 1.
- [ ] Do not change runtime failure hardening unless tests reveal trace projection needs an already-available stable payload field.
- [ ] If any event payload enrichment is considered, require explicit source-of-truth wording and tests before implementation.

### 2.8 Host routes

- [ ] Add a validation route such as `GET /api/runs/:runId/trace` in host apps only after app/contracts/server/client shape is fixed.
- [ ] Reuse the same access-check pattern as existing run timeline routes.
- [ ] Keep host ownership checks host-local.
- [ ] Do not write host owner ids into shared durable records.

## 3. Frontend / Consumer Boundary

### 3.1 Durable chat client boundary

- [ ] Add fetch helper for run trace response if a host route is added.
- [ ] Keep trace response as durable read data, not live stream data.
- [ ] Keep terminal reconcile behavior unchanged.

### 3.2 Playground UI validation

- [ ] Add no UI by default in the first implementation loop.
- [ ] If validation UI is needed, add only a minimal inspector/debug panel.
- [ ] Do not build a LangSmith-like trace dashboard.
- [ ] Do not make UI display the source of truth for trace semantics.
- [ ] Keep screenshots out of scope unless a visible validation surface changes.

## 4. Tests

### 4.1 App projection tests

- [ ] Completed run with agent lifecycle events projects one root `agent` span.
- [ ] Root span has deterministic id, trace id, app/thread/run attribution, source refs, timestamps, and `completed` status.
- [ ] Failed run projects root `failed` status.
- [ ] Runtime failure with `runtime_error` event projects child `runtime_error` span.
- [ ] Cancelled run projects root `cancelled` status.
- [ ] Assistant `message_start` / `message_end` projects `assistant_message` span.
- [ ] Assistant `message_end` with error or aborted stop reason projects failed assistant span.
- [ ] Durable `tool_invocation` plus matching tool events projects one tool span.
- [ ] Failed durable tool invocation projects failed tool span even if event payload is missing `isError`.
- [ ] Unknown raw event projects `unknown_event` span and increments diagnostics.
- [ ] Missing tool match or orphan event records a diagnostic without failing the whole projection.
- [ ] Projection remains durable-first and does not depend on live/SSE state.

### 4.2 Contract / server tests

- [ ] DTO types cover trace projection and span fields.
- [ ] Route helper serializes app-provided trace projection without projection logic.
- [ ] Error response shape is stable.
- [ ] No raw durable event fields are lost by existing timeline response changes.

### 4.3 Client schema tests

- [ ] Valid trace response normalizes correctly.
- [ ] Invalid projection schema normalizes safely.
- [ ] Invalid individual span item is filtered or rejected according to the chosen convention.
- [ ] Unknown-event span normalizes correctly.
- [ ] Optional `metadata`, `tool`, `error`, and `usageRef` fields normalize safely.

### 4.4 Host route tests

- [ ] Add host route tests only if the trace route is implemented in this slice.
- [ ] Protected run trace route must reuse existing run access pattern.
- [ ] Inaccessible run returns the same style of route error as timeline route.

### 4.5 Verification and review

- [ ] Define expected app-level verification coverage for trace projection.
- [ ] Define expected contract/server/client verification coverage for DTO and normalization changes.
- [ ] Define expected package-level type safety coverage for touched public types.
- [ ] Capture final cross-package type-safety evidence before closeout if public DTOs changed.
- [ ] Code review gate: use the repository Review Profile after each meaningful implementation slice.
- [ ] Use the repository Review Profile after each meaningful implementation slice without redefining command details here.
- [ ] Keep slice closeout evidence in commit or task notes without prescribing shell commands in this todo.

## 5. Recommended Execution Order

### Loop 1: Contract and Source-of-Truth Alignment

- [x] Update `docs/source-of-truth/run-trace-usage-contract.md` with trace span projection semantics.
- [x] Define raw event log vs timeline projection vs span projection.
- [x] Define `TraceSpanV1`, `TraceSpanProjectionV1`, source refs, status mapping, diagnostics, and unknown event behavior.
- [x] Record Phase 1 non-goals: no DB table, no durable span writes, no feedback/eval/exporter, no trace context/tags, no prompt hub.
- [x] Define trace response v1 as `run + projection`; raw run events/tool invocations remain on timeline reads.
- [x] Capture documentation acceptance evidence.
- [x] Code review gate: use the repository Review Profile if documentation changes are substantial.
- [x] Use the repository Review Profile if documentation changes are substantial.
- [x] Close the slice only after acceptance evidence and review are clean.

### Loop 2: App Trace Projection

- [ ] Add trace projection types to `packages/app/src/types.ts`.
- [ ] Add pure projection builder module in `packages/app/src`.
- [ ] Add `runs.getTrace`.
- [ ] Load thread for `appId`.
- [ ] Generate deterministic root, assistant-message, tool, runtime-error, and unknown-event spans.
- [ ] Add structured diagnostics for unknown, orphaned, unpaired, and negative-duration cases.
- [ ] Add focused app tests for completed, failed, cancelled, assistant, tool, runtime-error, unknown, and orphan cases.
- [ ] Capture targeted app verification and type-safety evidence.
- [ ] Code review gate: use the repository Review Profile.
- [ ] Use the repository Review Profile.
- [ ] Close the slice only after verification evidence and review are clean.

### Loop 3: Contracts, Server, Client

- [ ] Add trace DTOs to `packages/contracts`.
- [ ] Add durable-chat-server response builders for trace responses.
- [ ] Add durable-chat-client trace response normalizers.
- [ ] Add contract/server/client tests.
- [ ] Capture downstream declaration freshness and type-safety evidence for affected packages.
- [ ] Capture targeted contract/server/client verification evidence.
- [ ] Code review gate: use the repository Review Profile.
- [ ] Use the repository Review Profile.
- [ ] Close the slice only after verification evidence and review are clean.

### Loop 4: Host Route Validation

- [ ] Add `GET /api/runs/:runId/trace` to relevant host route layer only after shared helpers are stable.
- [ ] Reuse existing accessible-run lookup and host ownership checks.
- [ ] Add route tests if the host package already has adjacent route coverage for run timeline behavior.
- [ ] Do not add UI unless needed for validation.
- [ ] Capture targeted host verification and type-safety evidence if the route is added.
- [ ] Code review gate: use the repository Review Profile.
- [ ] Use the repository Review Profile.
- [ ] Close the slice only after verification evidence and review are clean.

### Loop 5: Closeout and Follow-up Recording

- [ ] Re-read source-of-truth and implementation to ensure no parallel definitions remain.
- [ ] Confirm no DB migration was introduced.
- [ ] Confirm no durable `message_update` persistence was introduced.
- [ ] Confirm no shared user/auth/org/tenant/account model was introduced.
- [ ] Confirm no LangSmith SDK or exporter was introduced as internal truth.
- [ ] Record follow-up candidates for trace context/metadata/tags, feedback, dataset/eval, prompt attribution, and exporters.
- [ ] Capture final targeted verification and cross-package type-safety evidence if not already covered by earlier slices.
- [ ] Code review gate: use the repository Review Profile for final closeout.
- [ ] Use the repository Review Profile for final closeout.
- [ ] Delete this temporary todo once stable facts live in source-of-truth docs and implementation is complete.

## 6. Deferred Follow-ups Recorded For Future Todos

- [ ] Trace Context / Run Metadata v1:
  - add run-level trace metadata/tags/prompt attribution after span shape is validated.
- [ ] Feedback v1:
  - add feedback subjects based on run/span/message/tool after stable span ids exist.
- [ ] Dataset / Eval Example v1:
  - export curated examples from run/span/message data after feedback and trace subjects are stable.
- [ ] Offline Eval / Experiment v1:
  - run candidate runtime/prompt/model configs over datasets after examples are stable.
- [ ] Prompt attribution / Prompt registry:
  - start with prompt refs/hashes in trace metadata before building a full prompt hub.
- [ ] LangSmith / OpenTelemetry exporter:
  - export internal span projections to external systems as sinks, not source of truth.
- [ ] Durable `trace_spans`:
  - reconsider only after query/search/export workloads prove projection-only reads are insufficient.

## 7. Feedback To WebGPT For Next Review

### 7.1 Accepted recommendations

- [x] We accept the recommendation to do `Trace Span Projection v1` next.
- [x] We accept projection-only as the first implementation strategy.
- [x] We accept that `trace_spans` should not be persisted yet.
- [x] We accept that route helpers must not implement projection semantics.
- [x] We accept that trace context/tags, feedback, dataset/eval, and exporters should be follow-ups.
- [x] We accept that LangSmith or OpenTelemetry should be treated as external sinks, not internal truth.

### 7.2 Adjustments to WebGPT's proposal

- [x] Use `assistant_message` instead of `llm_message` in Phase 1 because current durable facts represent assistant message lifecycle, not stable provider LLM-call lifecycle.
- [x] Make `appId` non-null because `Thread.appId` is required and can be resolved at the app boundary.
- [x] Defer stable `tags` until trace context/tags are actually introduced.
- [x] Defer `message` source refs unless stable message ids can be obtained without inference.
- [x] Keep full tool input/output out of stable span top-level fields; existing durable tool records remain the source.
- [x] Accept WebGPT second-review feedback that implementation todo should avoid prescribing concrete shell/test/build commands while still requiring verification evidence and the repository Review Profile.
- [x] Accept WebGPT second-review feedback that tool spans should be root children in Phase 1.
- [x] Accept WebGPT second-review feedback that trace endpoint v1 should return `run + projection`, not raw arrays.
- [x] Accept WebGPT second-review feedback that deterministic span ids need source-type-specific rules.
- [x] Accept WebGPT second-review feedback that diagnostics should use stable codes.

### 7.3 Questions for WebGPT audit

- [x] WebGPT confirmed `assistant_message` is the safer Phase 1 kind name than `llm_message`.
- [x] WebGPT recommended `GET /api/runs/:runId/trace` return `run + projection` only.
- [x] WebGPT recommended source-type-specific deterministic ids: root from run id, durable tool from tool invocation id, event-only spans from event id.
- [x] WebGPT recommended Phase 1 tool spans should always be root children.
- [x] WebGPT recommended unknown/orphan/missing relationships use structured diagnostics instead of failing projection, except for missing base run/thread/app attribution.
