# agent-infra

Contract-first durable backend primitives for agent runtimes, plus consumer apps that define how the system is used.

## Structure

- `apps/docs`: deployable official documentation site
- `apps/playground-web`: first consumer of `agent-infra`, with both browser-local experiments and a durable runtime console
- `packages/app`: application/use-case boundary for creating threads and running durable turns
- `packages/core`: domain types + repository interfaces
- `packages/contracts`: serialized request/response contracts for browser and HTTP consumers
- `packages/db`: Drizzle repositories (SQLite + PostgreSQL) for durable thread/run/message/tool storage
- `packages/runtime-pi`: pi-agent-core adapter that persists runs, messages, tool invocations, and run events
- `packages/shared`: shared helpers
- `docs`: internal architecture and roadmap notes

## Quick start

The default local app experience is the browser-local pi experiment in `playground-web`.
The same app also includes `/runtime-pi`, which exercises the durable backend through the official app boundary.

The public docs site lives in `apps/docs`.

Environment file should be placed under `apps/playground-web` (Next.js app scope).

```bash
pnpm install
cp apps/playground-web/.env.example apps/playground-web/.env.local
pnpm dev
```

For the docs site:

```bash
pnpm install
pnpm dev:docs
```

The browser-local experiment keeps sessions, settings, and provider keys in browser IndexedDB. It does not write to the durable backend packages.

## Durable backend packages

- `@agent-infra/app` defines the narrow application boundary used by consumers:
  - `threads.create`
  - `threads.list`
  - `threads.getMessages`
  - `turns.runText`
- `@agent-infra/core` defines the stable storage contract:
  - `thread`
  - `run`
  - `message`
  - `message_part`
  - `tool_invocation`
  - `run_event`
- `@agent-infra/contracts` defines serialized request/response contracts for consumer-facing APIs.
- `@agent-infra/db` implements SQLite and PostgreSQL repositories for that contract.
- `@agent-infra/runtime-pi` is the current server-side runtime adapter mainline.

## Documentation split

- `apps/docs` contains the deployable official documentation site.
- `docs/` keeps internal notes, roadmap material, and architecture working docs.
- `apps/playground-web` remains the first consumer and experiment harness, not the documentation source of truth.

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
