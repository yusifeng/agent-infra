# Repository Guidelines

## Project Structure & Module Organization

This repository is a single Vite + React + TypeScript app. Source lives under `src/`:

- `src/main.tsx` boots the app and `src/App.tsx` wires top-level routes.
- `src/features/durable-chat/` contains the main product area, split into `components/`, `runtime/`, `service/`, `repo/`, `schema/`, and `types/`.
- `src/components/ui/` holds reusable UI primitives.
- `src/lib/` contains small shared helpers.
- `src/dev/` contains local diagnostics and developer-only utilities.
- Tests live beside the code they cover as `*.test.ts` or `*.test.tsx`.

## Build, Test, and Development Commands

Use `pnpm` from this directory:

- `pnpm dev` - start the Vite dev server.
- `pnpm build` - type-check and build production assets.
- `pnpm lint` - run ESLint across the repo.
- `pnpm typecheck` - run TypeScript project checks only.
- `pnpm test` - run all Vitest suites once.
- `pnpm preview` - preview the built app locally.
- `pnpm smoke:phase1` / `pnpm acceptance:phase1` - run the repo’s browser and API smoke flows.

## Coding Style & Naming Conventions

The codebase is ESM, strict TypeScript, and follows the existing style:

- 2-space indentation, single quotes, semicolons.
- Prefer named exports for reusable modules.
- Use PascalCase for React components, camelCase for functions and variables, and kebab-case for folders.
- Keep changes small and local; avoid introducing extra abstractions unless they are reusable across the app.
- Since this app already has shadcn/ui initialized, prefer existing shadcn/ui and Radix primitives for new interactive UI building blocks such as menus, dialogs, alert dialogs, inputs, buttons, and popovers instead of hand-rolled DOM implementations. Only hand-roll a primitive when there is a clear gap or a documented reason not to use shadcn/ui.

## Testing Guidelines

Vitest is the primary test runner, with Testing Library and JSDOM for UI coverage. Name tests `*.test.ts` or `*.test.tsx` and keep them close to the implementation. Favor focused tests for runtime, repo, and component behavior, then run the narrowest relevant command first, such as `pnpm test` or `pnpm typecheck`.

## Commit & Pull Request Guidelines

Git history uses short, imperative Conventional Commit subjects such as `feat(vite-chat): ...` or `docs(share): ...`. Keep the first line concise and scoped. PRs should describe the affected area, mention any API or script changes, and include screenshots for visible UI updates.

## Security & Configuration Tips

Do not commit local credentials, build outputs, or browser state. The app proxies `/api` to a local Fastify server during development; adjust `VITE_API_PROXY_TARGET` only when you need a different backend target.
