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

```bash
pnpm install
cp .env.example .env
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
