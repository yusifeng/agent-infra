# Replay Inspect Map Todo

## 0. Context and Boundary

### 0.1 Confirmed facts
- [x] This task only changes `apps/playground-next-web`.
- [x] Replay currently has playback cursor state, replay steps, presentation state, and `ReplayDock` controls.
- [x] The current worktree already contains uncommitted replay/dock changes from the previous interaction; this todo treats them as the starting diff to be corrected, not as final architecture.
- [x] Clicking a progress segment should inspect that segment, not seek playback.
- [x] Inspecting a segment should not pause playback.
- [x] Playback cursor and inspect cursor must be separate concepts.
- [x] Previous/next buttons remain playback controls.
- [x] Playback advancing to a new step should not overwrite the inspected segment.
- [x] Segment colors should use exactly three semantic tones first: `user`, `thinking`, and `answer`.
- [x] Segment width should use an approximate content-size weight model, not a real tokenizer.
- [x] Message highlighting should use an overlay/spotlight that is detached from message document flow, not a permanent message-row background.

### 0.2 Goals
- [x] Convert the replay progress rail into a conversation-structure map.
- [x] Keep playback controls predictable while making progress segment clicks useful for reading/navigation.
- [x] Make segment color express semantic category.
- [x] Make segment width express approximate information size.
- [x] Make inspected message location clear without changing original message layout.
- [x] Keep the implementation local, testable, and reversible.

### 0.3 Non-goals
- [x] Do not add real tokenizer logic.
- [x] Do not add playback speed controls.
- [x] Do not add drag scrubbing.
- [x] Do not add keyboard shortcuts.
- [x] Do not add a "play from here" secondary action in this loop.
- [x] Do not move replay behavior into shared packages.
- [x] Do not change durable contracts, DB schema, route DTOs, or runtime protocol.
- [x] Do not redesign normal `/chat` message layout.
- [x] Do not implement Vite replay support in this loop.

## 1. Definitions First

### 1.1 Source of Truth
- [x] Reconfirm this remains app-local replay UX and does not require `docs/source-of-truth` promotion yet.
- [x] Keep evolving replay inspect-map definitions in this todo during implementation.
- [x] Promote only if this model becomes shared across consumers or packages. No promotion is needed in this app-local loop.

### 1.2 Data Model
- [x] Define `ReplaySegmentTone = 'user' | 'thinking' | 'answer'`.
- [x] Define segment tone mapping: user text/reasoning is `user`; assistant answer text is `answer`; assistant reasoning/search/tool events are `thinking`.
- [x] Define segment weight mapping with clamped approximate content sizes.
- [x] Preserve `ReplayCursor.stepIndex` as playback state.
- [x] Add inspect state as separate runtime state, not as a property of `ReplayCursor`.
- [x] Define `playbackActive` separately from `inspected`.
- [x] Keep `complete` based on playback progress only.
- [x] Keep real timestamp duration support from `occurredAt` where available, with existing replay delay fallback.

### 1.3 Types / Interfaces
- [x] Extend replay progress segment shape with `tone`, `weight`, `playbackActive`, and `inspected`.
- [x] Replace ambiguous segment `active` semantics with explicit playback/inspect fields.
- [x] Extend `ReplayViewState` with playback and inspected block ids/indexes.
- [x] Expose `inspectStep(stepIndex)` from replay runtime.
- [x] Rename component callback semantics so progress click calls inspect, not seek.
- [x] Keep `seekToStep` available internally for explicit playback controls only.

### 1.4 Overlay / Spotlight Model
- [x] Add stable `data-replay-block-id` attributes to rendered replay message targets.
- [x] Remove long-lived message-row background as the primary highlighter.
- [x] Add a detached overlay layer with `pointer-events: none`.
- [x] Measure inspected target rect relative to the messages viewport.
- [x] Render spotlight by absolute positioning, not by altering message row layout.
- [x] Keep a light persistent outline or low-opacity overlay after the flash, without covering content heavily.
- [x] Recompute overlay position on inspect changes and transcript changes.

## 2. Backend / Platform
- [x] No backend/platform changes are planned.
- [x] No contract, DB, route, core, app, or package boundary changes are planned.

## 3. Frontend Boundary

### 3.1 Service
- [x] Add pure helpers for replay segment tone.
- [x] Add pure helpers for replay segment weight.
- [x] Update `buildReplayViewState` to emit tone, weight, playback/inspect states, and block ids.
- [x] Add or preserve real duration calculation from `occurredAt` values.
- [x] Keep service code DOM-free.

### 3.2 Runtime
- [x] Add inspect cursor state to `useReplayRuntime`.
- [x] Implement `inspectStep(stepIndex)` without mutating playback cursor.
- [x] Keep `togglePlayback`, `previousStep`, `nextStep`, and `seekToStep` playback-oriented.
- [x] Ensure session changes reset inspect state.
- [x] Preserve timer cleanup behavior.

### 3.3 Replay Console / Viewport
- [x] Scroll inspected block to about 30% from the top of the viewport.
- [x] Avoid `scrollIntoView({ block: 'nearest' })` for inspect because it does not express the desired reading position.
- [x] Avoid forcing scroll on normal playback unless existing playback behavior already does so.
- [x] Update overlay measurements after inspect and transcript render.
- [x] Do not make message rows responsible for their own replay overlay positioning.

### 3.4 UI
- [x] Update `ReplayDock` segment rendering to use semantic tone colors.
- [x] Render variable segment widths with `flexGrow: segment.weight`.
- [x] Preserve a minimum clickable width for short user/search/tool segments.
- [x] Show playback active and inspected states as distinct visual treatments.
- [x] Change progress segment click from seek to inspect.
- [x] Keep hover title/tooltip information for label and duration.
- [x] Keep `ComposerDock` changes limited to the already requested AI disclaimer.

## 4. Tests

### 4.1 Service Tests
- [x] Cover segment tone mapping for user, thinking, and answer.
- [x] Cover segment weight growth and clamp behavior.
- [x] Cover fixed-ish width for search/tool events.
- [x] Cover playback active and inspected being different segments.
- [x] Cover duration labels still prefer real timestamps when available.

### 4.2 Runtime Tests
- [x] Cover inspect action does not mutate playback cursor.
- [x] Cover playback actions do not overwrite inspected step.
- [x] Cover session reset clears inspected state.
- [x] Cover progress click semantics through a focused runtime or component boundary where feasible.

### 4.3 UI / DOM Tests
- [x] Cover `ReplayDock` segment click calls inspect handler rather than seek handler.
- [x] Cover segment `style.flexGrow` or equivalent width data is emitted.
- [x] Cover semantic tone classes are emitted.
- [x] Cover message list renders stable replay target data attributes.
- [x] Cover overlay layer is detached from message rows and does not replace row layout classes.

### 4.4 Verification
- [x] Run `pnpm --filter playground-next-web test`.
- [x] Run `pnpm --filter playground-next-web typecheck`.
- [x] Run `codex review` for the combined replay inspect-map implementation after targeted verification.

## 5. Recommended Execution Order

### Loop 1: Segment Semantics And Inspect State
- [x] Clean up current uncommitted replay presentation changes into the new playback/inspect model.
- [x] Add `ReplaySegmentTone` and segment weight helpers.
- [x] Update `ReplayViewState` and progress segment state names.
- [x] Add inspect state/action in replay runtime.
- [x] Ensure progress click semantics are represented in types before UI changes.
- [x] Add focused service/runtime tests.
- [x] Run `pnpm --filter playground-next-web test`.
- [x] Run `pnpm --filter playground-next-web typecheck`.
- [x] Include segment semantics / inspect-state in the combined review gate.
- [x] Include segment semantics / inspect-state in the combined replay inspect-map commit.

### Loop 2: Inspect Scroll And Overlay Spotlight
- [x] Add stable replay target ids to message rows/answer containers.
- [x] Replace persistent row background with detached overlay spotlight.
- [x] Implement viewport-relative overlay measurement.
- [x] Implement inspect scroll to middle-upper viewport position.
- [x] Keep overlay `pointer-events: none` and outside normal message row layout.
- [x] Add focused UI/DOM tests for target attributes and overlay behavior where feasible.
- [x] Run `pnpm --filter playground-next-web test`.
- [x] Run `pnpm --filter playground-next-web typecheck`.
- [x] Include inspect scroll / overlay in the combined review gate.
- [x] Include inspect scroll / overlay in the combined replay inspect-map commit.

### Loop 3: ReplayDock Visual Map
- [x] Render semantic segment colors for `user`, `thinking`, and `answer`.
- [x] Render variable segment widths from segment weights.
- [x] Distinguish playback active from inspected segment visually.
- [x] Keep hover title/tooltip with label and duration.
- [x] Ensure clicking a segment calls inspect and does not seek.
- [x] Run `pnpm --filter playground-next-web test`.
- [x] Run `pnpm --filter playground-next-web typecheck`.
- [x] Include ReplayDock visual-map in the combined review gate.
- [x] Include ReplayDock visual-map in the combined replay inspect-map commit.

### Loop 4: Final Hardening
- [x] Re-run targeted verification after any review fixes.
- [x] Check `git status --short` for unrelated work.
- [x] Decide whether `docs/todolist.md` should be kept as completed execution record or deleted.
- [x] Confirm every applicable item in this todo is checked.
