# playground-fastify-server

This app is the Fastify-based server scaffold for `agent-infra`.

Runbook:

- [`docs/playground-vite-fastify-runbook.md`](/Users/david/Documents/github/agent-infra/docs/playground-vite-fastify-runbook.md)

Current purpose:

- validate non-Next route hosting
- give `playground-vite-web` a local `/api` target during development
- become the future host for `@agent-infra/durable-chat-server`
- expose the phase-1 durable chat API used by the Vite consumer

## Commands

- `pnpm --filter playground-fastify-server bootstrap:db`
- `pnpm --filter playground-fastify-server dev:prepared`
- `pnpm --filter playground-fastify-server dev:prepared:sqlite`
- `pnpm --filter playground-fastify-server dev:prepared:turso`
- `pnpm --filter playground-fastify-server dev`
- `pnpm --filter playground-fastify-server build`
- `pnpm --filter playground-fastify-server start:prepared`
- `pnpm --filter playground-fastify-server typecheck`
- `pnpm --filter playground-fastify-server test`

The prepared commands are the validated default path. They run DB bootstrap explicitly before the host starts serving requests.
The `:sqlite` and `:turso` variants also force DB mode explicitly via `PLAYGROUND_DB_MODE`, so `.env` loading cannot silently switch the runtime to another backend.

## Env loading

The bootstrap command and the server both load `.env*` files in this priority order:

- `apps/playground-fastify-server`
- repository root
- `apps/playground-next-web` as a phase-1 compatibility fallback

This keeps the Fastify host usable with the same local runtime/db configuration that the Next reference app already uses.

## Current API surface

- `GET /health`
- `GET /api/meta`
- `GET /api/threads`
- `POST /api/threads`
- `GET /api/threads/:threadId/messages`
- `POST /api/threads/:threadId/runs/stream`
