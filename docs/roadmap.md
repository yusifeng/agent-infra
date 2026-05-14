# Roadmap

`v0` is now considered complete.

The completed `v0` scope and closeout rationale live in [`v0-closeout.md`](./v0-closeout.md).

The roadmap after `v0` should be read as a set of candidate tracks, not as a promise to build every item in order.

## Selected Next Infra Track: Run Trace And Usage Contract v1

The next infra track is `Run Trace And Usage Contract v1`.

This track combines the most valuable parts of observability hardening and usage
tracking without turning shared infra into a billing or user-management product.
The source of truth lives in
[`source-of-truth/run-trace-usage-contract.md`](./source-of-truth/run-trace-usage-contract.md).

Completed foundation:

- assistant `message_update` is explicitly live-only in the current contract
- raw `run_events` remain append-only durable process facts
- timeline responses preserve raw `runEvents` and `toolInvocations`
- `packages/app` provides a typed timeline projection over durable records
- `Run.usage` uses a versioned `RunUsageSummaryV1` stored in `runs.usage_json`
- shared attribution stays at `runId` / `threadId` / `appId`
- host user attribution remains outside shared packages

Deferred until real need is demonstrated:

- `run_usage_records` or ledger tables for queryable aggregation
- server-side cancel and runtime abort mechanics
- replay/eval fixtures
- broader runtime adapter contract hardening

## Completed `v0`

The completed baseline includes:

- durable `thread` / `run` / `message` / `message_part` / `tool_invocation` / `run_event`
- `packages/app` use-case boundary for thread and turn orchestration
- `packages/runtime-pi` as the runtime adapter mainline
- `playground-next-web` as the first consumer of the platform contracts
- run-oriented timelines, recent-run inspection, and durable-first reconnect behavior
- live assistant streaming built on top of durable runtime events without replacing durable message truth

## Candidate Track 1: Observability Hardening

- richer runtime failure payloads
- stronger event semantics and trace inspection
- better use of `tool_execution_update`
- clearer debugging and operational trace quality

## Candidate Track 2: Replay And Resume

- replay-oriented APIs or derived views
- explicit resume-safe runtime behavior
- stronger snapshot and recovery semantics
- optimization of `/chat/:threadId` initial load ordering if duplicate
  initialization requests become a measured problem

## Candidate Track 3: Artifact And File Lifecycle

- complete artifact repositories
- file attachments
- durable linking between artifacts, runs, and messages

## Candidate Track 4: Runtime Adapter Expansion

- harden `runtime-pi`
- refine the runtime adapter contract
- evaluate whether a second adapter adds real value

## Candidate Track 5: Consumer Hardening

- stabilize first-consumer patterns
- keep `playground-next-web` a clean reference consumer
- continue hardening `durable-chat-server` and `durable-chat-client` as the reusable adoption surface
- keep transport codec/runtime helpers out of `packages/contracts` unless a second consumer or transport proves the need
- improve reload/reconnect, long-thread paging, and run-centric navigation when
  those changes validate shared runtime or observability contracts
- keep visual polish explicitly lower priority than core runtime, contract, DB,
  and app-layer work
- improve adoption without turning the harness into a product
