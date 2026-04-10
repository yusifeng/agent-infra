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
