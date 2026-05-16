# ReplayDock Todo

## 0. Context and Boundary

### 0.1 Confirmed facts
- [x] This task only changes `apps/playground-next-web`.
- [x] Replay already has `ReplayCursor`, `ReplayStatus`, replay steps, presentation service, and runtime actions for play, pause, resume, and restart.
- [x] The replay bottom controls should use the same outer dock/card shape as the chat `ComposerDock`.
- [x] The component should be renamed from `ReplayControlBar` to `ReplayDock`.
- [x] The first version includes clickable seek/progress, previous/next, one primary play/pause/resume/replay button, current step context, and restart.
- [x] The first version does not add playback speed, drag scrubbing, keyboard shortcuts, Vite support, package contracts, routes, DB schema, or durable runtime protocol changes.

### 0.2 Goals
- [x] Make replay controls feel like a compact player instead of a loose button row.
- [x] Keep the existing replay source data and transcript rendering behavior stable.
- [x] Add explicit replay navigation semantics that are testable outside React.
- [x] Keep UI changes local to the replay console and shared chat-shell visual primitives.

### 0.3 Non-goals
- [x] Do not redesign `/chat` composer internals.
- [x] Do not change replay step generation semantics.
- [x] Do not add speed control in this loop.
- [x] Do not add drag scrubbing or keyboard shortcuts in this loop.
- [x] Do not introduce new public APIs outside `playground-next-web`.

## 1. Definitions First

### 1.1 Source of Truth
- [x] Reconfirm this is app-local replay UX, not a durable platform concept that belongs in `docs/source-of-truth`.
- [x] Keep stable behavior definitions in this todo unless replay becomes a shared platform capability.

### 1.2 Data model
- [x] Define replayable steps as all `ReplayStep` values except the terminal `done` step.
- [x] Preserve `ReplayCursor.stepIndex` as the raw step index into `session.steps`.
- [x] Treat `ReplayViewState.currentStepIndex` as consumed replayable step count for labels.
- [x] Add a separate active replayable step index/count for progress segments and current step display.

### 1.3 Types / Interfaces
- [x] Extend `ReplayControlState` with previous, next, seek, and toggle affordances.
- [x] Extend `ReplayViewState` with current step label/kind and progress segment data needed by `ReplayDock`.
- [x] Add pure replay cursor transition helpers for `togglePlayback`, `previousStep`, `nextStep`, and `seekToStep`.
- [x] Keep `useReplayConsoleRuntime` return shape compatible except for replacing separate control handlers with replay player handlers used by `ReplayDock`.

## 2. Backend / Platform
- [x] No backend, contract, DB, or package changes are planned.

## 3. Frontend Boundary

### 3.1 Service / Runtime
- [x] Add replay navigation helpers in `features/durable-chat/service`.
- [x] Update `buildReplayControlState` and `buildReplayViewState`.
- [x] Update `useReplayRuntime` to expose `togglePlayback`, `previousStep`, `nextStep`, and `seekToStep`.
- [x] Preserve timer cleanup and session-reset behavior.

### 3.2 UI
- [x] Rename `ReplayControlBar` to `ReplayDock`.
- [x] Keep the dock/card shell aligned with `ComposerDock`.
- [x] Replace separate play/pause/resume buttons with one primary playback button.
- [x] Add previous/next controls.
- [x] Add clickable segmented progress rail.
- [x] Add current step context without increasing visual noise.
- [x] Keep restart as a secondary control.

## 4. Tests
- [x] Add or update service tests for replay control/view state.
- [x] Add tests for pure replay cursor transitions.
- [x] Run `pnpm --filter playground-next-web test`.
- [x] Run `pnpm --filter playground-next-web typecheck`.

## 5. Recommended Execution Order

### Loop 1: Replay Player Semantics
- [x] Implement replayable-step indexing and cursor transition helpers.
- [x] Extend replay presentation state for player UI.
- [x] Update runtime actions to use the transition helpers.
- [x] Add focused service tests for transition and presentation behavior.
- [x] Run `pnpm --filter playground-next-web test`.
- [x] Run `pnpm --filter playground-next-web typecheck`.
- [x] Run `codex review` for this loop after targeted verification passes.
- [x] Commit the replay player semantics slice if review is clean. Combined with Loop 2 because the worktree already contained the ReplayDock shell change and the slices are one cohesive replay UX change.

### Loop 2: ReplayDock UI
- [x] Rename `ReplayControlBar` file/component to `ReplayDock`.
- [x] Wire the new runtime actions into `ReplayConsole`.
- [x] Implement the player-style dock shell, controls, progress rail, and labels.
- [x] Run `pnpm --filter playground-next-web test`.
- [x] Run `pnpm --filter playground-next-web typecheck`.
- [x] Run `codex review` for this loop after targeted verification passes.
- [x] Commit the ReplayDock UI slice if review is clean.

### Loop 3: Final Todo Closure
- [x] Re-run targeted verification if any follow-up changes were needed after review. No follow-up changes were needed after review.
- [x] Confirm every applicable item in this todo is checked.
- [x] Delete `docs/todolist.md` only if no completed checklist record is needed for this loop. Kept as the completed checklist record for this execution loop.
