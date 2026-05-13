# Playground Next Migration Analysis Task

## Goal

Decide the safest path for moving the current `playground-vite-web` experience back into `playground-next-web`, with Vercel deployment as the target runtime.

This is an analysis task, not an implementation task. The output should be a migration decision and an execution todo that can be implemented in slices.

## Current Context

- `apps/playground-vite-web` is currently the most complete browser experience.
- `apps/playground-fastify-server` is currently the most complete backend route surface for the Vite app.
- `apps/playground-next-web` already exists and has a validated Vercel runbook, but its product surface is behind the Vite/Fastify path.
- The current Next app is not deployed as a user-facing production product, so preserving its current app structure is not a hard requirement.
- Recreating the Next app shell is acceptable if it reduces migration risk.

## Known Current State

### Vite Web

`playground-vite-web` currently contains the newer durable chat UI and browser runtime work:

- auth UI flows
- thread list and active thread routing
- thread rename / archive / pin hooks
- share dialog and public share rendering
- search result panel
- replay and shared snapshot consoles
- attach-stream orchestration for reconnecting to active runs
- richer transcript rendering and answer-container presentation
- many feature-local tests around runtime, services, repo, schema, and UI

### Fastify Server

`playground-fastify-server` currently contains backend capabilities that the Vite app depends on:

- auth routes and session cookies
- thread catalog routes with user scoping
- thread management routes
- run stream route
- attach-stream route
- stream hub wiring
- search/browse tools and related policy
- auto thread title update event
- request timing / startup diagnostics

### Next Web

`playground-next-web` currently has a thinner surface:

- basic Next app shell
- core thread list / message / run / stream / timeline routes
- durable chat client runtime adapters
- existing Vercel deployment notes
- no obvious parity with the newest Vite auth/share/thread-management/search/replay/attach-stream surface

The existing Next app is useful as a reference for:

- Next route-handler style
- Vercel build/deploy constraints
- package composition through `@agent-infra/*`
- current chat shell layout and durable client package usage

It should not automatically be treated as the foundation if rebuilding the app directory is simpler.

## Primary Question

Should migration be done by incrementally patching the existing `apps/playground-next-web`, or by rebuilding the Next app shell and porting the current Vite/Fastify capabilities into it?

## Initial Recommendation To Validate

Prefer a **hybrid rebuild**:

- keep the `apps/playground-next-web` workspace package, package name, env examples, Vercel runbook, and proven build/deploy configuration
- replace or heavily rewrite the app shell and feature-local code where it is stale
- port reusable browser feature logic from Vite only where it has not already moved into `@agent-infra/durable-chat-client`
- port backend route semantics from Fastify into Next route handlers only after deciding which runtime constraints are acceptable on Vercel
- keep package-layer logic in `packages/*`; do not move durable runtime or business complexity into Next page code

Rationale:

- the existing Next app is not user-facing production, so preserving stale code has little value
- Vite has the more complete user experience and tests
- Fastify has the more complete backend route semantics
- Next already proves the Vercel deployment shape, so deleting every Next-specific setup file would create avoidable deployment risk

## Non-Goals

- Do not implement migration in this task.
- Do not delete `apps/playground-next-web` before the migration decision is accepted.
- Do not move platform/domain logic from `packages/*` into Next route handlers.
- Do not assume Vercel Functions can reliably host in-memory active run state across instances.
- Do not solve Redis, worker queues, or multi-instance stream durability in this task.
- Do not preserve old Next feature code solely because it exists.
- Do not re-open the old loading-only recovery approach; attach-stream remains the intended recovery shape.

## Analysis Work Items

### 1. Inventory Feature Parity

- [x] List every user-visible Vite route/screen.
- [x] List every Vite durable-chat feature module and decide whether it is:
  - reusable as-is
  - reusable after import/path adaptation
  - already replaced by `@agent-infra/durable-chat-client`
  - better rewritten for Next
- [x] List every Vite auth feature module and its backend dependency.
- [x] List every Vite share/replay/search feature module and its backend dependency.
- [x] List every Next feature module that is still useful.
- [x] List every Next feature module that should be deleted instead of patched.

### 2. Inventory API Parity

- [x] Compare Fastify routes with existing Next route handlers.
- [x] Identify missing Next API routes:
  - auth
  - thread get/update/archive/pin
  - shares
  - public share read
  - attach-stream
  - any search/timeline helper required by the current Vite UI
- [x] Identify Fastify-only route behavior that must move to shared server helpers before Next can use it cleanly.
- [x] Identify Fastify-only behavior that should remain out of Next for now.
- [x] Decide whether Next route handlers should directly call shared route helper functions or whether a small Next route adapter package is needed.

### 3. Runtime And Deployment Boundary

- [x] Reconfirm which capabilities are acceptable on Vercel Functions without Redis:
  - ordinary JSON API
  - basic SSE stream for a single request
  - attach-stream while the same in-memory session exists
  - best-effort local dev behavior
- [x] Mark which capabilities require Redis or a worker for robust deployment:
  - active run state across instances
  - process restart recovery
  - multi-instance attach-stream
  - server-side cancellation across instances
  - durable background generation after client disconnect
- [x] Decide whether the migrated Next app targets:
  - local parity first, Vercel best-effort streaming later
  - Vercel deployability first, with Redis/worker planned before relying on attach-stream
- [x] Keep `docs/playground-next-web-vercel-runbook.md` aligned with the chosen runtime boundary.

### 4. Frontend Migration Strategy

- [x] Decide whether to keep React Router concepts from Vite or map them cleanly to Next App Router routes.
- [x] Define target Next pages:
  - `/login`
  - `/register`
  - `/forgot-password`
  - `/new`
  - `/chat/[threadId]`
  - `/share/[publicId]`
- [x] Decide whether the main chat shell should be a client component mounted under a server-rendered route shell.
- [x] Define URL-state ownership for active thread, replay/share pages, and panel state.
- [x] Decide how to move Vite CSS/theme into Next without mixing stale Next styling and newer Vite styling.
- [x] Decide whether to keep Next's current `components/chat-shell/*` or replace it with the Vite component set.

### 5. Backend Migration Strategy

- [x] Decide how auth cookies are read/written in Next route handlers.
- [x] Decide how to reuse Fastify auth service without Fastify-specific request/reply objects.
- [x] Decide how thread catalog user scoping is enforced in Next route handlers.
- [x] Decide how attach-stream route handler accesses a process-local `RunStreamHub`.
- [x] Decide how stream hub lifetime is initialized in Next without relying on per-request construction.
- [x] Decide whether auto-title stream events are required in the first Next migration slice.
- [x] Decide how request timing diagnostics should work in Next, or explicitly defer them.

### 6. Package Extraction Opportunities

- [x] Identify Vite code that should move into `@agent-infra/durable-chat-client` before Next migration.
- [x] Identify Fastify route logic that should move into `@agent-infra/durable-chat-server` before Next migration.
- [x] Identify auth/thread-catalog logic that belongs in a shared package rather than either app.
- [x] Avoid moving purely product/UI code into packages unless there is a real second consumer.

### 7. Migration Decision

Produce a short decision record with:

- [x] recommended path: incremental patch, hybrid rebuild, or full recreate
- [x] files/directories to preserve
- [x] files/directories to delete or ignore
- [x] first implementation slice
- [x] verification commands for the first slice
- [x] Vercel deployment risks that remain unresolved

## Executed Analysis Results

### Feature Parity Inventory

The Vite app has these user-visible routes:

- `/` redirects to `/new`
- `/new`
- `/chat/:threadId`
- `/replay/:threadId`
- `/share/:publicId`
- `/login`
- `/register`
- `/forgot-password`

The target Next app should map these to:

- `/` redirecting to `/new`
- `/new`
- `/chat/[threadId]`
- `/replay/[threadId]`
- `/share/[publicId]`
- `/login`
- `/register`
- `/forgot-password`

`playground-next-web` currently has only:

- `/`
- `/new`
- `/chat/[threadId]`

with `app/(chat-shell)/chat/[threadId]/page.tsx` and `app/(chat-shell)/new/page.tsx` returning `null` because the shell is mounted from the route-group layout.

Vite durable-chat modules are ahead of Next in these areas:

- thread management UI and runtime:
  - rename
  - archive
  - pin / unpin
  - thread title refresh
- auth-aware shell:
  - current user
  - logout
  - protected route handling
- share:
  - current share lookup
  - create/copy share
  - revoke share
  - public shared snapshot view
- replay:
  - replay console
  - replay control bar
  - replay presentation services
- search:
  - search result panel
  - persisted research status
  - search tool result presentation
- attach-stream:
  - refresh recovery
  - thread-switch recovery
  - snapshot-first live draft replacement
- richer presentation:
  - answer containers
  - content node model
  - DeepSeek-style mode presentation
  - visible-content guards

Next durable-chat modules still worth preserving as references:

- `app/api/*` route-handler style
- `lib/playground-*.ts` service bootstrap shape
- `components/chat-shell/markdown-*`
- `components/chat-shell/durable-log-pane.tsx`
- `features/durable-chat/runtime/*` only as historical reference for package-client integration
- `scripts/deployment-smoke.mjs`
- `scripts/bootstrap-db.mjs`
- `next.config.ts`
- `.env.example`
- `docs/playground-next-web-vercel-runbook.md`

Next modules likely cheaper to replace than patch:

- `components/durable-chat-console.tsx`
- most of `components/chat-shell/*` except markdown/log references
- most of `features/durable-chat/runtime/*`
- `features/durable-chat/service/chat-runtime.ts`
- `features/durable-chat/types/*`
- `features/durable-chat/schema/*` if the Vite/client package normalizers cover the same boundary
- `app/(chat-shell)/layout.tsx` if auth/share/replay routing is rebuilt around App Router

### API Parity Inventory

Fastify currently exposes these relevant routes:

- `GET /api/meta`
- `GET /site-icons/:hostname`
- `GET /api/threads`
- `POST /api/threads`
- `GET /api/threads/:threadId`
- `PATCH /api/threads/:threadId`
- `POST /api/threads/:threadId/archive`
- `POST /api/threads/:threadId/pin`
- `DELETE /api/threads/:threadId/pin`
- `GET /api/threads/:threadId/messages`
- `POST /api/threads/:threadId/shares`
- `GET /api/threads/:threadId/shares/current`
- `GET /api/threads/:threadId/runs`
- `GET /api/runs/:runId/timeline`
- `GET /api/shares/:publicId`
- `POST /api/shares/:publicId/revoke`
- `POST /api/threads/:threadId/runs/stream`
- `GET /api/threads/:threadId/runs/:runId/attach-stream`
- `POST /api/auth/email/request-signup-code`
- `POST /api/auth/email/request-password-reset-code`
- `POST /api/auth/sign-up`
- `POST /api/auth/sign-in`
- `POST /api/auth/reset-password`
- `GET /api/auth/me`
- `POST /api/auth/logout`

Next currently exposes only:

- `GET /api/meta`
- `GET /api/threads`
- `POST /api/threads`
- `GET /api/threads/:threadId/messages`
- `GET /api/threads/:threadId/runs`
- `POST /api/threads/:threadId/runs`
- `POST /api/threads/:threadId/runs/stream`
- `GET /api/runs/:id/timeline`

Missing Next API surface:

- auth routes
- current-user route protection
- thread catalog user scoping
- `GET /api/threads/:threadId`
- `PATCH /api/threads/:threadId`
- archive route
- pin / unpin routes
- share create/current/public/revoke routes
- attach-stream route
- site icon route or equivalent image proxy
- Fastify request timing diagnostics
- Tavily/search tool runtime wiring
- auto-title stream event

The shared app package already has these use cases:

- `threads.rename`
- `threads.archive`
- `threads.getMessagesPage`
- `turns.startText`
- `runs.listByThread`
- `runs.getActiveByThread`
- `shares.createThreadSnapshot`
- `shares.getCurrentByThread`
- `shares.getPublic`
- `shares.revoke`

Therefore route parity should not start by inventing new app use cases. The main missing pieces are:

- auth route adapter for Next
- thread catalog user-scoping adapter for Next
- route helper extraction from Fastify-specific request/reply code
- process-local run stream hub access in Next

### Runtime And Vercel Boundary

The migrated Next app should target **local parity first with explicit Vercel caveats**, not pretend in-memory attach-stream is robust on Vercel.

Acceptable without Redis:

- ordinary JSON API routes
- auth/session routes backed by the database
- DB-backed thread/message/run/share reads and writes
- single-request SSE streaming while the request is alive
- attach-stream in local dev or a single warm process where the in-memory stream session still exists

Not robust on Vercel without Redis or a worker:

- multi-instance attach-stream
- process-restart recovery
- active run snapshot state across instances
- server-side cancellation across instances
- durable background generation after the original request is gone
- assuming a module-level `Map` always holds the active run session

Conclusion:

- implement the Next route shape so local parity is real
- document attach-stream as best-effort on Vercel until the stream hub has Redis or another external backing
- do not block the whole Next migration on Redis unless production attach-stream reliability is a launch requirement

### Frontend Migration Strategy

Use Next App Router routes directly. Do not keep React Router concepts.

Target routes:

- `app/page.tsx`: redirect to `/new`
- `app/(auth)/login/page.tsx`
- `app/(auth)/register/page.tsx`
- `app/(auth)/forgot-password/page.tsx`
- `app/(chat)/new/page.tsx`
- `app/(chat)/chat/[threadId]/page.tsx`
- `app/replay/[threadId]/page.tsx`
- `app/share/[publicId]/page.tsx`

The main chat shell should be a client component mounted under thin route shells. Route params should be passed into the client runtime explicitly instead of derived from `usePathname()` where possible.

URL ownership:

- active thread: route segment
- auth `next`: query param
- share id: route segment
- replay thread id: route segment
- side panels and transient UI state: client state, not route state for the first migration

Styling:

- prefer porting the Vite theme and component CSS as the new visual source of truth
- avoid mixing the stale Next chat shell CSS with newer Vite presentation rules
- Next currently uses Tailwind 3 while Vite uses Tailwind 4; first slice should either keep CSS plain enough to work in Tailwind 3 or explicitly upgrade the Next Tailwind path before porting Vite classes that depend on Vite/Tailwind 4 setup

### Backend Migration Strategy

Auth:

- reuse `PlaygroundAuthService`
- move Fastify-specific cookie helpers into Next route-local adapters or shared server helpers
- read cookies through `next/headers`
- write cookies through `NextResponse`
- keep origin checks, but adapt request origin extraction to Web Request headers

Thread catalog:

- reuse the existing thread catalog service and repo code
- move code out of Fastify app if it becomes shared by Next
- all protected thread routes must load accessible thread by current user before calling app use cases

Attach stream:

- Next needs a module-level `RunStreamHub` singleton equivalent to Fastify's injected `runStreamHub`
- the stream route must open a hub session before runtime output can publish into it
- the attach route must subscribe to that hub and write `run.snapshot` first
- this remains best-effort on Vercel until the hub can be backed by Redis/external state

Search:

- Next `lib/playground-services.ts` currently injects no tools
- Fastify runtime service injects Tavily search, search planner, policy-aware `searchWeb`, and `openUrl`
- Next must either port this wiring or intentionally ship first without search

Auto-title:

- not required in the first migration slice
- can follow after core chat/auth/thread routes are working

Request timing:

- defer Fastify request timing parity
- preserve basic response correctness first
- add Next diagnostics only if it helps deployment triage

### Package Extraction Decisions

Move or reuse in `@agent-infra/durable-chat-server`:

- route DTO builders already there
- attach-stream SSE encoding and event helpers already there
- missing shared adapters for auth/thread access should be considered before duplicating Fastify code into Next

Move or reuse in `@agent-infra/durable-chat-client`:

- API normalizers already there
- stream parsing already there
- shared send/load/reconcile flows already there
- Vite-only presentation code should stay app-local unless Next proves it is a second consumer

Host-local migration boundary:

- auth and thread-catalog are playground host concerns, not durable platform concerns
- do not move playground auth into `packages/core`, `packages/contracts`, `packages/db`, or `packages/app`
- if Fastify and Next must coexist during migration, share only host adapter code behind an explicitly playground-owned boundary
- if Fastify is going away after Next migration, keep the auth/thread-catalog migration route-local first and avoid over-extracting

## Subagent Review Addendum

Two independent migration reviews agreed on the main direction and found the same class of missing work:

- `hybrid rebuild` remains the right strategy
- the original slice plan was too UI-forward
- the highest risk is the Next host backend, not the chat component port
- the plan needs a foundation slice before auth implementation
- the deployment smoke and route protection plan must change as soon as auth is introduced

### Must Add Before Implementation

Add a foundation slice before writing feature code:

- resolve source-of-truth boundaries for Next host auth
- decide whether auth/thread-catalog code is copied into Next host-local modules or moved to an explicitly playground-owned host adapter
- update explicit DB bootstrap so Next prepares durable, auth, and thread catalog schemas
- update `.env.example` and Vercel runbook for auth/search env
- add Next dependencies needed by auth and UI migration, including native packaging checks for `argon2`
- decide Tailwind 3 vs Tailwind 4 migration before porting Vite UI
- define an auth-capable deployment smoke path
- define route-level test strategy because `playground-next-web test` currently has no tests to run
- keep `codex review` and commit gates on every meaningful slice

### Protected Route Matrix

Anonymous routes:

- `GET /api/meta`
- `GET /api/shares/:publicId`
- `GET /site-icons/:hostname` or the Next equivalent
- auth entry routes:
  - `POST /api/auth/email/request-signup-code`
  - `POST /api/auth/email/request-password-reset-code`
  - `POST /api/auth/sign-up`
  - `POST /api/auth/sign-in`
  - `POST /api/auth/reset-password`
  - `GET /api/auth/me`, returning `{ user: null }` when unauthenticated

Protected routes:

- `POST /api/auth/logout`
- `GET /api/threads`
- `POST /api/threads`
- `GET /api/threads/:threadId`
- `PATCH /api/threads/:threadId`
- `POST /api/threads/:threadId/archive`
- `POST /api/threads/:threadId/pin`
- `DELETE /api/threads/:threadId/pin`
- `GET /api/threads/:threadId/messages`
- `GET /api/threads/:threadId/runs`
- `POST /api/threads/:threadId/runs`
- `POST /api/threads/:threadId/runs/stream`
- `GET /api/threads/:threadId/runs/:runId/attach-stream`
- `GET /api/runs/:runId/timeline`
- `POST /api/threads/:threadId/shares`
- `GET /api/threads/:threadId/shares/current`
- `POST /api/shares/:publicId/revoke`

Protected route rule:

- thread routes must load the accessible thread for the current user before calling app use cases
- run routes must load the run, then load the run's thread for the current user
- share revoke must load the share, then load the source thread for the current user
- wrong thread/run pairs must not leak cross-thread metadata

### DTO And Projection Matrix

The Next migration must distinguish these shapes:

- base durable `ThreadDto`
- playground thread DTO with `pinned`, `pinnedAt`, `runtimeProvider`, and `runtimeModel`
- base `MessageDto` / `RunDto` / `RunTimelineResponseDto`
- public share DTO and shared snapshot DTO
- private playground stream events such as `thread.title_updated`
- attach-stream events such as `run.snapshot`, `run.assistant`, terminal events, and `run.attach_unavailable`

`GET /api/threads` and thread mutation responses must return the playground thread projection, not the base durable thread list, once auth/thread catalog is enabled.

### Runtime Binding And Search Gates

Runtime binding is not a search-only concern.

The Next stream route must preserve Fastify's thread runtime binding semantics:

- read existing runtime binding from the thread catalog or latest run
- force later turns in the same thread to keep the bound provider/model
- bind the thread after the first successful queued turn if unset
- pass `webSearchEnabled` and reject search-enabled sends when search is not configured

Search UI must not be ported as enabled before the backend has:

- Tavily provider wiring
- search planner
- policy-aware `searchWeb`
- `openUrl`
- `TAVILY_API_KEY` env documentation
- `/site-icons/:hostname` or equivalent route

### Verification Reality

The first implementation slice cannot rely on `pnpm --filter playground-next-web test` unless that slice adds tests.

Use this rule:

- if a slice adds no tests yet, do not list `playground-next-web test` as a required passing gate
- if a slice adds route/helper tests, make `playground-next-web test` required from that slice onward
- keep `playground-next-web typecheck` and `playground-next-web build` as baseline gates
- update deployment smoke during auth migration, not at the end

## Migration Decision Record

Decision: **hybrid rebuild**.

Do not incrementally patch the stale Next chat UI. Do not delete the whole workspace either.

Preserve:

- `apps/playground-next-web/package.json`
- `apps/playground-next-web/next.config.ts`
- `apps/playground-next-web/tsconfig.json`
- `apps/playground-next-web/.env.example`
- `apps/playground-next-web/scripts/bootstrap-db.mjs`
- `apps/playground-next-web/scripts/deployment-smoke.mjs`
- `apps/playground-next-web/lib/playground-base-services.ts`
- `apps/playground-next-web/lib/playground-app-services.ts`
- `apps/playground-next-web/lib/playground-meta.ts`
- `apps/playground-next-web/lib/playground-services.ts`, but update tool wiring
- markdown renderer files if still compatible
- durable log pane if still desired after UI port
- Vercel runbook and deployment smoke flow

Replace or ignore:

- current route-group shell under `app/(chat-shell)` once new routes are introduced
- `components/durable-chat-console.tsx`
- most current `components/chat-shell/*` UI, except reusable markdown/log pieces
- current Next feature runtime if Vite/client-package runtime can replace it cleanly
- stale Next schemas/types duplicated from packages or Vite

First implementation slice:

1. Add a foundation audit/tooling slice.
2. Resolve host-auth source-of-truth and package boundaries.
3. Prepare bootstrap/env/dependency/test/smoke strategy.
4. Only then add Next auth route handlers and auth pages.

Why this first:

- Vite's current product surface is auth-gated.
- Many Fastify chat routes depend on `currentUser`.
- Next currently has anonymous chat APIs, incomplete bootstrap, no auth smoke, and no route tests.
- Migrating chat before auth would create a second set of route semantics that must be redone.

Baseline verification:

```bash
pnpm --filter playground-next-web typecheck
pnpm --filter playground-next-web build
```

Add `pnpm --filter playground-next-web test` to required gates once the relevant slice adds tests.

If auth/thread-catalog service extraction touches packages:

```bash
pnpm --filter @agent-infra/db test
pnpm --filter @agent-infra/app test
pnpm typecheck
```

After each meaningful implementation slice:

```bash
codex review --uncommitted -c model="gpt-5.3-codex" -c model_reasoning_effort="medium"
```

Then commit immediately after clean review and targeted verification, unless the user asks to batch.

## Implementation Todo For Loop Workflow

### Slice 0: Foundation Audit And Tooling Prep

- [ ] Resolve Next host auth boundary against `docs/source-of-truth/playground-host-auth-model.md`.
- [ ] Decide whether auth/thread-catalog code is copied into Next host-local modules or moved to an explicitly playground-owned host adapter.
- [ ] Decide Tailwind 3 vs Tailwind 4 strategy before UI port.
- [ ] Decide whether `argon2`, `resend`, `radix-ui`, `tailwind-merge`, `@fontsource-variable/geist`, and `tw-animate-css` are needed immediately or in later slices.
- [ ] Define Vercel Node runtime requirements and function duration assumptions for streaming routes.
- [ ] Define auth-capable deployment smoke strategy.
- [ ] Define route/helper test strategy for Next.
- [ ] Update this analysis if the boundary decision changes.
- [ ] Run baseline verification.
- [ ] Run codex review.
- [ ] Commit the slice.

### Slice 1: Auth, Session, Bootstrap, Env, And Smoke

- [ ] Add Next auth route handlers matching Fastify auth semantics.
- [ ] Add Next auth pages for login/register/forgot-password.
- [ ] Adapt auth cookie read/write to Next `Request` / `NextResponse`.
- [ ] Preserve `GET /api/auth/me` behavior: unauthenticated returns `{ user: null }`.
- [ ] Preserve origin checks and define rate-limit strategy for Next/Vercel.
- [ ] Reuse `PlaygroundAuthService`; avoid copying business logic into route handlers.
- [ ] Update explicit bootstrap so Next prepares durable, auth, and thread catalog schemas.
- [ ] Update `.env.example` for auth env.
- [ ] Update Vercel runbook for auth env and origin allowlist.
- [ ] Update deployment smoke so it works after thread routes become authenticated.
- [ ] Add focused tests or route-level coverage where feasible.
- [ ] Run targeted verification.
- [ ] Run codex review.
- [ ] Commit the slice.

### Slice 2: User-Scoped Thread Catalog, Runtime Binding, And Protected APIs

- [ ] Port thread catalog service/repo access into Next or a small playground host helper.
- [ ] Make `GET /api/threads` return only visible user-scoped playground thread DTOs.
- [ ] Make `POST /api/threads` create a thread through catalog ownership.
- [ ] Add `GET /api/threads/:threadId`.
- [ ] Add `PATCH /api/threads/:threadId`.
- [ ] Add archive route.
- [ ] Add pin and unpin routes.
- [ ] Add user access checks to messages, runs, timeline, stream, and later attach routes.
- [ ] Preserve runtime binding semantics for provider/model.
- [ ] Pass `webSearchEnabled` through run start inputs only when backend search is configured.
- [ ] Add route/helper tests for protected route behavior.
- [ ] Run targeted verification.
- [ ] Run codex review.
- [ ] Commit the slice.

### Slice 3: Stream Route Parity And Attach-Stream Backend

- [ ] Add process-local `RunStreamHub` singleton for Next.
- [ ] Publish run stream events into the hub from `runs/stream`.
- [ ] Ensure the main stream route opens hub sessions before runtime output can publish.
- [ ] Add `GET /api/threads/:threadId/runs/:runId/attach-stream`.
- [ ] Validate snapshot-first, version ordering, terminal retention, and unavailable semantics.
- [ ] Validate refresh during generation locally.
- [ ] Validate switch thread away/back during generation locally.
- [ ] Keep Vercel best-effort caveat in the runbook.
- [ ] Run targeted verification.
- [ ] Run codex review.
- [ ] Commit the slice.

### Slice 4: Search And Browse Tool Wiring

- [ ] Port Fastify Tavily/search planner/openUrl runtime tool wiring into Next runtime services.
- [ ] Add required env documentation for `TAVILY_API_KEY`.
- [ ] Add or port `/site-icons/:hostname` equivalent.
- [ ] Reject or hide search-enabled sends when search is not configured.
- [ ] Validate search tool invocation persistence and search panel loading inputs.
- [ ] Run targeted verification.
- [ ] Run codex review.
- [ ] Commit the slice.

### Slice 5: Thread Management UI, Share API, And Public Share View

- [ ] Port thread management UI actions against the now-protected Next API.
- [ ] Add share create/current/public/revoke routes if not already completed.
- [ ] Preserve public share sanitization and snapshot-not-live-thread semantics.
- [ ] Add `/share/[publicId]` page and client runtime.
- [ ] Keep public share read anonymous; keep create/current/revoke authenticated.
- [ ] Reuse the same presentation chain as main chat where possible.
- [ ] Run targeted verification.
- [ ] Run codex review.
- [ ] Commit the slice.

### Slice 6: Main Chat UI Port

- [ ] Replace stale Next shell with the Vite-derived chat shell.
- [ ] Map Vite route behavior to Next App Router.
- [ ] Pass route params explicitly into client components instead of deriving active thread from `usePathname()`.
- [ ] Port composer, message list, answer containers, loading semantics, search status presentation, and thread sidebar actions.
- [ ] Reuse `@agent-infra/durable-chat-client` flows where possible.
- [ ] Avoid duplicating Vite-only runtime code if the package already owns the behavior.
- [ ] Verify attach fallback does not call missing routes or hidden disabled capabilities.
- [ ] Run targeted UI/runtime tests and Next typecheck/build.
- [ ] Run codex review.
- [ ] Commit the slice.

### Slice 7: Replay, Auto-Title, Final Smoke, And Cleanup

- [ ] Add `/replay/[threadId]`.
- [ ] Port replay runtime and UI.
- [ ] Add auto-title stream event if still needed.
- [ ] Update deployment smoke for final auth/user-scoped chat flow.
- [ ] Update Vercel runbook with final route/runtime boundaries.
- [ ] Run full Next verification.
- [ ] Run codex review.
- [ ] Commit the slice.
- [ ] Only after parity is proven, decide whether to delete stale Next shell/runtime directories.

## Remaining Vercel Risks

- In-memory `RunStreamHub` is not a robust production attach-stream backend on Vercel.
- Module-level singletons can be cold-started or split across instances.
- A disconnected browser request should not be assumed to keep backend generation alive unless verified for the actual deployment mode.
- Server-side cancellation of active runs will need an external coordination point if multiple instances are possible.
- Redis or a worker queue is the likely next architecture step if production-grade attach/resume/cancel is required.

## Acceptance Criteria

- [x] The team can say whether `playground-next-web` should be patched or rebuilt.
- [x] The answer names concrete directories/files, not only abstract strategy.
- [x] The answer separates frontend migration from backend route/runtime migration.
- [x] The answer names what is required for Vercel-safe production behavior.
- [x] The answer identifies what can work locally with in-memory state but is not robust on Vercel.
- [x] The answer produces an implementation todo suitable for loop-workflow.

## Review Requirement

- [ ] Before turning the accepted analysis into implementation work, run the repository review profile after each meaningful functional slice.
- [ ] After a clean slice-level review and targeted verification, commit that slice immediately unless the user asks to batch commits.
