# Playground Next Web Chat Refactor Todo

## 0. Context and Boundary

### 0.1 Confirmed facts
- [x] `apps/playground-next-web` is the first consumer, experiment harness, and validation surface for `agent-infra`, but it is not the product boundary.
- [x] `apps/playground-next-web/components/chat-shell/message-list.tsx` is about 1000 lines and currently mixes transcript list rendering, user message cards, persisted assistant cards, live assistant cards, thinking/research timelines, answer containers, actions, and empty/loading/error states.
- [x] `apps/playground-next-web/features/durable-chat/runtime/use-durable-chat-runtime.ts` is about 1100 lines and currently coordinates thread navigation, message loading, send, attach/recovery, completed-turn reconcile, inspector hydration, title refresh, and viewport-adjacent state.
- [x] `docs/playground-next-web-chat-runtime-architecture.md` defines the current chat runtime boundary: Live UI Path, Durable Projection Path, and Background / Debug Path.
- [x] Reusable browser-side runtime flows already live in `packages/durable-chat-client`; the Next app should keep React, router, DOM/viewport, shell UI, and demo composition concerns local.
- [x] Recent regressions involved subtle behavior around streaming, thread switching, durable reconcile, loading interstitials, title fallback flashes, auto-scroll, and markdown code-block fallback rendering.
- [x] Refactoring without behavior tests is high risk because several important behaviors depend on timing between live draft state, durable transcript projection, router transitions, and DOM layout.

### 0.2 Goals
- [x] Reduce bug-fix latency by splitting oversized chat files along existing architecture seams.
- [x] Preserve the current user-visible chat behavior while refactoring.
- [x] Add behavior-lock tests before moving runtime or rendering logic.
- [x] Make `message-list.tsx` a composition layer rather than a mixed rendering/service file.
- [ ] Make `use-durable-chat-runtime.ts` a composition layer rather than the main state machine.
- [ ] Keep reusable durable runtime behavior in `packages/*` when it represents platform capability rather than Next-only UI behavior.

### 0.3 Non-goals
- [x] Do not redesign the chat UI or change copy/visual treatment as part of this refactor.
- [x] Do not introduce SWR, React Query, Zustand, Redux, or another external state library in this pass.
- [x] Do not rewrite the chat page into a server-first architecture.
- [x] Do not change durable contracts, DB schema, route DTOs, or runtime protocol unless a behavior-lock test exposes an actual package boundary gap.
- [x] Do not move Next-only shell UI into `packages/*`.
- [x] Do not implement new product features such as unread markers, search target jump, per-thread scroll persistence, or new inspector UX in this pass.
- [x] Do not do broad cleanup of unrelated files while refactoring chat.
- [x] Do not use broad full-page snapshots as the main behavior lock; prefer focused service, hook, or DOM assertions.
- [x] Do not introduce global React context or an external store just to make file splitting easier.
- [x] Do not move markdown visual theme, Shiki worker behavior, Tailwind classes, router state, document title, or DOM viewport logic into shared packages.
- [x] Do not reintroduce `run.event` / `run.tool` debug events into the center chat hot path as part of this cleanup.

## 1. Definitions First

### 1.1 Source of Truth
- [ ] Reconfirm that each planned extraction stays consistent with `docs/playground-next-web-chat-runtime-architecture.md`.
- [ ] Decide which facts from the refactor are stable enough to promote into `docs/source-of-truth/*` after implementation.
- [ ] Keep `docs/todolist.md` as the working plan only; do not create a parallel architecture note until behavior and boundaries stabilize.

### 1.2 Behavior Lock Matrix
- [x] Lock streaming completion behavior: a live assistant draft remains visible through completion until the durable transcript has visible assistant content.
- [x] Lock thread-switching-during-stream behavior: switching from thread A to B and back to A continues showing the active stream and shows the final reply when the run completes.
- [x] Lock completed-turn reconcile behavior: an empty durable assistant shell must not clear a visible live draft.
- [x] Lock auto-scroll behavior: near-bottom users follow streaming, detached users are not pulled to bottom, text selection blocks auto-follow, and prepending history preserves visual anchor.
- [x] Lock thread switch behavior: switching threads does not show a visible `loading messages` interstitial in the center chat area.
- [x] Lock title behavior: thread header should not flash a thread id fallback before the resolved title is displayed.
- [x] Lock pending-title stale behavior: a pending navigation title for thread A must never render in thread B.
- [x] Lock generated-title typing behavior: title typing/animation cancels when the active thread changes.
- [ ] Lock markdown streaming behavior: code blocks keep stable wrapper/theme treatment while Shiki or markdown enhancement completes.
- [x] Lock send behavior: sending a new user message intentionally returns the active thread to bottom-follow mode.
- [ ] Lock historical pagination behavior: loading older messages keeps the reader's current visual position stable.
- [x] Lock stale attach cleanup behavior: a stale attach request's completion/finally path must not clear the current thread's live stream state.
- [x] Lock inspector separation behavior: inspector hydration, selected-run persistence, and debug/search prefetch must not drive center chat loading or clear live draft.

### 1.3 Data Model
- [ ] Keep durable thread, run, and message DTOs unchanged unless a test proves that package-level behavior cannot be expressed with the current contracts.
- [x] Keep presentation-only derived shapes inside `apps/playground-next-web/features/durable-chat/service` unless they become reusable across consumers.
- [ ] Identify any runtime state that is currently duplicated between Next UI and `@agent-infra/durable-chat-client`; remove duplication only when behavior tests already cover the path.

### 1.4 Types / Interfaces
- [x] Define the message UI split boundaries before editing: list shell, user card, assistant transcript card, live assistant card, thinking timeline, research timeline, message part, answer container, actions, and empty states.
- [x] Define the runtime split boundaries before editing: thread navigation/load, send/attach stream lifecycle, completed-turn reconcile, inspector hydration, title/meta refresh, and viewport coordination.
- [x] Keep exported component/hook props stable unless a narrower internal type reduces coupling without changing public usage.
- [x] Prefer pure service functions for behavior that can be tested without React or DOM.
- [x] Define a small message-list render decision seam before extracting leaf UI components, so service-like visibility/grouping logic does not get duplicated across JSX files.

## 2. Backend / Platform

### 2.1 Package Boundary
- [x] Review whether any logic found during runtime extraction belongs in `packages/durable-chat-client` instead of the Next app.
- [x] Move only reusable runtime/client behavior into packages; keep router, DOM, and shell rendering local to `playground-next-web`.
- [ ] If package behavior changes, add package-level tests before updating the Next consumer.

### 2.2 Contracts / Routes / DB
- [x] Confirm no contract, route, or DB change is required for the first UI split.
- [x] Confirm no contract, route, or DB change is required for the first runtime split.
- [ ] If a contract or route gap appears, pause the refactor loop and create a smaller package-first implementation slice.

## 3. Frontend Boundary

### 3.1 Service Layer
- [x] Inventory existing service helpers used by `message-list.tsx` and `use-durable-chat-runtime.ts`.
- [x] Add missing pure tests around presentation builders before extracting React components.
- [x] Keep markdown/code-block transformation behavior centralized instead of duplicating fallback logic across components.

### 3.2 Runtime Layer
- [x] Treat `use-durable-chat-runtime.ts` extraction as higher risk than `message-list.tsx` extraction.
- [x] Add or strengthen runtime-flow tests before moving send, attach, or reconcile logic.
- [x] Keep the root hook responsible for composition and dependency injection after extraction.
- [x] Keep abort-controller ownership explicit in whichever controller owns the corresponding async flow.

### 3.3 UI Layer
- [x] Split `message-list.tsx` into feature-local components without changing markup semantics or CSS class behavior.
- [x] Keep memoization decisions local and evidence-driven; do not add blanket `memo`, `useMemo`, or `useCallback` as a substitute for state-boundary cleanup.
- [x] Avoid changing visual hierarchy while extracting components.
- [x] Keep `components/chat-shell` from continuing to accumulate unrelated feature panels once the new directory shape is clear.

### 3.4 Directory Shape
- [x] Propose the final directory shape only after the first UI and runtime slices prove the seams.
- [x] Prefer feature-local directories such as `features/durable-chat/ui/messages`, `features/durable-chat/ui/shell`, and `features/durable-chat/runtime/controllers` if they match actual code ownership.
- [x] Move files in small batches with behavior tests passing between moves.

## 4. Tests

### 4.1 Pre-Refactor Behavior Tests
- [x] Add or strengthen tests for live draft retention through completed-turn reconcile.
- [x] Add or strengthen tests for thread switch attach/recovery while a run is streaming.
- [x] Add or strengthen tests that an empty durable assistant shell does not clear visible assistant content.
- [x] Add or strengthen tests for title selection so thread id is not used as the normal header fallback during known-thread navigation.
- [x] Add or strengthen tests for markdown code block fallback stability during streaming.
- [x] Add or strengthen tests for live-run persisted transcript filtering so the current live assistant does not duplicate with durable blocks.
- [x] Add or strengthen tests for stale attach event/finally guards so old attach requests cannot mutate the active thread state.
- [x] Add or strengthen tests for pending title and title typing stale guards.
- [x] Add or strengthen tests for inspector/search/debug prefetch staying out of the center chat loading path.

### 4.2 Viewport / DOM Tests
- [x] Add or strengthen tests for near-bottom streaming auto-follow using `behavior: 'auto'`.
- [x] Add or strengthen tests for detached reader state where streaming chunks do not force bottom scroll.
- [x] Add or strengthen tests for text selection intersecting the messages viewport blocking auto-follow.
- [x] Add or strengthen tests for selection clearing restoring state from current scroll position.
- [x] Add or strengthen tests for prepending older messages preserving visual anchor.
- [x] Add or strengthen tests for user clicking jump-to-bottom using smooth scroll except under reduced motion.

### 4.3 UI Extraction Tests
- [x] Add focused tests for message presentation helpers that feed user, assistant, live assistant, thinking, research, and answer-container rendering.
- [x] Add snapshot or DOM-level tests only where they catch real regressions in structure that pure service tests cannot catch.
- [x] Avoid brittle full-page snapshots for the chat shell.

### 4.4 Targeted Verification Commands
- [x] Run `pnpm --filter playground-next-web test` after each frontend behavior or extraction slice.
- [x] Run `pnpm --filter playground-next-web typecheck` after each extraction slice that changes component or hook boundaries.
- [ ] Run `pnpm --filter @agent-infra/durable-chat-client test` if any shared runtime package behavior changes.
- [ ] Run `pnpm typecheck` before considering the full refactor complete.

### 4.5 Manual / Browser Verification
- [x] Verify streaming in the active thread still renders progressively.
- [x] Verify switching away from a streaming thread and back continues showing the stream and final reply.
- [x] Verify switching threads has no visible center-chat loading interstitial.
- [x] Verify thread title does not flash a thread id fallback.
- [ ] Verify selecting text while streaming does not pull the viewport to bottom.
- [ ] Verify markdown code blocks do not flicker between white and dark treatments while streaming.
- [ ] Verify loading older messages preserves reader position.

## 5. Recommended Execution Order

### Loop 0: Preflight
- [x] Inspect current dirty worktree and separate unrelated local changes from the refactor. Current refactor diff is limited to `docs/todolist.md`; `repomix-output/` is ignored.
- [x] Resolve or quarantine the `apps/playground-next-web/next-env.d.ts` generated-path issue because it currently interferes with clean review. The file is not dirty in this loop; keep it out of the chat refactor diff and handle only if a later clean-review gate flags tracked generated output.
- [x] Confirm `pitfalls.md` is unrelated to this refactor unless the user explicitly includes it. It is not dirty in this loop.
- [x] Run the narrowest existing tests that cover current chat behavior to establish a baseline. `pnpm --filter playground-next-web test` and `pnpm --filter playground-next-web typecheck` pass before behavior-lock work begins.

### Loop 1A: Pure Behavior-Lock Tests
- [x] Add missing pure tests for streaming draft retention, completed-turn reconcile, empty assistant shell handling, live-run transcript filtering, send `text_end` bridge behavior, stale thread load guards, and markdown fallback wrapper stability.
- [x] Use existing package/app service test files where possible instead of introducing broad integration snapshots.
- [x] Do not move or split production files in this loop except to expose pure functions required for testing.
- [x] Run `pnpm --filter playground-next-web test`.
- [x] Run `pnpm --filter @agent-infra/durable-chat-client test` if package-level tests changed.
- [x] Run `pnpm --filter playground-next-web typecheck`.
- [x] Run `codex review` for this loop after targeted verification passes.
- [x] Commit the pure behavior-lock test slice if review is clean.

- [x] Add focused hook/DOM tests for viewport selection lock, detached reader behavior, near-bottom follow, prepend anchor restoration, pending title stale guards, and generated-title typing cancellation.
- [x] Keep browser-only perception checks in the manual checklist instead of forcing brittle full-page snapshots.
- [x] Run `pnpm --filter playground-next-web test`.
- [x] Run `pnpm --filter playground-next-web typecheck`.
- [x] Run `codex review` for this loop after targeted verification passes.
- [x] Commit the hook/DOM behavior-lock test slice if review is clean.

- [x] Extract a small pure message-list presentation helper for render decisions such as silent loading placeholder, empty state, transcript rows, live assistant row, and action availability.
- [x] Add focused tests for the helper before changing leaf components.
- [x] Keep CSS classes, React state, DOM refs, and user-facing copy out of the service helper.
- [x] Run `pnpm --filter playground-next-web test`.
- [x] Run `pnpm --filter playground-next-web typecheck`.
- [x] Run `codex review` for this loop after targeted verification passes.
- [x] Commit the message render decision seam if review is clean.

### Loop 3: Message UI Split
- [x] Split `message-list.tsx` into message UI components along the boundaries defined in section 1.4.
- [x] Preserve existing rendering behavior, class names, and user-visible copy.
- [x] Keep service logic out of newly extracted UI components.
- [x] Preserve observable selectors such as message role/id/render-key and markdown code block selectors.
- [x] Run `pnpm --filter playground-next-web test`.
- [x] Run `pnpm --filter playground-next-web typecheck`.
- [x] Run manual browser verification for streaming, title, markdown, and thread switching.
- [x] Run `codex review` for this loop after targeted verification passes.
- [x] Commit the UI split slice if review is clean.

### Loop 4: Message Service Cleanup
- [x] Move any remaining pure presentation logic out of UI components and into `features/durable-chat/service`.
- [x] Add or update service tests for extracted logic.
- [x] Run `pnpm --filter playground-next-web test`.
- [x] Run `pnpm --filter playground-next-web typecheck`.
- [x] Run `codex review` for this loop after targeted verification passes.
- [x] Commit the service cleanup slice if review is clean.

### Loop 5: Runtime Test Seams
- [x] Define only the minimum controller seams needed for testing stream lifecycle, thread load/navigation, and inspector hydration; do not design a large controller architecture upfront.
- [x] Add tests around the highest-risk runtime flows before moving implementation code.
- [x] Keep `use-durable-chat-runtime.ts` behavior unchanged in this loop unless a tiny extraction is necessary for testability.
- [x] Run `pnpm --filter playground-next-web test`.
- [x] Run `pnpm --filter playground-next-web typecheck`.
- [x] Run `codex review` for this loop after targeted verification passes.
- [x] Commit the runtime-test seam slice if review is clean.

### Loop 6: Stream Lifecycle Runtime Split
- [x] Extract send, attach/recovery, live draft, and completed-turn reconcile coordination into a bounded runtime controller.
- [x] Preserve the current subscription/recovery behavior when navigating away from and back to a streaming thread.
- [x] Preserve the rule that empty durable assistant shells do not clear visible live assistant content.
- [x] Run `pnpm --filter playground-next-web test`.
- [x] Run `pnpm --filter playground-next-web typecheck`.
- [x] Run manual browser verification for thread A streaming, switch to thread B, return to thread A, and complete response.
- [x] Run `codex review` for this loop after targeted verification passes.
- [x] Commit the stream lifecycle split slice if review is clean.

### Loop 7: Thread Load / Navigation Runtime Split
- [x] Extract thread navigation and message loading coordination into a bounded runtime controller.
- [x] Preserve silent center-chat loading semantics during thread switch.
- [x] Preserve pending navigation title behavior without thread id fallback flashes.
- [x] Run `pnpm --filter playground-next-web test`.
- [x] Run `pnpm --filter playground-next-web typecheck`.
- [x] Run manual browser verification for normal thread switching and no visible loading interstitial.
- [x] Run `codex review` for this loop after targeted verification passes.
- [x] Commit the thread load/navigation split slice if review is clean.

### Loop 8: Inspector Runtime Split
- [x] Extract inspector hydration and selected-run coordination into a bounded runtime controller.
- [x] Keep the center chat path independent from optional inspector/debug hydration.
- [x] Preserve the rule that inspector hydration and selected-run persistence cannot clear live draft or drive main loading.
- [x] Run `pnpm --filter playground-next-web test`.
- [x] Run `pnpm --filter playground-next-web typecheck`.
- [x] Run manual browser verification for current chat route stability; in-chat inspector open/close/replay is not applicable because the current chat shell does not render an inspector entry point.
- [x] Run `codex review` for this loop after targeted verification passes.
- [ ] Commit the inspector split slice if review is clean.

### Loop 9: Directory Reorganization
- [x] Move extracted files into the final feature-local directory shape only after imports and ownership are clear.
- [x] Update imports without changing behavior.
- [x] Run `pnpm --filter playground-next-web test`.
- [x] Run `pnpm --filter playground-next-web typecheck`.
- [x] Run `codex review` for this loop after targeted verification passes.
- [ ] Commit the directory organization slice if review is clean.

### Loop 10: Final Hardening
- [ ] Run `pnpm typecheck`.
- [ ] Run `pnpm test` if the accumulated changes touched shared packages or behavior outside `playground-next-web`.
- [ ] Repeat the manual browser verification checklist in section 4.5.
- [ ] Promote stable long-lived architecture facts into `docs/source-of-truth/*` or update `docs/playground-next-web-chat-runtime-architecture.md` if needed.
- [ ] Delete `docs/todolist.md` when the refactor is complete and stable facts have been promoted.
- [ ] Run `codex review` for the final hardening loop.
