# @agent-infra/db

`@agent-infra/db` supports both SQLite and PostgreSQL for durable `thread`, `run`, `message`, `message_part`, `tool_invocation`, `artifact`, and `run_event` storage.

## Modes

- No `DATABASE_URL`: uses SQLite at `./local.db` (configurable by `SQLITE_PATH`) and auto-creates schema.
- With `DATABASE_URL`: uses PostgreSQL.

## PostgreSQL migration flow

For Postgres deployments, generate and apply migrations from `src/schema.ts`:

```bash
pnpm --filter @agent-infra/db db:generate
pnpm --filter @agent-infra/db db:migrate
```
