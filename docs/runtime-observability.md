# Runtime Observability

## Purpose

This document defines what `agent-infra` currently means by runtime observability, what is already implemented, and what belongs in `v0` versus later phases.

The goal is to make one run:

- traceable after the fact
- inspectable while it is executing
- durable enough to recover from UI disconnects

This document is about platform capability, not just UI behavior. `apps/playground-web` may render these capabilities, but the design target lives in `packages/core`, `packages/contracts`, `packages/db`, `packages/app`, and `packages/runtime-pi`.

## Observability Model

For one assistant run, `agent-infra` currently uses four durable layers:

1. `run`
   - terminal status, provider/model, error, timing, usage summary
2. `message` + `message_part`
   - durable conversation projection
   - final assistant text, tool calls, tool results, and reasoning parts
3. `tool_invocation`
   - structured tool execution record
4. `run_events`
   - append-only runtime fact log

The first three are compact projections.
`run_events` is the process truth.

## Source Of Truth

The intended order of truth is:

1. `run_events` preserve the runtime event sequence.
2. `message` / `message_part` / `tool_invocation` provide durable read models.
3. SSE is a transport for already-persisted updates.
4. UI state is disposable and must be rebuildable from durable records.

This means:

- the UI must not become the only place where live state exists
- disconnects are acceptable if the run can still be reconstructed
- final assistant content still comes from durable messages, not only from stream transport

## Event Flow

Current flow:

```text
pi-agent-core AgentEvent
  -> runtime-pi event handler
  -> durable writes
     - run
     - message / message_part
     - tool_invocation
     - run_events
  -> app read model
  -> HTTP / SSE contracts
  -> consumer UI
```

## `pi-agent-core` Event Coverage

Current `AgentEvent` union from `pi-agent-core`:

- `agent_start`
- `agent_end`
- `turn_start`
- `turn_end`
- `message_start`
- `message_update`
- `message_end`
- `tool_execution_start`
- `tool_execution_update`
- `tool_execution_end`

## Current Handling Matrix

### Fully projected into durable state

- `agent_start`
  - updates `run.status -> running`
  - appends `run_event`
- `message_start` for assistant
  - creates assistant `message(status=created)`
  - appends `run_event`
- `message_end` for assistant
  - writes final assistant `message_part`s
  - updates assistant message terminal status
  - appends `run_event`
- `tool_execution_start`
  - creates `tool_invocation(status=running)`
  - appends assistant `tool-call` message part
  - appends `run_event`
- `tool_execution_end`
  - updates `tool_invocation(status=completed|failed)`
  - creates `tool` message with `tool-result` part
  - appends `run_event`
- `agent_end`
  - updates `run.status -> completed|failed`
  - writes usage summary
  - appends `run_event`

### Persisted as trace events, but not yet given richer structure

- `turn_start`
- `turn_end`
- `message_update`
- `tool_execution_update`

These events are not dropped. They are currently preserved through `run_events` and can be rendered in the run log, but they do not yet update additional durable projections.

## What Is Already Good Enough For `v0`

The following observability capabilities are already present and should be treated as `v0` platform assets:

- append-only `run_events` with per-run ordering
- durable tool execution trace through `tool_invocation`
- durable final assistant/tool projections through `message` and `message_part`
- run-oriented timeline reads through the app boundary
- SSE transport for live observation of persisted updates
- recent-run navigation in the console
- failure hardening that still produces durable failed state and `runtime_error` trace entries

This is enough for:

- run inspection
- debugging failed runs
- viewing historical tool activity
- checking what happened after disconnect or refresh

## `v0` Observability Target

`v0` should stop at a strong durable debugging baseline, not at full replay.

### In scope for `v0`

- durable run timelines
- durable tool traces
- recent runs and run-oriented log views
- reload-safe timeline reconstruction from durable data
- assistant text streaming in the consumer transcript

### Important rule for `v0` text streaming

If text streaming is added in `v0`, it must follow this rule:

- `message_update` drives live assistant text as transport/view state
- final assistant text still settles through durable `message_part` writes at `message_end`
- live draft text must not become the only source of truth

In other words:

- stream output is allowed in `v0`
- stream output does **not** replace durable assistant persistence

## Why `message_update` Matters

`message_update` is the key bridge between observability and live output.

Today it is already:

- received from `pi-agent-core`
- persisted into `run_events`
- available to SSE consumers as a raw event trace

What is still missing is formal platform semantics for it as a live transcript signal.

For `v0`, that should mean:

- the event is exposed clearly enough for a consumer to build live assistant text
- the consumer can render a growing assistant draft
- completion reconciles back to durable messages
- disconnects fall back to durable timeline data instead of pretending the live draft is durable

## What Is Explicitly Not Required For `v0`

The following are valuable, but should be treated as later-phase work unless they become necessary:

- full replay engine
- deterministic rerun from stored events alone
- global trace search and analytics queries
- structured trace correlation across services
- complete tool-progress UI for `tool_execution_update`
- production-grade incident forensics metadata

## Strong `v1` Candidates

These are the most likely next observability upgrades after `v0`:

- richer `runtime_error` payloads
- formal live transcript contract based on `message_update`
- stronger use of `tool_execution_update` for long-running tools
- trace or correlation ids
- runtime snapshot metadata such as prompt/tool/runtime version fingerprints
- replay-oriented APIs or derived views

## Decision Summary

The platform direction is:

- keep durable trace quality high
- keep SSE as a transport, not the only truth
- allow `v0` to include live assistant streaming
- do not let streaming-only UI behavior replace durable observability
