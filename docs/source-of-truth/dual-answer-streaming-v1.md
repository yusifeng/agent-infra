# Dual-Answer Streaming V1

This document captures the durable streaming contract for the first dual-answer implementation.

## Start Request

`POST /api/threads/:threadId/runs/stream` remains the stream start endpoint.

- Single-answer start is the default path.
- Dual-answer start is requested with `answerMode: "dual"` or `candidateCount: 2`.
- The Next `/chat` client requests dual answers only when `NEXT_PUBLIC_PLAYGROUND_DUAL_ANSWER_ENABLED=true`.
- Dual-answer start is rejected unless `PLAYGROUND_DUAL_ANSWER_ENABLED=true` is enabled on the server.
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

## Canonical History

Dual candidates share one pre-answer model context.

- The route persists the user message and candidate run rows first.
- Before either candidate runtime starts, the route captures one canonical transcript snapshot with a cutoff at the trigger user message.
- Both sibling candidate runs receive that same immutable `historyMessages` snapshot.
- Candidate A's persisted assistant/tool output must never enter candidate B's model input for the same user turn.

## Canonical Selection

Canonical projection is explicit and deterministic.

- The selected/default candidate is the canonical answer when its run is completed.
- If the selected/default candidate is failed or empty and another candidate completed, projection falls back to a completed candidate.
- Fallback selection is projection-level in v1; it does not mutate the persisted `answer_selections` row to `source="system_fallback"`.
- Future user turns, share snapshots, and replay input use canonical projection, so unselected sibling candidates do not pollute model context or public snapshots.

## Chat Presentation

Normal `/chat` can show non-canonical candidates for comparison.

- One assistant answer remains represented by one `AnswerContainer`.
- A dual-answer turn is represented by an `AnswerCandidateGroup` that contains multiple `AnswerContainer` instances.
- Inspector and per-run operations continue to use the underlying run id for the specific candidate answer.
- Canonical-only consumers should request/project selected/default answers, not candidate comparison groups.

## Disconnect Behavior

Client disconnect is detach-only in v1.

- Disconnecting from the POST stream does not cancel durable candidate runs.
- Active candidate runs stay recoverable through per-run attach-stream endpoints.
- UI stop behavior should detach from active streams, not cancel the runtime.

## Auto Title

Auto-title runs at most once per user turn.

- In v1, the first completed candidate run is used as the title source.
- Failed candidates do not trigger title generation unless another sibling candidate completes.
