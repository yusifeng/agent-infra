# @agent-infra/db

`@agent-infra/db` supports SQLite, Turso/libSQL, and PostgreSQL for durable `thread`, `run`, `message`, `message_part`, `tool_invocation`, `artifact`, and `run_event` storage.

## Modes

Preferred host contract:

- `PLAYGROUND_DB_MODE=sqlite` -> uses SQLite at `./local.db` by default, configurable with `SQLITE_PATH`
- `PLAYGROUND_DB_MODE=turso` -> uses Turso/libSQL over HTTP via `TURSO_DATABASE_URL`
- `PLAYGROUND_DB_MODE=postgres` -> uses PostgreSQL via `DATABASE_URL`

When `PLAYGROUND_DB_MODE` is set, it is the authoritative DB type selector.
Connection env only provide details for that selected mode.

Legacy fallback behavior still exists for callers that do not set `PLAYGROUND_DB_MODE`:

- with `TURSO_DATABASE_URL`: uses Turso/libSQL
- otherwise with `DATABASE_URL`: uses PostgreSQL
- otherwise: uses SQLite

`createDbConfigFromEnv()` only creates a DB config and live client handle. It does **not**
implicitly create or migrate schema for request-serving code paths.

If a host, test, or smoke script wants bootstrap convenience, it must opt into that
explicitly:

```ts
const dbConfig = createDbConfigFromEnv();
await dbConfig.bootstrapSchema();
```

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

- In hosts that set `PLAYGROUND_DB_MODE=turso`, `TURSO_DATABASE_URL` is the expected
  connection variable.
- For callers that still rely on legacy implicit selection, `createDbConfigFromEnv()`
  prefers `TURSO_DATABASE_URL` over `DATABASE_URL`.
- For a remote Turso database, set both `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN`.
- For local development without Turso, prefer the existing SQLite mode via `SQLITE_PATH`.
- For remote/shared environments, prefer running schema bootstrap or migrations as an
  explicit setup step rather than letting a user request trigger it.
