---
name: webgpt-todo-response
description: Use after receiving WebGPT or other LLM feedback on an agent-infra roadmap/todo and before sending the todo back for another review. Produce a concise handoff response that says what we adopted, what we reject or question, and what WebGPT should specifically re-evaluate in the todo.
---

# WebGPT Todo Response

## Purpose

Generate the message to send back to WebGPT after we have read its previous
analysis and drafted or updated `docs/todolist.md`.

Use this skill when the user asks:

- whether we have rebuttals or questions for WebGPT
- what to include when sending our todo back to WebGPT for another pass
- to prepare a response asking WebGPT to evaluate, improve, or challenge our todo
- to compare WebGPT's recommendations against our chosen implementation scope

## Inputs To Inspect

Read only the files needed for the current handoff:

- WebGPT response, usually `repomix-output/webgpt.md` or
  `repomix-output/llm/webgpt.md`
- current todo, usually `docs/todolist.md`
- relevant source-of-truth docs under `docs/source-of-truth/`
- optional other LLM replies if the user asks for a multi-model synthesis

Do not re-run broad repository analysis unless the todo or WebGPT response
depends on code facts that are unclear.

## Workflow

1. Identify WebGPT's strongest recommendations.
   - Mark which ones are adopted in the todo.
   - Mark which ones are intentionally deferred.
   - Mark which ones are rejected or need clarification.

2. Check the todo against project boundaries.
   - Shared semantics should live in `packages/*` or source-of-truth docs.
   - Playground UI should validate platform capabilities, not define them.
   - `/chat` should not become a quality-management surface.
   - Trace/timeline data must not be treated as deterministic replay logs.
   - Do not introduce shared user/org/tenant/billing models unless the task
     explicitly requires them.

3. Find weak spots in the todo.
   - Missing source-of-truth step
   - Missing data/type/interface step before UI
   - Metadata overwrite risk
   - Auth/visibility ambiguity
   - Scope creep into eval runner, experiment, exporter, prompt hub, or LLM judge
   - Missing tests or review gates
   - UI route boundary drift

4. Write a concise message for WebGPT.
   - Assume WebGPT has no hidden context beyond the attached todo and bundle.
   - Be explicit about decisions already made.
   - Ask targeted questions instead of open-ended “any thoughts?”
   - Request concrete todo edits, not generic feedback.

## Output Shape

Produce a copy-ready Markdown response with these sections:

```md
# Response To WebGPT

## What We Adopted
- ...

## Where We Differ / Pushback
- ...

## My Current Leaning
1. ...

## Highest-Value Review Points
1. ...

## Specific Questions For You
1. ...

## Please Review The Todo For
- ...

## Constraints To Preserve
- ...
```

Keep it short enough to paste into WebGPT with the todo. Prefer 5-10 specific
questions/checks over a long essay.

Use `My Current Leaning` to distinguish default decisions from genuinely open
questions. WebGPT may challenge these, but should not treat them as blank slate.

Use `Highest-Value Review Points` to focus WebGPT on the few risks most likely
to improve the todo. These should be sharper than the broader checklist.

## Good Question Patterns

- “Does this todo accidentally move product semantics into playground code?”
- “Is `metadataJson.review` sufficient for v1, or is there a concrete reason to
  add top-level columns now?”
- “Are we missing any app-layer merge guards that prevent UI from overwriting
  `capture`, `feedback`, or `host` metadata?”
- “Do the loops defer eval runner cleanly, or is eval scope leaking into review?”
- “Are the proposed tests enough to prove auth, dataset visibility, and source
  lineage boundaries?”

## Avoid

- Do not ask WebGPT to implement patches unless the user explicitly wants that.
- Do not ask WebGPT to run commands.
- Do not include local absolute paths.
- Do not send vague requests like “please improve this.”
- Do not restate the whole todo; reference it and ask for specific audit points.
