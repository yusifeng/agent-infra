# Playground Web Guidelines

This file adds `apps/playground-web`-specific guidance on top of the repository-level [`AGENTS.md`](/Users/david/Documents/github/agent-infra/AGENTS.md).

## Role In The Repository

`playground-web` is the first consumer and validation surface for `agent-infra`.
It is important, but it is not the product boundary and it must not become the main home for durable runtime or business complexity.

- Use this app to exercise package APIs, runtime behavior, streaming UX, and observability flows.
- Prefer moving reusable behavior into `packages/*` when it reflects a real platform capability.
- If a change would lose most of its value when `playground-web` is removed, treat it as lower priority than package-layer work.

## Application Feature Layering

For non-trivial application features in this app, prefer feature-local layering instead of page-local sprawl.

Default layers:

1. `types`
2. `schema`
3. `repo`
4. `service`
5. `runtime`
6. `ui`

`config` is optional.
Do not create an empty `config` layer unless the feature has real app-level policy knobs or strategy constants.

## Layer Responsibilities

- `types`: app-local feature types and view models
- `schema`: parsing and validation for unknown or external shapes
- `repo`: HTTP, SSE, storage, and other boundary access
- `service`: pure merge, derivation, and decision logic
- `runtime`: orchestration, side effects, and state transitions
- `ui`: rendering and interaction binding

## Dependency Direction

Application feature code should depend downward only:

- `types` -> `types`
- `schema` -> `types`, `schema`
- `repo` -> `types`, `schema`, `repo`
- `service` -> `types`, `schema`, `repo`, `service`
- `runtime` -> `types`, `schema`, `repo`, `service`, `runtime`
- `ui` -> `types`, `schema`, `repo`, `service`, `runtime`, `ui`

## What Should Stay Thin

Pages, layouts, and route handlers should stay thin.

- `page.tsx` should mostly bind route params and render a feature entry point.
- `route.ts` should mostly bind HTTP semantics, call lower layers, and return responses.
- Do not let one large client component become the implicit state machine for the whole feature if the behavior is already non-trivial.

## Boundary Rules

- `ui` should not directly parse unknown JSON, SSE payloads, URL payloads, or local storage payloads.
- `ui` should not directly own complex fetch, stream, or persistence orchestration.
- `repo` should own boundary access, but should not absorb business rules that belong in `service`.
- `runtime` should coordinate effects and state transitions, but should reuse `service` for pure logic.
- Durable or reusable logic discovered in this app should be pushed down into `packages/*` when it is clearly a platform concern.

## Current Hotspot

The current place where this guidance matters most is the durable chat surface.
That feature already has enough streaming, recovery, and inspector complexity to justify feature-local `types / schema / repo / service / runtime / ui` separation.

In the current app shape:

- `components/chat-shell/*` may continue to exist as the presentational UI layer.
- feature-local `schema / repo / service / runtime / types` should absorb the non-trivial durable chat logic.
- prefer local reducer state plus pure `service` helpers before considering any external state-management library.

## Verification

For changes in this app, prefer the narrowest useful verification loop:

- `pnpm --filter playground-web typecheck`
- `pnpm --filter playground-web build`

If behavior, UX state transitions, route semantics, or feature boundaries change, update the relevant docs in the same work loop.
