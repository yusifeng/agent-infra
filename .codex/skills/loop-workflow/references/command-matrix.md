# Command Matrix

Use from repository root.

## Baseline

- Install deps: `pnpm install`
- Start app dev server: `pnpm dev`
- Build workspace: `pnpm build`
- Type check workspace: `pnpm typecheck`
- Run all tests where available: `pnpm test`

## Package-targeted checks

- DB package tests: `pnpm --filter @agent-infra/db test`
- Runtime Pi tests: `pnpm --filter @agent-infra/runtime-pi test`
- Runtime smoke pass: `pnpm --filter @agent-infra/runtime-pi smoke`

## DB lifecycle

- Generate migration files: `pnpm --filter @agent-infra/db db:generate`
- Apply migrations: `pnpm --filter @agent-infra/db db:migrate`

## Review gate

- `codex review --uncommitted -c model="gpt-5.3-codex" -c model_reasoning_effort="medium"`
- Require tool timeout `>= 1200000` ms.

## Commit hygiene

- Check status: `git status --short`
- Review staged summary: `git diff --cached --stat`
- Review staged full diff: `git diff --cached`
