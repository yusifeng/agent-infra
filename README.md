# agent-infra

Reusable AI infrastructure base with a minimal v0.1 conversation loop.

## Structure

- `apps/playground-web`: Next.js demo playground UI
- `packages/core`: domain types + repository interfaces
- `packages/db`: Drizzle repositories (SQLite + PostgreSQL)
- `packages/runtime-ai-sdk`: runtime adapter with `mock` / `real` AI mode
- `packages/shared`: shared helpers
- `docs`: architecture and roadmap

## Quick start (zero-config demo)

No model API key and no local Postgres are required.

Environment file should be placed under `apps/playground-web` (Next.js app scope).

```bash
pnpm install
cp apps/playground-web/.env.example apps/playground-web/.env.local
pnpm dev
```

Default behavior:

- `AI_MODE=mock`
- database is local SQLite file (`./local.db`)
- SQLite schema is auto-initialized on first app start

## Advanced mode

### Real model mode

Use a real model by setting:

```bash
AI_MODE=real
OPENAI_API_KEY=sk-...
# optional
OPENAI_MODEL=gpt-4o-mini
```

If `AI_MODE=real` is set but `OPENAI_API_KEY` is missing, the runtime fails fast with a clear error.

### PostgreSQL mode

To switch database from SQLite to PostgreSQL, set:

```bash
DATABASE_URL=postgres://postgres:postgres@localhost:5432/agent_infra
```

When `DATABASE_URL` is provided, playground uses Postgres repositories.

### Postgres schema migration

Use Drizzle migration flow for PostgreSQL:

```bash
pnpm --filter @agent-infra/db db:generate
pnpm --filter @agent-infra/db db:migrate
```

## `playground-web` routes

- `/`: existing `agent-infra` demo (thread/run/message loop backed by SQLite/Postgres repos in this monorepo).
- `/pi`: **experimental** `pi-web-ui` entry for UX evaluation of `pi-agent-core` + `pi-web-ui`.

### `/pi` experiment notes

- Goal: quickly evaluate pi runtime/UI feel without changing current architecture.
- Storage: uses pi-web-ui local browser storage (IndexedDB via `AppStorage` + stores).
- Persistence boundary: does **not** write session/message history into current `agent-infra` durable backend.
- Provider keys: configured in pi-web-ui's own provider-key/settings flow on the `/pi` page (if required by provider/model).
- Existing `/` demo remains zero-config (`AI_MODE=mock`) and is not affected by `/pi`.
