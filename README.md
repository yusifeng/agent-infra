# agent-infra

Reusable AI infrastructure base with a minimal v0.1 conversation loop.

## Structure

- `apps/playground-web`: minimal Next.js playground
- `packages/core`: domain types + repository interfaces
- `packages/db`: Drizzle schema + PostgreSQL repositories
- `packages/runtime-ai-sdk`: minimal AI SDK runtime adapter
- `packages/shared`: shared helpers
- `docs`: architecture and roadmap

## Quick start

```bash
pnpm install
pnpm dev
```

Set database URL before running app:

```bash
export DATABASE_URL='postgres://postgres:postgres@localhost:5432/agent_infra'
```

Initialize database schema with Drizzle:

```bash
pnpm --filter @agent-infra/db db:generate
pnpm --filter @agent-infra/db db:migrate
```
