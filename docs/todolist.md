# Playground Next Web Shell Hardening Todo

## 0. Context and Boundary

### 0.1 Confirmed facts
- [x] `apps/playground-next-web/components/chat-shell/auth-shell-gate.tsx` currently performs auth validation on the client with `useEffect`, a `/api/auth/me` fetch, and post-mount redirect behavior.
- [x] `apps/playground-next-web/app` currently has no `error.tsx` or `loading.tsx` route boundaries.
- [x] `apps/playground-next-web/features/durable-chat/runtime/use-durable-chat-runtime.ts` is a 1509-line runtime hook that owns thread list state, message loading, stream lifecycle, share dialogs, log inspector coordination, routing, and viewport effects.
- [x] `apps/playground-next-web/components/chat-shell/message-list.tsx` is already partially optimized with `memo(...)`, so the next issue is file/runtime complexity more than total absence of memoization.
- [x] `apps/playground-next-web/app/site-icons/[hostname]/route.ts` already returns `Cache-Control`; favicon caching is not a missing-header bug.
- [x] `docs/source-of-truth/playground-host-auth-model.md` is the current auth boundary source of truth for host-local auth ownership and request-scoped current user behavior.
- [x] `docs/playground-next-web-chat-runtime-architecture.md` already states that `runtime` owns router/history, side-effect orchestration, abort controllers, and viewport behavior, and that external state libraries are not the default direction.

### 0.2 Goals
- [x] Remove client-only auth gating from the chat shell and observability entry path so protected routes can reject or redirect before the main console bootstraps.
- [ ] Add explicit route loading/error boundaries for the authenticated shell and share/auth pages where async work currently falls through to blank or generic behavior.
- [ ] Reduce `use-durable-chat-runtime.ts` complexity by extracting bounded controllers/hooks without changing durable chat semantics.
- [ ] Keep the optimization pass focused on validated bottlenecks and avoid speculative framework churn.

### 0.3 Non-goals
- [x] Do not introduce shared auth abstractions into `packages/*`.
- [x] Do not rewrite the durable chat console into a server-first architecture.
- [x] Do not adopt SWR, React Query, or another external state library as part of this pass.
- [x] Do not treat `next/image`, blanket `React.memo`, or `useStableCallback` removal as mandatory mainline work in this slice.
- [x] Do not expand this task into visual redesign or broad UI cleanup.

## 1. Definitions First

### 1.1 Source of Truth
- [x] Reconfirm that moving auth checks out of `AuthShellGate` remains consistent with `docs/source-of-truth/playground-host-auth-model.md`, especially request-scoped current user and protected route expectations.
- [x] Decide whether the auth source-of-truth doc needs a small update to document the chosen protected-route enforcement point: middleware, server redirect, or another host-local server gate.
- [ ] Reconfirm that runtime hook extraction stays inside the existing `repo` / `service` / `runtime` boundary described in `docs/playground-next-web-chat-runtime-architecture.md`.

### 1.2 Data model
- [x] Keep `AuthUserDto` unchanged unless the chosen server-side auth gate proves that extra current-user fields are actually required.
- [ ] Keep durable thread, run, and message DTOs unchanged unless runtime extraction exposes an actual contract gap.

### 1.3 Types / Interfaces
- [x] Define the protected-route input/output boundary before implementation: what server-side code decides auth, and what user/current-user data gets passed into console entry components.
- [ ] Define the first hook extraction seams inside `runtime`: thread catalog/session bootstrap, live send/attach lifecycle, and shell dialog actions.
- [ ] Define route boundary expectations for `loading.tsx` and `error.tsx` so they stay thin host-shell behavior rather than new business logic.

## 2. Backend / Platform

### 2.1 Host auth gate
- [x] Choose and document the server-side enforcement path for protected playground routes.
- [x] Implement the protected-route check in a host-local server boundary.
- [x] Ensure the chosen approach still preserves `next` redirect behavior for `/login`.

### 2.2 Route behavior
- [x] Verify whether chat-shell pages should become server-authenticated composition roots that pass `currentUser` into client consoles instead of relying on `AuthShellGate`.
- [x] Verify whether `/observability` should use the same protected-route path as `/new`, `/chat/:threadId`, and `/replay/:threadId`.

## 3. Frontend Boundary

### 3.1 Runtime
- [ ] Split `use-durable-chat-runtime.ts` along existing architecture boundaries rather than by arbitrary file size.
- [ ] Extract one bounded slice first, prove that tests and behavior remain stable, then continue with the next slice.
- [ ] Preserve current durable chat semantics for thread switching, message pagination, send/reconcile, attach stream recovery, and share dialog state.

### 3.2 UI shell
- [x] Remove or reduce `AuthShellGate` responsibility once protected routes are enforced before client bootstrap.
- [ ] Add authenticated-shell `loading.tsx` and `error.tsx` boundaries with minimal but explicit UX.
- [ ] Add auth page Suspense fallback UI instead of `fallback={null}`.
- [ ] Evaluate whether any additional component memoization is justified after runtime extraction and profiler evidence, not before.

## 4. Tests

### 4.1 Auth / route checks
- [x] Add or update focused host-level tests for protected route redirect behavior if coverage exists in the Next app.
- [x] Verify `/api/auth/me` remains valid as an API contract even if page-level auth no longer depends on client fetch gating.

### 4.2 Runtime
- [ ] Add or preserve focused tests around any extracted runtime/service/controller logic where behavior can be verified without DOM-heavy integration.
- [ ] Run the narrowest `playground-next-web` verification for chat shell behavior after each extraction slice.

### 4.3 Manual verification
- [ ] Verify unauthenticated navigation to `/new`, `/chat/:threadId`, `/replay/:threadId`, and `/observability` redirects correctly.
- [ ] Verify authenticated load no longer shows the current client-side auth flash.
- [ ] Verify loading/error boundaries appear for the expected routes.
- [ ] Verify chat send, thread switch, replay, and share flows still work after runtime extraction.

## 5. Recommended Execution Order

### Loop 1
- [x] Finalize the protected-route enforcement design and update source-of-truth docs only if the chosen server boundary changes a stable auth fact.
- [x] Implement server-side protected-route gating for authenticated playground pages.
- [x] Remove the client auth fetch dependency from shell entry points.
- [x] Verify redirect behavior and authenticated page load behavior.
- [x] Run `codex review` for this loop after targeted verification passes.

### Loop 2
- [ ] Add `loading.tsx` / `error.tsx` boundaries for the authenticated shell and auth/share routes with minimal UI.
- [ ] Replace auth-page `Suspense fallback={null}` with an explicit fallback.
- [ ] Verify route-level loading and failure behavior.
- [ ] Run `codex review` for this loop after targeted verification passes.

### Loop 3
- [ ] Extract the first bounded slice from `use-durable-chat-runtime.ts`.
- [ ] Run targeted verification for that slice.
- [ ] Run `codex review` for this loop after targeted verification passes.
- [ ] Commit the slice before continuing if clean.

### Loop 4
- [ ] Continue runtime extraction in bounded slices until the remaining root hook is a composition layer rather than the main state machine.
- [ ] Run targeted verification for each extraction slice.
- [ ] Run `codex review` for this loop after targeted verification passes.
- [ ] Re-evaluate whether any memoization or callback-stability follow-up is still justified after the structural work lands.
