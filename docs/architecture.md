# agent-infra v0.1 Architecture

## Project goal

`agent-infra` focuses on durable backend infrastructure for agent runtimes, not a full chat product.

## Layers

- `apps/docs`: deployable official documentation site for public concepts, guides, and reference, with locale-aware docs routes.
- `packages/app`: narrow application boundary that orchestrates durable thread and turn flows.
- `packages/core`: domain types and repository interfaces only.
- `packages/contracts`: serialized request/response contracts for transport consumers.
- `packages/db`: Drizzle schema plus SQLite / PostgreSQL repository implementations.
- `packages/runtime-pi`: pi-agent-core adapter that translates runtime events into durable records.
- `apps/playground-web`: first consumer of `agent-infra`, with browser-local experiments plus a chat-first runtime validation surface that keeps durable inspection as a secondary pane.

## Consumer boundary

`playground-web` is intentionally treated as the first consumer of `agent-infra`, not the place where orchestration rules live.
The intended flow is:

- `packages/app` owns thread and turn use cases.
- `packages/runtime-pi` owns runtime execution and event persistence.
- `packages/contracts` owns serialized HTTP/browser shapes.
- `playground-web` calls the app layer and renders the resulting contracts.

## Application Feature Layering

Application-specific feature complexity in `apps/*` should be kept inside explicit feature boundaries instead of accumulating in pages, route handlers, or one large client component.

This rule applies to consumer or application code in `apps/*`.
It does **not** require `packages/*` to adopt the same directory structure, because the package split already expresses the main platform boundaries.

Use feature layering when an app feature has both:

- non-trivial runtime or side-effect orchestration
- both boundary access and UI rendering concerns

Simple static pages, thin route files, and purely presentational components do not need the full structure.

### Minimal layers

The default feature layering for `apps/*` is:

1. `types`
2. `schema`
3. `repo`
4. `service`
5. `runtime`
6. `ui`

`config` is optional.
Do not create an empty `config` layer unless the feature has real application-level policy knobs, thresholds, or strategy constants to hold there.

### Layer roles

- `types`: application-local feature types and view models
- `schema`: parsing and validation for unknown or external shapes
- `repo`: boundary access such as HTTP, SSE, storage, and other external reads/writes
- `service`: pure business or state-transition logic
- `runtime`: orchestration, side effects, and state-machine coordination
- `ui`: rendering and interaction binding

### Dependency direction

Dependencies should point downward only:

- `types` -> `types`
- `schema` -> `types`, `schema`
- `repo` -> `types`, `schema`, `repo`
- `service` -> `types`, `schema`, `repo`, `service`
- `runtime` -> `types`, `schema`, `repo`, `service`, `runtime`
- `ui` -> `types`, `schema`, `repo`, `service`, `runtime`, `ui`

This is a code-organization rule for application features, not a requirement to create framework-enforced import checks immediately.

### Boundary rules

- `ui` should not directly parse unknown JSON, SSE payloads, URL payloads, or storage payloads.
- `ui` should not directly own complex fetch, stream, or persistence orchestration.
- `runtime` should coordinate effects and state transitions, but should reuse `service` for pure merge and decision logic.
- `repo` should own boundary access, but should not absorb application decision rules that belong in `service`.
- Lasting application complexity should move into `schema / repo / service / runtime`, not back into page components.

### Composition roots

Pages, layouts, and route handlers should stay thin and act as composition roots or framework entry points.

In practice, this means:

- pages bind route params and render a feature entry component
- route handlers bind HTTP semantics and call into lower layers
- feature runtimes assemble the concrete repo/service behavior needed by the UI

### Current target

For `apps/playground-web`, this rule is most relevant to the durable chat surface.
That surface already has enough runtime and boundary complexity to justify feature-local `types / schema / repo / service / runtime / ui` separation inside the app.

## Why `thread` instead of `session`

`thread` maps better to a durable conversation timeline that can contain many runs and messages over time.

## Why message is split into parts

`message_part` enables mixed content in one message: text, tool-call, tool-result, reasoning, and structured data.
This keeps the model output and tool execution trace extensible.

## Why `run_events`

`run_events` is the append-only event log for a run. It preserves runtime lifecycle truth even when durable projections stay intentionally compact.

## v0.1 scope

- thread / run / message / message_part / tool_invocation / run_event persistence
- app-layer use cases for thread creation, listing, message reads, and text turns
- browser-local `playground-web` experiment plus a chat-first runtime validation surface with durable inspection
- initial SSE transport for live run observation, with durable timeline endpoints kept as the source of truth
- one server-side runtime adapter mainline: `runtime-pi`

## Evolution

- grow `apps/docs` into the public package and architecture reference
- harden the app boundary and transaction semantics
- expand streaming and resume-safe run state transitions beyond the initial SSE transport
- complete artifact lifecycle and file storage integrations
- add memory interfaces above conversation history

## Docs Hygiene

`docs/` should prefer durable reference material over completed execution checklists.

Keep long-lived documents such as:

- architecture and boundary definitions
- roadmap and closeout documents
- observability or contract references
- active backlogs that still shape prioritization
- manuals and onboarding material

Treat task checklists and rollout TODOs as temporary working docs:

- create them when they help execute a bounded change
- merge lasting conclusions into architecture, closeout, or reference docs
- delete them once the work is complete and their content has been absorbed elsewhere
