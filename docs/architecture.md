# agent-infra v0.1 Architecture

## Project goal

`agent-infra` focuses on durable backend infrastructure for agent runtimes, not a full chat product.

## Layers

- `packages/core`: domain types and repository interfaces only.
- `packages/db`: Drizzle schema plus SQLite / PostgreSQL repository implementations.
- `packages/runtime-pi`: pi-agent-core adapter that translates runtime events into durable records.
- `apps/playground-web`: browser-local pi experiment harness, intentionally separate from durable persistence.

## Why `thread` instead of `session`

`thread` maps better to a durable conversation timeline that can contain many runs and messages over time.

## Why message is split into parts

`message_part` enables mixed content in one message: text, tool-call, tool-result, reasoning, and structured data.
This keeps the model output and tool execution trace extensible.

## Why `run_events`

`run_events` is the append-only event log for a run. It preserves runtime lifecycle truth even when durable projections stay intentionally compact.

## v0.1 scope

- thread / run / message / message_part / tool_invocation / run_event persistence
- browser-local `playground-web` experiment for pi runtime feel and storage UX
- one server-side runtime adapter mainline: `runtime-pi`

## Evolution

- add streaming and resume-safe run state transitions
- complete artifact lifecycle and file storage integrations
- add memory interfaces above conversation history
