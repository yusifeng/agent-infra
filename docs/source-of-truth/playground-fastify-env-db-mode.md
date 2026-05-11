# Playground Fastify Env / DB Mode Model

This document is the source of truth for how
[`playground-fastify-server`](/Users/david/Documents/github/agent-infra/apps/playground-fastify-server)
loads environment files and selects its database backend.

It exists to prevent three classes of drift:

- implicit cross-app env coupling
- accidental DB mode switching caused by unrelated variables
- `/api/meta` reporting a different DB source than the one the host actually uses

## 1. Env loading boundary

`playground-fastify-server` only loads `.env*` files from:

1. `apps/playground-fastify-server`
2. repository root

It does **not** default-read:

- `apps/playground-next-web/.env*`
- any other sibling app's `.env*`

If another app needs different env, that app owns its own env loading.
Cross-app fallback is not part of the Fastify host contract.

## 2. DB mode selection

The only supported DB type selector is:

- `PLAYGROUND_DB_MODE`

Allowed values:

- `sqlite`
- `turso`
- `postgres`

This variable decides **which class of database** the Fastify host will use.
Other variables only provide connection details for the selected mode.

### 2.1 sqlite

Required selector:

```env
PLAYGROUND_DB_MODE=sqlite
```

Optional connection variable:

```env
SQLITE_PATH=./local.db
```

If `SQLITE_PATH` is absent, SQLite defaults to `./local.db`.

### 2.2 turso

Required selector:

```env
PLAYGROUND_DB_MODE=turso
```

Required connection variable:

```env
TURSO_DATABASE_URL=libsql://...
```

Usually also required:

```env
TURSO_AUTH_TOKEN=...
```

### 2.3 postgres

Required selector:

```env
PLAYGROUND_DB_MODE=postgres
```

Required connection variable:

```env
DATABASE_URL=postgres://...
```

## 3. Forced mode semantics

If `PLAYGROUND_DB_MODE` is present, it is absolute.

Examples:

- `PLAYGROUND_DB_MODE=sqlite` ignores `TURSO_DATABASE_URL` and `DATABASE_URL`
- `PLAYGROUND_DB_MODE=turso` ignores `SQLITE_PATH` and `DATABASE_URL`
- `PLAYGROUND_DB_MODE=postgres` ignores `SQLITE_PATH` and `TURSO_DATABASE_URL`

This rule exists so a user can choose DB mode intentionally without being overridden by
leftover env from another task, app, or shell session.

## 4. Prepared scripts are the default startup path

The validated default startup path is the prepared scripts, not raw `dev` / `start`.

Development:

- `pnpm --filter playground-fastify-server dev:prepared`
- `pnpm --filter playground-fastify-server dev:prepared:sqlite`
- `pnpm --filter playground-fastify-server dev:prepared:turso`

Production-shaped local validation:

- `pnpm --filter playground-fastify-server start:prepared`

Raw `dev` and `start` still exist, but they are lower-level entrypoints intended for
advanced debugging or already-prepared environments.

## 5. Startup observability

Both bootstrap and server startup should make these resolved facts visible:

- loaded env files
- resolved DB mode
- resolved DB connection string/path
- whether DB mode was explicitly forced by `PLAYGROUND_DB_MODE`

When the connection string contains credentials, startup reporting must redact them before
writing logs or human-facing summaries.

This exists so developers do not need to infer DB state indirectly from unrelated logs or
guesswork.

## 6. `/api/meta` reporting

`/api/meta` must report DB information from the resolved runtime/app services:

- `dbMode`
- `dbConnection`

It must not guess DB mode from the presence of env variables.

That means `/api/meta` should stay aligned with the same `DbConfig` that the host is
actually serving with.
