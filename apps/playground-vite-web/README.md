# playground-vite-web

This app is the Vite-based browser consumer scaffold for `agent-infra`.

Current purpose:

- validate browser-side durable chat behavior outside Next.js
- host Tailwind CSS and shadcn/ui for future consumer UI work
- proxy `/api` requests to `playground-fastify-server` during local development

## Commands

- `pnpm --filter playground-vite-web dev`
- `pnpm --filter playground-vite-web build`
- `pnpm --filter playground-vite-web typecheck`
- `pnpm --filter playground-vite-web smoke:phase1`
- `pnpm --filter playground-vite-web acceptance:phase1`

## Current status

The app currently provides:

- Vite + React + TypeScript
- Tailwind CSS v4
- shadcn/ui initialization
- a local `/api -> http://localhost:4000` proxy target, overridable via `VITE_API_PROXY_TARGET`
- `/new` and `/chat/:threadId` client routes
- app-local durable chat runtime wired to `@agent-infra/durable-chat-client`
- a single route host that keeps `DurableChatConsole` mounted across `/new` and `/chat/:threadId`, so the first-send handoff preserves in-flight chat state
- sidebar + transcript + sticky composer aligned to `playground-next-web`
- a repeatable phase-1 smoke script that boots Fastify from source on a temporary sqlite DB, runs Vite with the matching proxy target, and verifies the main chat API loop
- a browser-level phase-1 acceptance script that drives `/new -> send -> /chat/:threadId -> refresh -> switch thread` against the same temporary sqlite-backed harness

## Browser acceptance

The browser acceptance uses Playwright Chromium. On a fresh machine, install the browser once:

- `pnpm --filter playground-vite-web exec playwright install chromium`
