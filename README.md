# agent-infra

Durable backend primitives for agent runtimes, plus a browser-local pi experiment harness.

## Structure

- `apps/playground-web`: browser-local pi experiment harness
- `packages/core`: domain types + repository interfaces
- `packages/db`: Drizzle repositories (SQLite + PostgreSQL) for durable thread/run/message/tool storage
- `packages/runtime-pi`: pi-agent-core adapter that persists runs, messages, tool invocations, and run events
- `packages/shared`: shared helpers
- `docs`: architecture and roadmap

## Quick start

The default app experience is the browser-local pi experiment in `playground-web`.

Environment file should be placed under `apps/playground-web` (Next.js app scope).

```bash
pnpm install
cp apps/playground-web/.env.example apps/playground-web/.env.local
pnpm dev
```

This route keeps sessions, settings, and provider keys in browser IndexedDB. It does not write to the durable backend packages.

## Durable backend packages

- `@agent-infra/core` defines the stable storage contract:
  - `thread`
  - `run`
  - `message`
  - `message_part`
  - `tool_invocation`
  - `run_event`
- `@agent-infra/db` implements SQLite and PostgreSQL repositories for that contract.
- `@agent-infra/runtime-pi` is the current server-side runtime adapter mainline.

### PostgreSQL migration flow

```bash
pnpm --filter @agent-infra/db db:generate
pnpm --filter @agent-infra/db db:migrate
```

### runtime-pi configuration

`@agent-infra/runtime-pi` supports DeepSeek and OpenAI. If both keys are present, it defaults to DeepSeek:

```bash
DEEPSEEK_API_KEY=sk-...
# optional OpenAI fallback / alternate selection
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4o-mini
```

### runtime-pi smoke harness

Run a real server-side smoke pass against `@agent-infra/db` repositories:

```bash
DEEPSEEK_API_KEY=sk-... pnpm --filter @agent-infra/runtime-pi smoke
```

By default this uses SQLite at `packages/runtime-pi/runtime-pi-smoke.db`. You can override with `SQLITE_PATH` or point to PostgreSQL with `DATABASE_URL`.
