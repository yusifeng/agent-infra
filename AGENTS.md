# Repository Guidelines

## Project Structure & Module Organization

This repository is a `pnpm` workspace with one app and several shared packages.

- `apps/playground-web`: Next.js 15 browser-local experiment harness.
- `packages/core`: durable runtime domain types and repository interfaces.
- `packages/contracts`: shared contract exports built on `core`.
- `packages/db`: Drizzle-based SQLite/PostgreSQL repositories and schema.
- `packages/runtime-pi`: server-side Pi runtime adapter and smoke harness.
- `packages/shared`: small shared utilities.
- `docs`: architecture and roadmap notes.
- `.codex/skills`: local agent workflow helpers; treat these as tooling, not app code.

## Build, Test, and Development Commands

Use `pnpm` from the repository root:

- `pnpm dev`: starts `apps/playground-web` in local development.
- `pnpm build`: builds every workspace package.
- `pnpm typecheck`: builds dependency packages, then runs strict TypeScript checks across the workspace.
- `pnpm test`: runs package tests where a `test` script exists.
- `pnpm --filter @agent-infra/db db:generate`: generates Drizzle migrations.
- `pnpm --filter @agent-infra/db db:migrate`: applies DB migrations.
- `pnpm --filter @agent-infra/runtime-pi smoke`: runs the runtime smoke pass against SQLite by default.

## Coding Style & Naming Conventions

The codebase is TypeScript-first, ESM-only, and `strict` mode is enabled in [`tsconfig.base.json`](/Users/david/Documents/github/agent-infra/tsconfig.base.json).

- Follow the existing style: 2-space indentation, single quotes, and semicolons.
- Prefer explicit named exports for package entry points such as `src/index.ts`.
- Keep package names under `@agent-infra/*`.
- Match existing file patterns: `page.tsx` and `route.ts` in Next app routes, descriptive kebab-case directories, and PascalCase only for React component identifiers.

## Testing Guidelines

Vitest is used in package-level tests under `packages/*/test`.

- Name tests `*.test.ts`.
- Add focused repository/runtime tests beside the package they cover.
- Run targeted tests with commands such as `pnpm --filter @agent-infra/db test` or `pnpm --filter @agent-infra/runtime-pi test`.
- Preserve coverage around persistence ordering, run events, and provider-selection flows when changing runtime behavior.

## Commit & Pull Request Guidelines

Recent history favors short, imperative commit subjects, for example `Add Pi Narrow API routes...` or `Fix db index export collision...`.

- Start commit messages with a verb and keep the first line concise.
- In PRs, describe the affected workspace package(s), note schema or env changes, and link related issues.
- Include screenshots only for `apps/playground-web` UI changes.

## Security & Configuration Tips

- Copy `apps/playground-web/.env.example` to `.env.local` for local app setup.
- Do not commit API keys or local database files.
- `runtime-pi` smoke runs may use `DEEPSEEK_API_KEY`, `OPENAI_API_KEY`, `OPENAI_MODEL`, `SQLITE_PATH`, or `DATABASE_URL`.
