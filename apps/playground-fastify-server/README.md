# playground-fastify-server

This app is the Fastify-based server scaffold for `agent-infra`.

Current purpose:

- validate non-Next route hosting
- give `playground-vite-web` a local `/api` target during development
- become the future host for `@agent-infra/durable-chat-server`

## Commands

- `pnpm --filter playground-fastify-server dev`
- `pnpm --filter playground-fastify-server build`
- `pnpm --filter playground-fastify-server typecheck`
