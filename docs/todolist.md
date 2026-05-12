# Playground Auto-Title Stream Event Todo

## 0. Context and Boundary

### 0.1 Confirmed facts
- [x] Auto-title writeback already persists successfully to the thread record; refresh shows the new title without any database changes.
- [x] The visible sidebar thread title, chat header title, and `document.title` all currently derive from the same frontend title-refresh path.
- [x] The current auto-title UX depends on frontend polling after the main run completes, so delayed writeback can miss the typing animation window.
- [x] This fix should stay inside the playground business boundary and must not push auto-title semantics into shared infra models.

### 0.2 Goals
- [ ] Replace auto-title polling as the primary update path with a playground-scoped stream event emitted after auto-title rename succeeds.
- [ ] Make sidebar title, chat header title, and `document.title` update immediately from the same event-driven source.
- [ ] Preserve the existing local typing animation, but trigger it from the new title event rather than from short polling luck.

### 0.3 Non-goals
- [x] Do not change database schema, add tables, or add migrations.
- [x] Do not add auto-title-specific event types to `packages/contracts`.
- [x] Do not change `RunStreamEventDto` semantics for shared consumers.
- [x] Do not redesign manual rename behavior in this task.
- [x] Do not generalize a full cross-app event bus beyond what is required for playground title updates.

## 1. Definitions First

### 1.1 Source of Truth
- [ ] Confirm whether any existing durable chat source-of-truth doc needs a short note about playground-private stream events.
- [ ] If a stable pattern emerges, promote that pattern into `docs/source-of-truth/*` after implementation instead of keeping it only in the todo.

### 1.2 Event model
- [x] Public stream events remain `RunStreamEventDto` from `packages/contracts`.
- [x] Playground business events are modeled separately as `PlaygroundPrivateStreamEventDto`.
- [x] The full playground stream union is `PlaygroundStreamEventDto = RunStreamEventDto | PlaygroundPrivateStreamEventDto`.
- [x] The first private event is `thread.title_updated`.
- [x] `thread.title_updated` should carry `threadId`, `title`, and `updatedAt` directly instead of forcing a follow-up fetch.

### 1.3 Type / parser ownership
- [x] Define `PlaygroundPrivateStreamEventDto` and `PlaygroundStreamEventDto` under the playground app boundary, not in `packages/contracts`.
- [x] Add a playground-local stream normalizer/parser that accepts both shared `run.*` events and playground-private events.
- [x] Keep the generic durable chat client parser focused on `RunStreamEventDto` only.

## 2. Backend / Platform Boundary

### 2.1 Fastify stream emission
- [x] Add a playground-local SSE event builder/encoder path for `thread.title_updated`.
- [x] Emit `thread.title_updated` only after auto-title rename succeeds.
- [x] Include the persisted final title and thread `updatedAt` in the emitted event payload.
- [x] Ensure the event is only written when the current SSE connection is still open.

### 2.2 Route integration
- [x] Update `/api/threads/:threadId/runs/stream` in the fastify playground app to emit the private title event after successful auto-title writeback.
- [x] Keep existing `run.ready`, `run.state`, `run.assistant`, `run.completed`, and `run.failed` behavior unchanged.
- [x] Avoid introducing any coupling from the fastify route into shared runtime or shared durable chat protocol types.

## 3. Frontend Boundary

### 3.1 Stream parsing
- [ ] Add a playground-local stream event parser/normalizer for `PlaygroundStreamEventDto`.
- [ ] Route shared `run.*` events through the existing durable chat flow.
- [ ] Route `thread.title_updated` through a playground-local handler without modifying shared client stream semantics.

### 3.2 Runtime / state updates
- [ ] Patch the matching local thread record immediately when `thread.title_updated` arrives.
- [ ] If the updated thread is the active thread and the local title was still default, start the local typing animation from the event payload.
- [ ] Keep sidebar, header, and `document.title` sourced from the same local thread/title state so one patch updates all three surfaces.

### 3.3 Polling fallback
- [ ] Decide whether to keep the existing auto-title polling as a short-term fallback path or remove it entirely after event-driven updates are verified.
- [ ] If kept, downgrade polling to a fallback role and document that event delivery is the primary path.

## 4. Tests

### 4.1 Backend tests
- [x] Add/extend fastify route tests to verify `thread.title_updated` is emitted after successful auto-title writeback.
- [x] Verify no private title event is emitted when auto-title is skipped or generation fails.

### 4.2 Frontend tests
- [x] Add parser tests for the playground-local stream union and `thread.title_updated`.
- [ ] Add runtime tests that a private title event updates sidebar/header/document title from a single local patch.
- [ ] Add runtime tests that the typing animation starts from `thread.title_updated` when the thread was still on the default title.
- [ ] Preserve coverage that manual rename cannot be overwritten by late auto-title behavior.

## 5. Recommended Execution Order

### Loop 1
- [x] Define playground-private stream DTOs and the playground-local parser/normalizer boundary.
- [x] Add focused tests for parsing/normalization.
- [x] Run targeted verification and `codex review`, then commit.

### Loop 2
- [x] Emit `thread.title_updated` from the fastify stream route after successful auto-title writeback.
- [x] Add/extend fastify server tests for success/skip/failure cases.
- [x] Run targeted verification and `codex review`, then commit.

### Loop 3
- [ ] Consume `thread.title_updated` in the Vite runtime and patch the local thread/title state.
- [ ] Trigger typing animation from the event-driven path.
- [ ] Verify sidebar/header/document title all update from the same event.
- [ ] Run targeted verification and `codex review`, then commit.

### Loop 4
- [ ] Re-evaluate the old polling logic and either demote it to fallback or remove it if redundant.
- [ ] Update any durable chat maintenance/source-of-truth docs that need to mention the new playground-private stream boundary.
- [ ] Run final targeted verification and `codex review`, then delete `docs/todolist.md` when all items are complete.
