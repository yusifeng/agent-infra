# Playground Next Migration Todo

Source analysis:

- [x] Primary analysis: `docs/playground-next-migration-analysis-task.md`
- [x] Vercel runbook caveats: `docs/playground-next-web-vercel-runbook.md`
- [x] Direction: hybrid rebuild
- [x] Do not start by porting the Vite UI.
- [x] First stabilize the Next host backend boundary.

## 0. Context And Boundary

### 0.1 Confirmed Facts

- [x] `apps/playground-vite-web` is the most complete frontend experience.
- [x] `apps/playground-fastify-server` is the most complete backend route semantics reference.
- [x] `apps/playground-next-web` already has useful Vercel/package/bootstrap/runbook shape.
- [x] Existing Next chat pages are mostly a stale shell and should not drive the migration.
- [x] In-memory `RunStreamHub` is only best-effort on Vercel Functions.
- [x] Production-grade attach/resume/cancel on Vercel will need external runtime state such as Redis, a worker, or a run coordinator.
- [x] Current `playground-next-web test` is not a valid required gate until tests are added.

### 0.2 Goals

- [ ] Move the current Vite/Fastify playground experience into `apps/playground-next-web`.
- [ ] Preserve Vercel deployability while making Vercel runtime caveats explicit.
- [ ] Keep platform/domain logic in `packages/*` when it is truly reusable.
- [ ] Keep playground host concerns out of durable platform packages.
- [ ] Make each implementation loop independently verifiable, reviewable, and committable.

### 0.3 Non-Goals

- [x] Do not delete `apps/playground-vite-web` during early migration.
- [x] Do not delete `apps/playground-fastify-server` before Next parity and smoke are proven.
- [x] Do not move playground auth into `packages/core`, `packages/contracts`, `packages/db`, or `packages/app`.
- [x] Do not pretend Vercel Functions make module-level active run state durable.
- [x] Do not port search UI as enabled before search backend wiring exists.
- [x] Do not ship attach-stream UI calls before matching backend routes exist.
- [x] Do not leave anonymous deployment smoke after `/api/threads` becomes session-gated.

## 1. Definitions First

### 1.1 Source Of Truth

- [x] Reconcile Next migration with `docs/source-of-truth/playground-host-auth-model.md`.
- [x] Reconcile runtime binding with `docs/source-of-truth/playground-chat-mode-model.md`.
- [x] Reconcile public share behavior with `docs/source-of-truth/share-model.md`.
- [x] Reconcile attach-stream behavior with `docs/source-of-truth/run-attach-stream-model.md`.
- [x] Decide whether a new source-of-truth doc is needed after migration facts stabilize.

Loop 0 decision:

- [x] No new source-of-truth doc is needed before implementation.
- [x] Existing source-of-truth docs already define the key boundaries.
- [x] Update source-of-truth docs later only if implementation discovers a durable, long-lived fact not covered there.

### 1.2 Host Boundary

- [x] Decide whether auth/thread-catalog code is copied into Next host-local modules.
- [x] Decide whether auth/thread-catalog code moves to an explicitly playground-owned host adapter.
- [x] Keep playground host adapter code separate from durable platform packages.
- [x] Define a shared current-user helper for Next route handlers.
- [x] Define unauthorized behavior per route type.
- [x] Preserve `GET /api/auth/me` behavior: unauthenticated returns `{ user: null }`.

Loop 0 decision:

- [x] Next auth remains playground host-local.
- [x] Do not move auth/thread-catalog into durable platform packages.
- [x] Start by copying/adapting Fastify host-local auth and thread-catalog code into Next host-local modules.
- [x] Extract an explicitly playground-owned host adapter only after duplication proves it is needed.

### 1.3 Data Model And Bootstrap

- [x] Update Next explicit bootstrap to prepare durable schema.
- [x] Update Next explicit bootstrap to prepare auth schema.
- [x] Update Next explicit bootstrap to prepare thread catalog schema.
- [x] Confirm Turso/SQLite bootstrap behavior stays explicit, not implicit inside user-facing requests.
- [ ] Confirm auth/session tables work in the selected remote DB mode.
- [x] Confirm thread catalog projection can be built from durable thread plus catalog row.

### 1.4 DTO / Projection Matrix

- [x] Define base durable `ThreadDto` usage.
- [x] Define playground thread DTO usage with `pinned`, `pinnedAt`, `runtimeProvider`, and `runtimeModel`.
- [x] Define message/run/timeline DTO usage.
- [ ] Define public share DTO and shared snapshot DTO usage.
- [ ] Define private playground stream events such as `thread.title_updated`.
- [x] Define attach-stream events: `run.snapshot`, `run.assistant`, terminal events, and `run.attach_unavailable`.
- [x] Ensure `GET /api/threads` returns playground thread DTOs once thread catalog is enabled.
- [x] Ensure thread mutation responses return playground thread DTOs once thread catalog is enabled.

### 1.5 Protected Route Matrix

- [x] Keep `GET /api/meta` anonymous.
- [ ] Keep `GET /api/shares/:publicId` anonymous.
- [ ] Keep `GET /site-icons/:hostname` or Next equivalent anonymous.
- [x] Keep auth entry routes anonymous.
- [x] Keep `POST /api/auth/logout` origin/rate-limited and idempotent for stale sessions.
- [x] Protect all `/api/threads*` chat/thread routes.
- [x] Protect `GET /api/runs/:runId/timeline`.
- [ ] Protect share create/current/revoke routes.
- [x] For thread routes, load accessible thread before app use cases.
- [x] For run routes, load run and then load its thread before app use cases.
- [ ] For share revoke, load share and then load source thread before app use cases.
- [x] Ensure wrong thread/run pairs do not leak cross-thread metadata.

### 1.6 Runtime And Search Gates

- [x] Preserve provider/model runtime binding from thread catalog or latest run.
- [x] Bind thread provider/model after the first successful queued turn if unset.
- [x] Force later turns in the same thread to keep the bound provider/model.
- [ ] Pass `webSearchEnabled` through run start only when backend search is configured.
- [ ] Reject or hide search-enabled sends when search backend is unavailable.
- [ ] Define `TAVILY_API_KEY` behavior in env docs and UI gating.

## 2. Backend / Platform

### 2.1 Next Auth Host

- [x] Add Next auth route handlers matching Fastify semantics.
- [x] Adapt auth cookies to Next `Request` / `NextResponse`.
- [x] Preserve production cookie name and secure cookie behavior.
- [x] Preserve origin checks.
- [x] Define rate-limit strategy for Next/Vercel.
- [x] Preserve client IP and user-agent capture for auth events.
- [x] Add `argon2` dependency if auth password hashing is hosted in Next.
- [x] Add `resend` dependency if auth email sending is hosted in Next.
- [x] Verify native dependency packaging for Vercel.

### 2.2 Thread Catalog And Protected APIs

- [x] Port or adapt thread catalog repo/service for Next.
- [x] Make `GET /api/threads` user-scoped.
- [x] Make `POST /api/threads` create owner catalog rows.
- [x] Add `GET /api/threads/:threadId`.
- [x] Add `PATCH /api/threads/:threadId`.
- [x] Add `POST /api/threads/:threadId/archive`.
- [x] Add `POST /api/threads/:threadId/pin`.
- [x] Add `DELETE /api/threads/:threadId/pin`.
- [x] Protect existing message/runs/timeline routes.
- [x] Protect existing stream route.
- [x] Preserve runtime binding in stream route.

### 2.3 Stream And Attach-Stream

- [x] Add process-local `RunStreamHub` singleton for Next.
- [x] Open hub session before runtime output can publish.
- [x] Publish stream assistant/state/terminal events into the hub.
- [x] Add `GET /api/threads/:threadId/runs/:runId/attach-stream`.
- [x] Send `run.snapshot` first on attach.
- [x] Preserve monotonic runtime `version`.
- [x] Preserve terminal retention behavior.
- [x] Preserve unavailable reasons and fallback semantics.
- [x] Document Vercel best-effort behavior after implementation.

### 2.4 Search / Browse

- [ ] Port Tavily provider wiring.
- [ ] Port search planner.
- [ ] Port policy-aware `searchWeb`.
- [ ] Port `openUrl`.
- [ ] Add or port `/site-icons/:hostname` equivalent.
- [ ] Validate tool invocation persistence.
- [ ] Validate search panel inputs can be loaded from timeline/tool data.

### 2.5 Share / Public Snapshot

- [ ] Add share create route.
- [ ] Add current share route.
- [ ] Add public share read route.
- [ ] Add share revoke route.
- [ ] Preserve public share sanitize behavior.
- [ ] Preserve snapshot-not-live-thread boundary.
- [ ] Keep public share read anonymous.
- [ ] Keep create/current/revoke authenticated.

### 2.6 Vercel / Env / Config

- [x] Update `.env.example` for auth env.
- [ ] Update `.env.example` for search env.
- [x] Update Vercel runbook for auth env.
- [x] Update Vercel runbook for origin allowlist.
- [ ] Define Node runtime requirements for route handlers.
- [ ] Define function duration assumptions for stream routes.
- [ ] Keep attach-stream caveat visible until external state exists.

Loop 0 decision:

- [x] Keep `playground-next-web` route handlers on the Node.js runtime.
- [x] Treat long stream duration and disconnect behavior as deployment assumptions to verify per Vercel project settings.
- [x] Do not rely on Edge runtime for DB/auth/runtime-pi routes.
- [x] Keep in-memory attach-stream as best-effort until external state is added.

## 3. Frontend Boundary

### 3.1 Routing

- [ ] Map `/` to `/new`.
- [x] Add `/login`.
- [x] Add `/register`.
- [x] Add `/forgot-password`.
- [ ] Keep `/new`.
- [ ] Keep `/chat/[threadId]`.
- [ ] Add `/share/[publicId]`.
- [ ] Add `/replay/[threadId]`.
- [ ] Pass route params into client components explicitly.
- [ ] Stop deriving active thread from `usePathname()` in the final shell.

### 3.2 Auth UI

- [x] Port login form.
- [x] Port register form.
- [x] Port forgot-password form.
- [x] Port auth loading state.
- [ ] Port protected route redirect behavior.
- [ ] Port logout behavior.
- [x] Preserve `next` redirect query semantics.

### 3.3 Chat UI

- [x] Decide Tailwind 3 vs Tailwind 4 strategy.
- [ ] Align Next Tailwind content globs with migrated feature paths.
- [ ] Port or replace Vite theme styles.
- [ ] Port sidebar.
- [ ] Port chat header.
- [ ] Port composer.
- [ ] Port message list.
- [ ] Port answer containers.
- [ ] Port loading semantics.
- [ ] Port thread rename/archive/pin actions.
- [ ] Port search status presentation only after search backend exists.
- [ ] Port attach-stream frontend only after backend exists.

Loop 0 decision:

- [x] Do not upgrade Tailwind during backend/auth slices.
- [x] Keep the current Next Tailwind 3 setup until UI port work begins.
- [x] Before porting Vite UI, either upgrade Next to a Tailwind 4-compatible stack or adapt the Vite styles to the current Next stack.
- [x] Do not raw-copy Vite Tailwind 4 CSS into the current Tailwind 3 app.

### 3.4 Share And Replay UI

- [ ] Port public share runtime.
- [ ] Port public share presentation using the main transcript rendering chain.
- [ ] Port share dialog.
- [ ] Port replay runtime.
- [ ] Port replay presentation.
- [ ] Port replay controls.

## 4. Tests And Verification

### 4.1 Baseline Gates

- [x] Run `pnpm --filter playground-next-web typecheck`.
- [x] Run `pnpm --filter playground-next-web build`.
- [x] Do not require `pnpm --filter playground-next-web test` until tests exist.

### 4.2 Test Strategy

- [x] Add route/helper tests when auth helpers are introduced.
- [x] Add protected route tests for thread access.
- [x] Add runtime binding tests.
- [x] Add stream hub / attach route tests.
- [ ] Add search tool wiring tests.
- [ ] Add share sanitize/public route tests.
- [ ] Add focused UI/runtime tests after chat shell port.

### 4.3 Smoke Strategy

- [x] Update deployment smoke before `/api/threads` becomes auth-gated.
- [x] Decide how smoke obtains a session.
- [ ] Validate `/api/meta`.
- [ ] Validate authenticated thread list/create.
- [ ] Validate authenticated stream.
- [ ] Validate persisted messages.
- [ ] Validate public share read without a session once share route exists.

Loop 0 decision:

- [x] Auth-aware smoke must be implemented in the same slice that makes `/api/threads` session-gated.
- [x] The smoke should obtain a session through the public auth flow or a documented test-only seeded identity path.
- [x] Do not keep the existing anonymous thread smoke after auth gating.

### 4.4 Review And Commit Gates

- [ ] Run `codex review --uncommitted -c model="gpt-5.3-codex" -c model_reasoning_effort="medium"` after each meaningful slice.
- [ ] Use tool timeout `timeout_ms >= 1200000` for review.
- [ ] Run codex review after targeted verification and before committing each slice.
- [ ] Commit immediately after clean review and targeted verification unless the user asks to batch.
- [ ] Do not accumulate a second slice on top of a clean reviewed uncommitted slice.

## 5. Recommended Execution Order

### Loop 0: Foundation Audit And Tooling Prep

- [x] Resolve host auth source-of-truth boundary.
- [x] Decide auth/thread-catalog host adapter strategy.
- [x] Decide Tailwind strategy.
- [x] Decide immediate dependency additions.
- [x] Define Vercel runtime/duration assumptions.
- [x] Define auth-capable smoke strategy.
- [x] Define route/helper test strategy.
- [x] Run baseline verification.
- [x] Run codex review after verification and before commit.
- [x] Commit.

Loop 0 decisions:

- [x] Add `argon2` and `resend` in Loop 1 only if Next hosts auth directly.
- [x] Add UI-only dependencies in the UI port loop, not in backend loops.
- [x] Add search-only dependencies/env in the search loop.
- [x] Add route/helper tests when the first route helper is introduced.

### Loop 1: Auth, Session, Bootstrap, Env, And Smoke

- [x] Add auth routes.
- [x] Add auth pages.
- [x] Add cookie/session adapter.
- [x] Add complete explicit bootstrap.
- [x] Update env docs.
- [x] Update auth-aware smoke.
- [x] Add tests where feasible.
- [x] Run targeted verification.
- [x] Run codex review after verification and before commit.
- [x] Commit.

### Loop 2: User-Scoped Thread Catalog, Runtime Binding, And Protected APIs

- [x] Add thread catalog integration.
- [x] Add playground thread projection.
- [x] Add thread management routes.
- [x] Protect messages/runs/timeline/stream routes.
- [x] Preserve runtime binding.
- [x] Add protected route tests.
- [x] Run targeted verification.
- [x] Run codex review after verification and before commit.
- [x] Commit.

### Loop 3: Stream Route Parity And Attach-Stream Backend

- [x] Add Next stream hub singleton.
- [x] Publish stream events into hub.
- [x] Add attach-stream route.
- [x] Validate snapshot-first attach locally.
- [x] Validate refresh recovery locally.
- [x] Validate thread-switch recovery locally.
- [x] Run targeted verification.
- [x] Run codex review after verification and before commit.
- [x] Commit.

### Loop 4: Search And Browse Tool Wiring

- [ ] Port search/browse runtime tools.
- [ ] Add site icon route.
- [ ] Add search env docs.
- [ ] Validate search configured/unconfigured behavior.
- [ ] Run targeted verification.
- [ ] Run codex review after verification and before commit.
- [ ] Commit.

### Loop 5: Thread Management UI, Share API, And Public Share View

- [ ] Port thread action UI.
- [ ] Add share API parity.
- [ ] Port public share view.
- [ ] Preserve share sanitization.
- [ ] Run targeted verification.
- [ ] Run codex review after verification and before commit.
- [ ] Commit.

### Loop 6: Main Chat UI Port

- [ ] Replace stale Next shell.
- [ ] Port Vite-derived chat shell.
- [ ] Port core runtime wiring against protected APIs.
- [ ] Verify attach/search gates do not call missing capabilities.
- [ ] Run targeted verification.
- [ ] Run codex review after verification and before commit.
- [ ] Commit.

### Loop 7: Replay, Auto-Title, Final Smoke, And Cleanup

- [ ] Add replay route and UI.
- [ ] Add auto-title event or fallback refresh.
- [ ] Run full auth-aware deployment smoke.
- [ ] Update final runbook.
- [ ] Decide stale directory deletion only after parity is proven.
- [ ] Run full verification.
- [ ] Run codex review after verification and before commit.
- [ ] Commit.
