# Playground Next Optimization Todo

## 0. Context And Boundary

### 0.1 Confirmed Facts

- [x] Target app is `apps/playground-next-web`.
- [x] `playground-next-web` is an experiment harness and validation surface, not the product boundary.
- [x] Reusable durable chat behavior should move toward `packages/durable-chat-client` or `packages/durable-chat-server` when it is not playground-specific.
- [x] Host auth, thread catalog ownership, playground search policy, and playground UI should remain app-local unless a later consumer proves they are shared platform concerns.
- [x] Existing app test baseline passes: `pnpm --filter playground-next-web test`.
- [x] Existing tests are strongest around pure `service`, `schema`, and `lib` helpers.
- [x] Current biggest maintainability hotspots are `use-durable-chat-runtime.ts`, `message-list.tsx`, stream routes, attach route, and `auth-form.tsx`.
- [x] Current biggest performance risks are client-only route binding, initialization waterfalls, unstable runtime callback props, sidebar derived-prop churn, markdown/shiki chunking, and broad durable-chat-client barrel imports.

### 0.2 Goals

- [ ] Improve readability by splitting only the code paths that have independent responsibilities and tests.
- [ ] Improve testability by adding focused protection around route semantics, runtime flow decisions, host auth, and thread catalog ownership.
- [ ] Improve performance by removing avoidable request waterfalls, avoiding avoidable re-renders, and keeping heavy markdown/shiki/runtime surfaces out of initial client chunks where practical.
- [ ] Keep each slice narrow enough to verify, run `codex review`, and commit independently.
- [ ] Keep docs/source-of-truth synchronized when a long-lived behavior changes.

### 0.3 Non-goals

- [x] Do not redesign the playground UI.
- [x] Do not rewrite the durable chat runtime from scratch.
- [x] Do not introduce an external state-management library.
- [x] Do not move host auth into `packages/*`.
- [x] Do not move playground search/browse policy into `runtime-pi` or durable shared infra by default.
- [x] Do not move visual chat-shell components into shared packages.
- [x] Do not add broad component-test infrastructure unless a slice needs it and the value is clear.
- [x] Do not do opportunistic cleanup outside the current slice.

## 1. Definitions First

### 1.1 Source Of Truth

- [ ] Reconcile stream/attach work with `docs/source-of-truth/run-attach-stream-model.md`.
- [ ] Reconcile share work with `docs/source-of-truth/share-model.md` if share runtime/dialog behavior changes.
- [ ] Reconcile auth work with `docs/source-of-truth/playground-host-auth-model.md` if auth semantics or route response contracts change.
- [ ] Reconcile chat mode/runtime binding work with `docs/source-of-truth/playground-chat-mode-model.md` if route initialization or model binding semantics change.
- [ ] Reconcile search policy work with `docs/source-of-truth/playground-search-browse-policy-model.md` if search/browse host policy changes.
- [ ] Update source-of-truth wording from Fastify/Vite-only to current playground host/consumer wording when changing an affected behavior.
- [ ] Do not create a new source-of-truth doc during early refactoring unless a stable long-lived behavior is introduced.

### 1.2 Data Model

- [ ] Confirm no DB schema changes are needed for the first optimization slices.
- [ ] Confirm no contract DTO changes are needed before changing stream/attach helpers.
- [ ] Confirm route tests can use mocked services before introducing any test-only repository fixtures.
- [ ] Confirm auth service tests can use repo fakes or temporary SQLite without changing production schema.
- [ ] Confirm thread catalog tests preserve `threads.userId = null` and host catalog owner semantics.

### 1.3 Types / Interfaces

- [ ] Define a DI-friendly stream coordinator interface before moving logic out of `runs/stream/route.ts`.
- [ ] Define attach unavailable reason handling before moving attach helper logic out of `attach-stream/route.ts`.
- [x] Define `runInitializeRuntime` operation ordering expectations in `packages/durable-chat-client` tests before changing concurrency.
- [ ] Define a small attach client flow interface before extracting attach event handling from `useDurableChatRuntime`.
- [ ] Define app-local auth response mapping helpers before changing auth route or form behavior.
- [ ] Define whether `@agent-infra/durable-chat-client` subpath exports will be introduced as package public API.

## 2. Backend / Platform

### 2.1 Stream Route Protection And Extraction

- [x] Add focused tests for `POST /api/threads/:threadId/runs/stream` pre-start JSON errors.
- [x] Cover web search enabled while `TAVILY_API_KEY` is missing returns `503`.
- [x] Cover unauthenticated request short-circuits before runtime services are loaded.
- [x] Cover inaccessible thread maps through the existing route error status helper.
- [x] Add a stream success test or package-level coordinator test that verifies the first SSE event is `run.ready`.
- [x] Cover terminal event is emitted once when persisted updates reach completed or failed.
- [x] Cover runtime failure emits `run.failed` and closes the stream hub session.
- [ ] Extract only the reusable stream writing/coordinator logic after tests exist.
- [ ] Prefer `packages/durable-chat-server` for reusable SSE lifecycle helpers.
- [ ] Keep the Next route responsible only for request parsing, auth/access binding, playground runtime binding, and returning `Response`.

### 2.2 Attach Route Protection And Extraction

- [x] Add focused tests for attach unavailable outcomes.
- [x] Cover run not found returns `run.attach_unavailable` with `run_not_found`.
- [x] Cover thread/run mismatch does not leak unauthorized cross-thread metadata.
- [x] Cover accessible thread/run mismatch returns `thread_run_mismatch`.
- [x] Cover missing in-memory stream snapshot for running run returns `stream_session_gone`.
- [x] Cover terminal run returns `run_not_active`.
- [x] Cover successful attach is snapshot-first.
- [ ] Extract reusable attach SSE encoding/unavailable/session lifecycle logic after tests exist.
- [ ] Prefer `packages/durable-chat-server` for reusable attach semantics.
- [ ] Keep playground-specific auth/access checks in `apps/playground-next-web`.

### 2.3 Durable Chat Client Flow Performance

- [x] Add or update `packages/durable-chat-client` tests for `runInitializeRuntime`.
- [x] Prove `refreshThreads` and `activateThread(initialThreadId)` can start concurrently when `initialThreadId` exists.
- [x] Preserve current no-initial-thread behavior.
- [x] Preserve stale request guards and abort semantics.
- [x] Implement the smallest concurrency change in `packages/durable-chat-client`.
- [x] Run `pnpm --filter @agent-infra/durable-chat-client test`.
- [x] Run `pnpm --filter playground-next-web typecheck`.

### 2.4 Inspector And Reconcile Flow Performance

- [ ] Audit existing `packages/durable-chat-client` inspector/reconcile tests before changing request ordering.
- [ ] Add controlled-promise tests for message/runs/timeline request ordering where useful.
- [ ] Parallelize independent fetches only where existing semantics do not require sequencing.
- [ ] Preserve selected-run resolution behavior.
- [ ] Preserve stale request protection.
- [ ] Run `pnpm --filter @agent-infra/durable-chat-client test`.
- [ ] Defer this loop until stream/attach and initialization slices are complete unless it becomes a blocker.

### 2.5 Package Import Surfaces

- [ ] Inspect `packages/durable-chat-client/package.json` exports before adding subpaths.
- [ ] Add stable subpath exports only if they are compatible with workspace build and consumer imports.
- [ ] Prefer `@agent-infra/durable-chat-client/runtime`, `/repo`, `/schema`, and `/service` if introduced.
- [ ] Update app imports from broad barrel imports to subpath imports in narrow batches.
- [ ] Run package tests and app typecheck after import changes.
- [ ] Capture build output or bundle stats if the slice claims bundle-size improvement.

## 3. Frontend Boundary

### 3.1 Route And Shell Initialization

- [ ] Make server pages pass `initialThreadId` directly instead of relying on client pathname parsing.
- [ ] Keep `/new` explicit by passing `initialThreadId: null`.
- [ ] Remove or narrow `ChatShellRouter` after route params are server-bound.
- [ ] Keep runtime complexity out of `page.tsx`.
- [ ] Evaluate whether auth can be server-bound in a later slice; do not combine with route param cleanup unless small.
- [ ] Verify direct `/chat/:threadId` navigation no longer depends on client `usePathname()` to know the active thread.
- [ ] Run `pnpm --filter playground-next-web typecheck`.
- [ ] Run `pnpm --filter playground-next-web build` if App Router boundaries changed.

### 3.2 Runtime Hook Readability

- [ ] Inventory responsibilities inside `useDurableChatRuntime` and group them by flow before editing.
- [ ] Extract attach event application into a small runtime helper or flow.
- [ ] Add tests for extracted attach event behavior before changing surrounding hook wiring.
- [ ] Extract share dialog state/actions into a bounded helper or controller.
- [ ] Extract thread rename/archive/pin action flow if it can be tested independently.
- [ ] Extract scroll/composer DOM behavior only if it reduces hook complexity without creating a second state machine.
- [ ] Keep `useDurableChatRuntime` as the integration point for app-specific UI state.
- [ ] Avoid moving playground-only actions into shared packages.

### 3.3 Runtime Render Performance

- [ ] Use existing render diagnostics or React Profiler to identify high-frequency unrelated renders before changing memo boundaries.
- [ ] Stabilize callbacks passed to memoized heavy children such as `ChatMessageList`, `ChatSidebar`, composer, and log pane.
- [ ] Consider returning grouped `state` and `actions` from runtime only if it reduces prop churn without broad rewrite.
- [ ] Avoid blanket `useCallback` churn for callbacks not crossing memo boundaries.
- [ ] Verify draft input and live token updates do not repeatedly re-render unrelated sidebar/header subtrees.
- [ ] Run `pnpm --filter playground-next-web typecheck`.

### 3.4 Sidebar Derived State

- [ ] Remove per-render `pinnedThreadIds` allocation in `DurableChatConsole`, or memoize it if retaining the prop.
- [ ] Prefer letting `ChatSidebar` derive pinned grouping from `threads` directly if that keeps the API simpler.
- [ ] Keep thread grouping behavior unchanged.
- [ ] Run targeted tests if grouping helpers are extracted.
- [ ] Run `pnpm --filter playground-next-web typecheck`.

### 3.5 Message List Readability

- [ ] Split `MessageList` only along existing component boundaries.
- [ ] Move `useRenderDiagnostic` to a local helper file if it remains UI-local.
- [ ] Move `ReasoningPanel` to its own component file.
- [ ] Move `MessageActions` to its own component file.
- [ ] Move research summary/live research labels if that reduces `message-list.tsx` without changing behavior.
- [ ] Keep pure projection and decision logic in `features/durable-chat/service/*`.
- [ ] Do not move visual message components into `packages/*`.
- [ ] Run `pnpm --filter playground-next-web typecheck`.

### 3.6 Auth Form Readability

- [ ] Extract auth client request helper from `auth-form.tsx` if it can be tested without DOM.
- [ ] Extract auth error presentation mapping into an app-local service/helper.
- [ ] Extract cooldown calculation or hook logic only if tests can cover it simply.
- [ ] Replace direct DOM validity reads with refs or form state only if behavior stays identical.
- [ ] Preserve safe `next` redirect behavior.
- [ ] Preserve existing cookie/session route behavior.
- [ ] Run `pnpm --filter playground-next-web test`.

### 3.7 Markdown And Shiki Bundle Hygiene

- [ ] Move lightweight markdown constants such as `SHIKI_THEME` away from `markdown-shiki-runtime` if doing so avoids early shiki runtime imports.
- [ ] Verify `markdown-core` no longer statically imports heavy shiki runtime surfaces for constants.
- [ ] Evaluate whether main-thread shiki fallback is required.
- [ ] If fallback is only best-effort, prefer safe non-highlighted code rendering over downloading shiki on the main thread.
- [ ] Preserve sanitization and XSS safety.
- [ ] Capture build or bundle evidence before claiming bundle improvement.
- [ ] Run `pnpm --filter playground-next-web build`.

## 4. Tests

### 4.1 Existing Baseline

- [x] `pnpm --filter playground-next-web test` passes before optimization work starts.

### 4.2 Route Tests

- [x] Add stream route tests or package-level stream coordinator tests.
- [x] Add attach route tests or package-level attach helper tests.
- [ ] Add auth route response mapping tests for at least sign-up/sign-in if response shapes change.
- [ ] Add thread messages/runs route tests only when modifying route behavior.

### 4.3 Runtime Tests

- [ ] Add attach event flow tests before extracting attach logic from `useDurableChatRuntime`.
- [x] Add `runInitializeRuntime` ordering tests in `packages/durable-chat-client`.
- [ ] Add inspector/reconcile ordering tests before parallelizing those flows.
- [ ] Keep hook-level tests out of scope unless pure flow extraction cannot cover the behavior.

### 4.4 Auth Tests

- [ ] Add auth service tests for signup code cooldown.
- [ ] Add auth service tests for invalid code attempt tracking.
- [ ] Add auth service tests for expired challenge handling.
- [ ] Add auth service tests for sign-up challenge consumption and session creation.
- [ ] Add auth service tests for reset-password session revocation.
- [ ] Add auth form helper tests after extracting pure mapping/cooldown/client helpers.

### 4.5 Thread Catalog Tests

- [ ] Add tests for `createThreadWithCatalog` creating durable thread with `userId: null`.
- [ ] Add tests for non-owner access through `loadAccessibleThread`.
- [ ] Add tests for `bindRuntimeIfUnset` not overwriting existing runtime binding.
- [ ] Decide and test legacy catalog backfill behavior.

### 4.6 UI / Render Tests

- [ ] Prefer service tests and profiler/render diagnostics before adding React Testing Library.
- [ ] Add component smoke tests only if a UI extraction introduces meaningful interaction risk.
- [ ] If component tests are introduced, start with reasoning panel, message actions, and research summary click behavior.

## 5. Recommended Execution Order

### Loop 1: Stream And Attach Safety Net

- [x] Add focused tests around `runs/stream` pre-start errors and attach unavailable outcomes.
- [x] Extract the smallest testable stream/attach helper only if tests need a stable seam.
- [x] Run `pnpm --filter playground-next-web test`.
- [x] Run `pnpm --filter playground-next-web typecheck` if route/helper types changed.
- [x] Run codex review with the repository Review Profile.
- [x] Commit this slice after clean review and passing verification.

### Loop 2: Durable Client Initialization Waterfall

- [x] Add `packages/durable-chat-client` test proving direct-thread initialization can start independent work concurrently.
- [x] Implement concurrent `refreshThreads` and `activateThread(initialThreadId)` where safe.
- [x] Run `pnpm --filter @agent-infra/durable-chat-client test`.
- [x] Run `pnpm --filter playground-next-web typecheck`.
- [x] Run codex review with the repository Review Profile.
- [x] Commit this slice after clean review and passing verification.

### Loop 3: Route Param Binding And Shell Startup

- [ ] Pass `initialThreadId` through server pages.
- [ ] Remove or narrow client pathname routing.
- [ ] Verify direct `/chat/:threadId` startup behavior.
- [ ] Run `pnpm --filter playground-next-web typecheck`.
- [ ] Run `pnpm --filter playground-next-web build`.
- [ ] Run codex review with the repository Review Profile.
- [ ] Commit this slice after clean review and passing verification.

### Loop 4: Runtime Readability And Attach Flow Extraction

- [ ] Extract attach client flow from `useDurableChatRuntime`.
- [ ] Add focused attach flow tests.
- [ ] Optionally extract share or thread actions only if the first extraction is clean and still in the same bounded slice.
- [ ] Run `pnpm --filter playground-next-web test`.
- [ ] Run `pnpm --filter playground-next-web typecheck`.
- [ ] Run codex review with the repository Review Profile.
- [ ] Commit this slice after clean review and passing verification.

### Loop 5: Render Performance And Sidebar Prop Churn

- [ ] Stabilize high-impact callbacks crossing memo boundaries.
- [ ] Remove or memoize `pinnedThreadIds` derived allocation.
- [ ] Verify with render diagnostics or profiler.
- [ ] Run `pnpm --filter playground-next-web typecheck`.
- [ ] Run codex review with the repository Review Profile.
- [ ] Commit this slice after clean review and passing verification.

### Loop 6: Auth And Thread Catalog Test Coverage

- [ ] Add host auth service tests.
- [ ] Add auth helper/route mapping tests if response shapes are touched.
- [ ] Add thread catalog ownership/runtime-binding tests.
- [ ] Run `pnpm --filter playground-next-web test`.
- [ ] Run codex review with the repository Review Profile.
- [ ] Commit this slice after clean review and passing verification.

### Loop 7: Message List And Auth Form Readability

- [ ] Split `message-list.tsx` along UI component boundaries.
- [ ] Extract pure auth form helpers if not already done.
- [ ] Keep behavior unchanged.
- [ ] Run `pnpm --filter playground-next-web test`.
- [ ] Run `pnpm --filter playground-next-web typecheck`.
- [ ] Run codex review with the repository Review Profile.
- [ ] Commit this slice after clean review and passing verification.

### Loop 8: Bundle Hygiene

- [ ] Split markdown/shiki constants and fallback path if bundle evidence supports it.
- [ ] Add durable-chat-client subpath exports if the package API direction is confirmed.
- [ ] Update imports in narrow batches.
- [ ] Run package tests and app build/typecheck as appropriate.
- [ ] Capture build output or bundle evidence.
- [ ] Run codex review with the repository Review Profile.
- [ ] Commit this slice after clean review and passing verification.

## 6. Completion Criteria

- [ ] Critical stream and attach behavior has focused tests.
- [ ] Direct thread initialization avoids avoidable request waterfalls.
- [ ] Server route params drive initial chat thread selection.
- [ ] `useDurableChatRuntime` is smaller because independent flows are extracted and tested.
- [ ] High-frequency live updates no longer cause obvious unrelated sidebar/header/message-list prop churn.
- [ ] Host auth and thread catalog ownership have focused tests.
- [ ] `message-list.tsx` and `auth-form.tsx` are easier to read without behavior drift.
- [ ] Markdown/shiki and durable-chat-client imports have measured or clearly justified bundle improvements.
- [ ] Relevant source-of-truth docs are updated for any changed long-lived behavior.
- [ ] `docs/todolist.md` is deleted after all work is complete and stable facts are promoted or already documented.
