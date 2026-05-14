# Message Pagination Model

This document is the source of truth for durable transcript pagination.

It records the stable model after the original rollout plan was implemented.
It is not a migration checklist.

## Goal

Thread message reads should support long durable transcripts without requiring
every consumer to hydrate the entire thread on first load.

The stable model is:

- per-thread ordering by durable `seq ASC`
- tail-first initial windows for interactive consumers
- keyset pagination for older and newer slices
- optimistic user rows and live assistant drafts remain overlay state, not
  durable page state

## Cursor Basis

Pagination is based on durable message sequence, not timestamps.

The internal cursor basis is:

```text
threadId + seq
```

Consumers receive opaque cursors. They must not parse cursor internals or assume
the cursor remains stable across unrelated thread ids.

## Ordering

API responses return messages in `seq ASC` order.

This remains true for:

- initial tail windows
- older pages loaded with `before`
- newer catch-up pages loaded with `after`

The backend may read descending internally for tail windows, but the response
shape exposed to consumers stays ascending.

## Query Semantics

The thread messages route supports:

- `limit`: requested window size, clamped by route helpers
- `before`: load older messages before a cursor
- `after`: load newer messages after a cursor

Route helpers decode cursors into sequence bounds and reject cursors that do not
belong to the requested thread.

The no-pagination request remains a compatibility path for consumers that still
expect a full-thread read.

## Page Info

Paged responses include `pageInfo` when pagination is active.

`pageInfo` carries:

- `hasOlder`
- `hasNewer`
- `startCursor`
- `endCursor`

`startCursor` and `endCursor` correspond to the first and last returned message
in ascending response order.

When every returned durable message is later filtered out by a host-specific
projection, route code should preserve page cursors when the underlying page
result still has page bounds.

## Layer Ownership

- `packages/core` owns repository-level page result types and sequence-bound
  message reads.
- `packages/db` owns SQLite/PostgreSQL keyset queries and page boundary
  calculation.
- `packages/app` exposes the `threads.getMessagesPage(...)` use case.
- `packages/contracts` owns serialized thread message page DTOs.
- `packages/durable-chat-server` owns cursor encode/decode, query parsing, and
  response DTO construction.
- `packages/durable-chat-client` owns browser fetch helpers, page-info
  normalization, older-page loading, and incremental catch-up helpers.
- Consumer apps own scroll anchoring, load-more controls, and route-specific
  presentation.

## Runtime Integration

Interactive chat runtimes should treat durable pages as the stable transcript
window and keep live state as an overlay.

For completed sends, runtimes should prefer incremental catch-up from
`pageInfo.endCursor` when available. Full reload remains a fallback when no page
cursor exists or compatibility behavior requires it.

For older history, runtimes should load `before(pageInfo.startCursor)` and
prepend the resulting durable messages while preserving the user's scroll
anchor.

## Non-Goals

This model does not require:

- offset pagination
- timestamp cursors
- durable persistence of optimistic rows
- durable persistence of live assistant draft tokens
- a product-specific infinite-scroll UI in shared packages
