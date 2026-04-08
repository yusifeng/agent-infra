# @agent-infra/db

`@agent-infra/db` supports both SQLite (demo default) and PostgreSQL (advanced mode).

## Modes

- No `DATABASE_URL`: uses SQLite at `./local.db` (configurable by `SQLITE_PATH`) and auto-creates schema.
- With `DATABASE_URL`: uses PostgreSQL.

## PostgreSQL migration flow

For Postgres deployments, generate and apply migrations from `src/schema.ts`:

```bash
pnpm --filter @agent-infra/db db:generate
pnpm --filter @agent-infra/db db:migrate
```
