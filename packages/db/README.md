# @agent-infra/db

`@agent-infra/db` supports SQLite, Turso/libSQL, and PostgreSQL for durable `thread`, `run`, `message`, `message_part`, `tool_invocation`, `artifact`, and `run_event` storage.

## Modes

- With `TURSO_DATABASE_URL`: uses Turso/libSQL over HTTP and auto-creates the SQLite-compatible schema. Set `TURSO_AUTH_TOKEN` for remote Turso databases.
- Otherwise with `DATABASE_URL`: uses PostgreSQL.
- Otherwise: uses SQLite at `./local.db` (configurable by `SQLITE_PATH`) and auto-creates schema.

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

## Turso notes

Turso/libSQL uses the SQLite schema path in this package.

- `createDbConfigFromEnv()` prefers `TURSO_DATABASE_URL` over `DATABASE_URL`.
- For a remote Turso database, set both `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN`.
- For local development without Turso, prefer the existing SQLite mode via `SQLITE_PATH`.
