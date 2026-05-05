# Message Pagination Plan

## Goal

Add durable transcript pagination without pushing more state complexity into `apps/playground-next-web`.

The target model is:

- stable per-thread ordering by `seq ASC`
- tail-first initial window for product consumers
- cursor-based pagination for older/newer slices
- optimistic user rows and live assistant drafts remain overlay state, not durable page state

## Best-Practice Constraints

- Use cursor pagination, not offset pagination.
- Use durable `threadId + seq` as the cursor basis, not `createdAt`.
- Keep API responses in `seq ASC` order even when loading older messages.
- Support `before` for older history and `after` for incremental catch-up.
- Preserve current consumers until UI support is ready:
  - `/api/threads/:threadId/messages` without pagination params should keep existing full-thread behavior for now.

## Rollout

### M1: Contract And Read Path

- `packages/core`
  - add paged message repository types
- `packages/db`
  - add keyset message-page queries for SQLite and PostgreSQL repos
- `packages/app`
  - add `threads.getMessagesPage(...)`
- `packages/contracts`
  - add thread message page info DTO
- `packages/durable-chat-server`
  - support `limit` / `before` / `after` on the messages route
  - encode/decode opaque cursors
- `packages/durable-chat-client`
  - normalize paged message responses
  - add paged fetch helper while preserving current full-read helper compatibility

Acceptance:

- backend can return the latest window
- backend can return older messages before a cursor
- response includes `pageInfo`
- existing consumers keep working without pagination params

### M2: Client Runtime Integration

- move transcript state from “single full array” toward “durable page window + overlay”
- add explicit `history-loading` style runtime state
- change send reconcile to use incremental `after(lastDurableSeq)` catch-up instead of full reload where possible

Acceptance:

- thread activation can choose tail-first paging
- send completion no longer depends on whole-thread transcript reload
- reconnect/reload can incrementally catch up newer durable rows

### M3: UI Behavior

- add “load older messages”
- preserve scroll anchor when prepending older pages
- keep bottom auto-scroll only when the user is already near the bottom

Acceptance:

- loading older history does not jump the viewport
- long threads no longer require full transcript hydrate on first open
