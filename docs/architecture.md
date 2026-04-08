# agent-infra v0.1 Architecture

## Project goal

`agent-infra` focuses on reusable conversation and execution infrastructure, not a full chat product.

## Layers

- `packages/core`: domain types and repository interfaces only.
- `packages/db`: Drizzle schema and PostgreSQL repository implementations.
- `packages/runtime-ai-sdk`: runtime adapter from core message parts to AI SDK model calls.
- `apps/playground-web`: minimal Next.js app to verify end-to-end flow.

## Why `thread` instead of `session`

`thread` maps better to a durable conversation timeline that can contain many runs and messages over time.

## Why message is split into parts

`message_part` enables mixed content in one message: text, tool-call, tool-result, reasoning, and structured data.
This keeps the model output and tool execution trace extensible.

## v0.1 scope

- thread / run / message / message_part / tool_invocation persistence
- minimal runtime turn execution
- one mock tool call (`getCurrentTime`)
- minimal playground UI for create thread + send message + receive assistant response

## Evolution

- add streaming and resume-safe run state transitions
- complete artifact lifecycle and file storage integrations
- add memory interfaces above conversation history
