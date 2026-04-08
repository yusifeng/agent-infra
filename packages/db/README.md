# @agent-infra/db

Set `DATABASE_URL` to a PostgreSQL connection string.

## Basic usage

1. Generate migrations from `src/schema.ts`:
   ```bash
   pnpm --filter @agent-infra/db db:generate
   ```
2. Apply migrations:
   ```bash
   pnpm --filter @agent-infra/db db:migrate
   ```
3. Build repositories from a drizzle client.
