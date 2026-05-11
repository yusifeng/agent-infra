# Playground Vite Runtime Maintainability Todo

## 0. Context and Boundary

### 0.1 Confirmed facts
- [x] `apps/playground-vite-web` is the current Vite + React consumer surface for durable chat behavior.
- [x] The largest current maintainability hotspot is `apps/playground-vite-web/src/features/durable-chat/runtime/use-durable-chat-runtime.ts`.
- [x] `use-durable-chat-runtime.ts` currently mixes runtime state glue, route lifecycle, message hydration, send/reconcile orchestration, scroll behavior, title refresh, dialog state, and thread actions.
- [x] `apps/playground-vite-web/src/features/durable-chat/components/message-list.tsx` is also large, but it has stronger focused rendering coverage and should not be the first optimization target.
- [x] This task is a code maintainability/refactoring task, not a product behavior change.
- [x] TanStack Query is not part of this first optimization pass.

### 0.2 Goals
- [x] Improve `apps/playground-vite-web` maintainability by reducing `use-durable-chat-runtime.ts` responsibility width.
- [x] Add or confirm focused tests before each refactor slice.
- [x] Preserve existing user-visible behavior and hook return shape unless a small interface change is explicitly justified.
- [x] Split low-risk controller responsibilities out of `use-durable-chat-runtime.ts` in independently verifiable loops.
- [x] Keep each loop small enough to typecheck, test, review, and commit independently.

### 0.3 Non-goals
- [x] Do not introduce TanStack Query in this task.
- [x] Do not introduce Zustand, Redux, Jotai, or another client-state library.
- [x] Do not rewrite the send stream, SSE handling, completed-turn reconciliation, or live assistant draft flow in the first slices.
- [x] Do not change API contracts, database schema, or package-level durable runtime contracts.
- [x] Do not redesign the chat UI.
- [x] Do not opportunistically delete unrelated code or refactor unrelated files.

## 1. Definitions First

### 1.1 Source of Truth
- [x] Existing durable chat frontend model docs remain authoritative where relevant.
- [x] Existing `docs/source-of-truth/playground-thread-auto-title-model.md` governs auto-title behavior.
- [x] Existing `docs/source-of-truth/playground-chat-mode-model.md` governs selected model and chat mode behavior.
- [x] Existing `docs/source-of-truth/playground-search-browse-policy-model.md` governs search/browse presentation semantics.
- [x] Existing `docs/source-of-truth/share-model.md` governs share behavior.
- [x] Do not create a new source-of-truth doc at the start of this task.
- [ ] Re-evaluate after the refactor whether stable Vite runtime ownership rules should be promoted to `docs/source-of-truth/*`.

### 1.2 Runtime ownership
- [x] `useDurableChatRuntime` should remain the facade consumed by `DurableChatConsole`.
- [x] `useChatSessionController` remains the owner of durable chat session state for this task.
- [x] `sendMessage`, `runSendMessageFlow`, and `runReconcileCompletedTurn` remain behaviorally intact during the first low-risk slices.
- [x] Extract DOM/viewport refs and effects into a dedicated controller hook.
- [ ] Extract auto-title refresh and title typing refs/effects into a dedicated controller hook.
- [ ] Extract thread menu/rename/archive/pin action state into a dedicated controller hook after lower-risk slices are stable.

### 1.3 Types / Interfaces
- [x] Keep `useDurableChatRuntime` return fields stable for `DurableChatConsole`.
- [x] Define narrow argument and return types for each extracted controller hook.
- [x] Avoid passing the full runtime state object into extracted hooks when a smaller explicit input set is enough.
- [x] Keep controller hooks colocated under `apps/playground-vite-web/src/features/durable-chat/runtime`.
- [x] Prefer named exports for new runtime helpers and hooks.

## 2. Frontend Boundary

### 2.1 Runtime
- [x] Identify the exact viewport/scroll/textarea code to extract from `use-durable-chat-runtime.ts`.
- [x] Identify the exact auto-title refresh/title typing code to extract from `use-durable-chat-runtime.ts`.
- [ ] Identify the exact thread action state and handlers to extract after the first two slices.
- [x] Preserve existing ref-based guards where they protect async races.
- [x] Do not convert runtime control refs into React state unless tests prove the behavior remains correct.

### 2.2 Components
- [ ] Keep `DurableChatConsole` behavior unchanged while `useDurableChatRuntime` remains the facade.
- [ ] Defer `message-list.tsx` splitting until runtime controller extraction has completed.
- [ ] If `message-list.tsx` is later split, preserve `ChatMessageList` props and current test-visible markup semantics.

### 2.3 Services and Repo
- [x] No repo/API changes are planned for the first controller extraction loop.
- [ ] Only change service or repo modules if a controller extraction exposes a small, clearly reusable pure helper.

## 3. Tests

### 3.1 Existing coverage to preserve
- [x] `use-durable-chat-runtime.test.tsx` covers live draft restore, send reconciliation, scroll behavior, search prefetch, auto-title refresh, model selection, and rename behavior.
- [x] `message-list.test.tsx` covers answer containers, thinking containers, search summaries, raw tool payload hiding, and action host behavior.
- [x] `use-search-panel-state.test.tsx` covers search panel loading, cache exposure, inflight dedupe, active thread reset, and error behavior.
- [x] `use-share-dialog-state.test.tsx` covers share creation/copy and revoke behavior.

### 3.2 Tests to add or confirm before refactor
- [x] Add or confirm tests for active-thread switch scroll-to-bottom behavior.
- [x] Add or confirm tests for older-message prepend anchor behavior.
- [x] Add or confirm tests for older-message load cancellation/failed apply clearing the pending anchor.
- [x] Add or confirm tests for title refresh cleanup on unmount.
- [x] Add or confirm tests for auto-title fetch failures not mutating thread state.
- [x] Add or confirm tests for non-default titles not starting title typing animation.
- [ ] Add or confirm tests for archiving the active thread resetting runtime and navigating to `/new`.
- [ ] Add or confirm tests for archiving a non-active thread only removing that thread from the list.
- [ ] Add or confirm tests for pin/unpin failures surfacing `threadActionError` without mutating thread order.
- [ ] Add or confirm tests for empty rename titles not calling the rename API.

### 3.3 Verification commands
- [x] Run targeted runtime tests for each loop:

```sh
pnpm --dir apps/playground-vite-web exec vitest run src/features/durable-chat/runtime/use-durable-chat-runtime.test.tsx
```

- [x] Run new controller hook tests when introduced:

```sh
pnpm --dir apps/playground-vite-web exec vitest run src/features/durable-chat/runtime/<new-controller>.test.tsx
```

- [ ] Run component regression tests when touching message list or shell wiring:

```sh
pnpm --dir apps/playground-vite-web exec vitest run src/features/durable-chat/components/message-list.test.tsx
```

- [x] Run Vite app typecheck after each implementation loop:

```sh
pnpm --filter playground-vite-web typecheck
```

- [x] Run slice-level review before committing each meaningful slice:

```sh
codex review --uncommitted -c model="gpt-5.3-codex" -c model_reasoning_effort="medium"
```

## 4. Recommended Execution Order

### Loop 1: Viewport / Scroll / Textarea Controller
- [x] Add or confirm missing scroll and prepend-anchor tests.
- [x] Create a dedicated viewport controller hook under `runtime`.
- [x] Move `messagesViewportRef`, `textareaRef`, `pendingPrependAnchorRef`, and `shouldAutoScrollRef` ownership into the controller where practical.
- [x] Move textarea height syncing into the controller.
- [x] Move scroll listener and scroll-to-bottom behavior into the controller.
- [x] Move older-message prepend anchor capture/apply helpers into the controller.
- [x] Keep `useDurableChatRuntime` return fields stable: `messagesViewportRef`, `textareaRef`, `onScrollToBottom`.
- [x] Run targeted tests and typecheck.
- [x] Run `codex review` for the slice.
- [x] Commit the clean slice if tests and review pass.

### Loop 2: Auto-title Refresh / Typing Title Controller
- [x] Add or confirm missing auto-title cleanup and failure tests.
- [x] Create a dedicated title refresh controller hook under `runtime`.
- [x] Move `typingTitleState`, title typing timer, title refresh request id, and title refresh abort controller into the controller.
- [x] Preserve active-thread guards for title animation.
- [x] Preserve manual rename protection against in-flight auto-title refresh.
- [x] Expose only the small API needed by `useDurableChatRuntime`, such as current visible title data, visible thread patching data, stop typing, and refresh-after-run.
- [x] Run targeted tests and typecheck.
- [x] Run `codex review` for the slice.
- [ ] Commit the clean slice if tests and review pass.

### Loop 3: Thread Actions Controller
- [ ] Add or confirm missing archive, pin/unpin failure, and empty rename tests.
- [ ] Create a dedicated thread actions controller hook under `runtime`.
- [ ] Move open menu, rename dialog, archive dialog, action loading, and action error state into the controller.
- [ ] Move rename/archive/pin/unpin handlers into the controller.
- [ ] Preserve active-thread archive behavior: stop live response, reset draft thread state, clear recovery state, and navigate to `/new`.
- [ ] Preserve share action behavior through the existing share dialog hook.
- [ ] Run targeted tests and typecheck.
- [ ] Run `codex review` for the slice.
- [ ] Commit the clean slice if tests and review pass.

### Loop 4: Message List Maintainability Assessment
- [ ] Re-check `message-list.tsx` after runtime extraction.
- [ ] Identify whether the highest-value split is pure thinking-flow helpers, subcomponents, or both.
- [ ] Add focused tests only if current `message-list.test.tsx` does not protect the intended split.
- [ ] Extract pure helpers before extracting rendered subcomponents.
- [ ] Preserve `ChatMessageList` public props.
- [ ] Run message-list tests and typecheck.
- [ ] Run `codex review` for the slice.
- [ ] Commit the clean slice if tests and review pass.

### Loop 5: Server-state Library Re-evaluation
- [ ] Re-evaluate after controller extraction whether TanStack Query is still needed.
- [ ] If needed, scope TanStack Query only to server state, such as search panel result cache, share state, auth me, runtime meta, or thread list.
- [ ] Do not use TanStack Query to own live draft, send stream, scroll state, dialog state, or local input draft.

## 5. Completion Criteria
- [ ] `use-durable-chat-runtime.ts` has materially narrower responsibility without behavior regressions.
- [ ] New controller hooks have focused tests or are covered by existing runtime facade tests.
- [ ] Existing durable chat source-of-truth semantics are preserved.
- [ ] Targeted tests pass for each slice.
- [ ] `pnpm --filter playground-vite-web typecheck` passes.
- [ ] Slice-level `codex review` findings are addressed or explicitly accepted.
- [ ] If stable ownership rules emerge, move them to `docs/source-of-truth/*`; otherwise keep no parallel durable facts outside this todo.
- [ ] Delete `docs/todolist.md` when the task is complete.
