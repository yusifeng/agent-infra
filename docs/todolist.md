# Playground Next Optimization Todo

## Backend Migration Parity Follow-Up

### Confirmed Missing Or Degraded Features

- [x] Confirm runtime-pi enabled-tool history projection is already used by Next backend routes through `durableRuntime.runTurn`.
- [x] Restore UI/API policy-only tool trace filtering on `GET /api/threads/:threadId/messages`.
- [x] Restore streamed auto-title generation and `thread.title_updated` emission after completed runs.
- [x] Restore per-thread `startText` serialization for concurrent streamed run starts.
- [x] Restore non-fatal runtime binding persistence failures after a successful run start.

### Loop A: Messages Route Sanitization

- [x] Add route tests for policy-only tool trace filtering on full and paginated thread messages.
- [x] Reuse the existing UI/share sanitizer before building thread message DTO responses.
- [x] Run focused playground tests.
- [x] Run `pnpm --filter playground-next-web typecheck`.
- [x] Run codex review with the repository Review Profile.
- [x] Commit this slice after clean review.

### Loop B: Streamed Auto Title

- [x] Port or share the Fastify auto-title service behavior into the Next backend boundary.
- [x] Emit `thread.title_updated` only after a completed run successfully changes a default thread title.
- [x] Add route tests for title update, non-default title skip, and generator failure not breaking the run stream.
- [x] Run focused playground tests.
- [x] Run `pnpm --filter playground-next-web typecheck`.
- [x] Run codex review with the repository Review Profile.
- [x] Commit this slice after clean review.

### Loop C: Run Start And Binding Parity

- [x] Restore a per-thread `startText` lock around the streamed run startup phase.
- [x] Keep runtime execution outside the startup lock.
- [x] Treat runtime binding persistence as best-effort after successful stream `startText`.
- [x] Treat runtime binding persistence as best-effort after successful non-stream `runText`.
- [x] Add route tests for startup serialization and non-fatal binding failures.
- [x] Run focused playground tests.
- [x] Run `pnpm --filter playground-next-web typecheck`.
- [x] Run codex review with the repository Review Profile.
- [x] Commit this slice after clean review.

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

- [x] Improve readability by splitting only the code paths that have independent responsibilities and tests.
- [x] Improve testability by adding focused protection around route semantics, runtime flow decisions, host auth, and thread catalog ownership.
- [x] Improve performance by removing avoidable request waterfalls, avoiding avoidable re-renders, and keeping heavy markdown/shiki/runtime surfaces out of initial client chunks where practical.
- [x] Keep each slice narrow enough to verify, run `codex review`, and commit independently.
- [x] Keep docs/source-of-truth synchronized when a long-lived behavior changes.

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

- [x] Reconcile stream/attach work with `docs/source-of-truth/run-attach-stream-model.md`.
- [x] Reconcile share work with `docs/source-of-truth/share-model.md` if share runtime/dialog behavior changes.
- [x] Reconcile auth work with `docs/source-of-truth/playground-host-auth-model.md` if auth semantics or route response contracts change.
- [x] Reconcile chat mode/runtime binding work with `docs/source-of-truth/playground-chat-mode-model.md` if route initialization or model binding semantics change.
- [x] Reconcile search policy work with `docs/source-of-truth/playground-search-browse-policy-model.md` if search/browse host policy changes.
- [x] Update source-of-truth wording from Fastify/Vite-only to current playground host/consumer wording when changing an affected behavior.
- [x] Do not create a new source-of-truth doc during early refactoring unless a stable long-lived behavior is introduced.

### 1.2 Data Model

- [x] Confirm no DB schema changes are needed for the first optimization slices.
- [x] Confirm no contract DTO changes are needed before changing stream/attach helpers.
- [x] Confirm route tests can use mocked services before introducing any test-only repository fixtures.
- [x] Confirm auth service tests can use repo fakes or temporary SQLite without changing production schema.
- [x] Confirm thread catalog tests preserve `threads.userId = null` and host catalog owner semantics.

### 1.3 Types / Interfaces

- [x] Define a DI-friendly stream coordinator interface before moving logic out of `runs/stream/route.ts`.
- [x] Define attach unavailable reason handling before moving attach helper logic out of `attach-stream/route.ts`.
- [x] Define `runInitializeRuntime` operation ordering expectations in `packages/durable-chat-client` tests before changing concurrency.
- [x] Define a small attach client flow interface before extracting attach event handling from `useDurableChatRuntime`.
- [x] Define app-local auth response mapping helpers before changing auth route or form behavior.
- [x] Define whether `@agent-infra/durable-chat-client` subpath exports will be introduced as package public API.

## 2. Backend / Platform

### 2.1 Stream Route Protection And Extraction

- [x] Add focused tests for `POST /api/threads/:threadId/runs/stream` pre-start JSON errors.
- [x] Cover web search enabled while `TAVILY_API_KEY` is missing returns `503`.
- [x] Cover unauthenticated request short-circuits before runtime services are loaded.
- [x] Cover inaccessible thread maps through the existing route error status helper.
- [x] Add a stream success test or package-level coordinator test that verifies the first SSE event is `run.ready`.
- [x] Cover terminal event is emitted once when persisted updates reach completed or failed.
- [x] Cover runtime failure emits `run.failed` and closes the stream hub session.
- [x] Decide not to extract stream writing/coordinator logic in this pass because the tested Next route remained the right boundary.
- [x] Prefer `packages/durable-chat-server` for reusable SSE lifecycle helpers if a later pass proves the helper is shared.
- [x] Keep the Next route responsible only for request parsing, auth/access binding, playground runtime binding, and returning `Response`.

### 2.2 Attach Route Protection And Extraction

- [x] Add focused tests for attach unavailable outcomes.
- [x] Cover run not found returns `run.attach_unavailable` with `run_not_found`.
- [x] Cover thread/run mismatch does not leak unauthorized cross-thread metadata.
- [x] Cover accessible thread/run mismatch returns `thread_run_mismatch`.
- [x] Cover missing in-memory stream snapshot for running run returns `stream_session_gone`.
- [x] Cover terminal run returns `run_not_active`.
- [x] Cover successful attach is snapshot-first.
- [x] Decide not to extract attach SSE encoding/session lifecycle logic in this pass because the tested Next route remained the right boundary.
- [x] Prefer `packages/durable-chat-server` for reusable attach semantics if a later pass proves the helper is shared.
- [x] Keep playground-specific auth/access checks in `apps/playground-next-web`.

### 2.3 Durable Chat Client Flow Performance

- [x] Add or update `packages/durable-chat-client` tests for `runInitializeRuntime`.
- [x] Prove `refreshThreads` and `activateThread(initialThreadId)` can start concurrently when `initialThreadId` exists.
- [x] Preserve current no-initial-thread behavior.
- [x] Preserve stale request guards and abort semantics.
- [x] Implement the smallest concurrency change in `packages/durable-chat-client`.
- [x] Run `pnpm --filter @agent-infra/durable-chat-client test`.
- [x] Run `pnpm --filter playground-next-web typecheck`.

### 2.4 Inspector And Reconcile Flow Performance

- [x] Audit existing `packages/durable-chat-client` inspector/reconcile tests and defer request-ordering changes.
- [x] Skip controlled-promise inspector tests because no inspector/reconcile ordering change was made.
- [x] Skip additional inspector parallelization because direct-thread initialization was the safe waterfall fix in this pass.
- [x] Preserve selected-run resolution behavior.
- [x] Preserve stale request protection.
- [x] Run `pnpm --filter @agent-infra/durable-chat-client test`.
- [x] Defer this loop until stream/attach and initialization slices are complete unless it becomes a blocker.

### 2.5 Package Import Surfaces

- [x] Inspect `packages/durable-chat-client/package.json` exports before adding subpaths.
- [x] Decide not to introduce durable-chat-client subpath exports until the package API direction is confirmed.
- [x] Prefer `@agent-infra/durable-chat-client/runtime`, `/repo`, `/schema`, and `/service` if introduced.
- [x] Skip app subpath import rewrites because no durable-chat-client subpath exports were introduced.
- [x] Run app typecheck/build after markdown import changes.
- [x] Capture build output or bundle stats if the slice claims bundle-size improvement.

## 3. Frontend Boundary

### 3.1 Route And Shell Initialization

- [x] Make server pages pass `initialThreadId` directly instead of relying on client pathname parsing.
- [x] Keep `/new` explicit by passing `initialThreadId: null`.
- [x] Remove or narrow `ChatShellRouter` after route params are server-bound.
- [x] Keep runtime complexity out of `page.tsx`.
- [x] Evaluate whether auth can be server-bound in a later slice; do not combine with route param cleanup unless small.
- [x] Verify direct `/chat/:threadId` navigation no longer depends on client `usePathname()` to know the active thread.
- [x] Run `pnpm --filter playground-next-web typecheck`.
- [x] Run `pnpm --filter playground-next-web build` if App Router boundaries changed.

### 3.2 Runtime Hook Readability

- [x] Inventory responsibilities inside `useDurableChatRuntime` and group them by flow before editing.
- [x] Extract attach event application into a small runtime helper or flow.
- [x] Add tests for extracted attach event behavior before changing surrounding hook wiring.
- [x] Keep share dialog state/actions in `useDurableChatRuntime` because attach extraction was the bounded clean slice.
- [x] Keep thread rename/archive/pin action flow in `useDurableChatRuntime` because it remained app-local UI behavior.
- [x] Keep scroll/composer DOM behavior in `useDurableChatRuntime` because extracting it would create another state surface.
- [x] Keep `useDurableChatRuntime` as the integration point for app-specific UI state.
- [x] Avoid moving playground-only actions into shared packages.

### 3.3 Runtime Render Performance

- [x] Use existing render diagnostics or React Profiler to identify high-frequency unrelated renders before changing memo boundaries.
- [x] Stabilize callbacks passed to memoized heavy children such as `ChatMessageList`, `ChatSidebar`, composer, and log pane.
- [x] Consider returning grouped `state` and `actions` from runtime only if it reduces prop churn without broad rewrite.
- [x] Avoid blanket `useCallback` churn for callbacks not crossing memo boundaries.
- [x] Verify draft input and live token updates do not repeatedly re-render unrelated sidebar/header subtrees.
- [x] Run `pnpm --filter playground-next-web typecheck`.

### 3.4 Sidebar Derived State

- [x] Remove per-render `pinnedThreadIds` allocation in `DurableChatConsole`, or memoize it if retaining the prop.
- [x] Prefer letting `ChatSidebar` derive pinned grouping from `threads` directly if that keeps the API simpler.
- [x] Keep thread grouping behavior unchanged.
- [x] Run targeted tests if grouping helpers are extracted.
- [x] Run `pnpm --filter playground-next-web typecheck`.

### 3.5 Message List Readability

- [x] Split `MessageList` only along existing component boundaries.
- [x] Move `useRenderDiagnostic` to a local helper file if it remains UI-local.
- [x] Move `ReasoningPanel` to its own component file.
- [x] Move `MessageActions` to its own component file.
- [x] Keep research summary/live research labels in `message-list.tsx` because moving them did not reduce behavior risk enough for this slice.
- [x] Keep pure projection and decision logic in `features/durable-chat/service/*`.
- [x] Do not move visual message components into `packages/*`.
- [x] Run `pnpm --filter playground-next-web typecheck`.

### 3.6 Auth Form Readability

- [x] Extract auth client request helper from `auth-form.tsx` if it can be tested without DOM.
- [x] Extract auth error presentation mapping into an app-local service/helper.
- [x] Extract cooldown calculation or hook logic only if tests can cover it simply.
- [x] Keep direct DOM validity read because replacing it was not required to preserve behavior in this slice.
- [x] Preserve safe `next` redirect behavior.
- [x] Preserve existing cookie/session route behavior.
- [x] Run `pnpm --filter playground-next-web test`.

### 3.7 Markdown And Shiki Bundle Hygiene

- [x] Move lightweight markdown constants such as `SHIKI_THEME` away from `markdown-shiki-runtime` if doing so avoids early shiki runtime imports.
- [x] Verify `markdown-core` no longer statically imports heavy shiki runtime surfaces for constants.
- [x] Evaluate whether main-thread shiki fallback is required.
- [x] If fallback is only best-effort, prefer safe non-highlighted code rendering over downloading shiki on the main thread.
- [x] Preserve sanitization and XSS safety.
- [x] Capture build or bundle evidence before claiming bundle improvement.
- [x] Run `pnpm --filter playground-next-web build`.

## 4. Tests

### 4.1 Existing Baseline

- [x] `pnpm --filter playground-next-web test` passes before optimization work starts.

### 4.2 Route Tests

- [x] Add stream route tests or package-level stream coordinator tests.
- [x] Add attach route tests or package-level attach helper tests.
- [x] Add auth route response mapping tests for at least sign-up/sign-in if response shapes change.
- [x] Add thread messages/runs route tests only when modifying route behavior.

### 4.3 Runtime Tests

- [x] Add attach event flow tests before extracting attach logic from `useDurableChatRuntime`.
- [x] Add `runInitializeRuntime` ordering tests in `packages/durable-chat-client`.
- [x] Skip inspector/reconcile ordering tests because those flows were not parallelized in this pass.
- [x] Keep hook-level tests out of scope unless pure flow extraction cannot cover the behavior.

### 4.4 Auth Tests

- [x] Add auth service tests for signup code cooldown.
- [x] Add auth service tests for invalid code attempt tracking.
- [x] Add auth service tests for expired challenge handling.
- [x] Add auth service tests for sign-up challenge consumption and session creation.
- [x] Add auth service tests for reset-password session revocation.
- [x] Add auth form helper tests after extracting pure mapping/cooldown/client helpers.

### 4.5 Thread Catalog Tests

- [x] Add tests for `createThreadWithCatalog` creating durable thread with `userId: null`.
- [x] Add tests for non-owner access through `loadAccessibleThread`.
- [x] Add tests for `bindRuntimeIfUnset` not overwriting existing runtime binding.
- [x] Decide and test legacy catalog backfill behavior.

### 4.6 UI / Render Tests

- [x] Prefer service tests and profiler/render diagnostics before adding React Testing Library.
- [x] Skip component smoke tests because the UI extraction was file movement plus existing service coverage.
- [x] Keep reasoning panel/message actions under existing runtime smoke through typecheck and app tests; no component-test infra added.

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

- [x] Pass `initialThreadId` through server pages.
- [x] Remove or narrow client pathname routing.
- [x] Verify direct `/chat/:threadId` startup behavior.
- [x] Run `pnpm --filter playground-next-web typecheck`.
- [x] Run `pnpm --filter playground-next-web build`.
- [x] Run codex review with the repository Review Profile.
- [x] Commit this slice after clean review and passing verification.

### Loop 4: Runtime Readability And Attach Flow Extraction

- [x] Extract attach client flow from `useDurableChatRuntime`.
- [x] Add focused attach flow tests.
- [x] Skip optional share/thread action extraction to keep the attach-flow slice bounded.
- [x] Run `pnpm --filter playground-next-web test`.
- [x] Run `pnpm --filter playground-next-web typecheck`.
- [x] Run codex review with the repository Review Profile.
- [x] Commit this slice after clean review and passing verification.

### Loop 5: Render Performance And Sidebar Prop Churn

- [x] Stabilize high-impact callbacks crossing memo boundaries.
- [x] Remove or memoize `pinnedThreadIds` derived allocation.
- [x] Verify with render diagnostics or profiler.
- [x] Run `pnpm --filter playground-next-web typecheck`.
- [x] Run codex review with the repository Review Profile.
- [x] Commit this slice after clean review and passing verification.

### Loop 6: Auth And Thread Catalog Test Coverage

- [x] Add host auth service tests.
- [x] Add auth helper/route mapping tests if response shapes are touched.
- [x] Add thread catalog ownership/runtime-binding tests.
- [x] Run `pnpm --filter playground-next-web test`.
- [x] Run codex review with the repository Review Profile.
- [x] Commit this slice after clean review and passing verification.

### Loop 7: Message List And Auth Form Readability

- [x] Split `message-list.tsx` along UI component boundaries.
- [x] Extract pure auth form helpers if not already done.
- [x] Keep behavior unchanged.
- [x] Run `pnpm --filter playground-next-web test`.
- [x] Run `pnpm --filter playground-next-web typecheck`.
- [x] Run codex review with the repository Review Profile.
- [x] Commit this slice after clean review and passing verification.

### Loop 8: Bundle Hygiene

- [x] Split markdown/shiki constants and fallback path if bundle evidence supports it.
- [x] Skip durable-chat-client subpath exports because the package API direction was not confirmed.
- [x] Update imports in a narrow markdown/shiki batch.
- [x] Run package tests and app build/typecheck as appropriate.
- [x] Capture build output or bundle evidence.
- [x] Run codex review with the repository Review Profile.
- [x] Commit this slice after clean review and passing verification.

## 6. Completion Criteria

- [x] Critical stream and attach behavior has focused tests.
- [x] Direct thread initialization avoids avoidable request waterfalls.
- [x] Server route params drive initial chat thread selection.
- [x] `useDurableChatRuntime` is smaller because independent flows are extracted and tested.
- [x] High-frequency live updates no longer cause obvious unrelated sidebar/header/message-list prop churn.
- [x] Host auth and thread catalog ownership have focused tests.
- [x] `message-list.tsx` and `auth-form.tsx` are easier to read without behavior drift.
- [x] Markdown/shiki and durable-chat-client imports have measured or clearly justified bundle improvements.
- [x] Relevant source-of-truth docs are updated for any changed long-lived behavior.
- [x] `docs/todolist.md` is retained as the completed execution record for this optimization pass.

---

# Playground Next 16 Upgrade Todo

## 7. Next.js 16 Migration Slice

- [x] Confirm official Next.js 16 migration constraints relevant to `apps/playground-next-web`.
- [x] Upgrade `playground-next-web` Next/React package versions and lockfile.
- [x] Resolve Next 16 Turbopack compatibility for the existing native server package externalization.
- [x] Preserve runtime package tracing for Pi dependencies.
- [x] Run `pnpm --filter playground-next-web typecheck`.
- [x] Run `pnpm --filter playground-next-web test`.
- [x] Run `pnpm --filter playground-next-web build`.
- [x] Run repository codex review profile.
- [x] Leave this todo section fully checked when the migration slice is complete.
