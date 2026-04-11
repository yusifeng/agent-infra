# v0 Todo

This checklist defines the practical stopping line for `agent-infra` `v0`.

It is not a wishlist.
It is a scope-control document used to decide:

- what is already good enough
- what still needs to be finished before calling `v0` complete
- what should be pushed out of `v0` on purpose

## `v0` Goal

`v0` means:

- durable backend foundations for one agent runtime mainline
- run-oriented observability and debugging
- one real consumer that proves the platform contracts are usable
- live assistant streaming that does not replace durable message truth

`v0` does **not** mean:

- a fully polished chat product
- replay engine
- production-grade incident platform
- every possible runtime adapter

## 1. Durable Core

- [x] `thread` persistence
- [x] `run` persistence
- [x] `message` persistence
- [x] `message_part` persistence
- [x] `tool_invocation` persistence
- [x] `run_events` append-only persistence
- [x] PostgreSQL schema support
- [x] SQLite schema support

Status:
The durable model is in place and already supports the current runtime and console flows.

## 2. Application Boundary

- [x] create thread
- [x] list threads
- [x] read thread messages
- [x] queue/start text turn
- [x] run text turn through runtime selection
- [x] read run timeline through `packages/app`
- [x] list recent runs for a thread through `packages/app`

Status:
The app boundary is narrow and usable. This is already aligned with the intended package split.

## 3. Runtime Mainline

- [x] one server-side runtime adapter mainline: `packages/runtime-pi`
- [x] `runtime-pi` persists run state transitions
- [x] `runtime-pi` persists assistant final messages
- [x] `runtime-pi` persists tool call / tool result records
- [x] `runtime-pi` appends raw runtime events into `run_events`
- [x] `runtime-pi` failure hardening writes durable failed state and `runtime_error`

Status:
`runtime-pi` is already a valid `v0` runtime mainline.

## 4. Contracts And Streaming

- [x] HTTP contracts for threads, messages, runs, and timelines
- [x] SSE transport for live run observation
- [x] `message_update` promoted from raw trace-only usage to a formal live assistant stream contract
- [x] assistant live streaming in the consumer transcript
- [x] final assistant content still reconciles back to durable messages

Status:
This is the biggest recent step. `v0` now includes live assistant streaming without turning stream state into durable truth.

## 5. Run-Oriented Observability

- [x] durable run timeline endpoint
- [x] recent runs inspection
- [x] tool activity inspection
- [x] raw `run_events` inspection
- [x] failure state inspection
- [x] observability rules documented in [`runtime-observability.md`](./runtime-observability.md)

Status:
Observability is strong enough for `v0` debugging and traceability.

## 6. First Consumer Validation

- [x] `playground-web` acts as the first consumer, not the system boundary
- [x] `/runtime-pi` exercises the real durable runtime stack
- [x] right-side log is run-oriented
- [x] transcript can show live assistant output
- [x] recent-run switching works
- [x] reload restores the last selected thread and run automatically
- [x] reconnect flow is explicitly defined and expressed as durable-first behavior, not stream-memory recovery

Status:
The consumer is already good enough to validate most platform capabilities.
The reconnect boundary is now explicit: durable reads recover thread/run state, while live stream drafts remain transient.

## 7. Verification

- [x] `pnpm typecheck` passes
- [x] `packages/runtime-pi` tests cover text, tools, and failure paths
- [x] `playground-web` builds successfully
- [ ] `packages/db` SQLite test path is green in the local development environment

Status:
The remaining unchecked item is an environment/tooling gap caused by the local `better-sqlite3` ABI mismatch, not by an identified domain-model defect.
Even so, the desired `v0` state is to have the DB package test path runnable in a normal local setup.

## 8. Docs

- [x] architecture document exists
- [x] roadmap document exists
- [x] runtime observability document exists
- [x] consumer backlog document exists for non-mainline web ideas
- [x] add a short "how to use agent-infra as a consumer" guide that links the app boundary, runtime timeline, and SSE model together

Status:
Core conceptual docs are present.
The most useful remaining `v0` doc gap is a short consumer-facing guide rather than more architecture prose.

## Remaining `v0` Must-Do Items

This is the item that still looks worth doing before calling `v0` complete:

- [ ] make the normal local DB test path reliable again

## Explicitly Out Of Scope For `v0`

- [x] replay engine
- [x] deterministic rerun from trace alone
- [x] trace ids / correlation ids
- [x] global trace analytics
- [x] richer `runtime_error` forensic payloads
- [x] full `tool_execution_update` progress UI
- [x] multiple polished runtime consoles
- [x] turning `playground-web` into a product-like chat app

## Suggested Stop Condition

You can reasonably call `v0` done when the two remaining `must-do` items above are closed, without adding more feature surface.
