# Playground Next Web Vercel Runbook

This runbook captures the currently validated deployment shape for [`apps/playground-next-web`](../apps/playground-next-web).

It is intentionally narrow:

- Next.js on Vercel
- Turso as the remote database
- runtime-pi based streaming chat
- custom domain wiring through Cloudflare

The goal is not to cover every possible host or database.
It records the setup that is already proven in this repository, so the next rollout does not need to rediscover the same constraints.

## Current validated endpoints

The current validated production domain is:

- `https://next-infra.zhangdawei.org`

The validated preview shape is:

- Vercel preview deployment for the `playground-next-web` project

The following loop is already proven end-to-end:

- `/new`
- `GET /api/meta`
- `GET /api/threads`
- `POST /api/threads`
- `POST /api/threads/:threadId/runs/stream`
- `GET /api/threads/:threadId/messages`

Additional Next routes covered by local build/tests, but still requiring
deployment smoke validation on the target Vercel project:

- `POST /api/threads/:threadId/shares`
- `GET /api/threads/:threadId/shares/current`
- `GET /api/shares/:publicId`
- `POST /api/shares/:publicId/revoke`
- `/share/:publicId`

## Required Vercel project shape

This app lives in a pnpm monorepo.
The current working deployment shape depends on these settings:

- Vercel project is linked from the **repository root**
- Vercel project `Root Directory` is `apps/playground-next-web`
- package manager is resolved from the repository-level `pnpm-lock.yaml`

Do **not** rely on deploying from the app subdirectory as if it were a standalone repo.
That shape is what previously caused Vercel to fall back to `npm install`.

## Required environment variables

The minimal runtime set is:

- `TURSO_DATABASE_URL`
- `TURSO_AUTH_TOKEN`
- one model key:
  - `DEEPSEEK_API_KEY`
  - or `OPENAI_API_KEY`

Optional:

- `OPENAI_MODEL`

Host auth routes are now present in `playground-next-web`.
Set these before relying on sign-up, sign-in, or password reset in a deployed
environment:

- `AUTH_CODE_SECRET`
- `AUTH_ALLOWED_ORIGINS`
- `RESEND_API_KEY`
- `AUTH_EMAIL_FROM`

`AUTH_CODE_SECRET` is required in production. `AUTH_ALLOWED_ORIGINS` must include
the deployed origin that posts to auth write routes, such as the production
domain and any preview domain used for manual validation.

Search migration will add:

- `TAVILY_API_KEY` if search/browse tools are enabled

When `TAVILY_API_KEY` is absent, `webSearchEnabled` chat turns should be
rejected before runtime execution instead of silently running without browse
tools.

If the runtime env is missing or invalid, `GET /api/meta` should expose:

- `runtimeConfigured: false`
- `runtimeConfigError`

That endpoint is the fastest health signal before trying a real chat turn.

## Explicit database bootstrap

The playground host auth and thread-catalog tables are prepared by the explicit
bootstrap command.

Use the explicit command when you need to prepare a brand-new database:

```bash
pnpm --filter playground-next-web bootstrap:db
```

For an already-used Turso database, this is usually not required again unless a
new host table or column has been introduced.

## Recommended local commands before deploy

Use the repository root:

```bash
pnpm --filter @agent-infra/runtime-pi test
pnpm --filter @agent-infra/runtime-pi build
pnpm --filter playground-next-web build
pnpm typecheck
```

These are the current minimum gates before pushing a Next/Vercel runtime change.

## Route runtime assumptions

The playground route handlers are intended for the Node.js runtime, not the Edge
runtime. They use Node-oriented database, auth, native hashing, and runtime-pi
dependencies.

Streaming routes also assume the deployment allows a long enough function
duration for the selected model response. Vercel plan limits and project
configuration should be validated before relying on long-running chat turns in
production.

## Deploy flow

Validated flow:

1. run from repository root
2. deploy preview with `vercel`
3. validate chat on preview
4. deploy production with `vercel --prod`
5. validate production domain with the deployment smoke command

## Deployment smoke

`playground-next-web` now has a deployment-level smoke command:

```bash
pnpm --filter playground-next-web smoke:deployment
```

Defaults:

- base URL: `https://next-infra.zhangdawei.org`
- prompt: `Reply with exactly ok.`

You can target another deployment explicitly:

```bash
PLAYGROUND_NEXT_WEB_BASE_URL="https://your-preview.vercel.app" \
pnpm --filter playground-next-web smoke:deployment
```

If your shell cannot complete TLS to the custom domain, the script now reports that as a network-layer failure instead of a chat regression.
In that case:

- retry from a different network
- or point `PLAYGROUND_NEXT_WEB_BASE_URL` at a reachable deployment URL

Optional checks:

- `PLAYGROUND_NEXT_WEB_EXPECT_DB_MODE=turso`
- `PLAYGROUND_NEXT_WEB_SMOKE_EMAIL`
- `PLAYGROUND_NEXT_WEB_SMOKE_PASSWORD`

When both smoke auth variables are set, the smoke signs in through
`POST /api/auth/sign-in` and reuses the returned session cookie for the thread,
stream, and message checks. When they are absent, it keeps the pre-auth anonymous
flow so current deployments can still be validated before `/api/threads` is
session-gated.

The smoke validates:

- `/api/meta`
- `/api/threads`
- thread creation
- `runs/stream`
- persisted user and assistant messages

Before `/api/threads` is session-gated, configure the smoke auth variables for
the target deployment and keep this command green with an authenticated session.

Preview deployments may still be protected by Vercel Authentication.
If so, use a production domain or an otherwise reachable deployment URL for the smoke command.

## Custom domain wiring

The current validated custom domain setup is:

- domain host: `next-infra.zhangdawei.org`
- DNS provider: Cloudflare
- record:
  - `CNAME`
  - `next-infra`
  - `cname.vercel-dns.com`
  - `DNS only`

Vercel project should also list the same custom domain in project domain settings.

## Runtime-pi / pi-ai caveat

There is still a **known build warning** in `playground-next-web build`:

- `@mariozechner/pi-ai/dist/providers/openai-codex-responses.js`
- `Critical dependency: the request of a dependency is an expression`

Current conclusion:

- this warning does **not** block the validated Next/Vercel runtime path
- it appears to come from the upstream `pi-agent-core -> pi-ai` barrel/registration chain
- current repository-level mitigation is to keep the runtime path deployable and verified, not to pretend the warning is fully eliminated

Treat it as a tracked residual risk, especially when upgrading:

- Next.js
- Vercel runtime behavior
- `@mariozechner/pi-agent-core`
- `@mariozechner/pi-ai`

## Attach-stream caveat

The current Next host includes a process-local attach stream route:

- `GET /api/threads/:threadId/runs/:runId/attach-stream`

It is intended to support local and best-effort single-process recovery for a
running response by sending a `run.snapshot` event first, then forwarding live
run events from the same process.

The current validated Vercel path proves the normal `runs/stream` request path.
It does not prove production-grade attach-stream recovery for a running response.

An in-memory `RunStreamHub` can support local development and best-effort
single-process recovery, but it should not be treated as durable on Vercel
Functions. Process restarts, cold starts, and multiple instances can lose or
split active run stream state.

If production attach/resume/cancel semantics become required on Vercel, add an
external runtime state layer such as Redis or a worker-backed run coordinator
behind the stream hub boundary.

## Failure triage

Check in this order:

1. `GET /api/meta`
   - confirms env visibility and runtime selection health
2. `GET /api/threads`
   - confirms database read path
3. `POST /api/threads`
   - confirms database write path
4. `POST /api/threads/:threadId/runs/stream`
   - confirms runtime-pi execution path
5. `GET /api/threads/:threadId/messages`
   - confirms final transcript persistence

If a deployed `runs/stream` regression returns during future upgrades, assume the highest-risk area is:

- `runtime-pi`
- `pi-agent-core`
- `pi-ai`
- Vercel serverless dependency tracing

before assuming the issue is in the chat route itself.
