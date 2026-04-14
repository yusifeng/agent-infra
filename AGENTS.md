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

## Product Boundary

`apps/playground-web` is the first consumer, experiment harness, and validation surface for `agent-infra`. It is important because some platform capabilities must be exercised and visualized through a UI, but it is **not** the product boundary and must not become the main place where business/runtime complexity accumulates.

- Use `playground-web` to validate package APIs, durable runtime behavior, and observability flows.
- Prefer pushing reusable behavior into `packages/*` when it represents a real platform capability.
- Do not introduce page-local abstractions or UX-only state machinery unless it is clearly required to expose or validate a core capability.
- If a change would lose most of its value when `playground-web` is removed, treat it as lower priority than core/runtime/contracts/db work.
- Page work should follow the platform, not define it: consumers may help discover the right interfaces, but web-demo needs must not drive the system goal.

## Engineering Working Style

Bias toward cautious, minimal, verifiable changes, especially for non-trivial tasks.

- Surface assumptions, ambiguity, and tradeoffs before coding; do not silently choose between multiple plausible interpretations.
- Prefer the simplest implementation that fully solves the request. Do not add speculative abstractions, configurability, or handling for scenarios that are not part of the task.
- Keep edits surgical: touch only lines that directly serve the request, match the surrounding style, and avoid unrelated refactors or cleanup.
- Remove only the imports, variables, functions, or comments made obsolete by your own changes. Mention unrelated dead code separately instead of deleting it opportunistically.
- Turn requests into explicit success criteria whenever possible, then verify them. For bug fixes, prefer reproducing the issue with a test first; for behavior changes, run the narrowest command that proves the change works.
- For multi-step work, keep a short plan with concrete verification points so progress and correctness stay easy to evaluate.

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
- When behavior, routes, or user-facing workflows change, update the relevant docs/README/architecture notes in the same work loop.

## Security & Configuration Tips

- Copy `apps/playground-web/.env.example` to `.env.local` for local app setup.
- Do not commit API keys or local database files.
- `runtime-pi` smoke runs may use `DEEPSEEK_API_KEY`, `OPENAI_API_KEY`, `OPENAI_MODEL`, `SQLITE_PATH`, or `DATABASE_URL`.


### Review Profile (Single Source of Truth)

- Review command: `codex review --uncommitted -c model="gpt-5.3-codex" -c model_reasoning_effort="medium"`
- Tool-call timeout for review: `timeout_ms >= 1200000`
- Apply this profile everywhere (skills/plans/docs). Do not redefine model/reasoning/timeout in other files.

- **Commit workflow (when user says “commit”)**: assume the user already ran `git add`. Do:
  - `git status --short` and `git diff --cached` (or `git diff --cached --stat`)
  - Generate a Conventional Commit message: `type(scope): summary` (≤72 chars, imperative)
  - Run `git commit -m "<message>"`
