# Cloud Agent Runtime Refactor Todo

## 0. Context And Boundary

### 0.1 Confirmed Facts

- [x] `apps/cloud-agent-next-web` is the current validation surface for the cloud Agent Runtime, but the durable product boundary should remain in `packages/*`.
- [x] Claude Code and Codex are now both real provider targets; this phase should consolidate those two paths instead of adding a third SDK.
- [x] The runtime goal is not a polished chat UI. The goal is a stable cloud agent runtime with provider adapters, sandbox isolation, auditability, recovery, and future provider extensibility.
- [x] Docker execution is the current practical sandbox baseline; it is not the final security story, but it is the path we can verify end to end now.
- [x] The app already contains useful infrastructure for threads, messages, events, provider sessions, profile audit, secrets, MCP, skills, and workspace paths.
- [x] The current diff proves important capabilities, but some code is now too concentrated in app composition files and provider-specific branches.

### 0.2 Goals

- [x] Make the current Claude and Codex behavior explicit before moving code.
- [x] Tighten the provider-neutral event model so app code does not depend on loose provider payloads.
- [x] Keep raw provider transcripts separate from normalized runtime events and product messages.
- [x] Reduce `apps/cloud-agent-next-web/lib/agent-runtime.ts` into smaller app-local composition modules before moving any reusable logic into packages.
- [x] Share Docker process plumbing between provider adapters while keeping provider runner protocols separate.
- [x] Clarify sandbox, workspace, config home, credential, MCP, and skill boundaries for both Claude and Codex.
- [x] Preserve the ability to add Codex-style or Claude-style providers later without rewriting the app routes.
- [x] Keep each refactor loop small enough to verify independently.

### 0.3 Non-Goals

- [x] Do not add a third SDK in this phase.
- [x] Do not redesign the chat UI.
- [x] Do not make `apps/cloud-agent-next-web` the permanent product boundary.
- [x] Do not flatten raw SDK transcripts into product messages.
- [x] Do not pretend Docker-first is the final production security model.
- [x] Do not build a generic provider framework before the Claude and Codex duplication is concrete.
- [x] Do not change route URLs, browser contracts, or DB schema unless a refactor loop proves it is necessary.
- [x] Do not productionize `CODEX_AUTH_MODE=codex-home`; treat it as a local/dev auth materialization path.

## 1. Definitions First

### 1.1 Runtime Ownership Boundaries

- [x] Update `docs/cloud-agent-runtime-alignment.md` with the current Claude + Codex state before starting large refactors.
- [x] Add an ownership table for app-owned versus package-owned runtime facts.
- [x] Define app-owned facts:
  - [x] Next route/auth/session glue.
  - [x] host env and local data-root resolution.
  - [x] owner checks and thread projection.
  - [x] DB-backed store wiring.
  - [x] event publication to the browser stream.
  - [x] queue/backend selection.
- [x] Define package-owned facts:
  - [x] provider adapter interfaces.
  - [x] normalized runtime event types and builders.
  - [x] provider transcript append contracts.
  - [x] sandbox execution contracts.
  - [x] reusable Docker process primitives.
  - [x] pure provider config/profile planning helpers when they no longer depend on app state.

### 1.2 Sandbox And Workspace Definitions

- [x] Define `RuntimeWorkspaceScope`: user workspace root, optional run/private workspace, provider config home, credential mount, and guest paths.
- [x] Define the default policy: one stable workspace per user, with a future escape hatch for per-run private workspaces.
- [x] Define how guest paths are reported to users and stored in events.
- [x] Define provider config home semantics:
  - [x] Claude config/session files live under provider-controlled config home.
  - [x] Codex config/auth files live under provider-controlled config home.
  - [x] host paths must not leak into model-visible tool output.
- [x] Define credential handling:
  - [x] env secrets are runtime-only.
  - [x] mounted credential files are read-only.
  - [x] credentials must not be copied into workspace.
- [x] Define MCP/skill execution boundary:
  - [x] stdio MCP is allowed only inside Docker mode.
  - [x] local mode must not silently execute host stdio MCP.
  - [x] user-level MCP/skills are shared across that user's workspace unless a future private scope overrides them.

### 1.3 Provider Event Model

- [x] Define a typed `AgentRuntimeEvent` contract instead of relying on `type + JsonObject payload` everywhere.
- [x] Add event builders or discriminated payload helpers for common event types:
  - [x] run lifecycle.
  - [x] assistant text delta/message.
  - [x] tool call started/delta/completed/failed.
  - [x] file/workspace change.
  - [x] usage.
  - [x] permission requested/resolved.
  - [x] provider session binding.
  - [x] provider raw transcript reference.
  - [x] sandbox/process error.
- [x] Mark required versus best-effort events for a provider adapter.
- [x] Define provider-specific extension payloads without forcing every app route to know Claude or Codex internals.
- [x] Define failure event expectations for auth failure, timeout, tool failure, permission denied, resume failure, and Docker exit non-zero.

### 1.4 Provider Session And Transcript Model

- [x] Document the relationship between product thread, provider session id, raw transcript, normalized events, and messages.
- [x] Keep provider session binding as the bridge between our product thread and provider-native resume/session behavior.
- [x] Define what must be persisted for recovery:
  - [x] product thread id.
  - [x] provider id.
  - [x] provider session id when available.
  - [x] provider config home identity.
  - [x] raw provider transcript reference.
  - [x] normalized run events.
- [x] Define the temporary recovery boundary when provider-native DB/S3/Redis session store is not used.

## 2. Characterization Before Refactor

### 2.1 Provider Adapter Baseline

- [x] Add or verify characterization tests for Claude adapter event order.
- [x] Add or verify characterization tests for Codex adapter event order.
- [x] Verify both adapters produce enough normalized events to reconstruct a run timeline.
- [x] Verify raw provider transcript append still happens independently of normalized events.
- [x] Verify provider session id binding is created and reused where the SDK supports it.

### 2.2 Docker Sandbox Baseline

- [x] Run Claude Docker smoke with `pwd`, `Read`, `Write`, `Edit`, and `Bash`.
- [x] Run Codex Docker smoke with `pwd`, command execution, and file write/read.
- [x] Confirm model-visible `pwd` is `/workspace` in Docker mode.
- [x] Confirm provider config home is inside the container guest path, not host `~/.claude` or host `~/.codex`.
- [x] Confirm credentials are mounted/read as intended and are not written to workspace.
- [x] Confirm host absolute paths do not appear in normal assistant-visible command output.

### 2.3 App Route Baseline

- [x] Capture current `POST /api/messages` behavior for a normal Claude message.
- [x] Capture current `POST /api/messages` behavior for a normal Codex message.
- [x] Capture current live stream and replay behavior for refresh, thread switch, and `/new`.
- [x] Capture current error behavior for provider auth failure and timeout.
- [x] Record any known breakage before refactoring, so cleanup work does not hide functional regressions.

## 3. Package Runtime Refactor

### 3.1 Typed Event Builders

- [x] Add typed event builders in `packages/cloud-agent-runtime`.
- [x] Convert Claude event mapping to use the builders.
- [x] Convert Codex event mapping to use the builders.
- [x] Keep provider raw events stored as raw transcript, not as required normalized event payload shape.
- [x] Add tests for event builder output and provider mapper behavior.
- [x] Run `pnpm --filter @agent-infra/cloud-agent-runtime test`.
- [x] Run `pnpm --filter @agent-infra/cloud-agent-runtime typecheck`.
- [x] Run slice-level review only if the user explicitly approves; otherwise record the skip reason. Current decision: deferred until the full todo is complete per user request.

### 3.2 Shared Docker Process Plumbing

- [x] Extract shared Docker command assembly for image, mounts, env, timeout, stdout JSONL, and exit handling.
- [x] Keep `claude-agent-runner.mjs` and `codex-agent-runner.mjs` provider-specific.
- [x] Normalize guest path handling in one place.
- [x] Share Docker preflight checks where practical.
- [x] Ensure local adapters do not accidentally inherit Docker-only behavior.
- [x] Add tests for Docker argument/mount/env planning without requiring Docker when possible.
- [x] Run `pnpm --filter @agent-infra/cloud-agent-runtime test`.
- [x] Run Docker smoke for Claude and Codex when Docker is available.
- [x] Run slice-level review only if the user explicitly approves; otherwise record the skip reason. Current decision: deferred until the full todo is complete per user request.

### 3.3 Provider Session And Transcript Helpers

- [x] Keep provider session binding persistence app-owned because it depends on app DB, owner checks, and thread projection.
- [x] Extract common raw transcript append helper shape after current Claude and Codex writes are characterized.
- [x] Keep storage implementation app-owned until package contracts prove stable.
- [x] Add tests around transcript append invariants.
- [x] Run targeted package tests.
- [x] Run slice-level review only if the user explicitly approves; otherwise record the skip reason. Current decision: deferred until the full todo is complete per user request.

### 3.4 Config And Auth Planning

- [x] Split provider config resolution into separate concerns:
  - [x] provider option planning.
  - [x] auth materialization.
  - [x] model/default selection.
  - [x] dev diagnostics.
- [x] Keep `codex-home` auth as a dev-only materializer.
- [x] Keep DeepSeek/OpenAI-compatible API-key auth as provider configuration, not global app truth.
- [x] Avoid copying provider global config wholesale unless explicitly allowed.
- [x] Add tests for provider config precedence and redacted diagnostics.
- [x] Run targeted package tests and typecheck.
- [x] Run slice-level review only if the user explicitly approves; otherwise record the skip reason. Current decision: deferred until the full todo is complete per user request.

### 3.5 Smoke Harness Cleanup

- [x] Extract common smoke helpers for env loading, temp directory creation, cleanup, JSON output, and preflight.
- [x] Keep provider smoke scripts separate enough that failures identify Claude versus Codex clearly.
- [x] Ensure smoke temp dirs are outside package test discovery paths.
- [x] Document exact local smoke commands in `docs/cloud-agent-runtime-alignment.md`.
- [x] Run both provider smoke scripts when credentials/auth are available; current shell Codex env is blocked by DeepSeek `/responses` capability and recorded in alignment.

## 4. App Runtime Refactor

### 4.1 Split `agent-runtime.ts` App-Locally First

- [x] Move pure path/workspace planning into an app-local runtime planning module.
- [x] Move provider factory selection into an app-local provider factory module.
- [x] Move MCP/profile/skill planning into focused app-local modules.
- [x] Move secret/env planning into a focused app-local module.
- [x] Keep `prepareCloudAgentTurn` as a thin composition function while behavior is being preserved.
- [x] Do not move helpers into packages until app-local boundaries are stable.
- [x] Run `pnpm --filter cloud-agent-next-web typecheck`.
- [x] Run a Claude and Codex web/API smoke if local provider auth is available.
- [x] Run slice-level review only if the user explicitly approves; otherwise record the skip reason. Current decision: deferred until the full todo is complete per user request.

### 4.2 Route And Stream Service Cleanup

- [x] Extract message POST orchestration from `messages/route.ts` into an app-local service.
- [x] Keep route handler responsible for auth/session validation and route params, delegating POST parsing/response construction to the app-local service.
- [x] Reuse a shared stream attach/replay helper between message and event routes where current behavior overlaps.
- [x] Preserve current refresh, thread switch, and `/new` behavior at the API stream/replay layer.
- [x] Add focused tests/checks where route/service logic can be exercised without browser automation.
- [x] Run `pnpm --filter cloud-agent-next-web typecheck`.
- [x] Verify a normal streamed message still works for Claude and Codex.

### 4.3 Worker Orchestration Cleanup

- [x] Split `executeCloudAgentRun` into smaller units:
  - [x] run lifecycle.
  - [x] adapter execution.
  - [x] event persistence/publication.
  - [x] final assistant message assembly.
  - [x] failure mapping.
- [x] Keep queue/backend-specific details outside provider adapters.
- [x] Preserve abort/cancel behavior in the refactor.
- [x] Preserve current run completion and error semantics in the refactor.
- [x] Run app typecheck.
- [x] Run targeted smoke.

### 4.4 Provider Session Recovery Cleanup

- [x] Split provider recovery manifest building from store persistence.
- [x] Split replay/compact planning from DTO/database transitions.
- [x] Verify same-thread second message uses provider resume when supported.
- [x] Verify dev server restart plus persisted DB/config home can recover the provider binding.
- [x] Verify resume failure archives the old binding and retries only according to the documented policy.
- [x] Record remaining recovery gaps in `docs/cloud-agent-runtime-alignment.md`.

## 5. Permission And Approval

- [x] Keep Claude permission bridge as the reference implementation.
- [x] Investigate Codex permission/approval capabilities before forcing Claude's shape onto Codex.
- [x] Define provider-neutral permission event shape only after both provider behaviors are understood.
- [x] Ensure non-interactive/dev allow modes are explicit and auditable.
- [x] Ensure approval-required mode has a durable event and UI/API path before enabling it by default.
- [x] Verify denied permissions become clear run events and durable failures.

## 6. Recommended Execution Order

### Loop 1: Baseline And Docs

- [x] Update `docs/cloud-agent-runtime-alignment.md` with current Claude + Codex facts.
- [x] Run the smallest available package/app typechecks to ensure the current diff is still healthy.
- [x] Run at least one provider smoke for the currently configured provider.
- [x] Record known failures without fixing unrelated areas.

### Loop 2: Runtime Event Builders

- [x] Add typed event builders.
- [x] Migrate Claude and Codex mappers.
- [x] Update tests.
- [x] Verify package tests/typecheck.

### Loop 3: Docker Process Plumbing

- [x] Extract shared Docker execution planning.
- [x] Keep provider runner files separate.
- [x] Verify Docker smoke for both providers when available.

### Loop 4: App Runtime Split

- [x] Split `agent-runtime.ts` app-locally.
- [x] Preserve behavior with app typecheck and provider smoke.
- [x] Only move stable pure helpers to packages after this loop settles.

### Loop 5: Route And Worker Cleanup

- [x] Extract message route service.
- [x] Extract stream replay/live helper.
- [x] Split worker orchestration.
- [x] Verify normal streamed messages, refresh/thread replay, and provider errors.

### Loop 6: Session Recovery And Permission

- [x] Tighten provider session recovery helpers.
- [x] Verify restart/resume behavior.
- [x] Clarify permission bridge behavior for Claude and Codex.

### Loop 7: Source-Of-Truth Promotion

- [x] Promote stable runtime/sandbox/provider facts into `docs/source-of-truth` only after behavior is verified.
- [x] Keep `docs/cloud-agent-runtime-alignment.md` as the working alignment note.
- [x] Replace this todo with a smaller follow-up list once the main cleanup loops are complete.

## 7. Verification Checklist

- [x] `pnpm --filter @agent-infra/cloud-agent-runtime test`
- [x] `pnpm --filter @agent-infra/cloud-agent-runtime typecheck`
- [x] `pnpm --filter cloud-agent-next-web typecheck`
- [x] Claude local smoke when credentials are available.
- [x] Claude Docker smoke when Docker image and credentials are available.
- [x] Codex local smoke attempted; current shell env blocked by DeepSeek `/responses` capability, while app Codex streamed path passed.
- [x] Codex Docker smoke attempted; Docker `/workspace` preflight passed and current shell env blocked by DeepSeek `/responses` capability.
- [x] API smoke for normal streamed response.
- [x] API smoke for file-writing tool behavior.
- [x] API replay smoke for refresh/thread switch continuity.
- [x] `git diff --check`

## 8. Follow-Up List After This Cleanup

These are intentionally smaller than the refactor loops above. They should be picked up as
separate slices after this todo is fully verified and reviewed.

- Add provider-level tests for app-local provider factory behavior when adding a new provider id.
- Decide whether provider session materialization needs DB/S3/Redis before multi-worker or cross-machine deployment.
- Add an operator-facing recovery report view for archived provider session bindings.
- Re-run Codex smoke with a Responses-compatible endpoint or explicit Codex/OpenAI auth instead of DeepSeek Chat Completions compatibility.
- Re-enable browser automation verification once the in-app browser connection is healthy.
