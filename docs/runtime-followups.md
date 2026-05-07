# Runtime Follow-ups

This document tracks runtime-level behavior that is either intentionally deferred
or recently tightened, so we do not lose the reasoning in app-local comments.

## Active Loop: Web Search Streaming

This section tracks the confirmed runtime/UI issues in the current
`playground-vite-web` + `playground-fastify-server` web-search flow. The goal is
to fix them one loop item at a time, with targeted tests and review gates for
each item.

### Working assumptions

- Scope is limited to the Vite + Fastify consumer path plus shared packages
  touched by that flow:
  - `/Users/david/Documents/github/agent-infra/packages/contracts`
  - `/Users/david/Documents/github/agent-infra/packages/runtime-pi`
  - `/Users/david/Documents/github/agent-infra/packages/durable-chat-client`
  - `/Users/david/Documents/github/agent-infra/apps/playground-fastify-server`
  - `/Users/david/Documents/github/agent-infra/apps/playground-vite-web`
- Search label / side panel product behavior is already established enough for
  now; the current priority is correctness and stability of runtime, live
  streaming, durable recovery, and transcript rebuild.
- Each loop item below should be fixed and verified independently. Do not batch
  multiple runtime/UI behavior changes into one diff unless they share the same
  root cause.

### Loop items

#### 1. Prevent toolcall partials from clearing live pre-search text

- Status: fixed
- Priority: P1
- Problem:
  - A provider `toolcall_start` / `toolcall_end` partial can drop previously
    streamed assistant text or thinking.
  - `runtime-pi` currently diffs against the whole `assistantMessageEvent.partial`
    snapshot, which can emit `assistant_replace('')` / `thinking_replace('')`
    and blank the live Vite draft.
- Acceptance:
  - During a search turn, already-streamed preamble text remains visible when
    the tool starts or ends.
  - Live search label/state no longer causes the preceding assistant sentence to
    disappear or collapse into the following summary sentence.
- Primary files:
  - `/Users/david/Documents/github/agent-infra/packages/runtime-pi/src/runtime.ts`
  - `/Users/david/Documents/github/agent-infra/packages/durable-chat-client/src/runtime/send-message-flow.ts`
- Required verification:
  - Add/update focused `runtime-pi` and `durable-chat-client` tests that model:
    - `text_delta -> toolcall_start(partial drops text) -> toolcall_end`
  - Run:
    - `pnpm --filter @agent-infra/runtime-pi test`
    - `pnpm --filter @agent-infra/durable-chat-client test`
- Resolution:
  - `runtime-pi` now preserves already-streamed text/thinking across
    `toolcall_*` partials and `toolUse` completions that finalize to tool-call
    blocks only.

#### 2. Preserve live search query across completed/failed tool phases

- Status: fixed
- Priority: P2
- Problem:
  - `tool_execution_end` currently emits a live `tool_event` with `input: null`.
  - The client reducer overwrites prior tool state by `toolCallId`, so the live
    search label can lose its original query exactly when the state transitions
    from searching to completed.
- Acceptance:
  - The live search label remains stable across `start -> completed` and
    `start -> failed`.
  - Query and grouping metadata are preserved until durable search summaries
    take over.
- Primary files:
  - `/Users/david/Documents/github/agent-infra/packages/runtime-pi/src/runtime.ts`
  - `/Users/david/Documents/github/agent-infra/packages/durable-chat-client/src/runtime/send-message-flow.ts`
- Required verification:
  - Add/update `durable-chat-client` tests for completed/failed tool events.
  - Run:
    - `pnpm --filter @agent-infra/durable-chat-client test`
- Resolution:
  - `tool_execution_end` now carries the original tool args into the live
    `tool_event`, so completed/failed search labels keep their query.

#### 3. Support multiple `searchWeb` calls in one live assistant segment

- Status: fixed
- Priority: P2
- Problem:
  - The live renderer currently shows only the last `searchWeb` tool in a
    segment, while durable transcript rebuild can aggregate multiple search
    results after completion.
- Acceptance:
  - A single live assistant segment can display multiple active/completed search
    labels or an equivalent grouped live representation.
  - Live and durable grouping rules for multi-search turns no longer diverge in
    obvious ways.
- Primary files:
  - `/Users/david/Documents/github/agent-infra/apps/playground-vite-web/src/features/durable-chat/components/message-list.tsx`
  - `/Users/david/Documents/github/agent-infra/apps/playground-vite-web/src/features/durable-chat/runtime/build-transcript-blocks.ts`
- Required verification:
  - Add/update Vite tests for:
    - two `searchWeb` calls in one segment
    - multi-search live label rendering
  - Run:
    - `pnpm --filter playground-vite-web test`
    - `pnpm --filter playground-vite-web typecheck`
- Resolution:
  - Live tool state now preserves per-`toolCallId` order, and the Vite live
    renderer displays every `searchWeb` call in a segment instead of only the
    last one.
  - Live text/thinking `replace` updates now honor tool boundaries the same way
    delta updates do, so post-search summary text starts a fresh live segment
    instead of overwriting the segment that owns the completed search label.

#### 4. Make reconcile failure leave the UI in a recoverable state

- Status: fixed
- Priority: P2
- Problem:
  - If `run.completed` arrives and the first durable message fetch fails, stale
    live draft state can remain the only visible truth for that run.
- Acceptance:
  - A failed first reconcile fetch does not permanently strand the UI on stale
    live-only content.
  - Recovery behavior is explicit and test-covered.
- Primary files:
  - `/Users/david/Documents/github/agent-infra/packages/durable-chat-client/src/runtime/reconcile-completed-turn.ts`
  - `/Users/david/Documents/github/agent-infra/apps/playground-vite-web/src/features/durable-chat/runtime/use-durable-chat-runtime.ts`
- Required verification:
  - Add/update a `durable-chat-client` reconcile test for failed first fetch.
  - Run:
    - `pnpm --filter @agent-infra/durable-chat-client test`
- Resolution:
  - On a failed first reconcile fetch after `run.completed`, the client now
    clears the stale live draft so the UI falls back to durable transcript state
    instead of leaving live-only content stranded on screen.

#### 5. Decide and implement refresh semantics for in-flight assistant text

- Status: fixed
- Priority: P1
- Problem:
  - Refresh during an active run cannot recover live-only text/thinking by
    design today because durable snapshots are only flushed at tool boundaries
    or assistant completion.
- Decision required:
  - Either:
    - add durable checkpoints for in-flight assistant text/thinking, or
    - explicitly accept live-only loss on refresh and document it as a product
      limitation
- Acceptance:
  - The repository has one explicit behavior for mid-run refresh, with tests and
    docs aligned to that choice.
- Primary files:
  - `/Users/david/Documents/github/agent-infra/packages/runtime-pi/src/runtime.ts`
  - `/Users/david/Documents/github/agent-infra/packages/durable-chat-client/src/runtime/load-thread-flow.ts`
  - `/Users/david/Documents/github/agent-infra/apps/playground-vite-web/src/features/durable-chat/runtime/use-durable-chat-runtime.ts`
- Required verification:
  - Add/update tests covering refresh while a run is still active.
  - Run targeted package tests plus:
    - `pnpm --filter playground-vite-web test`
- Resolution:
  - Vite now persists the active run’s live assistant draft in `sessionStorage`
    and restores it when the same thread reloads while the active run is still
    `queued` or `running`.
  - `applyHydratedTranscriptState()` keeps a restored live draft for the active
    running run instead of immediately clearing it when `selectedRunId` is null.

#### 6. Clarify search availability when `webSearchEnabled=true` but Tavily is unavailable

- Status: fixed
- Priority: P3
- Problem:
  - When the flag is enabled but `TAVILY_API_KEY` is missing, Fastify silently
    resolves an empty tool set.
  - This makes debugging and product behavior ambiguous.
- Acceptance:
  - Search unavailable behavior is explicit in code and test-covered.
  - Either a run event / metadata signal exists, or the route/runtime clearly
    communicates the no-search condition.
- Primary files:
  - `/Users/david/Documents/github/agent-infra/apps/playground-fastify-server/src/playground-services.ts`
  - `/Users/david/Documents/github/agent-infra/apps/playground-fastify-server/test/server.test.ts`
- Required verification:
  - Add/update server tests for the unavailable-provider path.
  - Run:
    - `pnpm --filter playground-fastify-server test`
- Resolution:
  - Fastify now fails the run-stream request explicitly with a 503 when
    `webSearchEnabled=true` but `TAVILY_API_KEY` is missing, and the server
    test suite covers that path.

### Suggested execution order

Run these items in order and do not start the next one until the previous item
has:

- a focused diff,
- targeted tests green,
- `codex review --uncommitted -c model="gpt-5.3-codex" -c model_reasoning_effort="medium"` clean,
- and, unless the user explicitly wants batching, its own commit.

Recommended order:

1. Prevent toolcall partials from clearing live pre-search text.
2. Preserve live search query across completed/failed tool phases.
3. Support multiple `searchWeb` calls in one live assistant segment.
4. Make reconcile failure leave the UI in a recoverable state.
5. Decide and implement refresh semantics for in-flight assistant text.
6. Clarify Tavily-unavailable search behavior.

## Deferred

### `runInitializeRuntime()` thread refresh ordering

- Status: deferred
- Current behavior:
  - `runInitializeRuntime()` refreshes thread navigation before activating
    `initialThreadId`.
- Why it is deferred:
  - This is not an obvious redundant request in the same way as the post-send
    `/api/threads` refresh or duplicate inspector loads.
  - Changing the order affects multiple concerns at once:
    - sidebar initialization
    - `/chat/:threadId` first-paint behavior
    - durable recovery / hydration ordering
- Re-evaluate when:
  - we explicitly optimize `/chat/:threadId` initial load latency, or
  - we observe initialization-stage duplicate requests that are clearly caused
    by the current ordering
- Relevant files:
  - `/Users/david/Documents/github/agent-infra/packages/durable-chat-client/src/runtime/chat-session-flow.ts`

## Recently Addressed

### Post-send thread refresh

- Status: fixed
- Summary:
  - Removed the unconditional `refreshThreads()` after stream completion.
  - Durable reconcile still uses `GET /api/threads/:threadId/messages`, but the
    extra `GET /api/threads` sidebar refresh no longer runs after every send.
- Commit:
  - `9d26b35` `fix(durable-chat-client): stop post-send thread refresh`

### Next thread activation guard

- Status: fixed
- Summary:
  - Added the missing Next-side `activateThread` guard so thread activation does
    not re-fire while the same thread is already loading/responding.
- Commit:
  - `e19ac2a` `fix(playground-next-web): guard thread activation`

### Next inspector duplicate loads

- Status: fixed
- Summary:
  - Narrowed inspector loading so transcript hydration completes first and the
    effect path becomes the single inspector reload entrypoint.
- Commit:
  - `d5563fe` `fix(playground-next-web): dedupe inspector loads`
