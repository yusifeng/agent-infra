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

## Full todo execution mode

When the user explicitly asks to execute the whole todo, for example:

- "按照 loop-workflow skill 开始执行吧，一直运行到所有的 [] 都变成 [x]"
- "run the todo until everything is checked off"
- "complete all loops in docs/todolist.md"

then the workflow changes from "one loop item and stop" to "continue loop-by-loop until the todo is complete".

Rules:

1. Use `docs/todolist.md` as the execution source.
   - Work from top to bottom.
   - Keep checkbox state current as each item is completed.
   - Do not mark an item `[x]` until it is actually done and verified.

2. Execute one meaningful loop at a time.
   - Finish that loop's implementation, targeted verification, `codex review`, and commit handling before moving to the next loop.
   - After a clean review and commit, immediately continue to the next unchecked loop item instead of stopping.

3. Continue until completion.
   - Stop only when every applicable `[ ]` item in `docs/todolist.md` is `[x]`, or when a real blocker prevents safe progress.
   - If an item becomes intentionally not applicable, update the todo text to record that decision instead of silently skipping it.

4. Preserve normal review and commit discipline.
   - Keep one concern per commit unless the user explicitly requests batching.
   - Run the repository's review profile for each meaningful code-change loop.
   - Do not accumulate multiple implementation loops into one unreviewed diff.

5. Final response for full todo execution.
   - Summarize completed loops.
   - State verification and review outcomes.
   - Mention any items left unchecked and why; if none remain, say the todo is fully checked off.
