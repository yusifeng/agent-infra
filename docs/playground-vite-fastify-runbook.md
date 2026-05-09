# Playground Vite + Fastify Runbook

This runbook captures the current validated setup for:

- [`apps/playground-vite-web`](/Users/david/Documents/github/agent-infra/apps/playground-vite-web)
- [`apps/playground-fastify-server`](/Users/david/Documents/github/agent-infra/apps/playground-fastify-server)

The goal is not to describe every possible deployment shape.
It records the setup that is already proven in this repository, so future consumers can copy the same pattern without reverse-engineering recent commits.

## Purpose

Use this pair of apps when you want to validate `agent-infra` outside Next.js:

- `playground-vite-web` validates browser-side durable chat behavior on top of `@agent-infra/durable-chat-client`
- `playground-fastify-server` validates route hosting outside Next.js on top of `@agent-infra/durable-chat-server`

The validated phase-1 scope is the main chat loop only:

- `/new`
- `/chat/:threadId`
- `/api/meta`
- `/api/threads`
- `/api/threads/:threadId/messages`
- `/api/threads/:threadId/runs/stream`

It does **not** cover the inspector/timeline pane yet.

## Startup modes

### Development shape

Use this when actively editing the apps:

- Fastify host with explicit bootstrap first:
  - `pnpm --filter playground-fastify-server dev:prepared`
  - `pnpm --filter playground-fastify-server dev:prepared:sqlite`
  - `pnpm --filter playground-fastify-server dev:prepared:turso`
  - or from repo root: `pnpm run dev:fastify-server`
- Vite: `pnpm --filter playground-vite-web dev`

The web app talks to the server through `/api` and Vite's proxy.

The raw `dev` script still exists, but it assumes the database schema has already been bootstrapped.
The validated default workflow is the prepared variant, which runs the bootstrap step before starting the host.
When you need deterministic local DB selection during development, use the explicit variants:

- `dev:prepared:sqlite` forces `PLAYGROUND_DB_MODE=sqlite`
- `dev:prepared:turso` forces `PLAYGROUND_DB_MODE=turso`

This avoids `.env` files reintroducing `TURSO_DATABASE_URL` or `DATABASE_URL` after startup.

### Production-shaped local validation

Use this when you want a closer-to-deploy local check:

- `pnpm --filter playground-vite-web smoke:phase1:production`

That command currently proves this sequence:

1. builds the required workspace packages
2. bootstraps the Fastify host database via `node dist/bootstrap-db.js`
3. starts `playground-fastify-server` via `node dist/server.js`
4. starts `playground-vite-web` via `vite preview`
5. keeps the browser app on relative `/api` paths
6. runs the main chat loop against a temporary sqlite database

This is the current strongest validated path for “would this still work outside dev mode?”

## Multi-database validation

Use these commands when you want to validate the same phase-1 main chat loop across the DB modes that are actually configured in your shell:

- `pnpm --filter playground-vite-web smoke:phase1:db`
- `pnpm --filter playground-vite-web smoke:phase1:db:production`

These commands always include:

- `sqlite` via a temporary local database

They also include these modes automatically when the required env is present:

- `postgres` when `DATABASE_URL` is set
- `turso` when `TURSO_DATABASE_URL` is set

Modes without the required env are reported as `skipped`, not silently ignored.
If a mode is available and fails, the command fails.
Before building the matrix, the scripts load `.env*` files using the same compatibility order already used by the Fastify host:

1. `apps/playground-vite-web`
2. `apps/playground-fastify-server`
3. repository root
4. `apps/playground-next-web`

The JSON summary includes `loadedEnvFiles` so you can see which config source the matrix actually consumed.

You can narrow the matrix explicitly, for example:

- `PLAYGROUND_PHASE1_DB_MODES=sqlite,postgres pnpm --filter playground-vite-web smoke:phase1:db`
- `PLAYGROUND_PHASE1_DB_MODES=turso pnpm --filter playground-vite-web smoke:phase1:db:production`

## Browser validation

The browser-level acceptance path is:

- `pnpm --filter playground-vite-web acceptance:phase1`

It currently covers:

- loading `/new`
- first send into a new thread
- redirect to `/chat/:threadId`
- transcript recovery after refresh
- creating a second thread via `新聊天`
- switching threads from the sidebar

On a fresh machine, install the Playwright browser once:

- `pnpm --filter playground-vite-web exec playwright install chromium`

## API timing diagnostics

The current Vite + Fastify setup now exposes a lightweight request timing layer for `/api/*` calls.

### Browser-side view

In `vite dev`, the browser prints request diagnostics to the console for:

- JSON API requests such as `/api/meta`, `/api/threads`, `/api/threads/:threadId/messages`
- stream lifecycle points such as:
  - stream open
  - first SSE event
  - first assistant event
  - terminal stream event

You can also inspect the accumulated records in DevTools:

- `window.__agentInfraPrintApiDiagnostics?.()`

Each entry includes:

- total browser-observed duration
- response-header arrival time
- `x-request-id`
- parsed `server-timing`

### Server-side view

Fastify now logs one structured `request timing` record per request.

That log includes:

- request id
- total duration
- timing spans
- simple cache-state annotations for app/runtime service initialization

This lets you distinguish:

- cold service initialization
- DB query time
- runtime turn setup time
- runtime streaming execution time

### What to compare

When a request feels slow, compare these two numbers first:

1. browser total duration
2. `server-timing total`

If they are close, the delay is mostly inside the server.
If browser total is much larger, the missing time is outside the app logic, usually proxying, connection setup, or remote DB/network behavior.

## Environment variables

### Fastify host process

`playground-fastify-server` reads `.env*` files in this order:

1. `apps/playground-fastify-server`
2. repository root
3. `apps/playground-next-web` as a compatibility fallback

That fallback exists so the Fastify host can reuse the same local runtime/database configuration already used by the Next reference app.

### Explicit DB bootstrap

The Fastify and Next hosts no longer bootstrap schema inside the first real API request.

Use explicit bootstrap commands instead:

- `pnpm --filter playground-fastify-server bootstrap:db`
- `pnpm --filter playground-fastify-server bootstrap:db:built`
- `pnpm --filter playground-next-web bootstrap:db`

Prepared startup wrappers already use these commands:

- `pnpm --filter playground-fastify-server dev:prepared`
- `pnpm --filter playground-fastify-server start:prepared`
- `pnpm --filter playground-next-web dev:prepared`
- `pnpm --filter playground-next-web start:prepared`

### Database selection

The DB mode comes from `createDbConfigFromEnv()` and follows this priority:

1. `TURSO_DATABASE_URL` (+ `TURSO_AUTH_TOKEN` when needed) -> Turso/libSQL
2. `DATABASE_URL` -> Postgres
3. otherwise `SQLITE_PATH` -> local SQLite, defaulting to `./local.db`

For the phase-1 smoke and acceptance scripts, the repository intentionally overrides this and uses a temporary sqlite path so validation stays self-contained.
The DB-matrix smoke commands are the exception: they intentionally preserve `DATABASE_URL` and `TURSO_*` when those modes are being exercised.

### Runtime selection

Runtime configuration is derived from the runtime-pi env helpers and typically depends on:

- `DEEPSEEK_API_KEY`
- `OPENAI_API_KEY`
- `OPENAI_MODEL`

If these are missing or invalid, `/api/meta` reports `runtimeConfigured: false` and includes `runtimeConfigError`.

### Vite API target

`playground-vite-web` uses relative `/api` requests.
During local validation, the actual upstream is controlled by:

- `VITE_API_PROXY_TARGET`

Current validated usage:

- under `vite dev`, `/api` proxies to `VITE_API_PROXY_TARGET` or `http://localhost:4000`
- under `vite preview`, the same `/api` proxy behavior is also enabled

That means the browser app does not need source changes when the Fastify port changes.

## Recommended validation sequence

When changing the Fastify host, route helpers, or the Vite/Fastify wiring, use this order:

1. `pnpm --filter playground-fastify-server test`
2. `pnpm --filter playground-fastify-server typecheck`
3. `pnpm --filter playground-vite-web smoke:phase1`
4. `pnpm --filter playground-vite-web smoke:phase1:production`
5. `pnpm --filter playground-vite-web smoke:phase1:db`
6. `pnpm --filter playground-vite-web smoke:phase1:db:production`
7. `pnpm --filter playground-vite-web acceptance:phase1`

You do not always need every step, but this is the full validated ladder.

## Failure triage

If something breaks, check in this order:

1. `/health`
   - if this fails, the Fastify host itself is not up
2. `/api/meta`
   - if this returns `runtimeConfigured: false`, the runtime env is not usable
3. DB selection
   - verify whether the process is actually using `TURSO_DATABASE_URL`, `DATABASE_URL`, or `SQLITE_PATH`
4. Vite proxy target
   - verify `VITE_API_PROXY_TARGET` matches the Fastify port you intended
5. stream terminal event
   - the main loop should reach either `run.completed` or `run.failed`

If Turso fails before SQL executes with a TLS connection error, treat that as an environment/connectivity issue, not a chat runtime regression.

## Current boundary

This runbook describes a validated adoption surface, not a product deployment template.

Still intentionally app-local:

- routing shell
- layout/presentational UI
- router integration (`useNavigate`, `useRouter`)
- scroll and DOM behavior

Already platformized:

- browser-side durable chat runtime helpers in `@agent-infra/durable-chat-client`
- route-side DTO/error/event helper logic in `@agent-infra/durable-chat-server`

The next likely hardening step after this runbook is app-level route/integration coverage for any new endpoint that gets added beyond the phase-1 main chat loop.
