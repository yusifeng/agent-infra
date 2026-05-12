# Run Attach Stream Model

This document is the source of truth for reconnecting a browser view to a
server-side assistant run that is already running.

## Problem Boundary

An assistant run is not owned by the browser's current SSE connection.

The original send stream can disappear because the user refreshes the page,
switches to another thread, or unmounts the current chat view. Those client-side
events must not cancel the backend run by themselves. If the run is still active
and the server process still holds its transient stream session, the browser can
attach to that running session again.

This is not provider-level stream resume. It does not call DeepSeek's private web
`resume_stream` API, does not require replaying every missed token, and does not
persist every stream delta into SQL.

## Durable State vs Transient State

Durable transcript state remains the source of truth after completion.

The database stores completed messages and durable run state. Running assistant
output is transient stream state while the run is active. The transient stream
state is held by the server runtime stream hub and can be backed by memory first,
with a future Redis-backed implementation keeping the same external semantics.

The browser should treat transient attached content as a live draft. On terminal
run state, the browser reloads or reconciles durable thread messages so the
final visible assistant response comes from persisted state.

## Attach Endpoint

The attach endpoint is:

```text
GET /api/threads/:threadId/runs/:runId/attach-stream
```

The route validates that the requested run belongs to the requested thread and
that the current user is allowed to observe that thread. Wrong thread/run pairs
must not leak cross-thread metadata.

## Snapshot-First Semantics

Attach-stream is snapshot-first.

When a client attaches to an active run, the server sends a `run.snapshot` event
before live mutation events. The snapshot is authoritative for that run. The
frontend replaces the current live assistant draft for the run with the snapshot;
it must not append snapshot content as if it were a delta.

After the snapshot, the server streams subsequent assistant, state, and terminal
events to the attached client.

## Version Semantics

Attach-stream live draft mutation events carry a monotonic runtime `version`.

This version is:

- a transient run-stream mutation version
- not a durable database version
- not a historical replay sequence
- used for attach ordering and frontend idempotency

The frontend tracks the current version per attached run and ignores live draft
mutation events with `version <= currentVersion`.

## Live Draft Identity

An in-progress assistant message might not have a durable message id yet.

While attached content is transient, the frontend uses:

```text
messageId ?? run:${runId}
```

as the live assistant bubble identity. When the run reaches a terminal state,
the frontend reloads or reconciles durable messages and replaces the live draft
with persisted transcript content.

## Attach Ordering

The stream hub must avoid losing events while an attach request is being set up.

The intended ordering is:

1. Register the subscriber.
2. Capture the current snapshot.
3. Send the snapshot.
4. Flush events newer than that snapshot.
5. Continue in live mode.

The implementation may buffer during setup or otherwise enforce equivalent
ordering, but clients must observe snapshot-first behavior followed by newer
events only.

## Unavailable Semantics

Attach can be unavailable even when durable state still says a run is active.
For example, the server process may have restarted, the in-memory session may
have expired, or the requested run may already be terminal.

The attach stream exposes unavailable reasons such as:

- `run_not_found`
- `run_not_active`
- `stream_session_gone`
- `thread_run_mismatch`
- `not_authorized`

Frontend behavior:

- If the run may already be terminal, reload durable thread messages.
- If the stream session is gone but the run may still be active, fall back to
  periodic durable message refresh.
- If authorization or thread/run mismatch fails, stop attaching and surface or
  log the error rather than retrying as a normal recovery path.

## User-Visible Recovery

Refresh during generation:

- The page hydrates durable thread messages and active run state.
- If the page does not own the original send stream for the running run, it opens
  the attach stream.
- The snapshot recreates the live assistant draft, and subsequent stream events
  continue updating it.
- On completion, durable messages are reloaded or reconciled.

Switch away and back during generation:

- Leaving a thread aborts only the local attach/send subscription for that view.
- The backend run continues unless the user explicitly cancels it.
- Returning to a thread with a queued or running `activeRun` attaches again when
  the current page does not own the original live stream.

## Explicit Non-Goals

The attach-stream model does not provide:

- provider-level stream resume
- strict `afterSeq` replay of every missed delta
- process-restart recovery
- multi-process recovery
- SQL persistence for every token or delta
- cancel-run support

Redis can be introduced later behind the stream hub boundary if process restart
or multi-process recovery becomes a product requirement.
