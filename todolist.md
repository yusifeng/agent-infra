# Agent Infra Next-Phase Todo

## Design Constraints

- [x] Confirm `packages/app` as the next mainline package and name it `@agent-infra/app`.
- [x] Keep `packages/app` as a narrow application boundary, not a new catch-all entrypoint.
- [x] Keep `packages/app` independent from Next.js, browser concerns, and direct env parsing.
- [x] Keep `packages/app` independent from `@agent-infra/contracts`.
- [x] Keep `packages/runtime-pi` as a runtime adapter only, not a use-case or transport layer.
- [x] Keep `packages/contracts` focused on request/response DTOs and serialized transport shapes only.
- [x] Keep `apps/playground-web` as the first consumer of `agent-infra`, not the place where app-layer orchestration lives.
- [x] Do not expand the mainline toward a chat-product direction.
- [x] Do not introduce `getRunDetails` in the first phase.
- [x] Do not start replay, artifact, memory, or additional runtime adapters before the app boundary is stable.

## Phase 0: Scope Lock

- [x] Lock `packages/app` v1 use cases to:
  - `threads.create`
  - `threads.list`
  - `threads.getMessages`
  - `turns.runText`
- [x] Confirm that `getRunTimeline` is not part of v1.
- [x] Confirm that `RuntimePiMetaDto` remains a playground diagnostic contract, not a mainline platform contract.
- [x] Confirm that `/api/runtime-pi/meta` may remain a local diagnostic route outside `packages/app`.
- [x] Confirm that `turns.runText` stays text-only and does not become a generic mixed-content write API.

## Phase 1: Create `packages/app`

- [x] Add `packages/app/package.json`.
- [x] Add `packages/app/tsconfig.json`.
- [x] Add `packages/app/src/index.ts`.
- [x] Define the app dependency shape:
  - repos bundle
  - runtime dependency
  - `idGenerator`
  - `now`
  - transaction boundary capability
- [x] Add `createAgentInfraApp(...)`.
- [x] Add `app.threads.create(...)`.
- [x] Add `app.threads.list(...)`.
- [x] Add `app.threads.getMessages(...)`.
- [x] Add `app.turns.runText(...)`.
- [x] Define app-native result types for the use cases.
- [x] Define typed app errors:
  - `ThreadNotFoundError`
  - `ThreadNotActiveError`
  - `InvalidTurnTextError`
  - `RuntimeSelectionError`
  - `RuntimeUnavailableError`
  - `TurnPersistenceError`
  - `TurnProjectionError`
- [x] Implement `turns.runText(...)` preconditions:
  - validate thread exists
  - validate thread is active
  - validate text is non-empty
  - validate runtime selection is usable
- [x] Implement `turns.runText(...)` pre-run write orchestration:
  - create user message
  - create first text part
  - create queued run
- [x] Implement `turns.runText(...)` runtime invocation orchestration.
- [x] Implement `turns.runText(...)` final projection read:
  - final run
  - thread messages
  - run event count
  - tool invocation count
- [x] Keep `packages/app` free from:
  - DTO mapping
  - Next.js request/response objects
  - browser logic
  - env/config parsing
  - runtime policy knobs
  - generic CRUD facades

## Phase 2: Define Transaction and Failure Semantics

- [x] Make all precondition failures leave no durable records:
  - thread not found
  - thread not active
  - empty text
  - runtime unavailable
  - invalid provider/model selection
- [x] Make pre-run writes atomic:
  - user message
  - first text part
  - queued run
- [x] Ensure runtime execution happens outside the pre-run transaction.
- [x] Define projection-read failure semantics:
  - durable state remains
  - app returns a projection error
  - error includes at least `threadId` and `runId`
- [x] Define runtime execution failure semantics:
  - final `run.status` is the source of truth
  - `run.status = failed` is a normal possible outcome
  - `executionError` can be attached without relying only on throw/catch
- [x] Document the separation of responsibility:
  - app handles preconditions, transaction boundaries, and outcome mapping
  - runtime adapter handles in-run state transitions and event persistence

## Phase 3: Move `playground-web` to the App Boundary

- [x] Refactor `apps/playground-web/app/api/runtime-pi/threads/route.ts` to call `packages/app`.
- [x] Refactor `apps/playground-web/app/api/runtime-pi/threads/[threadId]/messages/route.ts` to call `packages/app`.
- [x] Refactor `apps/playground-web/app/api/runtime-pi/runs/[threadId]/route.ts` to call `packages/app`.
- [x] Keep `/api/runtime-pi/meta` local and diagnostic-only.
- [x] Remove direct repo implementation orchestration from thread/message/run routes.
- [x] Remove direct `runAssistantTurnWithPi(...)` usage from the main playground routes.
- [x] Ensure `playground-web` remains a consumer of `@agent-infra/contracts`, not a source of local domain-like types.

## Phase 4: Expand `packages/contracts` Around Use Cases

- [x] Add request DTOs:
  - `CreateThreadRequestDto`
  - `RunTextTurnRequestDto`
  - `GetThreadMessagesRequestDto`
- [x] Add or rename response DTOs toward generic names:
  - `CreateThreadResponseDto`
  - `ThreadsResponseDto`
  - `ThreadMessagesResponseDto`
  - `RunTextTurnResponseDto`
- [x] Keep runtime/playground diagnostic contracts separate:
  - `RuntimePiMetaDto`
  - `RuntimePiModelOptionDto`
- [x] Ensure contracts do not include:
  - repo contracts
  - domain rules
  - runtime policies
  - env/config structures
  - DB connection and runtime diagnostic metadata as mainline API shapes
- [x] Ensure browser request DTOs do not expose unnecessary server-side internal fields.

## Phase 5: Publish a Public Configurable Runtime Entry

- [x] Decide the public runtime shape:
  - preferred target: `createPiRuntime(...)`
  - acceptable intermediate step: public configurable runtime entry before full factory-object shape
- [x] Add a runtime-level configuration surface for:
  - `getApiKey`
  - `systemPrompt`
  - `tools`
  - runtime selection resolution
- [x] Add a runtime-level prepare step for provider/model preflight.
- [x] Add a runtime-level turn execution method.
- [x] Keep `app.turns.runText(...)` narrow and free from runtime-policy arguments.
- [x] Make `packages/app` depend on a runtime object/port, not on a concrete route-style helper.
- [x] Move demo tools out of the runtime mainline default path.
- [x] Keep `createDemoTools` exportable for playground/smoke composition.
- [x] Make playground and smoke explicitly inject demo tools when needed.

## Phase 6: Harden Runtime Partial Failure Semantics

- [x] Ensure an open assistant message is marked `failed` if runtime crashes after message start.
- [x] Ensure running tool invocations are marked `failed` if runtime crashes mid-execution.
- [x] Ensure failed tool invocations get `finishedAt` where possible.
- [x] Ensure every created run eventually ends in `completed` or `failed`.
- [x] Ensure runtime exceptions write:
  - `run.status = failed`
  - `finishedAt`
  - `error` when possible
  - a `runtime_error` run event
- [x] Preserve already-written truthful durable records:
  - assistant parts
  - tool results
  - run events
- [x] Avoid leaving misleading hanging states such as:
  - assistant message stuck in `created`
  - tool invocation stuck in `running`

## Phase 7: Add Read-Side Timeline Use Cases

- [x] Add `runs.getTimeline({ runId })` to `packages/app`.
- [x] Return a read model focused on:
  - run events
  - tool invocations
  - run summary
- [x] Add matching request/response DTOs in `packages/contracts`.
- [x] Keep `getRunTimeline` separate from `runTextTurn`, not as an inline debug dump.
- [x] Do not introduce `getRunDetails` as a catch-all API at this stage.
- [x] Optionally expose the timeline in `playground-web` after the app boundary is stable.

## Explicitly Avoid

- [x] Do not turn `packages/app` into a repo facade.
- [x] Do not add `messages.create`, `runs.create`, `runEvents.list`, or other table-shaped APIs to `packages/app`.
- [x] Do not add `getRunDetails` in the first phase.
- [x] Do not pass runtime policy (`tools`, `systemPrompt`, `getApiKey`, agent options) through `turns.runText(...)`.
- [x] Do not move env/config/model discovery into `packages/app`.
- [x] Do not keep demo tools as the default runtime-pi mainline behavior.
- [x] Do not leave `playground-web` in a half-migrated state where some routes use `packages/app` and some still orchestrate repos directly.
- [x] Do not add another runtime adapter before the application boundary is stable.
- [x] Do not promote playground diagnostic shapes into generic platform contracts.
- [x] Do not prioritize streaming, resume, artifact, or memory work before the mainline app boundary is closed.
- [x] Do not keep expanding product-like chat UI behavior ahead of official use-case boundaries.

## Acceptance Criteria

- [x] `packages/app` exists and now exposes:
  - `threads.create`
  - `threads.list`
  - `threads.getMessages`
  - `turns.runText`
- [x] `packages/app` also exposes the phase-7 read-side use case:
  - `runs.getTimeline`
- [x] `packages/app` does not expose generic CRUD or repo-shaped APIs.
- [x] `packages/app` does not depend on `@agent-infra/contracts`.
- [x] `playground-web` thread/message/run routes no longer import repo implementations directly.
- [x] `playground-web` thread/message/run routes no longer call `runAssistantTurnWithPi(...)` directly.
- [x] `/api/runtime-pi/meta` remains diagnostic and local.
- [x] `turns.runText(...)` remains narrow:
  - `threadId`
  - `text`
  - `provider/model`
  - minimal server-side metadata only
- [x] A public configurable runtime entry exists for advanced customization.
- [x] Advanced runtime customization does not require internal-only APIs.
- [x] Pre-run writes are atomic and do not leave ambiguous partial user-turn state.
- [x] Runtime failures leave truthful failed state, not hanging intermediate state.
- [x] `contracts` includes use-case request/response DTOs without taking on domain or runtime concerns.
- [x] `getRunTimeline` is introduced only after the app boundary is stable.

---

# Runtime Console + SSE Todo

## Design Constraints

- [x] Keep the current high-level layout as `left / center / right`, not a product-style chat shell.
- [x] Define the three regions explicitly:
  - left = threads
  - center = transcript + composer
  - right = log console
- [x] Keep the right-side log console split into:
  - fixed summary/status area
  - scrollable log/timeline area
- [x] Treat durable persistence as the source of truth:
  - `run`
  - `run_events`
  - `tool_invocations`
  - persisted messages / message parts
- [x] Do not invent a parallel in-memory-only log model for the UI.
- [ ] Use SSE for transport only; durable records remain the canonical trace.
- [x] Do not introduce WebSockets for this phase.
- [x] Do not collapse the right-side console into tabs unless layout pressure forces it later.
- [x] Do not make the log console depend on browser-local runtime state that cannot be reconstructed from the backend.
- [x] Keep the log console useful for both:
  - live runs
  - previously completed runs

## Phase 0: Scope Lock

- [x] Define the right-side panel name and purpose as `Log`.
- [x] Lock the right-side fixed summary area to the minimum useful fields:
  - run status
  - provider
  - model
  - startedAt
  - finishedAt
  - duration
  - execution error
- [x] Lock the right-side scrollable area to three log blocks:
  - run events timeline
  - tool invocation list
  - error/event details
- [x] Keep the center area focused on transcript and message composition only.
- [x] Introduce explicit `selectedRunId` state in the page instead of inferring everything only from thread state.
- [x] Keep `getRunDetails` out of scope.
- [x] Keep replay/resume/abort out of scope.

## Phase 1: Strengthen the Read-Side Console

- [ ] Add a dedicated read model for the log console if the current `RunTimelineResponseDto` is not enough.
- [x] Confirm whether the existing timeline payload is sufficient to render:
  - run summary
  - tool rows
  - event rows
  - error details
- [ ] If needed, extend contracts with console-facing DTOs, but keep them transport-only.
- [x] Keep `runs.getTimeline(...)` as the backend read use case for the right-side console.
- [x] Do not merge timeline data into `runTextTurn` responses as an inline dump.
- [x] Keep timeline queries run-scoped, not thread-scoped.

## Phase 2: Rework `/runtime-pi` Layout into a Console

- [x] Refactor [runtime-pi-playground-page.tsx](/Users/david/Documents/github/agent-infra/apps/playground-web/components/runtime-pi-playground-page.tsx) into three regions:
  - left threads column
  - center transcript column
  - right log column
- [x] Keep the left column behavior simple:
  - create thread
  - select thread
  - show active thread
- [x] Keep the center column behavior simple:
  - render transcript
  - render composer
  - show current thread context
- [x] Add a right-side fixed summary card for the currently selected run.
- [x] Add a right-side scrollable log viewport below the summary card.
- [x] Make the log viewport render event rows in seq order.
- [x] Make the log viewport render tool invocation rows with status and details.
- [x] Add clear empty states:
  - no thread selected
  - no run selected
  - run exists but no events yet
- [x] Add clear failure states in the log area rather than only a top-of-page banner.

## Phase 3: Make the Console Truly Run-Oriented

- [x] Introduce page state for:
  - `selectedThreadId`
  - `selectedRunId`
  - `timeline`
  - `timelineLoading`
  - `timelineError`
- [x] When a new run completes or starts, set `selectedRunId` explicitly.
- [x] When switching threads, resolve which run should be focused:
  - prefer latest run for the thread
  - otherwise show transcript without a log selection
- [ ] Add a way to switch between recent runs for the active thread if more than one exists.
- [x] Keep the transcript thread-scoped and the log panel run-scoped.
- [ ] Do not overload thread selection with hidden run selection logic.

## Phase 4: Add a Proper SSE Transport Contract

- [x] Decide the SSE transport shape explicitly before coding:
  - single request that starts a run and streams events
  - or two-step create-then-stream flow
- [x] Prefer a design that keeps `runId` available immediately for UI state.
- [x] Keep SSE event names explicit and stable.
- [x] Add transport DTO/event contracts for the stream payloads.
- [x] Keep SSE payloads serializable and browser-consumable.
- [x] Do not make SSE events the only way to reconstruct state; the timeline endpoint must remain usable for reload/reconnect.
- [x] Do not make the stream payload depend on internal-only runtime objects.

## Phase 5: Refactor the Write Path for Streaming

- [x] Split the current one-shot `turns.runText(...)` flow into pieces only if needed for streaming.
- [x] If splitting is needed, define a narrow start-run use case that:
  - validates preconditions
  - writes user message + first text part + queued run atomically
  - returns `runId` and initial run metadata
- [x] Keep runtime execution outside the pre-run transaction.
- [x] Add a server path that starts execution and emits SSE frames as the run progresses.
- [x] Ensure the route still maps typed app errors to proper HTTP status before streaming begins.
- [x] Ensure once streaming begins, terminal failure information is still written durably.
- [x] Keep the non-SSE compatibility path until the SSE path is stable.

## Phase 6: Stream Useful Log Events

- [x] Stream at least these SSE event categories:
  - run lifecycle
  - assistant/message lifecycle
  - tool lifecycle
  - terminal completion/failure
- [x] Include `runId` on all stream events.
- [x] Include enough data to update the right-side summary incrementally.
- [x] Include enough data to append rows to the log viewport incrementally.
- [x] Include terminal events that let the client stop listening cleanly.
- [ ] Keep event ordering stable and compatible with persisted `run_events.seq`.
- [ ] Avoid sending giant repeated payloads when a smaller incremental event is enough.

## Phase 7: Wire the Page to SSE

- [x] Replace the current one-shot send flow in the page with an SSE-aware flow.
- [x] When the user sends a prompt:
  - create/start the run
  - set `selectedRunId`
  - open the stream
  - update the right-side summary live
  - append log rows live
- [ ] Keep transcript updates coherent while the stream is in flight.
- [x] On stream completion, refresh the canonical timeline from the backend.
- [x] On stream failure, surface the error in the log panel and then reconcile from the backend.
- [x] Handle browser navigation or thread switching while a stream is active.
- [x] Ensure only one active send stream per selected thread/composer interaction.

## Phase 8: Reconciliation and Reload Safety

- [ ] On initial page load, load threads and metadata as today.
- [ ] When a thread is selected, load transcript as today.
- [ ] If a thread has recent runs, load the latest run timeline into the right-side panel.
- [ ] After SSE disconnect/reconnect or page refresh, rebuild the log panel from durable data.
- [ ] Ensure the page still works when opening an already-completed run with no live stream.
- [ ] Ensure the log panel never depends on hidden ephemeral client state to remain meaningful.

## Phase 9: Console Polish

- [ ] Add visual distinction for:
  - queued
  - running
  - completed
  - failed
- [ ] Add clear row styling for:
  - event entries
  - tool entries
  - runtime/system errors
- [ ] Add expand/collapse for raw JSON payloads in the log viewport.
- [ ] Keep the summary area compact and always visible.
- [ ] Keep the log viewport scrollable independently from transcript when practical.
- [ ] Ensure the layout remains usable on narrower screens:
  - collapse to vertical sections on mobile
  - do not lose access to the log console

## Explicitly Avoid

- [ ] Do not turn the right-side panel into a generic “debug drawer” for unrelated metadata.
- [ ] Do not make the log panel a second transcript.
- [ ] Do not replace durable trace data with client-only console strings.
- [ ] Do not make SSE the only supported way to inspect a run.
- [ ] Do not remove the timeline endpoint after adding SSE.
- [ ] Do not stream provider keys, raw secrets, or unsafe internals to the browser.
- [ ] Do not couple the SSE transport to `playground-web`-specific UI wording.
- [ ] Do not add WebSockets unless SSE proves insufficient.
- [ ] Do not make the center transcript depend on the right-side log panel being present.
- [ ] Do not blur the distinction between thread-scoped state and run-scoped state.

## Acceptance Criteria

- [ ] `/runtime-pi` renders as a true three-region console:
  - left threads
  - center transcript
  - right log
- [ ] The right-side fixed area shows the current run summary clearly.
- [ ] The right-side scrollable area shows durable run trace information.
- [ ] The page can focus a specific run independently from just focusing a thread.
- [ ] The log panel can render completed historical runs without requiring a live connection.
- [ ] Sending a message uses SSE instead of a single final JSON response.
- [ ] The page updates the log panel live while the run is in progress.
- [ ] The page reconciles against durable backend state after the stream finishes.
- [ ] Refreshing the page still reconstructs the same run summary and logs from the backend.
- [x] The center transcript remains usable and understandable during and after streaming.
