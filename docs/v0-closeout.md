# v0 Closeout

This document marks the practical close of `agent-infra` `v0`.

It exists for one reason:
to separate what is already done from what is merely tempting to build next.

`v0` is complete enough to stop expanding surface area and start making deliberate choices again.

## What `v0` Proved

`v0` proved that `agent-infra` can already act as a durable backend foundation for one agent runtime mainline.

More concretely, it proved:

- durable records are not trapped inside a demo UI
- one runtime adapter can persist lifecycle truth into stable records
- a thin consumer can exercise the platform through packages instead of redefining the model locally
- live assistant streaming can exist without replacing durable message truth
- observability can stay durable-first even when the console uses SSE

## What Is In `v0`

The current `v0` platform includes:

- `packages/core`
  - stable domain model and repository interfaces for `thread`, `run`, `message`, `message_part`, `tool_invocation`, and `run_event`
- `packages/contracts`
  - HTTP and SSE DTO contracts used by consumers
- `packages/db`
  - SQLite and PostgreSQL repository implementations
  - local SQLite test path that self-heals the common `better-sqlite3` ABI mismatch
- `packages/app`
  - narrow application boundary for thread creation, thread reads, text turns, recent runs, and run timelines
- `packages/runtime-pi`
  - one server-side runtime adapter mainline built around durable persistence
- `apps/playground-web`
  - first consumer and experiment harness
  - durable runtime console that validates threads, transcript reads, recent runs, SSE, and run timelines
- `apps/docs`
  - deployable docs site for public concepts and guides

## What `v0` Explicitly Did Not Do

These were intentionally left out of `v0`:

- replay engine
- resumable stream sessions
- deterministic rerun from stored trace alone
- trace search and analytics platform
- production-grade incident forensics
- multiple runtime adapters at once
- a polished end-user chat product

This matters because the absence of these features is not an oversight.
It is part of how `v0` stayed coherent.

## Why `v0` Is A Valid Stopping Point

`v0` is a valid stopping point because the main architectural claims are now exercised by real code:

- the model lives in packages, not in the UI
- the app boundary is narrow enough to be consumed cleanly
- the runtime adapter is replaceable instead of becoming the whole system
- the read side has both durable timeline reads and live SSE transport
- refresh and reconnect behavior is durable-first, not client-memory-first

At this point, more random features would mostly increase surface area faster than they increase confidence.

## What Should Happen After `v0`

After `v0`, work should become track-based rather than backlog-shaped.

That means:

- pick one strategic direction
- state what problem it solves
- define what stays out of scope
- avoid mixing platform work, console polish, and product behavior in the same loop

## Recommended `v1` Candidate Tracks

These are the strongest next directions.
They are alternatives or phased tracks, not a requirement to do all of them immediately.

### 1. Observability Hardening

Focus:

- richer runtime failure payloads
- stronger event semantics
- clearer trace inspection primitives
- better use of `tool_execution_update`

Choose this if the next goal is:
making failures easier to debug and making traces more operationally useful.

Do **not** expand this track into:

- full replay infrastructure
- analytics dashboards
- product-specific monitoring features

### 2. Replay And Resume Primitives

Focus:

- replay-oriented APIs or derived views
- stronger run snapshots
- explicit resume-safe runtime state handling

Choose this if the next goal is:
closing the gap between durable trace and runtime continuation.

Do **not** start this track unless you are willing to define:

- what exact replay means
- what exact resume means
- which invariants must hold across reconnect, restart, and partial failure

This track is valuable, but it is easy to make vague and expensive.

### 3. Runtime Adapter Expansion

Focus:

- hardening `runtime-pi`
- extracting clearer runtime adapter contracts
- deciding whether a second adapter is actually worth supporting

Choose this if the next goal is:
proving that `agent-infra` is a runtime platform rather than a single-adapter system.

Do **not** start by adding adapters casually.
First define what a second adapter must prove that `runtime-pi` cannot.

### 4. Artifact And File Lifecycle

Focus:

- complete artifact repository behavior
- file attachment lifecycle
- linking artifacts back to runs and messages

Choose this if the next goal is:
supporting richer non-text outputs and durable work products.

This is a good track if the future agent workflows are expected to produce files, structured outputs, or persistent assets.

### 5. Consumer Hardening

Focus:

- stabilizing the consumer-facing contracts
- making the first-consumer patterns easier to reuse
- keeping `playground-web` a clean reference consumer

Choose this if the next goal is:
making adoption easier for the next real app.

This track should not become endless UI feature work.
The point is to make the platform easier to consume, not to turn the harness into a product.

## Suggested Prioritization

If one next track must be chosen now, the order I would recommend is:

1. observability hardening
2. replay and resume primitives
3. artifact and file lifecycle
4. runtime adapter expansion
5. consumer hardening

Reason:

- observability hardening strengthens the current mainline without changing the system identity
- replay/resume is the next real platform question after durable trace quality
- artifacts become important once agent runs must produce durable outputs beyond messages
- adapter expansion is useful, but only after the adapter contract is clearer
- consumer hardening matters, but should stay subordinate to platform goals

## Rules For `v1`

No matter which track is chosen, `v1` should keep these rules:

- do not move orchestration back into consumer apps
- do not redefine core records in UI code
- do not let SSE become the only truth
- do not let `playground-web` become the implicit product boundary
- do not add a second major initiative before the first one has a stop condition

## Decision Template For The Next Loop

Before starting the next mainline, answer these questions:

1. What exact platform weakness are we addressing?
2. Which package boundaries are expected to change?
3. What remains explicitly out of scope?
4. What is the acceptance signal that tells us to stop?

If those are not clear, the work is probably still backlog, not strategy.
