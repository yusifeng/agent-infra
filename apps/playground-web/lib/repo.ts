import { createDb, DrizzleMessageRepository, DrizzleRunRepository, DrizzleThreadRepository, DrizzleToolInvocationRepository } from '@agent-infra/db';

const db = createDb(process.env.DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5432/agent_infra');

export const repos = {
  threadRepo: new DrizzleThreadRepository(db),
  runRepo: new DrizzleRunRepository(db),
  messageRepo: new DrizzleMessageRepository(db),
  toolRepo: new DrizzleToolInvocationRepository(db)
};
