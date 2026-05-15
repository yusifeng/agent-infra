# Observability Console MVP Todo

## Context And Boundary

- [x] `/observability` is the selected route for the next observability surface.
- [x] The page is an independent management/debugging surface, not part of the business chat workflow.
- [x] The target information architecture is `thread | run | content`.
- [x] The first implementation should stay lightweight and useful before it becomes a full observability product.
- [x] Existing runtime data should be used first:
  - `GET /api/threads`
  - `GET /api/threads/:threadId/runs`
  - `GET /api/runs/:runId/timeline`
  - `GET /api/runs/:runId/trace`
- [x] Existing trace semantics already live below the UI layer; the UI must project them, not redefine them.
- [x] Package-layer contracts remain the product boundary. `apps/playground-next-web` is the first product host and validation surface.

## Goal

Build a durable observability console MVP that lets an authenticated operator select a thread, select one of its runs, and inspect that run through timeline and trace views.

The practical result should be:

- [x] A user can open `/observability`.
- [x] A user can see accessible threads.
- [x] A user can select a thread and see its recent runs.
- [x] A user can select a run and inspect its timeline.
- [x] A user can inspect the same run as a typed trace/span view.
- [x] The page can be refreshed or shared with `threadId` and `runId` query state.
- [x] Empty, loading, inaccessible, and error states are explicit.
- [x] The implementation does not couple this management page to `/chat`.

## Non-Goals

- [x] Do not redesign `/chat`.
- [x] Do not add a right-side trace panel to the existing chat UI as the main product path.
- [x] Do not build a standalone run-id-only dashboard as the primary IA.
- [x] Do not add global run search in this slice.
- [x] Do not add feedback, dataset, eval, prompt registry, or offline experiment features in this slice.
- [x] Do not add LangSmith or OpenTelemetry SDK integration in this slice.
- [x] Do not add billing, user/org/tenant cost attribution, or usage accounting in this slice.
- [x] Do not add a new durable `trace_spans` table unless implementation uncovers a hard blocker.
- [x] Do not move trace semantics into page-local code.

## Definitions First

### Source Of Truth

- [x] Re-read the existing source-of-truth docs for run timeline, trace projection, usage, and host auth before implementation.
- [x] Confirm that `/observability` introduces only a UI/product surface, not a new runtime concept.
- [x] Update source-of-truth docs only if a stable cross-package fact is introduced.
- [x] Keep page-level UX decisions out of source-of-truth docs unless they become part of reusable platform behavior.

### Route And URL State

- [x] Add `/observability` as the management console route.
- [x] Use `threadId` and `runId` query params for durable selection state.
- [x] If `threadId` is missing, pick a safe default from accessible threads when available.
- [x] If `runId` is missing, pick a safe default from the selected thread's recent runs when available.
- [x] If a query value is stale, inaccessible, or missing from loaded data, show a recoverable state and allow reselection.
- [x] Avoid making `/observability/:threadId/:runId` route segments for the MVP unless query state creates concrete problems.

### Information Architecture

- [x] Column 1: thread list.
- [x] Column 2: run list for the selected thread.
- [x] Column 3: selected run content.
- [x] Selected run content includes a compact run header.
- [x] Selected run content includes `Timeline` and `Trace` tabs.
- [x] Keep the UI desktop-first for the MVP, with a functional narrow-screen fallback.
- [x] Avoid decorative dashboard chrome that does not expose runtime information.

### Data And Types

- [x] Use existing DTOs from `@agent-infra/contracts`.
- [x] Use existing API clients from `@agent-infra/durable-chat-client` where possible.
- [x] Add only presentation/view-model types needed to render trace data ergonomically.
- [x] Keep trace span semantics derived from `RunTraceResponseDto`.
- [x] Do not parse raw run events in the page when an existing typed projection exists.
- [x] Do not introduce new DB schema in this slice.

## Backend And Platform

- [x] Confirm that existing APIs provide enough data for the MVP.
- [x] Avoid backend route changes unless there is a concrete data gap.
- [x] If an API gap is found, add the narrowest package-level contract/server/client change.
- [x] Keep route handlers thin composition roots.
- [x] Do not add Next-only business logic that should belong in `packages/*`.
- [x] Preserve Fastify/Vite portability expectations when touching shared packages.

## Frontend And Package Boundary

### Durable Chat Client

- [x] Re-export `fetchRunTraceResponse` from the Next app's local chat API adapter if the observability feature needs it.
- [x] Add a small trace presentation helper in `packages/durable-chat-client` only if the same projection is likely reusable outside Next.
- [x] Keep helper output presentational, for example flattened tree rows, depth, duration labels, and selected-span lookup.
- [x] Add tests for any new client helper.
- [x] Avoid expanding the existing chat log inspector state unless `/chat` actually consumes the new behavior.

### Next Observability Feature

- [x] Add an explicit `features/observability` area under `apps/playground-next-web`.
- [x] Put non-trivial page logic in feature files, not directly inside `app/observability/page.tsx`.
- [x] Reuse the existing auth shell/gate so the page follows host access rules.
- [x] Reuse existing app styling primitives where practical.
- [x] Keep the route page as a thin composition root.
- [x] Build data loading around existing thread, run, timeline, and trace fetchers.
- [x] Handle independent loading/error states for threads, runs, timeline, and trace.
- [x] Keep selected thread/run state synchronized with URL query params.

### UI Behavior

- [x] Thread column shows accessible threads with enough metadata to distinguish them.
- [x] Run column shows recent runs for the selected thread.
- [x] Run rows show status, creation/update time, and useful summary fields already available in the DTO.
- [x] Content column shows selected run metadata before tabs.
- [x] Timeline tab shows the typed timeline in chronological order.
- [x] Trace tab shows a span tree or indented flat tree.
- [x] Trace tab includes selected span details.
- [x] Trace tab surfaces diagnostics or projection warnings when present.
- [x] Empty states distinguish "no threads", "no runs", "no timeline", and "no trace spans".
- [x] Errors show enough detail to debug local development without exposing secrets.
- [x] The UI remains readable without requiring a polished dashboard redesign.

## Recommended Execution Order

## Review Gates

- [x] Loop 1 code review completed after package-level trace presentation work.
- [x] Loop 2 code review completed after observability data-layer work.
- [x] Loop 3 code review completed after `/observability` shell work.
- [x] Loop 4 code review completed after timeline/trace content work.
- [ ] Loop 5 final review completed if any unreviewed code remains.

### Loop 1: Package-Level Trace Presentation

- [x] Inspect current trace DTO shape and existing client inspector helpers.
- [x] Decide whether a reusable trace view-model helper is warranted.
- [x] Add the helper only if it removes real UI complexity or avoids duplicated trace tree logic.
- [x] Export the helper through the durable chat client package entry point if added.
- [x] Add focused tests for tree flattening, missing timestamps, parent/child ordering, and selected-span lookup if applicable.
- [x] Run targeted package tests.
- [x] Run `codex review --uncommitted -c model="gpt-5.3-codex" -c model_reasoning_effort="medium"`.
- [x] Address review findings or document why no code change is needed.
- [x] Commit the slice if code changed and verification is clean.

### Loop 2: Observability Feature Data Layer

- [x] Create the `apps/playground-next-web/features/observability` feature boundary.
- [x] Add typed loader/service utilities for threads, runs, timeline, and trace.
- [x] Add query-state helpers for `threadId` and `runId`.
- [x] Add selection fallback logic for missing or stale query params.
- [x] Add focused tests for selection fallback and URL-state behavior if the logic is extracted.
- [x] Run targeted Next/app or package tests.
- [x] Run `pnpm --filter playground-next-web typecheck`.
- [x] Run `codex review --uncommitted -c model="gpt-5.3-codex" -c model_reasoning_effort="medium"`.
- [x] Address review findings.
- [x] Commit the slice if verification is clean.

### Loop 3: `/observability` Route And Three-Column Shell

- [x] Add `apps/playground-next-web/app/observability/page.tsx`.
- [x] Compose the page through the observability feature entry component.
- [x] Reuse the existing auth gate.
- [x] Render the three-column structure: thread, run, content.
- [x] Implement thread selection and run selection.
- [x] Implement loading, empty, and error states for the first two columns.
- [x] Keep the page independent from chat-shell routing.
- [x] Run `pnpm --filter playground-next-web typecheck`.
- [x] Start or reuse the local Next dev server.
- [x] Verify `/observability` local reachability with HTTP because Browser automation was unavailable.
- [x] Run `codex review --uncommitted -c model="gpt-5.3-codex" -c model_reasoning_effort="medium"`.
- [x] Address review findings.
- [x] Commit the slice if verification is clean.

### Loop 4: Timeline And Trace Content

- [x] Add the selected run header.
- [x] Add `Timeline` and `Trace` tabs.
- [x] Render timeline content from the typed timeline response.
- [x] Render trace content from the typed trace response.
- [x] Add span selection and span detail rendering.
- [x] Surface trace diagnostics/projection warnings.
- [x] Add content-level loading, empty, and error states.
- [x] Verify the page with local route/query HTTP reachability; authenticated Browser automation was unavailable.
- [x] Run `pnpm --filter playground-next-web typecheck`.
- [x] Run targeted tests for any new helpers/components that have stable logic.
- [x] Verify `/observability` query-param route reachability locally.
- [x] Run `codex review --uncommitted -c model="gpt-5.3-codex" -c model_reasoning_effort="medium"`.
- [x] Address review findings.
- [x] Commit the slice if verification is clean.

### Loop 5: Closeout And Product Direction

- [ ] Re-check whether source-of-truth docs need a small `/observability` note.
- [ ] Update README/docs only where the new route needs to be discoverable.
- [ ] Confirm no business/runtime complexity was added only to the playground page.
- [ ] Confirm no trace semantics were duplicated in UI code.
- [ ] Confirm Fastify/Vite consumers were not accidentally broken by shared package changes.
- [ ] Run final targeted verification.
- [ ] Run final `codex review --uncommitted -c model="gpt-5.3-codex" -c model_reasoning_effort="medium"` if any unreviewed code remains.
- [ ] Address final review findings.
- [ ] Mark all completed todo items as `[x]`.

## Product Direction Notes

- [x] The next step is not "build prettier logs"; it is to make run inspection navigable across thread and run boundaries.
- [x] `/observability` is a better long-term product shape than attaching trace details to `/chat`, because management/debug workflows have different density, navigation, and context needs.
- [x] The first version should prove the operator workflow with existing runtime projections before adding storage, exporters, feedback, evals, or global search.
- [x] WebGPT's "Trace Inspector MVP" direction is broadly right, but the UI placement should be corrected: the inspector belongs in a standalone observability console, not primarily inside the chat surface.
- [x] The long-term path after this MVP is likely: better trace metadata and tags, prompt/message attribution, feedback capture, dataset/eval workflows, exporter integration, and only then durable normalized trace-span storage if query needs justify it.
