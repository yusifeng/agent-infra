# Run Attach Stream Todo

## Context

This task is about reconnecting a browser page to an already-running assistant run after the page loses its live SSE subscription.

Confirmed behavior:

- [x] A server-side run can continue after the browser's original stream connection closes.
- [x] Refreshing the page loses React state, refs, abort controllers, and the active SSE reader.
- [x] Switching away from a thread stops the page-owned live response view, but does not cancel the backend run.
- [x] Returning to a thread can hydrate durable messages and `activeRun` from the existing thread messages API.
- [x] `sessionStorage` draft restore is local UI state only; it is not proof that the page still owns a live stream.

## Goal

- [ ] Support attaching to an active running run from the browser using `threadId + runId`.
- [ ] On attach, send the current assistant output snapshot first.
- [ ] After the snapshot, continue streaming subsequent run events to the newly attached client.
- [ ] On terminal run state, reload or reconcile with durable thread messages so final content comes from persisted state.
- [ ] Cover both user-visible recovery cases:
  - [ ] Refresh page while a run is streaming.
  - [ ] Switch to another thread while a run is streaming, then switch back.

## Non-Goals

- [x] Do not call or depend on DeepSeek's private web `resume_stream` API.
- [x] Do not implement provider-level stream resume.
- [x] Do not add cancel-run support in this task.
- [x] Do not persist every token or stream delta into the SQL database.
- [x] Do not require Redis for the first implementation.
- [x] Do not implement multi-process or process-restart recovery in this task.
- [x] Do not implement strict `afterSeq` replay of every missed delta.
- [x] Do not change the durable DB message model to require a running assistant message before this feature works.
- [x] Do not treat local restored draft content as live stream ownership.

## Definitions First

- [ ] Define the runtime boundary between durable transcript state and transient running stream state.
- [ ] Decide the exact endpoint name and route shape. Preferred shape:
  - [ ] `GET /api/threads/:threadId/runs/:runId/attach-stream`
- [x] Define a snapshot event that is independent of frontend component state.
- [x] Define that a snapshot is authoritative for the attached run and replaces the current live assistant draft; it must not be appended as a delta.
- [x] Define that all attach-stream events which mutate the live assistant draft carry a monotonic runtime `version`.
- [x] Define `version` as a transient run-stream mutation version, not a durable DB version and not a historical replay sequence.
- [ ] Define frontend stale-event behavior:
  - [ ] Ignore live draft mutation events with `version <= currentVersion`.
  - [ ] Decide whether a version gap is acceptable under attach ordering guarantees or should request a fresh snapshot.
- [x] Define the minimum assistant snapshot payload needed to reconstruct the current in-progress assistant bubble:
  - [x] `runId`
  - [x] `messageId` when available
  - [x] temporary live draft identity when `messageId` is unavailable, derived from `runId`
  - [x] generated text segments
  - [x] reasoning segments if currently represented by the stream
  - [x] tool/search segments if currently represented by the stream
  - [x] run status
  - [x] version
- [x] Define whether terminal events include a final snapshot or only trigger durable message reload.
- [ ] Define attach ordering to avoid races:
  - [ ] Register subscriber in buffering mode.
  - [ ] Read current snapshot.
  - [ ] Send snapshot.
  - [ ] Flush buffered events newer than the snapshot.
  - [ ] Continue in live mode.
- [ ] Define attach-unavailable behavior for cases where the active run exists in durable state but the in-memory stream session is gone.
- [x] Define attach-unavailable reasons:
  - [x] `run_not_found`
  - [x] `run_not_active`
  - [x] `stream_session_gone`
  - [x] `thread_run_mismatch`
  - [x] `not_authorized`
- [ ] Define frontend behavior for each attach-unavailable reason:
  - [ ] Reload durable thread messages when the run may already be terminal.
  - [ ] Fall back to durable status polling or periodic message reload when the stream session is gone but the run is still active.
  - [ ] Stop attaching and surface or log a real error for authorization and thread/run mismatch failures.

## Backend / Runtime Work

- [x] Add a small run stream hub interface that is not coupled to Fastify response objects:
  - [x] `openSession`
  - [x] `publish`
  - [x] `getSnapshot`
  - [x] `subscribe`
  - [x] `closeSession`
- [x] Implement an in-memory `RunStreamHub`.
- [x] Keep the hub interface compatible with a future Redis-backed implementation.
- [x] Define hub lifecycle rules:
  - [x] `openSession` happens before provider stream deltas are consumed.
  - [x] `closeSession` happens after terminal state is published.
  - [x] Subscriber disconnect removes only that subscriber.
  - [x] Subscriber disconnect does not close the run session.
  - [x] Closed terminal sessions are retained briefly so late attach can observe terminal state.
  - [x] Running sessions have a max age or cleanup path to avoid memory leaks.
- [ ] Make the original send-message stream publish snapshot-relevant updates into the hub.
- [ ] Ensure assistant text, reasoning, and tool/search stream events update the hub snapshot.
- [ ] Ensure terminal states close or finalize the stream session after final events are sent.
- [ ] Add the attach stream route.
- [ ] Validate that attach requests belong to the requested thread and active run.
- [ ] On attach, send snapshot first, then future events.
- [ ] Clean up subscribers on client disconnect without cancelling the backend run.
- [ ] Return a clear unavailable event or terminal response when attach cannot continue.

## Frontend Work

- [ ] Add a client API for opening an attach stream by `threadId + runId`.
- [ ] Parse the new snapshot event.
- [ ] Parse the attach-unavailable event if added.
- [ ] Extract or share stream event application logic so send-stream and attach-stream do not diverge.
- [ ] Convert a snapshot into the same live assistant draft shape used by normal streaming.
- [ ] Replace the existing live draft for that run on snapshot; do not append snapshot content to existing draft content.
- [ ] Track current attach-stream version per run.
- [ ] Ignore stale attached events with `version <= currentVersion`.
- [ ] Use `messageId ?? run:${runId}` as the temporary live assistant bubble identity until durable messages are reloaded.
- [ ] Detect detached active runs:
  - [ ] `activeRun` is queued or running.
  - [ ] The current page does not own a live send stream for that run.
- [ ] Attach automatically after thread hydration when a detached active run is present.
- [ ] Attach automatically when switching back to a thread with a detached active run.
- [ ] Abort only the local attach subscription when leaving a thread or unmounting the page.
- [ ] Do not treat local attach abort as backend run cancellation.
- [ ] On terminal events, reload or reconcile durable messages and clear live draft state.
- [ ] Keep current send/stop button semantics unchanged unless required by this attach flow.

## Tests

- [ ] Add hub tests:
  - [ ] Snapshot is updated as events publish.
  - [ ] New subscriber receives snapshot first.
  - [ ] Events published during attach setup are not lost.
  - [ ] Snapshot replace semantics are preserved by consumers.
  - [ ] Stale versioned events can be identified and ignored.
  - [ ] Unsubscribing one subscriber does not close the run session.
  - [ ] Closing a session sends or preserves terminal state as expected.
  - [ ] Running sessions are cleaned up by max-age or cleanup rules.
  - [ ] Closed sessions are retained briefly for terminal attach.
- [ ] Add server route tests:
  - [ ] Attach succeeds for the active run in the requested thread.
  - [ ] Attach rejects or returns unavailable for wrong thread/run pairs.
  - [ ] Attach returns a specific unavailable reason for inactive or missing sessions.
  - [ ] Attach disconnect does not cancel the backend run.
  - [ ] Terminal run state is visible to an attached client.
- [ ] Add frontend schema tests for snapshot and unavailable events.
- [ ] Add frontend runtime tests:
  - [ ] Hydrated `activeRun` without page-owned stream opens attach stream.
  - [ ] Snapshot creates or replaces the live assistant draft.
  - [ ] Snapshot never appends duplicate content to an existing live draft.
  - [ ] Subsequent assistant events append to the snapshot content.
  - [ ] Stale versioned events are ignored.
  - [ ] Missing `messageId` uses the run-derived live draft key until durable reload.
  - [ ] Attach-unavailable falls back according to reason.
  - [ ] Terminal events reload durable messages.
  - [ ] Switching away aborts local attach only.
  - [ ] Switching back attaches again.
- [ ] Manual verification:
  - [ ] Start a long assistant response.
  - [ ] Refresh during generation.
  - [ ] Confirm the page receives current snapshot and then subsequent output.
  - [ ] Confirm final persisted assistant message appears after completion.
  - [ ] Start a long assistant response.
  - [ ] Switch to another thread during generation.
  - [ ] Switch back.
  - [ ] Confirm the page attaches and continues receiving output.

## Execution Slices

Each implementation slice is not complete until targeted verification has passed and the repository codex review profile from `AGENTS.md` has been run for the slice.

### Slice 1: Contract And Hub

- [x] Define snapshot and unavailable event DTOs/schemas.
- [x] Define version semantics for all attach-stream live draft mutation events.
- [x] Define snapshot replace semantics.
- [x] Define temporary live draft identity when `messageId` is unavailable.
- [x] Define unavailable reasons and fallback behavior.
- [x] Define in-memory hub TTL and terminal retention rules.
- [x] Add focused tests for the new event shapes.
- [x] Add `RunStreamHub` interface and in-memory implementation.
- [x] Add hub unit tests.
- [x] Run targeted package tests for the changed package(s).
- [x] Run codex review for this slice using the repository review profile from `AGENTS.md`.
- [x] Address review findings or explicitly document why any finding is not applied.

### Slice 2: Server Attach Stream

- [ ] Publish original send-stream events into the hub.
- [ ] Add attach stream route.
- [ ] Add server route tests around attach, terminal state, and disconnect behavior.
- [ ] Run targeted server/runtime tests.
- [ ] Run codex review for this slice using the repository review profile from `AGENTS.md`.
- [ ] Address review findings or explicitly document why any finding is not applied.

### Slice 3: Frontend Stream Application

- [ ] Add attach stream API client.
- [ ] Add snapshot handling.
- [ ] Share event application logic between original send stream and attached stream.
- [ ] Add schema and state-transition tests.
- [ ] Run targeted frontend tests/typecheck.
- [ ] Run codex review for this slice using the repository review profile from `AGENTS.md`.
- [ ] Address review findings or explicitly document why any finding is not applied.

### Slice 4: Recovery Integration

- [ ] Detect detached active runs after thread hydration.
- [ ] Attach on refresh recovery.
- [ ] Attach when switching back to a running thread.
- [ ] Reconcile durable messages on completion.
- [ ] Add runtime tests for refresh-equivalent hydration and thread switching.
- [ ] Run targeted frontend tests/typecheck.
- [ ] Run codex review for this slice using the repository review profile from `AGENTS.md`.
- [ ] Address review findings or explicitly document why any finding is not applied.

### Slice 5: Manual QA And Documentation

- [ ] Run the playground locally.
- [ ] Verify refresh during a long run.
- [ ] Verify switching away and back during a long run.
- [ ] Document any stable runtime/frontend behavior in the relevant source-of-truth doc if the implementation establishes a long-lived concept.
- [ ] Run codex review for final documentation and integration changes if this slice includes code or behavior changes.
- [ ] Address review findings or explicitly document why any finding is not applied.
- [ ] Delete this todo only after implementation, verification, and any source-of-truth updates are complete.
