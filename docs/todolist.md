# Observability Console IA Cleanup v1 Todo

## 0. Context and Boundary

### 0.1 Confirmed facts
- [x] `/observability` is the first validation surface for agent-infra management workflows, not a `/chat` accessory.
- [x] The observability console currently lives in `apps/playground-next-web`, but it should be treated as an independent management/debug application surface that could later move to a dedicated app.
- [x] The durable product boundary remains the package layer. Shared runtime, dataset, eval, usage, and trace semantics must stay in `packages/*` when they represent platform behavior.
- [x] Existing top-level observability surfaces are `/observability`, `/observability/datasets`, and `/observability/evals`.
- [x] The current evaluation foundation already supports dataset curation, eval run creation/execution, result review, comparison assist, and local review filters.
- [x] The current product problem is information architecture and object context, not a missing eval execution primitive.
- [x] WebGPT's main recommendation is directionally accepted: do `Observability Console IA Cleanup v1` before `Eval Run Compare v1`.
- [x] `Eval Run Compare v1` should not be exposed as a top-level nav item or disabled tab during this cleanup.
- [x] Existing route paths and selected-object query params should remain stable for v1:
  - `/observability?threadId=...&runId=...`
  - `/observability/datasets?datasetId=...&exampleId=...`
  - `/observability/evals?datasetId=...&evalRunId=...&resultId=...`
- [x] Result review filters in `/observability/evals` remain local UI state and must not become URL query params or server-side filters in this track.

### 0.2 Goals
- [x] Make Runs, Datasets, and Evals feel like sections of one management console instead of three unrelated tools.
- [x] Make each detail surface answer: current object, upstream lineage, downstream links, object-scoped actions, and current review/execution state.
- [x] Normalize global, section-level, object-level, and inline action placement.
- [x] Simplify the Evals page from a four-peer-object layout into a dataset-contextual eval run review workspace.
- [x] Preserve the current durable semantics, data models, routes, query selection behavior, and review truth.
- [x] Keep the first implementation conservative: shared shell and layout primitives are allowed, but broad generic abstraction is not the goal.
- [x] Leave a clean path for future `Eval Run Compare v1` without implementing or prematurely exposing compare UI.

### 0.3 Non-goals
- [x] No DB schema changes.
- [x] No changes to eval execution semantics.
- [x] No changes to dataset eligibility semantics.
- [x] No changes to result review truth.
- [x] No persisted comparison fields or tables.
- [x] No LLM-as-judge scoring.
- [x] No eval reports, dashboards, alerts, or CI gates.
- [x] No prompt hub or prompt version management.
- [x] No assignment queues, bulk review, or multi-reviewer workflow.
- [x] No server-side filtering, sorting, or pagination for local eval review filters.
- [x] No moving durable semantics into app-only React components.
- [x] No `/chat` management workflow expansion.
- [x] No large visual redesign, marketing-style shell, or landing page.
- [x] No route migration from `/observability` to `/observability/runs` in v1.

## 1. Definitions First

### 1.1 Source of Truth
- [x] Update `docs/roadmap.md` or a lightweight console IA note to define the observability console IA boundary:
  - top-level sections are `Runs`, `Datasets`, and `Evals`
  - `/observability` is the `Runs` section
  - `/observability/datasets` is the `Datasets` section
  - `/observability/evals` is the `Evals` section
  - `Eval Run Compare v1` is a future eval workspace, not part of this track's nav
- [x] Only touch durable source-of-truth model docs when restating existing durable semantics; do not turn visual layout choices into package/model truth.
- [x] Document that this track is UI/IA cleanup over existing durable concepts, not a new durable runtime capability.
- [x] Document action placement rules:
  - global shell actions: refresh current section, logout
  - run object actions: capture selected run to dataset
  - dataset/evals context actions: create eval run
  - eval run object actions: run queued eval run
  - form object actions: save expected output, save dataset review, save eval result review
  - lineage actions: source run, dataset example, output run links
- [x] Document lineage display expectations:
  - Run detail: `Thread -> Run`
  - DatasetExample detail: `Source Run -> Dataset -> Example`
  - EvalRun detail: `Dataset -> EvalRun`
  - EvalExampleResult detail: `DatasetExample -> EvalRun -> Result -> Eval output run -> Review`
- [ ] Keep evolving IA details in this todo until stable, then promote durable rules into source-of-truth and delete this file at closeout.

### 1.2 Data Model
- [x] No new tables are needed.
- [x] No persisted selection or filter model is needed.
- [x] No new eval result comparison storage is needed.
- [x] No new dataset, eval run, or review fields are needed.
- [x] Verify during implementation that all new UI state is derived from existing DTOs or local-only view state.

### 1.3 Types / Interfaces
- [x] Add only lightweight React layout/view types needed by the console shell and page composition.
- [x] Do not add new package-level interfaces unless implementation reveals reusable cross-consumer semantics.
- [x] Do not introduce a generic `ObjectConsole<T>` or similar broad abstraction in v1.
- [x] Shared components should accept display items, React nodes, strings, and slots rather than domain DTOs such as `DatasetExampleDto` or `EvalRunDto`.
- [x] Prefer explicit page-specific composition over premature generic layout machinery.

## 2. Backend / Platform

- [x] No `packages/core` changes planned.
- [x] No `packages/db` changes planned.
- [x] No `packages/contracts` changes planned.
- [x] No eval execution route changes planned.
- [x] No dataset route changes planned.
- [x] No run observability route changes planned.
- [x] Keep an eye out for accidental package semantic drift while editing UI copy and client usage.

## 3. Frontend Boundary

### 3.1 Shared Console Shell
- [x] Add a shared observability console shell under `apps/playground-next-web/features/observability/components`.
- [x] Add a left section nav with `Runs`, `Datasets`, and `Evals`.
- [x] Add a top/header area that can show section title, object context, refresh, current actor, and logout.
- [x] Keep page-specific data loading and mutations in the existing runtime/hooks.
- [x] Avoid moving dataset/eval/run semantics into the shell.

### 3.2 Runs Section
- [x] Display `/observability` as `Runs` in the console nav and page header.
- [x] Preserve existing thread/run selection query behavior.
- [x] Add or normalize `Thread -> Run` context in the selected run detail.
- [x] Move or present `Capture to dataset` as a selected-run scoped action.
- [x] Preserve existing run timeline, trace/usage, capture dialog, and source behavior.

### 3.3 Datasets Section
- [x] Display `/observability/datasets` as `Datasets` in the console nav and page header.
- [x] Preserve existing dataset/example selection query behavior.
- [x] Add or normalize `Source Run -> Dataset -> Example` context in example detail.
- [x] Preserve source-unavailable behavior: captured snapshots and review remain usable.
- [x] Keep expected-output save and dataset review save near their forms.
- [x] Keep source run and eval links as lineage navigation rather than primary submit actions.

### 3.4 Evals Section
- [x] Display `/observability/evals` as `Evals` in the console nav and page header.
- [x] Preserve existing `datasetId`, `evalRunId`, and `resultId` query behavior.
- [x] Keep Evals tied to selected dataset context.
- [x] Move away from a four-peer-column layout.
- [x] Make the main Evals workspace `dataset context + eval run list + eval run review workspace`.
- [x] Use a header/context dataset selector for Evals v1; do not keep dataset selection as a full peer column or introduce a collapsible dataset rail in this track.
- [x] Place `Create eval run` near the selected dataset context or in an EvalRun list header that explicitly says it is for the selected dataset.
- [x] Put eval run summary and local review filters inside the selected eval run workspace.
- [x] Keep results list and result detail as internal parts of the selected eval run workspace.
- [x] Place `Run eval` in the selected EvalRun workspace/detail header, not in the global page header or result list header.
- [x] Keep Comparison Assist inside result detail and do not promote it to a Compare tab.
- [x] Keep filter state local and out of URL.
- [x] Preserve review save behavior that refetches the selected eval run summary.

### 3.5 Shared States and Copy
- [ ] Add only the shared empty/loading/error primitives that reduce obvious duplication.
- [ ] Use local panel-level loading/error states where possible instead of blocking the whole console.
- [ ] Make empty states state the next available action.
- [x] Make output run copy clear with wording like `Eval output run`, `execution artifact`, and `not shown in normal chat threads`.
- [x] Ensure review status remains visually and semantically higher than Comparison Assist.
- [x] Avoid terms like `auto pass`, `auto fail`, `grade`, or any copy implying comparison assist is review truth.

## 4. Tests

- [x] Update or add tests proving the shared shell renders the correct active section for Runs, Datasets, and Evals.
- [x] Update Runs tests for the new heading/action placement without changing run query semantics.
- [x] Update Datasets tests proving dataset/example detail remains independent of `/observability` run query state.
- [x] Update Datasets tests proving source unavailable does not block captured snapshot review/editing.
- [x] Update Evals tests proving eval page remains independent of `threadId`/`runId` query state.
- [x] Update Evals tests proving filter state remains local and does not write URL params.
- [x] Update Evals tests proving review save still refreshes selected eval run summary.
- [x] Avoid tests that overfit old layout copy, column order, button index, or exact CSS grid shape.
- [ ] Add browser smoke coverage for `/observability`, `/observability/datasets`, and `/observability/evals`.
- [x] Run targeted app tests before each code-review checkpoint.
- [ ] Run `pnpm --filter playground-next-web typecheck` before final closeout.
- [ ] Run broader workspace verification if shared package files are touched unexpectedly.

## 5. Recommended Execution Order

### Loop 1 — Roadmap/source-of-truth IA boundary note
- [x] Update `docs/roadmap.md` or a lightweight console IA note with the accepted UI IA boundary and non-goals.
- [x] Only touch source-of-truth model docs when restating existing durable semantics.
- [x] Record that `Eval Run Compare v1` is deferred until after IA cleanup.
- [x] Record that v1 keeps existing routes and selected-object query params.
- [x] Run a docs-focused verification check by reading the updated section for duplicate or conflicting truth.
- [x] run `codex review` for this loop after targeted verification passes.
  - Review reported only unrelated untracked `.codex/skills/ui-ux-pro-max` findings; no Loop 1 roadmap/todo findings.
- [x] Commit the source-of-truth IA note.

### Loop 2 — Shared console shell without page re-layout
- [x] Add the minimal shared observability console shell.
- [x] Add the left nav with `Runs`, `Datasets`, and `Evals`.
- [x] Wrap `/observability`, `/observability/datasets`, and `/observability/evals` in the shared shell.
- [x] Normalize current actor, logout, and refresh placement through shell slots.
- [x] Preserve each page's existing internal layout and data behavior.
- [x] Add or update shell/nav tests.
- [x] Run targeted `playground-next-web` tests for affected components.
- [x] Run `pnpm --filter playground-next-web typecheck`.
- [x] run `codex review` for this loop after targeted verification passes.
- [x] Commit the shared shell slice.

### Loop 3 — Object context and action placement
- [x] If this loop becomes hard to review across all three sections, split it into `3a Runs`, `3b Datasets`, and `3c Evals`.
- [x] Add lightweight object context/breadcrumb components without introducing generic object-console abstractions.
- [x] Runs: show `Thread -> Run` context and keep capture as a selected-run action.
- [x] Datasets: show `Source Run -> Dataset -> Example` context and preserve source-unavailable behavior.
- [x] Evals: show `Dataset -> EvalRun` context and move `Run eval` to selected EvalRun context.
- [x] Keep save actions close to their forms.
- [x] Keep lineage links visually separate from primary submit actions.
- [x] Update affected UI tests for copy/action placement.
- [x] Run targeted `playground-next-web` tests for Runs, Datasets, and Evals.
- [x] Run `pnpm --filter playground-next-web typecheck`.
- [x] run `codex review` for this loop after targeted verification passes.
- [x] Commit the object context/action placement slice.

### Loop 4 — Evals workspace simplification
- [x] If this loop becomes a broad rewrite of `EvalConsole`, split it into dataset selector/context plus EvalRun list first, then EvalRun review workspace second.
- [x] Refactor `/observability/evals` from four peer columns into `dataset context + eval run list + eval run review workspace`.
- [x] Keep dataset selection available as a header/context control without making dataset list a full peer column or collapsible rail.
- [x] Place eval run summary, local filters, results list, and result detail inside the selected eval run workspace.
- [x] Place `Create eval run` near selected dataset context and `Run eval` near selected EvalRun context.
- [x] Keep Comparison Assist inside result detail.
- [x] Do not introduce a Compare tab, disabled Compare tab, or Compare nav item.
- [x] Preserve `datasetId`, `evalRunId`, and `resultId` selection behavior.
- [x] Preserve local-only filter state.
- [x] Preserve review save summary refresh.
- [x] Update Evals tests for layout, query behavior, filters, and summary refresh.
- [x] Run targeted Evals component tests.
- [x] Run `pnpm --filter playground-next-web typecheck`.
- [x] run `codex review` for this loop after targeted verification passes.
- [ ] Commit the Evals workspace simplification slice.

### Loop 5 — Shared states, browser smoke, and closeout
- [ ] Add or normalize only necessary empty/loading/error primitives.
- [ ] Harden copy around source unavailable, output run artifacts, review truth, and comparison assist.
- [ ] Run full relevant `playground-next-web` tests.
- [ ] Run `pnpm --filter playground-next-web typecheck`.
- [ ] Run browser smoke for:
  - `/observability`
  - `/observability/datasets`
  - `/observability/evals`
- [ ] Confirm no unexpected package, contract, DB, or route semantic changes.
- [ ] Promote stable IA facts from this todo into source-of-truth if they are not already there.
- [ ] Delete `docs/todolist.md` after stable facts are promoted and all work is complete.
- [ ] run `codex review` for this loop after targeted verification passes.
- [ ] Commit the closeout slice.

## 6. WebGPT Follow-up Questions

- [ ] Ask WebGPT whether the loop boundaries are conservative enough, especially splitting shared shell, object context, and Evals layout into separate reviewable slices.
- [ ] Ask WebGPT whether keeping `/observability/evals` as one route remains correct after the proposed Evals workspace simplification.
- [ ] Ask WebGPT whether dataset selection should be a compact selector, a collapsible rail, or a page header context in Evals v1.
- [ ] Ask WebGPT to challenge any part of the todo that accidentally turns UI layout cleanup into durable model or package API changes.
- [ ] Ask WebGPT to identify the smallest useful acceptance checklist for browser smoke so the IA cleanup does not drift into broad visual redesign.
