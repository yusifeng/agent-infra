# Chat Refactor Follow-up Todo

## 0. Context and Boundary

### 0.1 Confirmed facts
- [x] The previous `playground-next-web` chat refactor loops completed and left `docs/todolist.md` fully checked before this follow-up todo was created.
- [x] The current chat architecture note is `docs/playground-next-web-chat-runtime-architecture.md`.
- [x] `apps/playground-next-web/features/durable-chat/runtime/use-durable-chat-runtime.ts` is still about 1050 lines after the first runtime controller split.
- [x] `apps/playground-next-web/features/durable-chat/ui/messages/message-list-components.tsx` is still about 820 lines after the first message list split.
- [x] `apps/playground-next-web` has `test.fileParallelism = false`, added to avoid route-test mock isolation issues.
- [x] `apps/playground-fastify-server` currently uses the default `vitest run` configuration and has no app-level `vitest.config.ts`.
- [x] Full workspace `pnpm test` has recently failed due to 5s timeout behavior in untouched route/auth integration tests, while targeted `playground-next-web` verification passed.
- [x] The product boundary remains the shared platform packages and contracts; `playground-next-web` is a reference consumer and validation surface.

### 0.2 Goals
- [x] Make test results stable enough that future refactors do not require manual interpretation of timeout noise.
- [x] Keep `pnpm --filter playground-next-web test` and `pnpm --filter playground-next-web typecheck` as reliable frontend gates.
- [x] Define a reliable workspace-level verification profile for slow integration suites.
- [ ] Continue reducing `use-durable-chat-runtime.ts` by extracting stable derived view-model and send/reconcile wiring seams.
- [ ] Continue reducing `message-list-components.tsx` by splitting proven leaf UI components without changing markup semantics.
- [ ] Create a focused markdown/code-block streaming stability slice if flicker remains observable.
- [ ] Add minimal automated browser smoke coverage for the chat behaviors that are currently manual.

### 0.3 Non-goals
- [x] Do not redesign the chat UI.
- [x] Do not change durable contracts, route DTOs, DB schema, or runtime protocol as part of test stabilization.
- [x] Do not introduce a new state library to split the runtime hook.
- [x] Do not move Next-only router, DOM, viewport, markdown theme, or shell UI concerns into shared packages.
- [x] Do not make broad formatting or cleanup changes unrelated to a loop's explicit goal.
- [x] Do not treat longer test timeouts as a substitute for fixing real hanging tests if a hang is reproducible.
- [x] Do not build a broad E2E suite before the minimal smoke cases and test runtime strategy are proven.

## 1. Definitions First

### 1.1 Source of Truth
- [x] Reconfirm that follow-up refactors stay consistent with `docs/playground-next-web-chat-runtime-architecture.md`.
- [x] Decide whether test-stability facts belong in an existing runbook/doc or should remain only in this todo. Keep this as execution context in this todo; no durable concept model changed.
- [x] Promote only stable long-lived facts into `docs/source-of-truth/*`; keep execution details in this todo. No source-of-truth promotion is needed for app-local Vitest timeout settings.

### 1.2 Test Stability Model
- [x] Classify current failing/slow tests into unit, integration, route module, and browser smoke categories. Current failures are cold-run route/auth integration timeout issues, not chat UI behavior failures.
- [x] Define which commands are required for normal Next chat refactor slices. Normal Next chat slices require `pnpm --filter playground-next-web test` and `pnpm --filter playground-next-web typecheck`.
- [x] Define which commands are required for full workspace confidence. Full confidence should use `pnpm typecheck` plus a stabilized workspace test profile after timeout configuration is fixed.
- [x] Decide whether app-level Vitest timeout configuration or per-test timeout annotations are the better fit for slow Fastify auth/server tests. Use app-level timeout first because many cold-run integration tests exceed 5s for setup/Argon2/SQLite reasons.
- [x] Decide whether `playground-next-web` route tests need stronger mock reset/isolation beyond `fileParallelism = false`. No persistent logic failure was proven; the immediate issue is default timeout, with mock/spy failures appearing as secondary effects after timeout.
- [x] Document how to interpret `pnpm test` failures when a targeted app suite passes but an unrelated workspace integration suite times out. Treat them as command-profile failures until reproduced in that targeted suite with adequate timeout.

### 1.3 Runtime Interfaces
- [x] Identify which remaining `use-durable-chat-runtime.ts` sections are pure derived state vs side-effect orchestration.
- [x] Define a small view-model seam for derived values such as response status, title, visible transcript, send disabled, and answer containers.
- [x] Define a send/reconcile wiring seam that keeps dependency injection explicit and does not hide abort-controller ownership.
- [x] Keep the public `useDurableChatRuntime` return shape stable unless the component layer is changed in the same loop and covered by tests.

### 1.4 Message UI Interfaces
- [ ] Inventory leaf components currently inside `features/durable-chat/ui/messages/message-list-components.tsx`.
- [ ] Define split boundaries for user card, assistant card, live assistant card, answer container card, research timeline, thinking indicator, and welcome message.
- [ ] Keep markdown renderer, message actions, reasoning panel, and shared visual primitives in their existing ownership unless a real ownership problem appears.
- [ ] Preserve selectors, accessible labels, class behavior, and copy while moving leaf UI files.

### 1.5 Browser Smoke Scope
- [ ] Define the smallest reliable smoke harness for local chat behavior.
- [ ] Prefer mocked/local deterministic runtime data over depending on a live provider for browser smoke.
- [ ] Cover only high-regression chat behaviors first: thread switch no loading interstitial, no thread-id title flash, stream reconnect final content, viewport selection lock, markdown wrapper stability.

## 2. Backend / Platform

### 2.1 Package Boundary
- [x] Confirm no package-level code changes are needed for test stabilization.
- [ ] If test stabilization requires shared package behavior changes, add package-level tests before changing any consumer.
- [ ] Keep shared platform package tests independent from playground UI refactor state.

### 2.2 Fastify Test Stability
- [x] Reproduce `apps/playground-fastify-server` auth/server timeout behavior with targeted commands.
- [x] Identify whether slow cases are CPU-bound Argon2, SQLite setup, server lifecycle, or Vitest default timeout mismatch. The failing cases completed quickly once the app timeout was raised, so the issue was a default timeout mismatch under cold/workspace load rather than a real hang.
- [x] Add an app-level Vitest config or per-test timeout only after identifying the actual timing profile.
- [x] Preserve real failure detection for route/auth tests; do not mask unresolved hangs.

### 2.3 Next Route Test Stability
- [x] Reproduce `apps/playground-next-web` route test timeout/mock leakage behavior from a cold run.
- [x] Review module mock setup/reset in `lib/playground-thread-messages-route.test.ts`, `lib/playground-run-stream-routes.test.ts`, and `lib/playground-share-routes.test.ts`.
- [x] Strengthen mock cleanup only where it prevents cross-test contamination. No additional mock cleanup was needed after the timeout profile was fixed.
- [x] Keep `fileParallelism = false` unless a safer parallel strategy is proven.

## 3. Frontend Boundary

### 3.1 Runtime Layer
- [x] Extract a pure view-model builder or hook from `use-durable-chat-runtime.ts`.
- [x] Add focused tests for the view-model seam before replacing inline logic.
- [x] Extract send/reconcile wiring only after the view-model seam is stable.
- [ ] Keep route/thread/stream/inspector controllers as the current runtime controller boundary; do not introduce a generic controller abstraction.

### 3.2 UI Layer
- [ ] Split `message-list-components.tsx` in small batches.
- [ ] Keep `message-list.tsx` as the composition layer.
- [ ] Keep service-like presentation decisions in `features/durable-chat/service`, not duplicated in JSX.
- [ ] Run component/service tests after each UI split batch.

### 3.3 Markdown Streaming
- [ ] Inspect current markdown code-block render path and Shiki enhancement path.
- [ ] Ensure code block outer wrapper/theme classes are stable across raw fallback and highlighted states.
- [ ] Add a focused DOM/service test that would catch white/dark wrapper swaps during streaming fallback.
- [ ] Avoid remounting entire code blocks for enhancement if a smaller token-span update is enough.

### 3.4 Browser Smoke
- [ ] Add or choose a browser smoke runner that can execute locally without relying on manual Codex browser actions.
- [ ] Keep smoke tests narrow and deterministic.
- [ ] Run smoke tests only where they provide coverage that unit/hook tests cannot.

## 4. Tests

### 4.1 Test Stability Tests / Verification
- [x] Run `pnpm --filter playground-next-web test` from a clean shell and record baseline timing. Baseline failed after about 268s because 4 tests exceeded Vitest's 5s default timeout.
- [x] Run `pnpm --filter playground-fastify-server test` from a clean shell and record baseline timing. Baseline failed after about 181s because 7 tests exceeded Vitest's 5s default timeout.
- [x] Run `pnpm -r --workspace-concurrency=1 --if-present test` after stabilization changes.
- [x] Run `pnpm test` only after targeted suite stability is proven.
- [x] If a timeout remains, capture exact test names and decide whether it is an app issue or a command-profile issue. No timeout remained after stabilization.

### 4.2 Runtime Tests
- [x] Add focused tests for the runtime view-model seam.
- [x] Add focused tests for send/reconcile wiring if that seam is extracted.
- [ ] Keep existing stream/thread/inspector controller tests passing.

### 4.3 UI Tests
- [ ] Keep message presentation service tests passing through UI file moves.
- [ ] Add DOM-level tests only for structure that pure service tests cannot catch.
- [ ] Avoid full-page snapshots.

### 4.4 Browser / Integration Smoke
- [ ] Add smoke for thread switch without center-chat loading interstitial.
- [ ] Add smoke for header title not showing a thread id fallback during known-thread navigation.
- [ ] Add smoke for streaming reconnect final assistant content if a deterministic runtime fixture is available.
- [ ] Add smoke for selection/scroll lock only if the browser runner can reliably simulate selection.
- [ ] Add smoke for markdown code-block wrapper stability if the flicker remains reproducible.

## 5. Recommended Execution Order

### Loop 1: Test Stability Baseline
- [x] Inspect current Vitest config and test scripts across `playground-next-web`, `playground-fastify-server`, and root workspace.
- [x] Reproduce targeted `playground-next-web` test behavior from a clean shell.
- [x] Reproduce targeted `playground-fastify-server` test behavior from a clean shell.
- [x] Identify whether failures are real hangs, default timeout mismatches, CPU-bound tests, or workspace concurrency effects.
- [x] Write down the recommended verification command profile in this todo.
- [x] Run `codex review` for this loop if configuration or test code changed. No configuration or test code changed in Loop 1.
- [x] Commit the baseline/config slice if changes were made and review is clean.

### Loop 2: Stabilize Route/Auth Test Gates
- [x] Apply the smallest test/config changes needed to make targeted app suites stable.
- [x] Strengthen Next route-test mock isolation only if reproduction shows leakage.
- [x] Add or adjust Fastify test timeouts only for tests proven to exceed the default 5s under normal local conditions.
- [x] Run `pnpm --filter playground-next-web test`.
- [x] Run `pnpm --filter playground-fastify-server test`.
- [x] Run `pnpm --filter playground-next-web typecheck` if Next config/test imports changed.
- [x] Run `pnpm --filter playground-fastify-server typecheck` if Fastify config/test imports changed.
- [x] Run `codex review` for this loop after targeted verification passes.
- [x] Commit the test-stability slice if review is clean.

### Loop 3: Runtime View-Model Seam
- [x] Extract pure derived chat view-model logic from `use-durable-chat-runtime.ts`.
- [x] Keep side-effect orchestration and abort-controller ownership in the root hook/controllers.
- [x] Add focused tests for the view-model seam.
- [x] Run `pnpm --filter playground-next-web test`.
- [x] Run `pnpm --filter playground-next-web typecheck`.
- [x] Run manual/browser smoke for normal thread load if the change affects visible props. Not run as a browser pass for this pure seam; the new view-model tests cover the visible prop derivation directly.
- [x] Run `codex review` for this loop after targeted verification passes.
- [x] Commit the runtime view-model slice if review is clean.

### Loop 4: Send/Reconcile Wiring Cleanup
- [x] Identify the smallest send/reconcile wiring extraction that reduces root hook complexity.
- [x] Preserve streaming recovery and completed-turn reconcile behavior.
- [x] Add focused tests before replacing inline wiring.
- [x] Run `pnpm --filter playground-next-web test`.
- [x] Run `pnpm --filter playground-next-web typecheck`.
- [x] Run manual/browser smoke for send completion or attach recovery if feasible. Not run as a browser pass for this controller-only extraction; package and controller tests cover the send/reconcile call contract.
- [x] Run `codex review` for this loop after targeted verification passes.
- [x] Commit the send/reconcile cleanup slice if review is clean.

### Loop 5: Message Leaf UI Split
- [ ] Split one small group of leaf components out of `message-list-components.tsx`.
- [ ] Preserve markup, classes, selectors, accessible labels, and copy.
- [ ] Keep service logic out of leaf UI files.
- [ ] Run `pnpm --filter playground-next-web test`.
- [ ] Run `pnpm --filter playground-next-web typecheck`.
- [ ] Run browser smoke for existing transcript and code-block rendering.
- [ ] Run `codex review` for this loop after targeted verification passes.
- [ ] Commit the message UI split slice if review is clean.

### Loop 6: Markdown Code-Block Stability
- [ ] Inspect fallback vs Shiki-enhanced code-block DOM and class behavior.
- [ ] Add a focused test for stable code-block wrapper/theme treatment during markdown enhancement.
- [ ] Fix only the wrapper/theme/remount behavior needed to prevent visible flicker.
- [ ] Run `pnpm --filter playground-next-web test`.
- [ ] Run `pnpm --filter playground-next-web typecheck`.
- [ ] Run browser smoke on a response containing multiple fenced code blocks if feasible.
- [ ] Run `codex review` for this loop after targeted verification passes.
- [ ] Commit the markdown stability slice if review is clean.

### Loop 7: Minimal Chat Browser Smoke
- [ ] Choose the local smoke runner and fixtures.
- [ ] Add the smallest deterministic smoke for thread switching and title/loading behavior.
- [ ] Add streaming reconnect or markdown smoke only if deterministic fixtures make it reliable.
- [ ] Document how to run the smoke.
- [ ] Run `pnpm --filter playground-next-web test`.
- [ ] Run the new browser smoke command.
- [ ] Run `pnpm --filter playground-next-web typecheck`.
- [ ] Run `codex review` for this loop after targeted verification passes.
- [ ] Commit the browser smoke slice if review is clean.

### Loop 8: Final Hardening
- [ ] Run `pnpm typecheck`.
- [ ] Run the recommended stable workspace test profile from Loop 1/2.
- [ ] Run `pnpm test` if the profile says full workspace parallel test is expected to be stable.
- [ ] Update `docs/playground-next-web-chat-runtime-architecture.md` only if runtime/UI ownership changed.
- [ ] Promote stable long-lived facts into `docs/source-of-truth/*` only if this follow-up creates a reusable concept model.
- [ ] Delete `docs/todolist.md` when this follow-up is complete and any stable facts have been promoted.
- [ ] Run `codex review` for the final hardening loop.
