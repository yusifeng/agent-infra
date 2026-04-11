# @agent-infra/db

`@agent-infra/db` supports both SQLite and PostgreSQL for durable `thread`, `run`, `message`, `message_part`, `tool_invocation`, `artifact`, and `run_event` storage.

## Modes

- No `DATABASE_URL`: uses SQLite at `./local.db` (configurable by `SQLITE_PATH`) and auto-creates schema.
- With `DATABASE_URL`: uses PostgreSQL.

## Local test reliability

`@agent-infra/db` uses `better-sqlite3`, which is a native module.

If you switch Node versions, an existing install may keep a stale binary with the wrong ABI.
The package test command now checks for that case and automatically runs:

```bash
pnpm rebuild better-sqlite3
```

before `vitest` when it detects a `NODE_MODULE_VERSION` mismatch.

The intended normal local path is still:

```bash
pnpm --filter @agent-infra/db test
```

## PostgreSQL migration flow

For Postgres deployments, generate and apply migrations from `src/schema.ts`:

```bash
pnpm --filter @agent-infra/db db:generate
pnpm --filter @agent-infra/db db:migrate
```
