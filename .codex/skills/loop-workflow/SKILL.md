---
name: loop-workflow
description: "Use when implementing or reviewing changes in this repository and you need a strict, repeatable local development loop: align with repo docs, execute one mainline task at a time, run pnpm-based targeted verification, run codex review for code changes, and prepare clean commits/PR context."
---

# Loop Workflow

## Scope

Use this workflow for day-to-day implementation in this repository.
Apply it to changes across:

- `apps/playground-web`
- `packages/core`
- `packages/contracts`
- `packages/db`
- `packages/runtime-pi`
- `packages/shared`

Operate from repository root and use `pnpm` workspace commands.

## Mandatory alignment before coding

1. Read constraints in:
   - `AGENTS.md`
   - relevant docs under `docs/`
2. Confirm affected package boundaries and interfaces before editing.
3. Keep one mainline objective.
   - Park side ideas in docs/notes instead of scope hopping.

## Default development loop

1. Pick one task and define acceptance
   - State expected behavior and where it is verified.

2. Update docs first when behavior or constraints change
   - Keep architecture and runtime expectations synchronized with code changes.

3. Add or update the smallest useful tests
   - Prefer focused tests near changed package behavior (`packages/*/test`).

4. Implement minimal reversible diff
   - Avoid unrelated formatting churn or cross-package drift.

5. Run targeted verification
   - Global strict check when needed: `pnpm typecheck`
   - Package tests: `pnpm --filter <package> test`
   - DB flows:
     - `pnpm --filter @agent-infra/db db:generate` (when schema changes)
     - `pnpm --filter @agent-infra/db db:migrate` (when migration apply is required)
   - Runtime smoke:
     - `pnpm --filter @agent-infra/runtime-pi smoke` (when runtime adapter/repository behavior is touched)
   - Full workspace tests only when risk requires: `pnpm test`

6. Run codex review gate for code changes
   - Execute before staging/commit:
   - `codex review --uncommitted -c model="gpt-5.3-codex" -c model_reasoning_effort="medium"`
   - Use tool timeout `>= 1200000` ms.
   - Skip only for pure docs-only changes unless explicitly requested.
   - If review is clean, do not keep accumulating unrelated work in the same local diff.
   - Default behavior after a clean review is to commit the current loop item immediately.
   - Only defer the commit if the user explicitly asks to keep batching multiple loop items together.

7. Pre-commit gate
   - Check scope: `git status --short`
   - Review staged diff: `git diff --cached --stat` (or full `git diff --cached`)
   - Ensure docs are updated when behavior changed.

8. Commit and PR hygiene
   - Keep one concern per commit.
   - Use imperative subject.
   - In normal loop execution, a clean review should transition directly into commit, not into another implementation item.
   - When user asks to commit, generate Conventional Commit format:
     - `type(scope): summary`
     - max 72 chars, imperative.

## Guardrails

- Use `pnpm` only for package and task execution.
- Keep edits localized to affected package boundaries.
- Prefer explicit exports and strict TypeScript-safe changes.
- Do not commit secrets, local DB files, or `.env.local`.
- For risky runtime changes, prefer log/evidence-backed diagnosis before adding abstractions.

## Quick command reference

See `references/command-matrix.md` for command mapping by change type.

## Done criteria for one loop item

- Task acceptance is explicit and validated.
- Relevant checks/tests for touched packages passed.
- Docs are synchronized with behavior changes.
- Diff is focused and reviewable.
- If review was required and came back clean, the loop item is committed before starting the next item unless the user explicitly asks otherwise.
