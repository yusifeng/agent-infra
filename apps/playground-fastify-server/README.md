# playground-fastify-server

This app is the Fastify-based server scaffold for `agent-infra`.

Runbook:

- [`docs/playground-vite-fastify-runbook.md`](/Users/david/Documents/github/agent-infra/docs/playground-vite-fastify-runbook.md)

Current purpose:

- validate non-Next route hosting
- give `playground-vite-web` a local `/api` target during development
- become the future host for `@agent-infra/durable-chat-server`
- expose the phase-1 durable chat API used by the Vite consumer
- host business-level search planner policy for `searchWeb` and lightweight `openUrl`

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
After bootstrap succeeds, the prepared dev scripts `exec` into the watcher so `Ctrl+C` targets the live watch process directly instead of leaving an extra shell layer behind.

## Env loading

The bootstrap command and the server both load `.env*` files in this priority order:

- `apps/playground-fastify-server`
- repository root

They do **not** default-read:

- `apps/playground-next-web/.env*`
- any other sibling app's `.env*`

The Fastify host now owns its env boundary directly instead of inheriting another app's
database/runtime configuration implicitly.

## DB mode selection

Use `PLAYGROUND_DB_MODE` as the only DB type selector:

- `sqlite`
- `turso`
- `postgres`

Connection variables only provide details for the selected mode:

| `PLAYGROUND_DB_MODE` | Required variables | Optional variables |
|---|---|---|
| `sqlite` | none | `SQLITE_PATH` |
| `turso` | `TURSO_DATABASE_URL` | `TURSO_AUTH_TOKEN` |
| `postgres` | `DATABASE_URL` | none |

If `PLAYGROUND_DB_MODE` is present, it is absolute. For example:

- `PLAYGROUND_DB_MODE=sqlite` ignores `TURSO_DATABASE_URL` and `DATABASE_URL`
- `PLAYGROUND_DB_MODE=turso` ignores `SQLITE_PATH` and `DATABASE_URL`
- `PLAYGROUND_DB_MODE=postgres` ignores `SQLITE_PATH` and `TURSO_DATABASE_URL`

This is the intended contract for deterministic local and production-shaped startup.

## Startup observability

Prepared startup now logs a resolved summary that includes:

- loaded env files
- resolved DB mode
- resolved DB connection string/path
- whether DB mode was forced by `PLAYGROUND_DB_MODE`

Credentials inside non-sqlite connection strings are redacted before logging.

`bootstrap:db` also prints the same summary in its JSON output.

## Current API surface

- `GET /health`
- `GET /api/meta`
- `GET /api/threads`
- `GET /api/threads/:threadId`
- `POST /api/threads`
- `GET /api/threads/:threadId/messages`
- `POST /api/threads/:threadId/runs/stream`
