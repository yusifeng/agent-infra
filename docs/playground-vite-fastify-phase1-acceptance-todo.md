# Playground Vite + Fastify Phase 1 Acceptance

## Goal

Verify that `apps/playground-vite-web` and `apps/playground-fastify-server` form a real, non-Next main chat loop that is usable for platform validation.

## Acceptance checklist

- `playground-fastify-server` starts in local development with the expected env/config behavior.
- `GET /health` and `GET /api/meta` return valid responses from Fastify.
- `playground-vite-web` loads `/new` and proxies `/api/*` to Fastify without client-side path changes.
- First send path works end-to-end:
  - creates a thread
  - shows optimistic user state
  - starts stream
  - settles into persisted transcript
  - lands on `/chat/:threadId`
- Reloading `/chat/:threadId` restores transcript state.
- Switching threads restores the selected thread transcript.
- The phase-1 shell does not leak inspector/timeline dependencies into the page.

## Known focus areas

- Fastify env loading may differ from Next.js because it does not get `.env.local` loading for free.
- Stream validation should prefer a short scripted smoke path over long-running combined shell commands.
- Any issue found here should be fixed with the smallest change needed to keep the phase-1 boundary intact.

## Current findings

- Fastify now loads `.env*` files from `playground-fastify-server`, repository root, then `playground-next-web` as a compatibility fallback.
- Package-relative ESM imports in `packages/core` and `packages/app` now use explicit `.js` specifiers, so `playground-fastify-server start` can execute with plain Node.
- In the current local environment, `playground-next-web/.env` points at Turso, but direct Turso access can still fail with a TLS connection error before SQL executes.
- The phase-1 main chat loop itself has been validated with a local `SQLITE_PATH` override:
  - thread creation succeeded
  - SSE stream reached `run.completed`
  - persisted transcript contained the expected `user` + `assistant` messages
