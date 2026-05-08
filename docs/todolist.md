# Thread Management Todo

## 0. Context and Boundary

### 0.1 Confirmed facts
- [x] This task starts from thread item actions in the sidebar: rename, pin, share, delete.
- [x] Share already exists as an infra capability and should be reused rather than redesigned.
- [x] Thread rename should overwrite `thread.title` directly; v1 does not need separate auto-title vs custom-title fields.
- [x] Thread delete should be modeled as soft delete.
- [x] The repository already has thread lifecycle concepts that should be checked before adding new delete fields.
- [x] Deleting the active thread should navigate to `/new`.
- [x] UI work should prefer shadcn/ui primitives for menu, dialog, and destructive confirmations.
- [x] The current infra boundary discussion indicates `rename`, `archive`, and `share` belong in infra; `pin` should not yet become thread-level infra truth.
- [x] Multiple pinned threads are allowed as a product requirement, but pin is currently better treated as a consumer-level preference, not a `Thread` model field.
- [x] Existing shares should remain accessible after a thread is soft-deleted; delete should not auto-revoke share.

### 0.2 Goals
- [ ] Add infra-backed thread rename capability.
- [ ] Add infra-backed thread archive capability using the existing thread lifecycle model rather than inventing a second delete model.
- [ ] Reuse the existing share flow from thread actions.
- [ ] Expose a sidebar thread actions menu in Vite for rename, share, archive, and pin.
- [ ] Implement pin as a Vite-side list preference only, without changing infra thread truth.
- [ ] Ensure deleting the active thread transitions the app to `/new`.

### 0.3 Non-goals
- [x] Do not introduce a new global `pinnedAt` / `isPinned` field on `Thread` in infra for this task.
- [x] Do not build a per-user preference model in infra as part of this task.
- [x] Do not add segment-level share.
- [x] Do not add hard delete, trash, undo delete, or restore flows.
- [x] Do not redesign the full sidebar architecture.
- [x] Do not build a new share system; reuse the existing snapshot share model.

## 1. Definitions First

### 1.1 Source of Truth
- [x] Verify and align with existing thread lifecycle truth in infra before changing delete semantics.
- [x] Verify whether `Thread.status` and `archivedAt` already cover the needed archive model end-to-end.
- [ ] Decide whether this task needs a follow-up source-of-truth doc for thread lifecycle / thread management after the implementation stabilizes.
- [x] Keep `docs/source-of-truth/share-model.md` as the only long-lived truth for share behavior; do not duplicate share semantics here.

### 1.2 Data model
- [x] Confirm the current `Thread` durable shape in `core` / `db` and document the exact fields reused for archive.
- [x] Reuse `thread.title` for rename with no additional title fields.
- [x] Reuse existing archive lifecycle fields instead of adding `deletedAt` / `isDeleted` if current infra already supports archived threads.
- [ ] Define a Vite-local persistence model for pinned thread ids and ordering semantics.
- [ ] Confirm pin sorting semantics in Vite: pinned first, pinned ordered by latest pin action first, then normal threads by existing list order.

### 1.3 Types / Interfaces
- [x] Add or update core/app interfaces for `renameThread`.
- [x] Add or update core/app interfaces for `archiveThread`.
- [x] Add or update contracts/DTOs for rename and archive responses.
- [ ] Add or update Vite repo interfaces for rename/archive/share actions.
- [ ] Define Vite-local types for pinned thread preferences and pin-aware list projection.

## 2. Backend / Platform

### 2.1 core
- [x] Add thread management use-case surface for rename.
- [x] Add thread management use-case surface for archive.
- [x] Avoid adding thread-level pin truth to core.

### 2.2 contracts
- [x] Add request/response contracts for rename thread.
- [x] Add request/response contracts for archive thread.
- [x] Reuse existing share contracts for the share action entrypoint.

### 2.3 db
- [x] Confirm whether existing thread persistence already supports archive filtering and archive timestamps.
- [x] Implement repository rename behavior.
- [x] Implement repository archive behavior.
- [x] Ensure archived threads are excluded from normal thread list reads.

### 2.4 app
- [x] Add app-layer rename thread flow.
- [x] Add app-layer archive thread flow.
- [x] Preserve share lifecycle independence from thread archive.

### 2.5 routes
- [x] Add route to rename a thread.
- [x] Add route to archive a thread.
- [x] Reuse current share routes from the thread actions flow rather than adding parallel share APIs.

## 3. Frontend Boundary

### 3.1 schema
- [ ] Add parsers/validators for rename/archive route payloads if needed.
- [ ] Keep pin state parsing local to Vite-side preference storage.

### 3.2 repo
- [ ] Add Vite repo functions for rename thread.
- [ ] Add Vite repo functions for archive thread.
- [ ] Reuse the existing share repo facade for thread share actions.
- [ ] Add a Vite repo/storage facade for pin preference persistence.

### 3.3 service
- [ ] Add service logic for thread list projection with pinned-first sorting.
- [ ] Keep pin ordering rules in service-level pure logic with focused tests.
- [ ] Ensure archived threads disappear from projected visible thread lists.

### 3.4 runtime
- [ ] Add thread action runtime state for open/close menus.
- [ ] Add rename flow state and optimistic/local refresh behavior.
- [ ] Add archive flow state and active-thread redirect to `/new`.
- [ ] Add share action wiring that opens the existing share dialog.
- [ ] Add pin/unpin runtime wiring backed by Vite-local preferences.

### 3.5 ui
- [ ] Add a thread actions menu to thread list items using shadcn-style primitives.
- [ ] Add rename UI using shadcn-style input/dialog patterns.
- [ ] Add archive confirmation using shadcn-style destructive confirmation patterns.
- [ ] Add share menu item that launches the existing share dialog.
- [ ] Add pin/unpin menu item and pinned list presentation without exposing infra-level pin semantics.

## 4. Tests

### 4.1 backend / platform tests
- [x] Add rename thread app/repository tests.
- [x] Add archive thread app/repository tests.
- [x] Add route tests for rename.
- [x] Add route tests for archive.
- [x] Add tests proving archive does not revoke existing shares.

### 4.2 frontend repo/service tests
- [ ] Add tests for pin preference persistence.
- [ ] Add tests for pinned-first sorting and latest-pin-first order.
- [ ] Add tests for archived thread omission from visible lists.
- [ ] Add tests for share action integration with existing share state.

### 4.3 frontend runtime/ui tests
- [ ] Add tests for thread actions menu visibility and commands.
- [ ] Add tests for rename success/failure states.
- [ ] Add tests for archive confirmation and redirect to `/new` when active thread is archived.
- [ ] Add tests for share action opening the existing share dialog.
- [ ] Add tests for pin/unpin interaction and reordered list rendering.

## 5. Recommended Execution Order

### Loop 1
- [x] Confirm current infra thread lifecycle fields and archive semantics.
- [x] Implement infra rename and archive surfaces in core/contracts/db/app/routes.
- [x] Add focused backend tests.

### Loop 2
- [ ] Implement Vite repo/schema wiring for rename/archive/share.
- [ ] Implement pin preference storage and service-level sorting rules.
- [ ] Add focused repo/service tests.

### Loop 3
- [ ] Implement sidebar thread actions runtime and UI with shadcn-style primitives.
- [ ] Wire rename, archive, share, and pin actions.
- [ ] Add focused runtime/UI tests.

### Loop 4
- [ ] Verify end-to-end behavior manually in the Vite app.
- [ ] Run targeted review and clean up any source-of-truth promotions if thread lifecycle rules became stable enough for a long-lived doc.
