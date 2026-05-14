# Research Timeline Rows Todo

## Analysis Brief

### Goal

Unify `websearch` and `openUrl` reason-area rendering in `apps/playground-next-web` behind a `ResearchTimelineRow` presentation model.

### Product Boundary

This is a playground Next UI presentation change. The durable runtime, tool protocol, persisted DTOs, and shared packages are not the product boundary for this slice.

### Scope

- Replace separate live status and persisted summary display paths with timeline rows for search and browse activity.
- Remove user-visible `已完成搜索`.
- Keep search and browse as separate reason timeline rows instead of merging them with `·`.
- Show browse page previews inline after `浏览 N 个页面`, similar to the reference UI.
- Preserve the existing right-side search results panel behavior.

### Non-goals

- Do not change `searchWeb` or `openUrl` tool contracts.
- Do not change runtime persistence, stream protocol, or `packages/*` DTOs.
- Do not build a new source-of-truth document in this slice.
- Do not redesign the full chat shell or answer rendering.
- Do not add broad DOM/UI test infrastructure unless required by a focused verification gap.

### Source-of-Truth Impact

`docs/source-of-truth/playground-search-browse-policy-model.md` governs search/browse policy, not this visual presentation. No source-of-truth update is required unless implementation changes search/browse policy semantics.

### Data / Type / Interface First

- Define `ResearchTimelineRow` as an app-local presentation model.
- Define page/source preview shapes for row rendering.
- Define row builders for persisted activity and live tool state.
- Keep row builders isolated from raw UI components so live and persisted paths share the same display semantics.

### Layer Impact

- `service`: add row projection logic and tests in `apps/playground-next-web/features/durable-chat/service/*`.
- `ui`: update reason timeline rendering in `apps/playground-next-web/components/chat-shell/message-list.tsx` or a small extracted component.
- `runtime`: only consume existing live tool state and existing search panel data; do not change runtime behavior.

### Risks / Ambiguities

- Live `openUrl` tool state may not include page titles, so live browse rows may need hostname/url fallback until persisted results arrive.
- Existing `showPersistedResearchStatus` behavior may still be used by replay paths; row builders should make replay and normal completed rendering consistent.
- Search panel click behavior must remain discoverable without reintroducing dropdown-style search summary expansion.
- Existing tests may assert `已完成搜索`; those assertions should change to the new desired behavior.

### Need Subagent?

No. The affected code paths are localized and already identified.

### Test Strategy

- Add or update service tests around row projection first.
- Cover live completed search no longer emitting `已完成搜索`.
- Cover persisted search and browse becoming separate rows.
- Cover browse rows exposing page previews.
- Cover search rows preserving tool call ids for the existing right-side search panel.
- Run focused playground service tests and typecheck.

### Alignment Questions

No blocking questions. The agreed direction is timeline rows, no `已完成搜索`, search/browse as separate rows, and inline browse page previews.

### Ready for Todo?

Yes.

## 0. Context and Boundary

### 0.1 Confirmed facts

- [x] Target app is `apps/playground-next-web`.
- [x] The change is limited to reason-area presentation for `searchWeb` and `openUrl`.
- [x] Live and completed rendering currently use different view models/components.
- [x] Live completed search can currently display `已完成搜索`.
- [x] Completed/persisted rendering usually favors search summary rows and can hide browse page details inside a dropdown.
- [x] Search result details already have right-side panel behavior that should be preserved.
- [x] Search and browse should remain separate timeline rows, not merged into one line.

### 0.2 Goals

- [x] Introduce an app-local `ResearchTimelineRow` presentation model.
- [x] Render live and persisted research activity through the same timeline-row component.
- [x] Remove user-visible `已完成搜索`.
- [x] Render `浏览 N 个页面` with inline page previews.
- [x] Keep search result panel opening behavior intact.

### 0.3 Non-goals

- [x] Do not change durable runtime tool event semantics.
- [x] Do not change `searchWeb` / `openUrl` tool implementations unless a display field is already available and unused.
- [x] Do not move this UI presentation model into `packages/*`.
- [x] Do not change search/browse policy enforcement.
- [x] Do not redesign the full reasoning panel.
- [x] Do not commit unrelated workspace changes.

## 1. Definitions First

### 1.1 Source of Truth

- [x] Existing policy source of truth is `docs/source-of-truth/playground-search-browse-policy-model.md`.
- [x] This slice does not change search/browse policy semantics.
- [x] Re-check whether implementation touches policy wording; update source-of-truth only if semantics change.

### 1.2 Data model

- [x] Define `ResearchTimelineRow` in the playground service layer.
- [x] Define `ResearchTimelineSourcePreview` for favicon/source display.
- [x] Define `ResearchTimelinePagePreview` for browse inline links.
- [x] Decide and encode the max number of inline browse page previews before `查看全部`.
- [x] Define hostname/url fallback behavior for live browse rows without page titles.

### 1.3 Types / Interfaces

- [x] Add a persisted row builder from `ResearchActivityViewModel`.
- [x] Add a live row builder from `LiveAssistantToolState[]` plus optional `ActiveSearchPanelData`.
- [x] Preserve `searchToolCallIds` on search rows for the existing right-side result panel.
- [x] Expose enough browse page data for inline title/domain rendering without exposing raw tool payloads to UI.

## 2. Backend / Platform

- [x] No backend route changes are planned.
- [x] No DB or contract changes are planned.
- [x] No runtime-pi changes are planned.

## 3. Frontend Boundary

### 3.1 Service Projection

- [x] Add row projection tests before changing UI rendering.
- [x] Convert persisted `search-summary` / `search-status` activity into separate search and browse rows.
- [x] Convert live active tools into separate search and browse rows.
- [x] Ensure completed search without result count does not produce `已完成搜索`.
- [x] Ensure completed browse produces `浏览 N 个页面` when page/url data exists.

### 3.2 UI Rendering

- [x] Add or extract a `ResearchTimelineRows` renderer.
- [x] Render search rows in the reference style: icon, `搜索到 N 个网页`, optional source icons, explicit/right-panel click affordance if needed.
- [x] Render browse rows in the reference style: icon, `浏览 N 个页面`, inline page previews, `查看全部` when needed.
- [x] Remove dropdown expansion from the search/browse summary label path.
- [x] Keep reason text and research rows visually aligned in the existing vertical timeline.
- [x] Keep row spacing and text scale close to the provided reference.

### 3.3 Live / Completed Consistency

- [x] Route live assistant research display through `ResearchTimelineRow`.
- [x] Route completed/persisted assistant research display through `ResearchTimelineRow`.
- [x] Confirm replay display does not reintroduce completed status labels.
- [x] Preserve search panel opening from live and completed search rows.

## 4. Tests

- [x] Update `research-activity.test.ts` or add `research-timeline.test.ts` for row projection.
- [x] Cover live running search/browse rows.
- [x] Cover live completed search with panel data showing `搜索到 N 个网页`.
- [x] Cover live completed search without panel data not showing `已完成搜索`.
- [x] Cover persisted search and browse rows as separate rows.
- [x] Cover browse page previews prefer title, then source/hostname/url fallback.
- [x] Cover search row keeps `searchToolCallIds`.
- [x] Run focused tests for durable chat service projection.
- [x] Run `pnpm --filter playground-next-web typecheck`.
- [x] Run codex review with the repository Review Profile after the first meaningful functional slice.

## 5. Recommended Execution Order

### Loop 1: Row Model and Service Tests

- [x] Add `ResearchTimelineRow` types and builders.
- [x] Add tests for persisted and live row projection.
- [x] Remove `已完成搜索` from row projection behavior.
- [x] Run focused service tests.
- [x] Run `pnpm --filter playground-next-web typecheck`.
- [x] Run codex review with the repository Review Profile.
- [x] Commit the slice after clean review.

### Loop 2: Reason Timeline Renderer

- [x] Replace `LiveResearchLabel` / `ResearchSummaryLabel` primary rendering with timeline rows.
- [x] Render browse page previews inline.
- [x] Preserve search panel click behavior.
- [x] Remove summary dropdown behavior from the default reason timeline path.
- [x] Verify live and completed rendering visually match the agreed structure.
- [x] Run focused tests and `pnpm --filter playground-next-web typecheck`.
- [x] Run codex review with the repository Review Profile.
- [x] Commit the slice after clean review.

### Loop 3: Polish and Closeout

- [x] Adjust spacing/icons/text color against the provided reference.
- [x] Verify replay behavior if affected.
- [x] Run `pnpm --filter playground-next-web test` if the changed test surface is broad.
- [ ] Delete `docs/todolist.md` when the task is fully complete and stable facts are either unnecessary or promoted.
