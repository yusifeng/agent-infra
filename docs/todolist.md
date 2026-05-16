# Branching Answers Todo

## 0. Context and Boundary

### 0.1 Confirmed facts
- [x] The durable chat mainline currently behaves as `user message -> one run -> one assistant answer`.
- [x] The new feature should allow one user message to produce two visible answer candidates.
- [x] Both answer candidates should stream at the same time in the chat UI.
- [x] The first candidate is the default answer if the user never explicitly chooses.
- [x] Thumbs up / thumbs down feedback should be available for every answer candidate.
- [x] Existing historical threads with one answer per user message must continue to behave normally.
- [x] Share and replay can remain canonical-only in the first version.
- [x] The chosen model is sibling runtime runs plus explicit turn-level candidate and selection state.
- [x] A `Run` remains the durable runtime execution boundary.
- [x] A candidate answer is represented by a `Run`, not by multiple answers inside one `Run`.
- [x] Multiple candidate runs for one user turn share the same `Run.triggerMessageId`.
- [x] The product can treat ordinal `0` as primary/default and ordinal `1` as alternative.
- [x] The persistence/runtime layer should not model `Run B` as a child object of `Run A`.
- [x] The canonical transcript used for future model context must include only the selected/default answer for each user turn.
- [x] Message sequence allocation is a blocker for concurrent candidate runtime execution because `messages(thread_id, seq)` is unique.
- [x] Share/replay canonical hardening must happen before dual-answer data is publicly exposed.

### 0.2 Goals
- [x] Add durable answer candidate, answer selection, and run feedback state without breaking the existing single-answer flow.
- [x] Add canonical transcript projection so non-selected candidates do not pollute future model context.
- [x] Make message persistence safe when sibling runs write assistant/tool messages concurrently.
- [ ] Support two simultaneous streaming runs for one user message.
- [ ] Hydrate and recover multiple active candidate streams after thread/tab switches.
- [ ] Render candidate answers side-by-side in `/chat`, with choose-best and thumbs feedback controls.
- [x] Keep reusable durable behavior in `packages/*`; keep `apps/playground-next-web` as the validation/UI host.
- [x] Preserve legacy thread behavior without destructive migration.

### 0.3 Non-goals
- [x] Do not implement a full branching conversation tree.
- [x] Do not use child threads for v1 candidate answers.
- [x] Do not represent two candidates as multiple assistant answers inside one `Run`.
- [x] Do not store selection or feedback only in generic metadata.
- [x] Do not add `messages.selectedRunId` as the primary selection model unless this todo is explicitly revised.
- [x] Do not rely only on `runs.triggerMessageId` inference for product candidate grouping.
- [x] Do not redesign replay/share to show all candidates in v1.
- [x] Do not require destructive migration for historical single-answer threads.
- [x] Do not implement multi-user per-user selection in v1.
- [x] Do not add token-accurate candidate sizing or ranking.
- [x] Do not start with pixel-level UI before durable data and projection semantics are correct.
- [x] Do not add a turn-level attach-stream endpoint in v1 unless per-run attach becomes unmanageable.

### 0.4 V1 Product Rules Before Implementation
- [x] V1 rule: answer selection changes are rejected once a later user message exists, unless implemented as display-only and explicitly marked as such.
- [ ] V1 rule: if primary/default fails and an alternative completes, canonical selection falls back to the completed alternative with `source='system_fallback'`.
- [ ] V1 rule: composer remains locked until both candidate runs are terminal.
- [ ] V1 rule: stop behavior is detach-only; durable candidate runs continue and are recoverable by attach-stream.
- [ ] V1 rule: dual-answer mode ships behind an explicit feature flag until runtime, share/replay, hydration, and UI tests pass.
- [ ] V1 rule: decide whether dual-answer mode is always on after the flag, model-specific, or user-triggered.

## 1. Definitions First

### 1.1 Source of Truth
- [ ] Review `docs/source-of-truth/answer-container-model.md` and update it only when the candidate group model stabilizes.
- [ ] Keep evolving implementation details in this todo while the design is still being built.
- [ ] Add or update a source-of-truth doc after the durable model is implemented and verified.
- [ ] Document the distinction between runtime sibling runs, turn-level answer candidates, and canonical transcript projection.
- [ ] Document that `AnswerContainer` remains the UI host for one assistant answer, while a new candidate group can contain multiple answer containers.

### 1.2 Durable Data Model
- [x] Add `AnswerCandidateKind = 'primary' | 'alternative'`.
- [x] Add an `AnswerCandidate` domain type with `id`, `threadId`, `triggerMessageId`, `runId`, `ordinal`, `kind`, and timestamps.
- [x] Add an `AnswerSelection` domain type with `threadId`, `triggerMessageId`, `selectedRunId`, `source`, optional `selectedByUserId`, `createdAt`, and `updatedAt`.
- [x] Add `AnswerSelectionSource = 'default' | 'user' | 'system_fallback'`.
- [x] Add `RunFeedbackValue = 'thumbs_up' | 'thumbs_down'`.
- [x] Add a `RunFeedback` domain type with `id`, `threadId`, `triggerMessageId`, `runId`, `feedbackActorId`, `value`, `createdAt`, and `updatedAt`.
- [x] Define whether `AnswerSelection` is mutable only for the latest unresolved turn, and reject or mark display-only changes for older turns.
- [x] Define canonical-eligible candidate statuses: completed by default; failed/empty candidates are ineligible unless no completed candidate exists.
- [x] Confirm legacy runs without candidate rows are treated as single-candidate turns.
- [x] Define legacy fallback when a run has `triggerMessageId` but no `AnswerCandidate` row.
- [x] Define canonical candidate resolution: explicit selection first, then candidate ordinal `0`, then legacy single run fallback.
- [x] Define whether feedback is one-per-user, one-per-anonymous-session, or append-only audit plus current value.

### 1.3 Database Schema
- [x] Add `answer_candidates` table for explicit candidate grouping.
- [x] Add foreign keys for `answer_candidates.thread_id`, `trigger_message_id`, and `run_id` where supported.
- [x] Add unique constraint on `answer_candidates.run_id`.
- [x] Add unique constraint on `answer_candidates(thread_id, trigger_message_id, ordinal)`.
- [x] Add index on `answer_candidates(thread_id, trigger_message_id)`.
- [x] Validate that `answer_candidates.run_id` belongs to the same `thread_id` and `trigger_message_id` at repository/app level if DB cannot express the composite constraint cleanly.
- [x] Add `answer_selections` table keyed by `(thread_id, trigger_message_id)`.
- [x] Add index or foreign-key validation for `answer_selections.selected_run_id`.
- [x] Validate that `answer_selections.selected_run_id` is an existing candidate for the same `thread_id + trigger_message_id`.
- [x] Add `run_feedback` table keyed by `id`.
- [x] Add `feedbackActorId` or `feedbackSubjectKey` instead of relying on nullable `userId` uniqueness.
- [x] Add unique constraint for feedback replacement using `(run_id, feedback_actor_id)` or the chosen actor key.
- [x] Add index on `run_feedback(thread_id, trigger_message_id)`.
- [x] Add index on `runs(thread_id, trigger_message_id)` if missing.
- [x] Add `created_at` and `updated_at` where mutation is expected, especially `answer_selections` and `run_feedback`.
- [ ] Decide cascade/delete policy for candidates, selections, and feedback if threads/runs/messages are deleted or archived.
- [x] Implement both PostgreSQL and SQLite schemas.
- [x] Generate and review Drizzle migrations.

### 1.4 Repository Interfaces
- [x] Add `AnswerCandidateRepository`.
- [x] Add `AnswerCandidateRepository.findByRunId(runId)`.
- [x] Add `AnswerCandidateRepository.listByRunIds(runIds)`.
- [x] Add repository methods for listing candidates by thread and by trigger message.
- [x] Add `AnswerSelectionRepository`.
- [x] Add `AnswerSelectionRepository.getByThreadAndTrigger(threadId, triggerMessageId)`.
- [x] Add selection upsert/get/list methods.
- [x] Add `RunFeedbackRepository`.
- [x] Add `RunFeedbackRepository.listByRunIds(runIds, actor?)` for thread hydration.
- [x] Add feedback set/clear/list methods.
- [x] Add `RunRepository.listActiveByThread(threadId)`, and update archive/share active-run checks to use any active run, not latest active run.
- [x] Replace runtime cached `nextMessageSeq` with `messageRepo.createWithNextSeq` or `allocateMessageSeq` inside the DB transaction for every persisted message.
- [x] Avoid route-local DB access for durable candidate/selection/feedback state.

### 1.5 Contracts / DTOs
- [x] Add `AnswerCandidateDto`.
- [x] Add `AnswerSelectionDto`.
- [x] Add `RunFeedbackDto`.
- [x] Add request DTO for starting multiple answer candidates.
- [x] Add `candidateCount` or `answerMode` to the start request, with validation that v1 only supports `1` or `2` candidates.
- [x] Add request DTO for selecting a candidate.
- [x] Add request DTO for setting/clearing run feedback.
- [x] Extend thread messages response with `activeRuns`.
- [x] Define `activeRuns` as the new source of truth, while `activeRun` remains a derived compatibility field equal to the latest active run or `null`.
- [x] Extend thread messages response with `answerCandidates`.
- [x] Extend thread messages response with `answerSelections`.
- [x] Extend thread messages response with feedback needed by the UI.
- [x] Add durable-chat-client normalizer tests that accept old responses with `activeRun` only and new responses with `activeRuns`.
- [ ] Add `triggerMessageId` to dual-start response and multiplex stream `turn.ready` event if a turn wrapper is introduced.
- [ ] Add `candidateId`, `ordinal`, and `kind` to `run.ready` or `turn.ready` payload so client does not infer candidate identity only from `runId`.
- [ ] Add request idempotency strategy for send/dual-start requests, or explicitly document that the POST stream route must not be retried automatically.
- [ ] Define multiplex stream events or document reuse of existing run-scoped events with a turn wrapper.

### 1.6 Canonical Transcript Projection
- [x] Add a package-level pure projection function for canonical transcript construction.
- [x] Projection input should include messages, runs, answer candidates, and answer selections.
- [x] Projection should support a cutoff at or before `triggerMessageId` so sibling candidate runs use the same pre-answer history snapshot.
- [x] Projection should keep system/user messages.
- [x] Projection should keep assistant/tool messages only when their `runId` is canonical for that trigger message.
- [x] Projection should preserve original `seq` ordering after filtering non-canonical assistant/tool messages.
- [x] Projection should keep selected run's assistant and tool messages together.
- [x] Projection must not keep orphan tool messages from unselected runs.
- [x] Projection should preserve legacy assistant/tool messages when no candidate grouping exists.
- [x] Projection should handle missing or failed selected runs deterministically.
- [x] Projection should return diagnostics for missing selected run, selected run from wrong trigger, no candidate ordinal `0`, and failed selected candidate fallback.
- [x] Projection should be shared by runtime context construction, share snapshots, and replay/canonical readers.
- [x] Projection should not live only in `apps/playground-next-web`.

## 2. Backend / Platform

### 2.1 Core Package
- [x] Add answer candidate, selection, and feedback domain types.
- [x] Add repository interfaces.
- [x] Add canonical projection input/result types.
- [x] Export new types and repositories from package entry points.
- [x] Keep core free of HTTP parsing and UI presentation state.
- [x] Add focused tests for pure projection helpers if placed in `packages/core`.

### 2.2 DB Package
- [x] Add PostgreSQL schema definitions.
- [x] Add SQLite schema definitions.
- [x] Add repository implementations for candidates, selections, and feedback.
- [x] Add repository implementation for listing multiple active runs by thread.
- [x] Add migration files.
- [x] Add SQLite tests for candidate constraints.
- [x] Add SQLite tests for selection upsert.
- [x] Add SQLite tests for feedback set/clear behavior.
- [ ] Add PostgreSQL schema/migration smoke or snapshot test if this repo supports it.
- [x] Add repository validation tests that reject candidate/selection rows crossing `threadId` or `triggerMessageId`.

### 2.3 Message Sequence Hardening
- [x] Update runtime-facing message creation APIs so each assistant/tool message gets `seq` from an atomic DB-safe allocation, not from a cached runtime counter.
- [x] Remove runtime-level cached `nextMessageSeq`, or make it safe under sibling concurrent runs.
- [x] Add a test that simulates two runs creating assistant messages concurrently for the same thread and proves no `messages(thread_id, seq)` collision occurs.
- [x] Add a test that simulates two runs creating assistant plus tool messages concurrently for the same thread.
- [x] Treat this section as blocking before dual runtime execution starts.

### 2.4 App Package
- [x] Add `turns.startTextCandidates` or equivalent use case.
- [x] Ensure the use case creates exactly one user message for a dual-answer turn.
- [x] Ensure the use case creates two queued runs sharing the same `triggerMessageId`.
- [x] Ensure the use case inserts candidate rows with ordinal `0` and `1`.
- [x] Ensure the use case creates default selection for ordinal `0`.
- [x] Add `turns.selectAnswerCandidate`.
- [x] Add `selectAnswerCandidate` validation: selected run must be a candidate for the same `threadId + triggerMessageId`.
- [x] Add `selectAnswerCandidate` validation for old turns according to the v1 old-selection rule.
- [x] Add feedback use cases.
- [x] Add `runs.listActiveByThread` or equivalent app method.
- [x] Add `answerMode/candidateCount` handling so existing `startText` remains the default single-answer path.
- [x] Add `threads.getCanonicalMessages` or equivalent projection entry point.
- [x] Add canonical projection entry point used by share snapshot creation, not only runtime and UI hydration.
- [x] Add `threads.getMessagesWithAnswerCandidates` for UI hydration.
- [x] Ensure legacy `startText` path does not create candidate/selection rows unless explicitly configured.
- [x] Add app tests for one user message plus two candidate runs.
- [x] Add app tests for legacy canonical projection.
- [x] Add app tests for selected alternative canonical projection.
- [x] Add app tests for rejected invalid selection across different trigger messages.
- [x] Add app tests for rejected old selection changes after a later user message exists.
- [x] Add app tests for failed primary fallback behavior after product rule is decided.

### 2.5 Runtime Pi
- [x] Add `RuntimePiInput.historyMessages` or equivalent canonical history override; runtime-pi must prefer this over `messageRepo.listByThread`.
- [x] Stop constructing model history from raw `messageRepo.listByThread` when canonical data is available.
- [ ] For dual starts, app/route captures one immutable canonical history snapshot after user message U is persisted and before either candidate run starts.
- [x] Candidate A and B receive deep-copied snapshots so mutations or later persistence cannot alter sibling prompts.
- [x] Ensure two candidate runs for the same user message use the same canonical history snapshot before either candidate writes output.
- [x] Ensure Run A output cannot enter Run B's prompt.
- [x] Ensure Run B output cannot enter Run A's prompt.
- [x] Ensure future turns see only selected/default candidate messages.
- [x] Add tests where raw stored messages contain both candidate answers but model input contains only canonical messages.
- [x] Add regression test where candidate A persists before candidate B starts provider invocation; B still does not see A.
- [x] Add regression test where raw history ends with assistant from sibling candidate; runtime still accepts canonical history ending with user U.
- [x] Add tests for selection change before the next turn.
- [x] Preserve existing single-run runtime behavior.

### 2.6 Share / Replay Canonical Hardening
- [x] Route share snapshot creation through canonical projection before dual stream exposure.
- [x] Route replay input through canonical projection in v1 before dual stream exposure.
- [x] Update active-run guard for share creation to reject if any active run exists, not only latest active run.
- [x] Add app-level share snapshot test where raw thread has A and B candidate messages but payload includes only selected/default.
- [x] Add test that public share DTO remains unchanged for legacy threads.
- [x] Add replay test where replay block ids remain linear and do not expose candidate group state in v1.
- [x] Do not implement full replay of both candidates in v1.

### 2.7 Durable Chat Server / Route Helpers
- [x] Add DTO builders for answer candidates, selections, and feedback.
- [x] Add helper for thread messages response with `activeRuns`.
- [x] Add route helper for candidate selection.
- [x] Add route helper for run feedback.
- [ ] Add route helper or stream shape for multiplexing candidate run events.
- [ ] Multiplex stream keeps the HTTP stream open until all candidate runs are terminal or the client disconnects.
- [ ] One candidate failed/completed event must not close the other candidate's run hub session.
- [ ] Use per-run stream versions in run hub snapshots; do not share one stream version counter across run sessions unless the contract says it is turn-scoped.
- [ ] Add `turn.completed` / `turn.failed` / `turn.aborted` event semantics or explicitly document that v1 has only per-run terminal events.
- [ ] Auto-title runs once per user turn, not once per candidate run; define whether title generation uses user message, primary run, selected run, or first completed run.
- [ ] If client disconnects from the multiplex POST stream, apply the v1 detach-only rule: durable runtimes continue and are recoverable via attach-stream.
- [ ] Keep run-scoped attach-stream behavior reusable for recovery.
- [x] Add tests for multiple active runs serialization.
- [ ] Add tests for multiplex stream event ordering and terminal behavior where helper coverage is possible.

### 2.8 Next Routes
- [x] Extend `GET /api/threads/[threadId]/messages` to return candidates, selections, feedback, and `activeRuns`.
- [x] Add route for candidate selection.
- [x] Add route for run feedback set/clear.
- [x] Ensure auth/thread access checks apply to every new route.
- [ ] Keep dual stream route behind feature flag until client multi-stream state and share/replay canonical hardening are complete.
- [ ] Extend or add send route for dual-answer starts.
- [ ] Ensure stream start serialization does not create duplicate user messages.
- [ ] Ensure `withThreadRunStartLock` allows one dual-answer turn to create two sibling runs, but still rejects a second concurrent user turn for the same thread.
- [ ] Ensure stream routes can start and publish two run streams for one user message.
- [ ] Ensure attach-stream can recover each active candidate run after thread switch.
- [ ] Update archive/share/rename or other active-run guards to use `listActiveByThread` when active run count can be greater than one.
- [ ] Dual-answer stream start must remain feature-flagged until Loop 3.5 share/replay hardening and Loop 5 durable-chat-client multi-stream support are complete.
- [ ] Stream client abort follows the v1 detach-only rule and does not implicitly cancel either candidate run.
- [ ] If one candidate reaches a terminal event, the multiplex stream remains open until all candidate runs are terminal or the client disconnects.
- [ ] Add route test where one candidate fails and the other continues streaming.
- [ ] Add route test where stream client aborts after one run starts; both active candidate runs remain durable and recoverable by attach-stream.

## 3. Frontend Boundary

### 3.1 Durable Chat Client State Normalization
- [x] Normalize both `activeRun` and `activeRuns`; expose `activeRuns` as canonical client state.
- [x] Preserve compatibility for existing old responses with `activeRun` only.
- [ ] Replace single active response state with multi-run state while preserving compatibility.
- [ ] Replace single live draft state with `liveAssistantDraftsByRunId`.
- [ ] Track `liveStreamRunIds` as a set or equivalent.
- [ ] Apply incoming stream events by `runId`.
- [ ] Chat responding state remains true while any active candidate run is queued/running.
- [ ] Keep single-run consumers working during the migration.
- [x] Add durable-chat-client normalizer tests for old and new response shapes.
- [ ] Add durable-chat-client tests for interleaved A/B stream events.

### 3.2 Durable Chat Client Attach / Reconcile Lifecycle
- [ ] Replace `attachRunIdRef` and `attachAbortControllerRef` with runId-keyed maps or a multi-attach controller.
- [ ] Replace `attachVersionRef` with runId-keyed version tracking.
- [ ] Hydrate multiple active runs from thread messages response.
- [ ] Attach to multiple active run streams after thread switch.
- [ ] Reconcile completion by `completedRunId`; only clear that run's draft when persisted assistant content for that run exists.
- [ ] Ensure one candidate completing only clears that candidate's live draft.
- [ ] Reconcile completed candidate runs without wiping still-streaming candidates.
- [ ] Stop/detach affects all active candidate attach streams as detach-only; it does not cancel durable candidate runs in v1.
- [ ] Add tests for one run completing before the other.
- [ ] Add tests for hydration with multiple active runs.
- [ ] Add tests for stale attach events from run A not mutating draft/state for run B.

### 3.3 Next App Repo / Schema
- [ ] Update playground chat API schema for new candidate/selection/feedback DTOs.
- [ ] Update API client methods for selection and feedback.
- [ ] Update stream parsing to handle candidate/turn multiplexing if new event types are added.
- [ ] Keep schema validation strict enough to catch malformed candidate payloads.
- [ ] Add schema tests for new DTOs and stream events.

### 3.4 Presentation Services
- [ ] Add `AnswerCandidateGroup` type for one user turn with one or more candidate answer containers.
- [ ] Keep `AnswerContainer` as the representation of one assistant answer.
- [ ] Build candidate groups from messages, runs, candidates, selections, feedback, and live drafts.
- [ ] Preserve legacy output shape for single-answer turns where feasible.
- [ ] Mark ordinal `0` as default/primary.
- [ ] Mark selected candidate in presentation state.
- [ ] Include feedback state per candidate.
- [ ] Include live draft candidate containers while runs are streaming.
- [ ] Ensure non-canonical candidates remain visible in normal `/chat` comparison UI for any persisted dual-answer turn, while canonical-only consumers hide them.
- [ ] Ensure canonical-only consumers can request/project only selected/default answers.
- [ ] Add service test for a legacy thread with multiple historical single-answer turns and no candidate rows.
- [ ] Add service test where candidate messages are interleaved by `seq` because both runs streamed concurrently.
- [ ] Add service test where one candidate is still live and the other is already persisted.
- [ ] Add service test where selected alternative is canonical but primary remains visible in `/chat` comparison UI.

### 3.5 Chat UI
- [ ] Render one user message followed by a candidate comparison group when a turn has two candidates.
- [ ] Render primary and alternative answers side-by-side on desktop.
- [ ] Define responsive layout for narrow screens.
- [ ] Add choose-best action for each candidate.
- [ ] Show default/selected state clearly but without implying the alternative is a separate thread.
- [ ] Add thumbs up/down controls per candidate answer.
- [ ] Show per-candidate status: queued/running/completed/failed.
- [ ] Show failed candidate state without hiding the successful sibling.
- [ ] Disable choose-best for ineligible failed/empty candidates unless fallback rule allows it.
- [ ] Ensure thumbs controls are disabled or queued while feedback mutation is in flight.
- [ ] Ensure choose-best mutation updates canonical marker without reordering raw messages unexpectedly.
- [ ] Ensure operation bars remain attached to the correct `AnswerContainer`.
- [ ] Ensure code blocks, markdown, tools, and thinking sections still render correctly inside each candidate.
- [ ] Ensure streaming candidates do not cause existing auto-scroll/selection bugs to regress.
- [ ] Ensure text selection works inside side-by-side candidates.
- [ ] Ensure inspector/run trace can still target the correct `runId`.
- [ ] Add focused UI tests for candidate group rendering.
- [ ] Add focused UI tests for choose-best action wiring.
- [ ] Add focused UI tests for thumbs action wiring.

## 4. Tests

### 4.1 Data / Repository Tests
- [x] `packages/db`: candidate create/list constraints.
- [x] `packages/db`: selection upsert and replacement.
- [x] `packages/db`: reject `answer_selection.selected_run_id` when run belongs to same thread but different trigger message.
- [ ] `packages/db`: anonymous feedback replacement deterministic across SQLite and PostgreSQL.
- [x] `packages/db`: feedback set/clear/list.
- [x] `packages/db`: active runs list returns more than one running run.
- [x] `packages/db`: concurrent message sequence allocation does not collide.
- [x] `packages/db`: two concurrent runs each persist assistant plus tool messages without seq collision.

### 4.2 App / Projection Tests
- [x] `packages/app`: dual start creates one user message and two runs.
- [x] `packages/app`: candidate rows and default selection are created atomically.
- [x] `packages/app`: legacy `startText` path creates no candidate rows and still returns the old shape.
- [x] `packages/app`: legacy thread canonical projection is unchanged.
- [x] `packages/app`: selected alternative excludes primary assistant/tool messages from canonical context.
- [x] `packages/app`: feedback attaches to run and does not change canonical projection.
- [x] `packages/app`: invalid selection rejects runs from a different thread or trigger message.
- [x] `packages/app`: old selection change is rejected after a later user message exists.
- [x] `packages/app`: share snapshot uses canonical projection and excludes unselected candidate.

### 4.3 Runtime Tests
- [x] `packages/runtime-pi`: model context excludes non-selected candidate messages.
- [x] `packages/runtime-pi`: both candidate runs use the same pre-answer history snapshot.
- [x] `packages/runtime-pi`: candidate B starts after candidate A persisted assistant text, but B receives pre-answer snapshot only.
- [x] `packages/runtime-pi`: raw thread ends with non-canonical assistant, canonical input still ends with user U.
- [x] `packages/runtime-pi`: failed primary fallback follows the decided product rule.
- [x] `packages/runtime-pi`: old single-run tests still pass without candidate rows.

### 4.4 Server / Route Tests
- [x] `packages/durable-chat-server`: DTO builders serialize candidates/selections/feedback.
- [ ] `packages/durable-chat-server`: multiplex stream stays open after one candidate terminal event.
- [x] `apps/playground-next-web`: thread messages route returns `activeRuns`.
- [x] `apps/playground-next-web`: paginated message load returns candidate/selection/feedback only for relevant visible turns plus active runs.
- [ ] `apps/playground-next-web`: stream route creates two candidate runs without duplicate user messages.
- [ ] `apps/playground-next-web`: one candidate fails and the other continues streaming.
- [ ] `apps/playground-next-web`: one candidate failed/completed event does not close the sibling candidate stream.
- [ ] `apps/playground-next-web`: stream client abort is detach-only and active candidate runs remain recoverable by attach-stream.
- [ ] `apps/playground-next-web`: dual-answer stream route is unavailable or disabled when the feature flag is off.
- [ ] `apps/playground-next-web`: attach route recovers each active run.
- [x] `apps/playground-next-web`: selection and feedback routes enforce thread access.

### 4.5 Client / UI Tests
- [ ] `packages/durable-chat-client`: interleaved run events update separate live drafts.
- [ ] `packages/durable-chat-client`: completing one run leaves the other live.
- [ ] `packages/durable-chat-client`: hydration attaches multiple active runs.
- [ ] `packages/durable-chat-client`: stale attach event for A cannot clear B's draft.
- [ ] `apps/playground-next-web`: candidate grouping projection.
- [ ] `apps/playground-next-web`: side-by-side render smoke.
- [ ] `apps/playground-next-web`: choose-best action.
- [ ] `apps/playground-next-web`: thumbs up/down action.
- [ ] `apps/playground-next-web`: text selection/auto-scroll regression around streaming candidate content if existing test utilities support it.

### 4.6 Share / Replay Tests
- [x] `apps/playground-next-web`: unselected candidate messages are not included in canonical share snapshots.
- [x] `apps/playground-next-web`: public share DTO remains unchanged for legacy threads.
- [x] `apps/playground-next-web`: replay remains linear for dual-answer threads.
- [x] `apps/playground-next-web`: replay block ids remain linear and do not expose candidate group state in v1.

### 4.7 Verification Commands
- [x] Run `pnpm --filter @agent-infra/db test` after DB slice.
- [x] Run `pnpm --filter @agent-infra/app test` after app/projection slice.
- [x] Run `pnpm --filter @agent-infra/runtime-pi test` after runtime projection slice.
- [x] Run `pnpm --filter @agent-infra/durable-chat-client test` after client runtime slice.
- [x] Run `pnpm --filter playground-next-web test` after Next route/UI slices.
- [ ] Run `pnpm typecheck` before final integration commit if the touched package set is broad.

## 5. Recommended Execution Order

### Loop 1A: Durable Domain, Schema, And Repositories
- [x] Add core domain types and repository interfaces.
- [x] Add DB schema for answer candidates, answer selections, and run feedback.
- [x] Add DB indexes, foreign keys, validation checks, and uniqueness constraints.
- [x] Add repository implementations for PostgreSQL and SQLite.
- [x] Add active-runs listing support.
- [x] Add DB tests for constraints, cross-trigger validation, selection, and feedback.
- [x] Run `pnpm --filter @agent-infra/db test`.
- [x] Run relevant package typecheck if available.
- [x] Run `codex review` for this loop.
- [x] Commit this loop after review and verification pass.

### Loop 1B: Message Sequence Hardening
- [x] Replace cached per-run message sequence behavior with DB-safe per-message allocation.
- [x] Update runtime-facing message creation APIs.
- [x] Add concurrent assistant/tool message persistence tests.
- [x] Run `pnpm --filter @agent-infra/db test`.
- [x] Run affected runtime tests if message persistence signatures changed.
- [x] Run `codex review` for this loop.
- [x] Commit this loop after review and verification pass.

### Loop 2: Canonical Projection And App Use Cases
- [x] Add shared canonical transcript projection with cutoff/snapshot support.
- [x] Add app use cases for starting answer candidates.
- [x] Add app use cases for selecting candidates with validation.
- [x] Add app use cases for setting and clearing feedback.
- [x] Add active-runs app method.
- [x] Ensure dual candidate creation is atomic.
- [x] Ensure legacy single-answer threads project unchanged.
- [x] Ensure legacy `startText` remains single-answer by default.
- [x] Add app/projection tests.
- [x] Run `pnpm --filter @agent-infra/app test`.
- [x] Run `pnpm --filter @agent-infra/db test` if repository contracts changed.
- [x] Run `codex review` for this loop.
- [x] Commit this loop after review and verification pass.

### Loop 3: Runtime Context Safety
- [x] Change runtime-pi to use canonical/projected history for model context.
- [x] Ensure candidate A and B use the same immutable pre-answer history snapshot.
- [x] Prevent one candidate's output from entering the other's prompt.
- [x] Add runtime-pi tests for dual candidate raw storage and canonical model input.
- [x] Add runtime-pi tests for sibling candidate persistence ordering.
- [x] Add runtime-pi tests for legacy behavior.
- [x] Run `pnpm --filter @agent-infra/runtime-pi test`.
- [x] Run `codex review` for this loop.
- [x] Commit this loop after review and verification pass.

### Loop 3.5: Share / Replay Canonical Hardening
- [x] Route share snapshot creation through canonical projection.
- [x] Route replay input through canonical projection.
- [x] Update active-run guards to use plural active runs.
- [x] Add share/replay tests for dual-answer threads.
- [x] Confirm unselected candidate messages are excluded from canonical-only outputs.
- [x] Run `pnpm --filter playground-next-web test`.
- [x] Run any relevant package tests touched by projection reuse.
- [x] Run `codex review` for this loop.
- [x] Commit this loop after review and verification pass.

### Loop 4A: Contracts, Hydration Routes, Selection, And Feedback
- [x] Add contracts for candidates, selections, feedback, active runs, and dual start request shape.
- [x] Add durable-chat-server DTO builders and route helpers.
- [x] Update Next thread messages route with `activeRuns`, candidates, selections, and feedback.
- [x] Add Next selection and feedback routes.
- [x] Add compatibility normalization for `activeRun` and `activeRuns`.
- [x] Add server/route tests for hydration, selection, feedback, and auth.
- [x] Run `pnpm --filter @agent-infra/durable-chat-server test` if tests exist or relevant.
- [x] Run `pnpm --filter playground-next-web test`.
- [x] Run `codex review` for this loop.
- [ ] Commit this loop after review and verification pass.

### Loop 4B: Dual Stream Start And Multiplex Lifecycle
- [ ] Keep dual stream route behind feature flag.
- [ ] Update stream route to create and start two candidate runs.
- [ ] Ensure per-run attach-stream can recover multiple active runs.
- [ ] Implement and test v1 detach-only stream abort/disconnect behavior.
- [ ] Define and test per-run terminal and optional turn terminal semantics.
- [ ] Ensure one candidate failing or completing does not close the sibling stream.
- [ ] Ensure auto-title runs once per user turn.
- [ ] Add stream route and helper tests.
- [ ] Run `pnpm --filter playground-next-web test`.
- [ ] Run relevant durable-chat-server tests.
- [ ] Run `codex review` for this loop.
- [ ] Commit this loop after review and verification pass.

### Loop 5A: Durable Chat Client State Normalization
- [ ] Normalize `activeRun` and `activeRuns`.
- [ ] Replace single active response state with multi-run state.
- [ ] Replace single live draft state with `runId` keyed draft state.
- [ ] Apply stream events by `runId`.
- [ ] Keep single-run consumers working during the migration.
- [ ] Add durable-chat-client tests for old/new response shapes and interleaved events.
- [ ] Run `pnpm --filter @agent-infra/durable-chat-client test`.
- [ ] Run `codex review` for this loop.
- [ ] Commit this loop after review and verification pass.

### Loop 5B: Durable Chat Client Multi-Attach And Reconcile
- [ ] Replace single attach refs/controllers with runId-keyed maps.
- [ ] Replace single attach version with runId-keyed version tracking.
- [ ] Reconcile one candidate completion without clearing other candidates.
- [ ] Hydrate and attach multiple active runs after thread switch.
- [ ] Add stale-event and partial-completion tests.
- [ ] Run `pnpm --filter @agent-infra/durable-chat-client test`.
- [ ] Run `codex review` for this loop.
- [ ] Commit this loop after review and verification pass.

### Loop 6: Next Chat Presentation And UI
- [ ] Add candidate group presentation service.
- [ ] Render side-by-side answer candidates.
- [ ] Add per-candidate status.
- [ ] Add choose-best UI.
- [ ] Add thumbs up/down UI.
- [ ] Preserve existing single-answer visual path.
- [ ] Preserve auto-scroll and text selection behavior during streaming.
- [ ] Add focused service/UI tests.
- [ ] Run `pnpm --filter playground-next-web test`.
- [ ] Run `pnpm --filter playground-next-web typecheck` if available.
- [ ] Run `codex review` for this loop.
- [ ] Commit this loop after review and verification pass.

### Loop 7: Integration Hardening
- [ ] Run broad targeted tests for all touched packages.
- [ ] Run `pnpm typecheck`.
- [ ] Manually verify dual streaming in `apps/playground-next-web`.
- [ ] Manually verify thread switch during dual streaming.
- [ ] Manually verify failed primary with successful alternative.
- [ ] Manually verify stream disconnect or stop behavior.
- [ ] Manually verify selection and feedback persistence after refresh.
- [ ] Manually verify legacy single-answer thread rendering.
- [ ] Promote stable long-lived model facts into `docs/source-of-truth`.
- [ ] Delete `docs/todolist.md` when all work is complete and source-of-truth docs are updated.
- [ ] Run final `codex review`.
- [ ] Commit final hardening/docs cleanup after review and verification pass.
