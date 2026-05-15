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

- [ ] A user can open `/observability`.
- [ ] A user can see accessible threads.
- [ ] A user can select a thread and see its recent runs.
- [ ] A user can select a run and inspect its timeline.
- [ ] A user can inspect the same run as a typed trace/span view.
- [ ] The page can be refreshed or shared with `threadId` and `runId` query state.
- [ ] Empty, loading, inaccessible, and error states are explicit.
- [ ] The implementation does not couple this management page to `/chat`.

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

- [ ] Add `/observability` as the management console route.
- [ ] Use `threadId` and `runId` query params for durable selection state.
- [ ] If `threadId` is missing, pick a safe default from accessible threads when available.
- [ ] If `runId` is missing, pick a safe default from the selected thread's recent runs when available.
- [ ] If a query value is stale, inaccessible, or missing from loaded data, show a recoverable state and allow reselection.
- [ ] Avoid making `/observability/:threadId/:runId` route segments for the MVP unless query state creates concrete problems.

### Information Architecture

- [ ] Column 1: thread list.
- [ ] Column 2: run list for the selected thread.
- [ ] Column 3: selected run content.
- [ ] Selected run content includes a compact run header.
- [ ] Selected run content includes `Timeline` and `Trace` tabs.
- [ ] Keep the UI desktop-first for the MVP, with a functional narrow-screen fallback.
- [ ] Avoid decorative dashboard chrome that does not expose runtime information.

### Data And Types

- [ ] Use existing DTOs from `@agent-infra/contracts`.
- [ ] Use existing API clients from `@agent-infra/durable-chat-client` where possible.
- [ ] Add only presentation/view-model types needed to render trace data ergonomically.
- [ ] Keep trace span semantics derived from `RunTraceResponseDto`.
- [ ] Do not parse raw run events in the page when an existing typed projection exists.
- [ ] Do not introduce new DB schema in this slice.

## Backend And Platform

- [ ] Confirm that existing APIs provide enough data for the MVP.
- [ ] Avoid backend route changes unless there is a concrete data gap.
- [ ] If an API gap is found, add the narrowest package-level contract/server/client change.
- [ ] Keep route handlers thin composition roots.
- [ ] Do not add Next-only business logic that should belong in `packages/*`.
- [ ] Preserve Fastify/Vite portability expectations when touching shared packages.

## Frontend And Package Boundary

### Durable Chat Client

- [ ] Re-export `fetchRunTraceResponse` from the Next app's local chat API adapter if the observability feature needs it.
- [ ] Add a small trace presentation helper in `packages/durable-chat-client` only if the same projection is likely reusable outside Next.
- [ ] Keep helper output presentational, for example flattened tree rows, depth, duration labels, and selected-span lookup.
- [ ] Add tests for any new client helper.
- [ ] Avoid expanding the existing chat log inspector state unless `/chat` actually consumes the new behavior.

### Next Observability Feature

- [ ] Add an explicit `features/observability` area under `apps/playground-next-web`.
- [ ] Put non-trivial page logic in feature files, not directly inside `app/observability/page.tsx`.
- [ ] Reuse the existing auth shell/gate so the page follows host access rules.
- [ ] Reuse existing app styling primitives where practical.
- [ ] Keep the route page as a thin composition root.
- [ ] Build data loading around existing thread, run, timeline, and trace fetchers.
- [ ] Handle independent loading/error states for threads, runs, timeline, and trace.
- [ ] Keep selected thread/run state synchronized with URL query params.

### UI Behavior

- [ ] Thread column shows accessible threads with enough metadata to distinguish them.
- [ ] Run column shows recent runs for the selected thread.
- [ ] Run rows show status, creation/update time, and useful summary fields already available in the DTO.
- [ ] Content column shows selected run metadata before tabs.
- [ ] Timeline tab shows the typed timeline in chronological order.
- [ ] Trace tab shows a span tree or indented flat tree.
- [ ] Trace tab includes selected span details.
- [ ] Trace tab surfaces diagnostics or projection warnings when present.
- [ ] Empty states distinguish "no threads", "no runs", "no timeline", and "no trace spans".
- [ ] Errors show enough detail to debug local development without exposing secrets.
- [ ] The UI remains readable without requiring a polished dashboard redesign.

## Recommended Execution Order

## Review Gates

- [x] Loop 1 code review completed after package-level trace presentation work.
- [x] Loop 2 code review completed after observability data-layer work.
- [ ] Loop 3 code review completed after `/observability` shell work.
- [ ] Loop 4 code review completed after timeline/trace content work.
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

- [ ] Add `apps/playground-next-web/app/observability/page.tsx`.
- [ ] Compose the page through the observability feature entry component.
- [ ] Reuse the existing auth gate.
- [ ] Render the three-column structure: thread, run, content.
- [ ] Implement thread selection and run selection.
- [ ] Implement loading, empty, and error states for the first two columns.
- [ ] Keep the page independent from chat-shell routing.
- [ ] Run `pnpm --filter playground-next-web typecheck`.
- [ ] Start or reuse the local Next dev server.
- [ ] Verify `/observability` in the in-app browser.
- [ ] Run `codex review --uncommitted -c model="gpt-5.3-codex" -c model_reasoning_effort="medium"`.
- [ ] Address review findings.
- [ ] Commit the slice if verification is clean.

### Loop 4: Timeline And Trace Content

- [ ] Add the selected run header.
- [ ] Add `Timeline` and `Trace` tabs.
- [ ] Render timeline content from the typed timeline response.
- [ ] Render trace content from the typed trace response.
- [ ] Add span selection and span detail rendering.
- [ ] Surface trace diagnostics/projection warnings.
- [ ] Add content-level loading, empty, and error states.
- [ ] Verify the page with real local run data.
- [ ] Run `pnpm --filter playground-next-web typecheck`.
- [ ] Run targeted tests for any new helpers/components that have stable logic.
- [ ] Verify `/observability` in the in-app browser, including refresh with query params.
- [ ] Run `codex review --uncommitted -c model="gpt-5.3-codex" -c model_reasoning_effort="medium"`.
- [ ] Address review findings.
- [ ] Commit the slice if verification is clean.

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
