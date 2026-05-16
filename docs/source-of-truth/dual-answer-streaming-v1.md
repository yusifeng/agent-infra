# Dual-Answer Streaming V1

This document captures the durable streaming contract for the first dual-answer implementation.

## Start Request

`POST /api/threads/:threadId/runs/stream` remains the stream start endpoint.

- Single-answer start is the default path.
- Dual-answer start is requested with `answerMode: "dual"` or `candidateCount: 2`.
- Dual-answer start is disabled unless `PLAYGROUND_DUAL_ANSWER_ENABLED` is enabled on the server.
- The POST stream start request is not idempotent in v1 and must not be retried automatically by clients. Retrying can create another user turn.

## Candidate Identity

Each candidate answer is still a normal runtime `Run`.

- Sibling candidate runs share the same `Run.triggerMessageId`.
- Candidate grouping is represented by `answer_candidates`, not inferred only from run order.
- `run.ready` includes `triggerMessageId`, `candidateId`, `ordinal`, and `kind` for candidate streams.

## Multiplex Stream

The v1 multiplex stream reuses existing run-scoped events.

- The stream emits one `run.ready` per candidate run.
- Runtime updates remain `run.state`, `run.assistant`, `run.completed`, and `run.failed`.
- There is no `turn.ready`, `turn.completed`, `turn.failed`, or `turn.aborted` event in v1.
- Per-run stream hub sessions keep independent version counters.
- A terminal event for one candidate does not close the sibling candidate stream.
- The HTTP stream closes after all candidate runtimes are terminal or the client disconnects.

## Disconnect Behavior

Client disconnect is detach-only in v1.

- Disconnecting from the POST stream does not cancel durable candidate runs.
- Active candidate runs stay recoverable through per-run attach-stream endpoints.
- UI stop behavior should detach from active streams, not cancel the runtime.

## Auto Title

Auto-title runs at most once per user turn.

- In v1, the first completed candidate run is used as the title source.
- Failed candidates do not trigger title generation unless another sibling candidate completes.
