# Repository Guidelines

## Project Structure & Module Organization

This repository is a `pnpm` workspace with consumer apps, durable backend packages, and internal/public documentation.

- `apps/docs`: deployable official documentation site with locale-aware MDX content.
- `apps/playground-next-web`: Next.js 15 reference consumer and durable runtime console.
- `apps/playground-vite-web`: Vite browser consumer for validating non-Next frontend adoption.
- `apps/playground-fastify-server`: Fastify server host for validating non-Next route/runtime adoption.
- `packages/app`: application/use-case boundary for thread and turn orchestration.
- `packages/core`: durable runtime domain types and repository interfaces.
- `packages/contracts`: serialized request/response contracts for browser and HTTP consumers.
- `packages/durable-chat-client`: browser-side durable chat transport, schemas, runtime helpers, and inspector primitives.
- `packages/durable-chat-server`: reusable server bootstrap, route helpers, DTO/error helpers, and stream hub primitives.
- `packages/db`: Drizzle-based SQLite/PostgreSQL repositories and schema.
- `packages/runtime-pi`: server-side Pi runtime adapter and smoke harness.
- `packages/shared`: small shared utilities.
- `roadmap.md`: root-level project file index and boundary guide; use it to orient around major files and where work should land.
- `docs`: internal architecture, roadmap, runbooks, and working notes.
- `docs/source-of-truth`: durable concept-model docs that should be treated as the single source of truth for shared frontend/runtime facts.
- `.codex/skills`: local agent workflow helpers; treat these as tooling, not app code.

## Product Boundary

`agent-infra` is durable backend infrastructure for agent runtimes, plus reference consumers that prove the contracts work in real hosts. The main product boundary is the package layer, not any one playground app.

`apps/playground-next-web` is the first consumer, experiment harness, and validation surface for `agent-infra`. It is important because some platform capabilities must be exercised and visualized through a UI, but it is **not** the product boundary and must not become the main place where business/runtime complexity accumulates.

- Use `playground-next-web` to validate package APIs, durable runtime behavior, and observability flows.
- Use `playground-vite-web` and `playground-fastify-server` to prove shared frontend/server contracts outside Next.js.
- Prefer pushing reusable behavior into `packages/*` when it represents a real platform capability.
- Do not introduce page-local abstractions or UX-only state machinery unless it is clearly required to expose or validate a core capability.
- If a change would lose most of its value when a playground app is removed, treat it as lower priority than core/runtime/contracts/db/client/server work.
- Page work should follow the platform, not define it: consumers may help discover the right interfaces, but web-demo needs must not drive the system goal.

### Observability Console Boundary

The observability surface may currently live under `apps/playground-next-web`, but it should be treated as an independent management/debug application surface rather than a chat-page accessory or playground-only product feature.

- Treat `/observability` as the first validation surface for agent-infra management workflows: run inspection, timeline/trace review, usage review, feedback review, dataset capture, and future evaluation/experiment views.
- Keep `/chat` focused on end-user conversation and lightweight immediate feedback; do not make it the primary home for run curation, dataset management, evaluation, or observability workflows.
- Reusable observability, dataset, evaluation, experiment, usage, and trace capabilities should live in `packages/*` when they represent platform behavior. The Next.js observability UI should consume those package APIs rather than define the durable model locally.
- Host-specific details, such as playground-only feedback reason labels or local auth/session behavior, may remain app-owned sidecar state, but they must not become shared runtime facts unless a cross-consumer contract is intentionally designed.
- When adding management UI under `apps/playground-next-web`, design it so the surface could later move to a dedicated app without changing the shared core/app/contracts/db/client/server model.

## Engineering Working Style

Bias toward cautious, minimal, verifiable changes, especially for non-trivial tasks.

- Surface assumptions, ambiguity, and tradeoffs before coding; do not silently choose between multiple plausible interpretations.
- Prefer the simplest implementation that fully solves the request. Do not add speculative abstractions, configurability, or handling for scenarios that are not part of the task.
- Keep edits surgical: touch only lines that directly serve the request, match the surrounding style, and avoid unrelated refactors or cleanup.
- Remove only the imports, variables, functions, or comments made obsolete by your own changes. Mention unrelated dead code separately instead of deleting it opportunistically.
- Turn requests into explicit success criteria whenever possible, then verify them. For bug fixes, prefer reproducing the issue with a test first; for behavior changes, run the narrowest command that proves the change works.
- For multi-step work, keep a short plan with concrete verification points so progress and correctness stay easy to evaluate.
- Use root [`roadmap.md`](/Users/david/Documents/github/agent-infra/roadmap.md) as the first file-orientation index when deciding where existing code lives or where new work should land.
- When a concept model or long-lived behavioral fact already exists under `docs/source-of-truth`, align with that document first and update it instead of creating a parallel “truth” in another note.

## Build, Test, and Development Commands

Use `pnpm` from the repository root:

- `pnpm dev`: starts `apps/playground-next-web` in local development.
- `pnpm dev:next-web`: starts `apps/playground-next-web`.
- `pnpm dev:vite-web`: starts `apps/playground-vite-web`.
- `pnpm dev:fastify-server`: starts `apps/playground-fastify-server`.
- `pnpm dev:docs`: starts `apps/docs`.
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
- In `apps/*`, keep non-trivial feature code in explicit feature layers such as `types`, `schema`, `repo`, `service`, `runtime`, and `ui/components`; pages and route handlers should stay thin composition roots.

## Testing Guidelines

Vitest is used in package-level tests under `packages/*/test`.

- Name tests `*.test.ts`.
- Add focused repository/runtime tests beside the package they cover.
- Run targeted tests with commands such as `pnpm --filter @agent-infra/db test` or `pnpm --filter @agent-infra/runtime-pi test`.
- Preserve coverage around persistence ordering, run events, and provider-selection flows when changing runtime behavior.
- For consumer changes, prefer the matching app filter, such as `pnpm --filter playground-next-web test`, `pnpm --filter playground-vite-web test`, or `pnpm --filter playground-fastify-server test`.

## Commit & Pull Request Guidelines

Recent history favors short, imperative commit subjects, for example `Add Pi Narrow API routes...` or `Fix db index export collision...`.

- Start commit messages with a verb and keep the first line concise.
- In PRs, describe the affected workspace package(s), note schema or env changes, and link related issues.
- Include screenshots for UI changes in `apps/playground-next-web`, `apps/playground-vite-web`, or `apps/docs`.
- When behavior, routes, or user-facing workflows change, update the relevant docs/README/architecture notes in the same work loop.

## Security & Configuration Tips

- Copy `apps/playground-next-web/.env.example` to `.env.local` for local app setup.
- Do not commit API keys or local database files.
- `runtime-pi` smoke runs may use `DEEPSEEK_API_KEY`, `OPENAI_API_KEY`, `OPENAI_MODEL`, `SQLITE_PATH`, or `DATABASE_URL`.
- Playground hosts may also use local `.env` files and local SQLite files; keep those machine-local unless a checked-in example file is explicitly intended.


### Review Profile (Single Source of Truth)

- Review command: `codex review --uncommitted -c model="gpt-5.5" -c model_reasoning_effort="medium"`
- Tool-call timeout for review: `timeout_ms >= 1200000`
- Apply this profile everywhere (skills/plans/docs). Do not redefine model/reasoning/timeout in other files.
- For multi-loop implementation work, run `codex review` at the end of each meaningful functional slice instead of waiting for the entire todo to be finished.
- A meaningful slice should usually map to one bounded feature area, such as schema/bootstrap, one route/service cluster, or one frontend flow.
- Do not defer review until a large cross-cutting diff has accumulated, but also do not run review for every tiny 1-2 file micro-edit when the slice is still incomplete.
- After a clean slice-level review and passing targeted verification, commit that slice immediately by default.
- Do not keep accumulating additional implementation work in the same uncommitted diff after review unless the user explicitly asks to batch multiple loop items together.

- **Commit workflow (when user says “commit”)**: assume the user already ran `git add`. Do:
  - `git status --short` and `git diff --cached` (or `git diff --cached --stat`)
  - Generate a Conventional Commit message: `type(scope): summary` (≤72 chars, imperative)
  - Run `git commit -m "<message>"`
