# Roadmap

`v0` is now considered complete.

The completed `v0` scope and closeout rationale live in [`v0-closeout.md`](./v0-closeout.md).

The roadmap after `v0` should be read as a set of candidate tracks, not as a promise to build every item in order.

## Selected Next Infra Track: Dataset Review And Expected Output Foundation v1

The next infra track is `Dataset Review And Expected Output Foundation v1`.

This track turns captured dataset examples into curated future-eval candidates
without implementing eval execution. It adds typed expected-output and review
metadata, safe app-layer metadata merge semantics, detail/review routes, and an
independent `/observability/datasets` validation surface.

The source of truth lives in
[`source-of-truth/dataset-example-model.md`](./source-of-truth/dataset-example-model.md).

In scope:

- `DatasetExpectedOutputV1` as a nullable assistant-text target envelope
- `metadataJson.review` as strict post-capture curation metadata
- effective eligibility as a computed future-eval readiness signal
- app-layer safe merge helpers that preserve capture, feedback, host, and
  evaluation metadata namespaces
- app use cases for dataset example detail, expected-output update, and review
  update
- shared DTO/parser/normalizer support for expected output, review metadata, and
  effective eligibility
- authenticated playground routes and a dataset-centric review surface under
  `/observability/datasets`

Deferred:

- `EvalRun` or `EvalExampleResult`
- evaluation runner, eval reports, pass-rate dashboards, or experiment
  comparison
- LLM-as-judge scoring
- prompt hub or prompt version manager
- OpenTelemetry, LangSmith, or exporter sinks
- cost analytics dashboard or usage ledger
- automatic historical-run import
- full dataset analytics, search, bulk operations, assignments, or
  multi-reviewer workflow

## Completed Infra Track: Run Trace And Usage Contract v1

`Run Trace And Usage Contract v1` is complete.

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

## Completed Infra Track: Run-to-Dataset Capture v1

`Run-to-Dataset Capture v1` is complete as the next quality-loop foundation.

The source of truth lives in
[`source-of-truth/dataset-example-model.md`](./source-of-truth/dataset-example-model.md).

Completed foundation:

- shared `Dataset` and `DatasetExample` domain records and repositories
- SQLite/Postgres persistence for datasets and examples
- app-layer dataset use cases, including `captureExampleFromRun`
- minimal dataset contracts, server helpers, and client helpers
- authenticated playground dataset routes
- observability capture action for the selected durable run
- capture-time snapshots for canonical input context, baseline output, run
  context, tool invocations, and metadata
- capture-time metadata bridge for shared run feedback and playground-local
  feedback details

Deferred until the captured-example model has real usage pressure:

- evaluation runner
- live replay or frozen replay runtime
- experiment comparison
- LLM-as-judge scoring
- prompt hub or prompt version manager
- dataset management dashboard, filtering, search, or analytics
- automatic historical-run import

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
