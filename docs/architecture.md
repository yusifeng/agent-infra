# agent-infra v0.1 Architecture

## Project goal

`agent-infra` focuses on durable backend infrastructure for agent runtimes, not a full chat product.

## Layers

- `apps/docs`: deployable official documentation site for public concepts, guides, and reference, with locale-aware docs routes.
- `packages/app`: narrow application boundary that orchestrates durable thread and turn flows.
- `packages/core`: domain types and repository interfaces only.
- `packages/contracts`: serialized request/response contracts for transport consumers.
- `packages/db`: Drizzle schema plus SQLite / PostgreSQL repository implementations.
- `packages/runtime-pi`: pi-agent-core adapter that translates runtime events into durable records.
- `apps/playground-web`: first consumer of `agent-infra`, with browser-local experiments plus a chat-first runtime validation surface that keeps durable inspection as a secondary pane.

## Consumer boundary

`playground-web` is intentionally treated as the first consumer of `agent-infra`, not the place where orchestration rules live.
The intended flow is:

- `packages/app` owns thread and turn use cases.
- `packages/runtime-pi` owns runtime execution and event persistence.
- `packages/contracts` owns serialized HTTP/browser shapes.
- `playground-web` calls the app layer and renders the resulting contracts.

## Why `thread` instead of `session`

`thread` maps better to a durable conversation timeline that can contain many runs and messages over time.

## Why message is split into parts

`message_part` enables mixed content in one message: text, tool-call, tool-result, reasoning, and structured data.
This keeps the model output and tool execution trace extensible.

## Why `run_events`

`run_events` is the append-only event log for a run. It preserves runtime lifecycle truth even when durable projections stay intentionally compact.

## v0.1 scope

- thread / run / message / message_part / tool_invocation / run_event persistence
- app-layer use cases for thread creation, listing, message reads, and text turns
- browser-local `playground-web` experiment plus a chat-first runtime validation surface with durable inspection
- initial SSE transport for live run observation, with durable timeline endpoints kept as the source of truth
- one server-side runtime adapter mainline: `runtime-pi`

## Evolution

- grow `apps/docs` into the public package and architecture reference
- harden the app boundary and transaction semantics
- expand streaming and resume-safe run state transitions beyond the initial SSE transport
- complete artifact lifecycle and file storage integrations
- add memory interfaces above conversation history
