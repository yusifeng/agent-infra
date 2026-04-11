# Roadmap

`v0` is now considered complete.

The completed `v0` scope is summarized in [`v0-todo.md`](./v0-todo.md) and the closeout rationale lives in [`v0-closeout.md`](./v0-closeout.md).

The roadmap after `v0` should be read as a set of candidate tracks, not as a promise to build every item in order.

## Completed `v0`

The completed baseline includes:

- durable `thread` / `run` / `message` / `message_part` / `tool_invocation` / `run_event`
- `packages/app` use-case boundary for thread and turn orchestration
- `packages/runtime-pi` as the runtime adapter mainline
- `playground-web` as the first consumer of the platform contracts
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
- keep `playground-web` a clean reference consumer
- improve adoption without turning the harness into a product
