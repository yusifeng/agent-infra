# Vite Shadcn Primitive Replacement Todo

## 0. Context and Boundary

### 0.1 Confirmed facts
- [x] `apps/playground-vite-web` already has shadcn/ui initialized (`components.json`, Tailwind import, existing `Button` and `Select` primitives).
- [x] The current thread actions UI in durable chat still uses hand-rolled primitives for the thread menu and several dialogs.
- [x] The current hand-rolled implementations are in:
  - `src/features/durable-chat/components/sidebar.tsx`
  - `src/features/durable-chat/components/share-dialog.tsx`
  - `src/features/durable-chat/components/thread-rename-dialog.tsx`
  - `src/features/durable-chat/components/thread-archive-dialog.tsx`
- [x] The project currently does **not** yet provide reusable shadcn/ui wrappers for:
  - `DropdownMenu`
  - `Dialog`
  - `AlertDialog`
  - `Input`
- [x] `Button` already exists at `src/components/ui/button.tsx` and should be reused rather than bypassed.
- [x] This task is Vite-only and should not change infra behavior, contracts, or server routes.

### 0.2 Goals
- [ ] Add the missing shadcn/Radix primitive wrappers needed by the current durable-chat thread actions UX.
- [x] Replace the hand-rolled thread actions menu with a shadcn/Radix `DropdownMenu`.
- [x] Replace the hand-rolled archive confirmation with a shadcn/Radix `AlertDialog`.
- [x] Replace the hand-rolled rename and share modals with shadcn/Radix `Dialog` plus shared `Input`/`Button` primitives where appropriate.
- [x] Preserve the current product behavior while improving accessibility, focus management, and primitive consistency.

### 0.3 Non-goals
- [x] Do not redesign the thread actions feature itself.
- [x] Do not change rename/archive/share/pin runtime semantics.
- [x] Do not change infra, contracts, db, app, or routes.
- [x] Do not rewrite the whole sidebar or durable-chat visual language.
- [x] Do not force all existing custom UI into shadcn/ui; this task only covers the current thread menu and related dialogs.
- [x] Do not introduce a new form/state library.

## 1. Definitions First

### 1.1 Source of Truth
- [x] `apps/playground-vite-web/AGENTS.md` should explicitly state that new interactive primitives in this app should prefer shadcn/ui / Radix over hand-rolled DOM implementations.
- [x] Decide whether this replacement task needs any long-lived `docs/source-of-truth/*` addition. Result: no new source-of-truth doc is needed; the app-local policy belongs in `apps/playground-vite-web/AGENTS.md`.

### 1.2 Data / UI primitive model
- [x] This task does not introduce new business data models.
- [x] Define the minimal primitive set needed for replacement:
  - `DropdownMenu`
  - `Dialog`
  - `AlertDialog`
  - `Input`
- [x] Confirm whether existing `Button` variants are sufficient for the current share / rename / archive actions, or whether only minimal variant additions are needed. Result: existing `Button` variants are sufficient for the first replacement pass.

### 1.3 Types / Interfaces
- [x] Keep current durable-chat runtime/component interfaces stable wherever possible.
- [x] If new primitive wrappers require helper props or slot conventions, define them at the primitive layer instead of leaking Radix details through durable-chat feature interfaces.

## 2. Vite Boundary

### 2.1 ui primitives
- [x] Add `src/components/ui/dropdown-menu.tsx`.
- [x] Add `src/components/ui/dialog.tsx`.
- [x] Add `src/components/ui/alert-dialog.tsx`.
- [x] Add `src/components/ui/input.tsx`.
- [x] Keep these wrappers aligned with the app’s existing shadcn/Radix style and `cn()` utility patterns.

### 2.2 feature components
- [x] Replace the thread item actions flyout in `sidebar.tsx` with `DropdownMenu`.
- [x] Replace `thread-archive-dialog.tsx` internals with `AlertDialog`.
- [x] Replace `thread-rename-dialog.tsx` internals with `Dialog` + `Input` + `Button`.
- [x] Replace `share-dialog.tsx` internals with `Dialog` + shared primitives.
- [x] Decide whether the bespoke `IconButton` helper should remain as-is or wrap `Button` later; do not expand this task unless necessary. Result: keep `IconButton` unchanged for now; it is outside the current primitive replacement scope.

### 2.3 runtime integration
- [x] Preserve existing open/close and confirm/cancel wiring in `use-durable-chat-runtime.ts`.
- [x] Preserve existing share dialog state behavior in `use-share-dialog-state.ts`.
- [x] Remove any component-local assumptions that only existed because the old primitives were hand-rolled.

## 3. Tests

### 3.1 primitive-level tests
- [x] Add focused tests for any new app-level primitive wrappers only if they contain meaningful local behavior beyond thin re-export/wrapping. Result: no wrapper-specific tests were added in Loop 1 because these files are thin app-local wrappers.

### 3.2 feature UI tests
- [x] Update sidebar tests to match `DropdownMenu` interaction semantics.
- [x] Update archive dialog tests to match `AlertDialog` behavior.
- [x] Update rename dialog tests to match `Dialog` + `Input` behavior.
- [x] Update share dialog tests if the rendered accessibility structure changes. Result: existing runtime-level share dialog coverage remained sufficient; no dedicated component test was needed for this replacement.

### 3.3 runtime regression tests
- [x] Keep existing runtime tests passing for rename/share/archive thread actions.
- [x] Add or update tests only where primitive replacement changes event timing or close behavior.

### 3.4 verification
- [x] Run targeted Vite tests for sidebar, share dialog state, and durable chat runtime.
- [x] Run `pnpm --filter playground-vite-web typecheck`.
- [x] Run `codex review --uncommitted -c model="gpt-5.3-codex" -c model_reasoning_effort="medium"`.
- [x] Perform a quick browser smoke for thread menu, rename dialog, share dialog, and archive confirm behavior.

## 4. Recommended Execution Order

### Loop 1
- [x] Add the missing shadcn/Radix primitive wrappers (`dropdown-menu`, `dialog`, `alert-dialog`, `input`).
- [x] Verify they typecheck and fit the app’s existing UI conventions.

### Loop 2
- [x] Replace the sidebar thread actions menu with `DropdownMenu`.
- [x] Update focused sidebar tests.

### Loop 3
- [x] Replace archive confirmation with `AlertDialog`.
- [x] Replace rename dialog with `Dialog` + `Input` + `Button`.
- [x] Update related tests.

### Loop 4
- [x] Replace share dialog internals with `Dialog` + shared primitives.
- [x] Run targeted verification, review, and browser smoke.
