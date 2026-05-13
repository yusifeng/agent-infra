# Playground Next UI Parity Todo

Source analysis:

- [x] User direction: `apps/playground-vite-web` is the UI and interaction source of truth.
- [x] Conflict rule: when `playground-next-web` and `playground-vite-web` differ, Vite wins.
- [x] Stack rule: when Vite UI needs Tailwind 4 / shadcn / Radix / shared CSS, migrate that foundation into Next instead of downgrading Vite UI to the current Next stack.
- [x] Subagent A completed a read-only UI parity audit.
- [x] Subagent B completed a read-only UI parity audit.
- [x] Current Next backend/auth/thread/stream/share/replay functionality has been migrated through earlier loops.
- [x] Current Next UI parity is not complete even though earlier migration todo items were marked complete.

## 0. Context And Boundary

### 0.1 Confirmed Facts

- [x] `apps/playground-vite-web` is the most complete frontend experience and visual baseline.
- [x] `apps/playground-next-web` is the target app for Vercel deployment and App Router hosting.
- [x] The prior migration focused on functional parity and backend/route/runtime migration before strict UI parity.
- [x] Auth pages in `apps/playground-next-web/app/(auth)` are temporary simplified pages, not Vite UI parity.
- [x] Main chat shell in `apps/playground-next-web/components/chat-shell` is functionally useful but not a Vite visual clone.
- [x] Replay and public share pages are currently simplified Next implementations, not Vite UI parity.
- [x] Current uncommitted foundation patch touches `apps/playground-next-web/app/globals.css` and `apps/shared/chat-theme.css`.

### 0.2 UI Parity Principles

- [x] Vite UI wins over existing Next UI.
- [x] Tailwind 4 wins over Tailwind 3 compatibility.
- [x] Vite shadcn/Radix primitives win over low-fidelity local replacements.
- [x] Vite `chat-shell.css` class names, theme tokens, and interaction states should be preserved.
- [x] Next App Router, route handlers, auth gate, server actions/routes, and Vercel deployment shape may differ internally as long as user-visible UI remains Vite-aligned.
- [x] Do not preserve a Next-only visual design when it conflicts with Vite parity.
- [x] `Equivalent` means internal Next adaptation with the same user-visible UI and interaction behavior; it does not permit visual or interaction drift from Vite.
- [x] Any intentional non-parity exception must be explicitly approved by the user and written into this todo before implementation.
- [x] Keep Next-only debugging surfaces such as `DurableLogPane` only if they are visually isolated and do not change the default Vite-like experience.

### 0.3 Goals

- [x] Make `apps/playground-next-web` visually and interactively match `apps/playground-vite-web`.
- [x] Upgrade or align Next UI foundation to support Vite UI directly.
- [x] Replace temporary auth UI with Vite auth UI.
- [x] Replace or refactor current Next chat shell to match Vite sidebar/header/composer/message/search behavior.
- [x] Replace simplified replay and public share pages with Vite-equivalent presentation flows.
- [x] Verify parity with browser inspection/screenshots on desktop and mobile.
- [x] Keep each UI parity slice independently verifiable, reviewable, and committable.

### 0.4 Non-Goals

- [x] Do not redesign the product beyond Vite parity.
- [x] Do not downgrade Vite UI classes to fit Tailwind 3.
- [x] Do not change durable runtime semantics, stream semantics, DB schema, or auth service behavior unless UI parity exposes a direct bug.
- [x] Do not move playground auth or UI-only concerns into `packages/core`, `packages/contracts`, `packages/db`, or `packages/runtime-pi`.
- [x] Do not delete `apps/playground-vite-web` until Next UI parity is proven.
- [x] Do not treat `DurableLogPane` as a replacement for Vite message/search/replay presentation.
- [x] Do not mark a page as parity-complete without browser verification.

## 1. Definitions First

### 1.1 Source Of Truth

- [x] Use `apps/playground-vite-web/src/App.tsx` as the auth shell routing/presentation reference.
- [x] Use `apps/playground-vite-web/src/features/auth/components/*` as auth form references.
- [x] Use `apps/playground-vite-web/src/features/durable-chat/components/*` as chat component references.
- [x] Use `apps/playground-vite-web/src/features/durable-chat/durable-chat-console.tsx` as main chat shell reference.
- [x] Use `apps/playground-vite-web/src/features/durable-chat/replay-console.tsx` as replay presentation reference.
- [x] Use `apps/playground-vite-web/src/features/durable-chat/shared-snapshot-console.tsx` as public share presentation reference.
- [x] Reconcile public share work with `docs/source-of-truth/share-model.md`.
- [x] Reconcile chat mode controls with `docs/source-of-truth/playground-chat-mode-model.md`.
- [x] Decide after implementation whether any stable UI parity rule belongs in `docs/source-of-truth`.

### 1.2 UI Foundation Definitions

- [x] Align `playground-next-web` Tailwind version and CSS entry strategy with `playground-vite-web`.
- [x] Add or align `@fontsource-variable/geist`.
- [x] Add or align `tw-animate-css`.
- [x] Add or align `shadcn/tailwind.css`.
- [x] Add or align Radix primitives used by Vite UI.
- [x] Add or align `tailwind-merge` / `cn` behavior if Vite primitives require it.
- [x] Define how `apps/shared/chat-theme.css` is imported by Next after Tailwind 4 alignment.
- [x] Define how `(chat-shell)/chat-shell.css` should contain Vite chat-shell classes and variables.
- [x] Keep current temporary `--chat-muted` / `--chat-accent` aliases as compatibility aliases until later UI loops remove old Next references or prove them redundant.

### 1.3 Auth UI Definitions

- [x] Define Next adaptations for Vite `LoginForm`, `RegisterForm`, and `ForgotPasswordForm` with the same user-visible UI and interactions.
- [x] Define Next adaptation for Vite auth page shell background, logo, and centered layout with the same user-visible UI.
- [x] Define Next adaptation for Vite `useEmailCodeCooldown` with the same user-visible cooldown behavior.
- [x] Define auth error-code-to-Chinese-message mapping.
- [x] Define reset-password success notice behavior in Next without React Router state.
- [x] Preserve safe `next` query semantics and reject protocol-relative redirects.

### 1.4 Chat UI Definitions

- [x] Define Vite-to-Next component mapping for sidebar, header, composer, message list, search panel, and dialogs.
- [x] Define how Vite quick/expert mode UI maps to existing Next runtime/provider fields.
- [x] Define how Vite web search toggle maps to existing `webSearchEnabled` runtime input.
- [x] Define how Vite reasoning/thinking controls map to current Next runtime state.
- [x] Define whether `DurableLogPane` remains hidden/debug-only or moves behind a Vite-compatible control.
- [x] Define how Vite thread groups, pinned state, row menus, rename/archive/share/pin actions map to current protected APIs.

### 1.5 Message / Search / Replay / Share Definitions

- [x] Define whether Vite `ContentNode`, `TranscriptBlock`, and `AnswerContainer` presentation services are copied into Next or extracted without changing user-visible presentation.
- [x] Define how Next durable `MessageDto` pages feed Vite-style transcript projection.
- [x] Define how live assistant drafts feed Vite-style transcript projection.
- [x] Define how tool calls/results become user-facing Vite presentation instead of raw JSON cards.
- [x] Define SearchResultsPanel data inputs from persisted messages, timeline/tool data, and public snapshots.
- [x] Define replay step model parity with Vite replay runtime.
- [x] Define public share snapshot presentation parity with Vite shared snapshot console.

## 2. Backend / Platform Boundary

### 2.1 Preserve Existing Backend Behavior

- [x] Keep existing Next auth routes.
- [x] Keep existing protected thread routes.
- [x] Keep existing stream and attach-stream routes.
- [x] Keep existing share routes.
- [x] Keep existing replay route data API.
- [x] Only change backend routes if a Vite UI interaction has no existing Next endpoint.
- [x] Avoid backend rewrites while doing UI parity unless tests prove a route contract gap.

### 2.2 Route / API Gaps To Check

- [x] Confirm web search toggle can call current stream API with `webSearchEnabled`.
- [x] Confirm quick/expert mode UI can map to current model/reasoning controls.
- [x] Confirm thread row actions can call current rename/archive/pin/share routes.
- [x] Confirm public share can load all data needed for Vite shared snapshot presentation.
- [x] Confirm replay can load all data needed for Vite replay presentation.
- [x] Confirm auth pages can preserve existing Next cookie/session behavior while matching Vite UI.

## 3. Frontend Implementation Boundary

### 3.1 Style Foundation

- [x] Upgrade `apps/playground-next-web` to Vite-aligned Tailwind 4 foundation.
- [x] Align `postcss` / CSS entry files with Vite where needed.
- [x] Import Geist font like Vite.
- [x] Import `tw-animate-css` and shadcn CSS like Vite.
- [x] Audit Vite package deps, `components.json`, and UI primitive imports before finalizing the Next dependency list.
- [x] Port missing Vite `chat-shell.css` class/variable blocks.
- [x] Add missing UI primitives: Input, Dialog, AlertDialog, DropdownMenu, and any Button variants needed by Vite UI.
- [x] Add Vite visual assets/components needed by parity: `DeepseekLogo`, `PureDeepseek`, mode icons, and `SiteIconBadge`.
- [x] Verify Tailwind generates Vite classes used by migrated components.
- [x] Decide temporary style aliases remain as compatibility aliases for now and re-evaluate after page parity loops.

### 3.2 Auth UI

- [x] Port Vite auth shell background and centered layout.
- [x] Port `DeepseekLogo` or equivalent Vite logo component into Next.
- [x] Port login form visual structure and interactions.
- [x] Port register form visual structure and interactions.
- [x] Port forgot-password form visual structure and interactions.
- [x] Port password visibility toggles.
- [x] Port email-code cooldown behavior.
- [x] Port Chinese auth copy and error messages.
- [x] Preserve safe `next` redirect behavior.
- [x] Preserve reset-password success notice.
- [x] Remove temporary English auth UI.

### 3.3 Main Chat Shell

- [x] Port Vite sidebar brand, dimensions, mobile overlay, and open/close behavior.
- [x] Port Vite new-chat button style.
- [x] Port Vite thread grouping: pinned, today, yesterday, last 7 days, earlier, and more-history behavior where supported.
- [x] Port Vite thread row layout and static action affordance positions; interactive menus are completed in the dialogs/menus loop.
- [x] Port Vite account area layout; dropdown interaction is completed in the dialogs/menus loop.
- [x] Port Vite chat header layout, height, branding, title, and mode presentation.
- [x] Port Vite composer shell, empty-state landing, mode selector, web search toggle, thinking/reasoning controls, stop/send button states.
- [x] Ensure default Next chat view no longer looks like the old simplified Next shell.

### 3.4 Message / Search Presentation

- [x] Port Vite transcript block projection services or equivalent presentation pipeline.
- [x] Port answer container rendering.
- [x] Port persisted assistant/user message presentation.
- [x] Port live assistant draft presentation.
- [x] Port loading, thinking, reasoning, and shimmer states.
- [x] Port research/search status rows.
- [x] Port `SearchResultsPanel`.
- [x] Port source favicon/site badge presentation.
- [x] Port tool call/result user-facing presentation.
- [x] Preserve markdown/code/copy behavior while matching Vite visual output.

### 3.5 Dialogs And Thread Actions

- [x] Port rename dialog rather than using `window.prompt`.
- [x] Port archive/delete confirmation dialog rather than using `window.confirm`.
- [x] Port share dialog visual structure and focus behavior.
- [x] Port dropdown/menu interactions needed by sidebar and account controls.
- [x] Verify keyboard and focus behavior for dialogs/menus.

### 3.6 Replay UI

- [x] Replace simplified raw-message cursor replay with Vite-equivalent replay presentation.
- [x] Port replay runtime/view-state concepts needed by Vite UI.
- [x] Port replay control bar visual and interaction states.
- [x] Port reasoning/search/tool replay presentation.
- [x] Preserve Next route/data loading while matching Vite UI.

### 3.7 Public Share UI

- [x] Replace simplified document-style share page with Vite shared snapshot console parity.
- [x] Port shared snapshot transcript projection.
- [x] Port shared snapshot answer containers.
- [x] Port shared snapshot search panel.
- [x] Port loading, not-found, and empty states.
- [x] Keep public share read anonymous.

## 4. Tests And Verification

### 4.1 Command Gates

- [x] Run `pnpm --filter playground-next-web build` after foundation changes.
- [x] Run `pnpm --filter playground-next-web typecheck` after build if `.next/types` are required.
- [x] Run `pnpm --filter playground-next-web test` when touched code has tests or when adding new UI/runtime tests.
- [x] Run broader `pnpm typecheck` if shared packages or workspace-level dependencies change.

### 4.2 Focused Tests

- [x] Add or update auth helper tests for safe `next` redirect behavior.
- [x] Add or update auth UI behavior tests for login/register/forgot password where feasible.
- [x] Add or update email cooldown tests if cooldown hook is ported.
- [x] Add or update projection tests if transcript/search/replay presentation services are ported.
- [x] Add or update share/replay presentation tests if Vite services are copied or adapted.

### 4.3 Browser Verification

- [x] Capture or inspect the Vite baseline and the Next target for each verified page/state with the same viewport and comparable data.
- [x] Use desktop viewport `1440x900` for baseline parity checks unless a loop specifies otherwise.
- [x] Use mobile viewport `390x844` for baseline parity checks unless a loop specifies otherwise.
- [x] Verify `/login` desktop.
- [x] Verify `/login` mobile.
- [x] Verify `/register` desktop.
- [x] Verify `/register` mobile.
- [x] Verify `/forgot-password` desktop.
- [x] Verify `/forgot-password` mobile.
- [x] Verify auth empty state, submitting state, error state, password visible/hidden state, code before-send state, code cooldown state, code cooldown-ended state, and reset-success notice state.
- [x] Verify `/new` desktop.
- [x] Verify `/new` mobile.
- [x] Verify `/chat/:threadId` desktop with a real thread.
- [x] Verify `/chat/:threadId` mobile with a real thread.
- [x] Verify sidebar open/closed and mobile overlay.
- [x] Verify composer idle, sending, responding, and stop states.
- [x] Verify web search toggle visible and wired.
- [x] Verify reasoning/thinking controls visible and wired.
- [x] Verify message list with markdown, code, reasoning, search, and tool outputs.
- [x] Use at least one real thread or fixture containing markdown, code, reasoning, search, and tool result data for rich transcript verification.
- [x] Verify search results panel.
- [x] Verify rename/archive/share dialogs.
- [x] Verify `/replay/:threadId` desktop and mobile.
- [x] Verify `/share/:publicId` desktop and mobile.

### 4.4 Review And Commit Gates

- [x] Run `codex review --uncommitted -c model="gpt-5.3-codex" -c model_reasoning_effort="medium"` after each meaningful UI slice.
- [x] Use review tool timeout `timeout_ms >= 1200000`.
- [x] Run codex review after targeted verification and before committing each slice.
- [x] Commit immediately after clean review and passing targeted verification unless the user explicitly asks to batch.
- [x] Do not accumulate a second UI slice on top of a clean reviewed uncommitted slice.

## 5. Recommended Execution Order

### Loop 0: UI Foundation Decision And Current Diff Cleanup

- [x] Review the current uncommitted `globals.css` and `chat-theme.css` changes.
- [x] Decide whether those changes remain, move, or are replaced by Vite-aligned foundation work.
- [x] Update Next dependencies for Tailwind 4 / Vite UI foundation.
- [x] Align global CSS entry with Vite.
- [x] Align shared theme and chat-shell CSS imports.
- [x] Add missing UI primitives required by auth and chat parity.
- [x] Run targeted foundation verification.
- [x] Run codex review after verification and before commit.
- [x] Commit.

### Loop 1: Auth UI Parity

- [x] Port auth shell background, logo, and centered layout.
- [x] Port login form.
- [x] Port register form.
- [x] Port forgot-password form.
- [x] Port cooldown and password visibility interactions.
- [x] Preserve Next auth route calls and cookie/session behavior.
- [x] Preserve safe `next` redirect and reset success notice.
- [x] Browser-verify Vite baseline vs Next target for `/login`, `/register`, and `/forgot-password` on desktop and mobile.
- [x] Browser-verify auth empty, submitting, error, password visible/hidden, code before-send, code cooldown, code cooldown-ended, and reset-success notice states.
- [x] Run targeted verification.
- [x] Run codex review after verification and before commit.
- [x] Commit.

### Loop 2: Chat Shell Chrome Parity

- [x] Port sidebar layout, brand, grouping, thread rows, mobile behavior, and account area layout.
- [x] Port chat header layout and mode presentation.
- [x] Port composer layout, empty state, mode selector, search toggle, reasoning controls, send/stop states.
- [x] Leave thread row menus, account dropdown interaction, and dialogs to Loop 4 unless they are required for static layout parity.
- [x] Keep Next protected routing and runtime wiring intact.
- [x] Browser-verify Vite baseline vs Next target for `/new` and `/chat/:threadId` shell states on desktop and mobile.
- [x] Run targeted verification.
- [x] Run codex review after verification and before commit.
- [x] Commit.

### Loop 3: Message And Search Presentation Parity

- [x] Port transcript projection services.
- [x] Port answer containers.
- [x] Port user/assistant/live message rendering.
- [x] Port reasoning/thinking/research/search presentation.
- [x] Port SearchResultsPanel and source/site badge UI.
- [x] Replace raw JSON tool cards with Vite-style user-facing presentation.
- [x] Browser-verify Vite baseline vs Next target for rich transcript states on desktop and mobile.
- [x] Use at least one real thread or fixture with markdown, code, reasoning, search, and tool result data.
- [x] Run targeted verification.
- [x] Run codex review after verification and before commit.
- [x] Commit.

### Loop 4: Dialogs, Menus, And Thread Actions Parity

- [x] Port rename dialog.
- [x] Port archive/delete confirmation dialog.
- [x] Port thread row action menus.
- [x] Port share dialog.
- [x] Port account dropdown.
- [x] Remove prompt/confirm-style interactions where Vite uses dialogs.
- [x] Browser-verify Vite baseline vs Next target for hover, menu, dialog, focus, and keyboard behavior.
- [x] Run targeted verification.
- [x] Run codex review after verification and before commit.
- [x] Commit.

### Loop 5: Public Share UI Parity

- [x] Port Vite shared snapshot console presentation.
- [x] Port shared transcript projection and answer containers.
- [x] Port shared search panel.
- [x] Preserve anonymous public access and sanitization boundaries.
- [x] Browser-verify Vite baseline vs Next target for `/share/:publicId` desktop and mobile.
- [x] Run targeted verification.
- [x] Run codex review after verification and before commit.
- [x] Commit.

### Loop 6: Replay UI Parity

- [x] Port Vite replay runtime/view presentation needed by Next.
- [x] Port replay controls.
- [x] Port replay message/search/reasoning rendering.
- [x] Preserve Next route/data boundaries.
- [x] Browser-verify Vite baseline vs Next target for `/replay/:threadId` desktop and mobile.
- [x] Run targeted verification.
- [x] Run codex review after verification and before commit.
- [x] Commit.

### Loop 7: Final UI Parity Audit

- [x] Re-run Vite-vs-Next UI parity audit across auth, chat, replay, and share.
- [x] Verify no temporary English auth UI remains.
- [x] Verify no old Next shell branding such as `Forma` remains unless explicitly accepted.
- [x] Verify Vite UI-specific classes and tokens used by migrated components are present in built CSS.
- [x] Run final browser verification matrix.
- [x] Run final targeted command verification.
- [x] Run codex review after verification and before commit.
- [x] Commit.
