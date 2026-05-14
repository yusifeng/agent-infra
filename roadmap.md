# agent-infra Roadmap And File Guide

This file is a root-level map for quickly understanding where the important project files live and why the repository is split this way. The detailed planning roadmap still lives in [`docs/roadmap.md`](./docs/roadmap.md); this file is intentionally more practical: it is an index plus the reasoning behind the index.

## North Star

`agent-infra` is not a chat app first. It is durable backend infrastructure for agent runtimes.

The apps in `apps/*` are consumers and validation surfaces. They are useful because they force the platform contracts to run in real browser and server hosts, but reusable behavior should move into `packages/*` once it becomes a durable capability.

The project should keep asking one question before adding complexity: would this still matter if the current playground UI disappeared? If yes, it probably belongs in a package or a source-of-truth document. If no, it should stay small and local to the consumer.

## Repository Entrypoints

- [`README.md`](./README.md): public-facing repository overview and quick-start commands.
- [`AGENTS.md`](./AGENTS.md): working rules for coding agents and contributors operating in this repository.
- [`package.json`](./package.json): workspace-level scripts; start here for build, typecheck, test, and dev commands.
- [`pnpm-workspace.yaml`](./pnpm-workspace.yaml): declares the `apps/*` and `packages/*` workspace layout.
- [`tsconfig.base.json`](./tsconfig.base.json): shared strict TypeScript baseline.
- [`docs/architecture.md`](./docs/architecture.md): durable architecture and boundary explanation.
- [`docs/roadmap.md`](./docs/roadmap.md): planning roadmap after `v0`.
- [`docs/source-of-truth/README.md`](./docs/source-of-truth/README.md): index for long-lived concept-model documents.

## Main Package Map

### `packages/core`

Key files:

- [`packages/core/src/types.ts`](./packages/core/src/types.ts)
- [`packages/core/src/repositories.ts`](./packages/core/src/repositories.ts)
- [`packages/core/src/index.ts`](./packages/core/src/index.ts)

This is the lowest shared layer. It should define durable domain facts and repository interfaces, not application policy or framework behavior. If a type describes a thread, run, message, message part, tool invocation, run event, or durable repository contract, it probably starts here.

### `packages/contracts`

Key files:

- [`packages/contracts/src/index.ts`](./packages/contracts/src/index.ts)

This package owns serialized API shapes for HTTP and browser consumers. The point is to keep transport-facing shapes stable without letting framework-specific parsing, streaming, or route helper logic leak into the core domain model.

### `packages/app`

Key files:

- [`packages/app/src/app.ts`](./packages/app/src/app.ts)
- [`packages/app/src/types.ts`](./packages/app/src/types.ts)
- [`packages/app/src/errors.ts`](./packages/app/src/errors.ts)
- [`packages/app/test/app.test.ts`](./packages/app/test/app.test.ts)

This is the narrow use-case boundary. It coordinates durable operations like thread creation, thread listing, message reads, and text turns. Business flow that is broader than a repository method but still reusable across hosts should live here instead of in a Next route or Fastify route.

### `packages/db`

Key files:

- [`packages/db/src/schema.ts`](./packages/db/src/schema.ts)
- [`packages/db/src/schema-sqlite.ts`](./packages/db/src/schema-sqlite.ts)
- [`packages/db/src/repositories.ts`](./packages/db/src/repositories.ts)
- [`packages/db/src/repositories-sqlite.ts`](./packages/db/src/repositories-sqlite.ts)
- [`packages/db/src/client.ts`](./packages/db/src/client.ts)
- [`packages/db/drizzle.config.ts`](./packages/db/drizzle.config.ts)
- [`packages/db/README.md`](./packages/db/README.md)

This package turns the durable repository contracts into Drizzle-backed persistence. It is the right place to care about SQLite/PostgreSQL schema, migrations, transaction behavior, persistence ordering, and durable projections.

### `packages/runtime-pi`

Key files:

- [`packages/runtime-pi/src/runtime.ts`](./packages/runtime-pi/src/runtime.ts)
- [`packages/runtime-pi/src/messages.ts`](./packages/runtime-pi/src/messages.ts)
- [`packages/runtime-pi/src/tools.ts`](./packages/runtime-pi/src/tools.ts)
- [`packages/runtime-pi/src/config.ts`](./packages/runtime-pi/src/config.ts)
- [`packages/runtime-pi/src/smoke.ts`](./packages/runtime-pi/src/smoke.ts)

This is the current server-side runtime adapter mainline. It translates model/runtime activity into durable records and run events. Runtime provider selection, smoke coverage, tool mapping, and message conversion belong here when they are specific to the Pi adapter.

### `packages/durable-chat-client`

Key files:

- [`packages/durable-chat-client/src/index.ts`](./packages/durable-chat-client/src/index.ts)
- [`packages/durable-chat-client/test/chat-runtime.test.ts`](./packages/durable-chat-client/test/chat-runtime.test.ts)
- [`packages/durable-chat-client/test/send-message-flow.test.ts`](./packages/durable-chat-client/test/send-message-flow.test.ts)
- [`packages/durable-chat-client/test/load-thread-flow.test.ts`](./packages/durable-chat-client/test/load-thread-flow.test.ts)

This package is the reusable browser-side adoption surface for durable chat. Browser transport helpers, schema normalization, headless runtime helpers, live draft handling, and inspector primitives should move here when they need to be shared by more than one frontend consumer.

### `packages/durable-chat-server`

Key files:

- [`packages/durable-chat-server/src/api-dto.ts`](./packages/durable-chat-server/src/api-dto.ts)
- [`packages/durable-chat-server/src/chat-route-helpers.ts`](./packages/durable-chat-server/src/chat-route-helpers.ts)
- [`packages/durable-chat-server/src/route-errors.ts`](./packages/durable-chat-server/src/route-errors.ts)
- [`packages/durable-chat-server/src/run-stream-hub.ts`](./packages/durable-chat-server/src/run-stream-hub.ts)

This package is the reusable server-side adoption surface for chat routes. Route-side DTOs, shared endpoint semantics, stream hub behavior, and framework-neutral helpers belong here when both Next and Fastify need the same behavior.

### `packages/shared`

Key files:

- [`packages/shared/src/index.ts`](./packages/shared/src/index.ts)

This package should stay small. Use it for genuinely shared helpers, not as a dumping ground for concepts that have a clearer home in `core`, `app`, `contracts`, or a durable-chat package.

## Main App Map

### `apps/docs`

Key files:

- [`apps/docs/app/[lang]/[[...mdxPath]]/page.tsx`](./apps/docs/app/[lang]/[[...mdxPath]]/page.tsx)
- [`apps/docs/content/en/index.mdx`](./apps/docs/content/en/index.mdx)
- [`apps/docs/content/zh/index.mdx`](./apps/docs/content/zh/index.mdx)
- [`apps/docs/lib/i18n.ts`](./apps/docs/lib/i18n.ts)

This is the public documentation site. Put polished external-facing docs here. Internal planning, task notes, and architecture work-in-progress should stay under `docs/` until they are ready to become public docs.

### `apps/playground-next-web`

Key files:

- [`apps/playground-next-web/app/(chat-shell)/new/page.tsx`](<./apps/playground-next-web/app/(chat-shell)/new/page.tsx>)
- [`apps/playground-next-web/app/(chat-shell)/chat/[threadId]/page.tsx`](<./apps/playground-next-web/app/(chat-shell)/chat/[threadId]/page.tsx>)
- [`apps/playground-next-web/app/api/threads/route.ts`](./apps/playground-next-web/app/api/threads/route.ts)
- [`apps/playground-next-web/app/api/threads/[threadId]/runs/route.ts`](./apps/playground-next-web/app/api/threads/[threadId]/runs/route.ts)
- [`apps/playground-next-web/features/durable-chat`](./apps/playground-next-web/features/durable-chat)
- [`apps/playground-next-web/lib/playground-services.ts`](./apps/playground-next-web/lib/playground-services.ts)
- [`apps/playground-next-web/scripts/bootstrap-db.ts`](./apps/playground-next-web/scripts/bootstrap-db.ts)

This is the first and richest consumer. It is useful for validating the platform end to end: auth, thread catalog behavior, chat routes, runtime streaming, replay, share snapshots, and durable inspection. The risk is that it can attract platform complexity; when logic becomes reusable, move it toward `packages/app`, `packages/durable-chat-client`, `packages/durable-chat-server`, or `packages/runtime-pi`.

### `apps/playground-vite-web`

Key files:

- [`apps/playground-vite-web/src/App.tsx`](./apps/playground-vite-web/src/App.tsx)
- [`apps/playground-vite-web/src/features/durable-chat`](./apps/playground-vite-web/src/features/durable-chat)
- [`apps/playground-vite-web/src/features/auth`](./apps/playground-vite-web/src/features/auth)
- [`apps/playground-vite-web/scripts/phase1-smoke.mjs`](./apps/playground-vite-web/scripts/phase1-smoke.mjs)

This app proves the browser-side contracts outside Next.js. It should expose frontend portability problems early. If code is duplicated between this app and `playground-next-web`, decide whether it is harmless UI duplication or a sign that logic belongs in `packages/durable-chat-client`.

### `apps/playground-fastify-server`

Key files:

- [`apps/playground-fastify-server/src/server.ts`](./apps/playground-fastify-server/src/server.ts)
- [`apps/playground-fastify-server/src/app.ts`](./apps/playground-fastify-server/src/app.ts)
- [`apps/playground-fastify-server/src/routes/chat.ts`](./apps/playground-fastify-server/src/routes/chat.ts)
- [`apps/playground-fastify-server/src/routes/auth.ts`](./apps/playground-fastify-server/src/routes/auth.ts)
- [`apps/playground-fastify-server/src/playground-services.ts`](./apps/playground-fastify-server/src/playground-services.ts)

This host proves that the server-side platform can run outside Next.js. It should keep host-local concerns such as Fastify bootstrapping, request timing, local auth/session behavior, and environment wiring in the app, while pushing shared route semantics into `packages/durable-chat-server`.

## Internal Documentation Map

- [`docs/architecture.md`](./docs/architecture.md): overall system layering and long-term boundary rules.
- [`docs/glossary.md`](./docs/glossary.md): vocabulary that should stay consistent across code and docs.
- [`docs/runtime-observability.md`](./docs/runtime-observability.md): run/event observability notes.
- [`docs/source-of-truth`](./docs/source-of-truth): stable concept models for facts that should not be redefined in random task notes.

When a behavior or concept is long-lived, update a source-of-truth doc. When a note is temporary execution planning, keep it in `docs/` only long enough to finish the work and then fold lasting conclusions into the durable docs.

## Where New Work Should Land

- Domain facts and repository contracts: `packages/core`.
- Serialized HTTP/browser shapes: `packages/contracts`.
- Use-case orchestration: `packages/app`.
- Database schema, repositories, migrations, and persistence tests: `packages/db`.
- Runtime adapter behavior: `packages/runtime-pi`.
- Shared browser chat behavior: `packages/durable-chat-client`.
- Shared server route behavior: `packages/durable-chat-server`.
- Host-specific Next UI/routes/auth wiring: `apps/playground-next-web`.
- Host-specific Vite UI validation: `apps/playground-vite-web`.
- Host-specific Fastify boot/auth/env wiring: `apps/playground-fastify-server`.
- Public docs: `apps/docs/content`.
- Internal durable architecture notes: `docs` and `docs/source-of-truth`.

## Verification Shortlist

Use the narrowest command that proves the change:

- Whole workspace type safety: `pnpm typecheck`
- Whole workspace tests: `pnpm test`
- DB package tests: `pnpm --filter @agent-infra/db test`
- Runtime Pi tests/smoke: `pnpm --filter @agent-infra/runtime-pi test` and `pnpm --filter @agent-infra/runtime-pi smoke`
- Next playground tests: `pnpm --filter playground-next-web test`
- Vite playground tests: `pnpm --filter playground-vite-web test`
- Fastify playground tests: `pnpm --filter playground-fastify-server test`
- Docs dev server: `pnpm dev:docs`

For pure documentation edits, reading the rendered Markdown and checking links is usually enough; do not run the full TypeScript suite unless the documentation change depends on code behavior.
