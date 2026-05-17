import { mkdtemp, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';

import { createAgentInfraRepositories, type DbConfig } from '@agent-infra/db';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { bootstrapPlaygroundRunFeedbackDetails } from '../repo/schema';
import { PlaygroundRunFeedbackDetailsRepo } from '../repo/playground-run-feedback-details-repo';
import { InvalidPlaygroundRunFeedbackDetailsError } from '../types/playground-run-feedback-details';
import { PlaygroundRunFeedbackService } from './playground-run-feedback-service';

type SqliteClient = {
  close(): void;
  exec(statement: string): unknown;
  pragma(statement: string): unknown;
};
type SqliteDatabaseConstructor = new (path: string) => SqliteClient;

const require = createRequire(import.meta.url);
const Database = require('better-sqlite3') as SqliteDatabaseConstructor;

function createSqliteTestDbConfig(sqlitePath: string): DbConfig {
  const sqlite = new Database(sqlitePath);
  sqlite.pragma('foreign_keys = ON');

  return {
    mode: 'sqlite',
    db: drizzle(sqlite as never),
    connectionString: `file:${sqlitePath}`,
    sqlitePath,
    bootstrapSchema: async () => {
      sqlite.exec(`CREATE TABLE IF NOT EXISTS threads (
        id text PRIMARY KEY NOT NULL,
        app_id text NOT NULL,
        user_id text,
        title text,
        status text NOT NULL,
        metadata text,
        created_at integer NOT NULL,
        updated_at integer NOT NULL,
        archived_at integer
      )`);
      sqlite.exec(`CREATE TABLE IF NOT EXISTS runs (
        id text PRIMARY KEY NOT NULL,
        thread_id text NOT NULL REFERENCES threads(id),
        trigger_message_id text,
        provider text,
        model text,
        status text NOT NULL,
        usage_json text,
        error text,
        started_at integer,
        finished_at integer,
        created_at integer NOT NULL
      )`);
      sqlite.exec(`CREATE TABLE IF NOT EXISTS messages (
        id text PRIMARY KEY NOT NULL,
        thread_id text NOT NULL REFERENCES threads(id),
        run_id text REFERENCES runs(id),
        role text NOT NULL,
        seq integer NOT NULL,
        status text NOT NULL,
        metadata text,
        created_at integer NOT NULL,
        UNIQUE(thread_id, seq)
      )`);
      sqlite.exec(`CREATE TABLE IF NOT EXISTS message_parts (
        id text PRIMARY KEY NOT NULL,
        message_id text NOT NULL REFERENCES messages(id),
        part_index integer NOT NULL,
        type text NOT NULL,
        text_value text,
        json_value text,
        created_at integer NOT NULL,
        UNIQUE(message_id, part_index)
      )`);
      sqlite.exec(`CREATE TABLE IF NOT EXISTS run_feedback (
        id TEXT PRIMARY KEY NOT NULL,
        thread_id TEXT NOT NULL REFERENCES threads(id),
        trigger_message_id TEXT NOT NULL REFERENCES messages(id),
        run_id TEXT NOT NULL REFERENCES runs(id),
        feedback_actor_id TEXT NOT NULL,
        value TEXT NOT NULL,
        created_at integer NOT NULL,
        updated_at integer NOT NULL
      )`);
      sqlite.exec('CREATE UNIQUE INDEX IF NOT EXISTS run_feedback_run_actor_unique ON run_feedback(run_id, feedback_actor_id)');
      sqlite.exec('CREATE INDEX IF NOT EXISTS run_feedback_thread_trigger_idx ON run_feedback(thread_id, trigger_message_id)');
    }
  };
}

async function seedFeedbackTarget(dbConfig: DbConfig) {
  const repos = createAgentInfraRepositories(dbConfig.mode, dbConfig.db);
  const thread = await repos.threadRepo.create({
    id: 'thread-1',
    appId: 'playground-runtime-pi',
    userId: null,
    title: 'Feedback thread',
    status: 'active',
    metadata: null,
    archivedAt: null
  });
  const userMessage = await repos.messageRepo.createWithNextSeq({
    id: 'message-user-1',
    threadId: thread.id,
    runId: null,
    role: 'user',
    status: 'completed',
    metadata: null
  });
  const run = await repos.runRepo.create({
    id: 'run-1',
    threadId: thread.id,
    triggerMessageId: userMessage.id,
    provider: 'test',
    model: 'test-model',
    status: 'completed',
    usage: null,
    error: null,
    startedAt: null,
    finishedAt: null
  });
  await repos.messageRepo.createWithNextSeq({
    id: 'message-assistant-1',
    threadId: thread.id,
    runId: run.id,
    role: 'assistant',
    status: 'completed',
    metadata: null
  });

  return { repos, thread, run };
}

describe('PlaygroundRunFeedbackService', () => {
  let dbConfig: DbConfig;
  let tempDir = '';

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), 'playground-run-feedback-'));
    dbConfig = createSqliteTestDbConfig(path.join(tempDir, 'run-feedback.db'));
    await dbConfig.bootstrapSchema();
    await bootstrapPlaygroundRunFeedbackDetails(dbConfig);
  });

  afterEach(async () => {
    if (dbConfig.mode === 'sqlite') {
      dbConfig.db.$client.close();
    }
    await rm(tempDir, { recursive: true, force: true });
  });

  it('bootstraps the sidecar table idempotently', async () => {
    await expect(bootstrapPlaygroundRunFeedbackDetails(dbConfig)).resolves.toBeUndefined();
  });

  it('upserts and deletes sidecar details', async () => {
    const { thread, run } = await seedFeedbackTarget(dbConfig);
    const repo = new PlaygroundRunFeedbackDetailsRepo(dbConfig);

    await repo.upsert({
      threadId: thread.id,
      runId: run.id,
      feedbackActorId: 'actor-1',
      details: {
        reasonTags: ['not_helpful'],
        commentText: 'first'
      },
      now: new Date('2026-01-01T00:00:00.000Z')
    });
    await repo.upsert({
      threadId: thread.id,
      runId: run.id,
      feedbackActorId: 'actor-1',
      details: {
        reasonTags: ['false_or_misleading'],
        commentText: null
      },
      now: new Date('2026-01-01T00:01:00.000Z')
    });

    await expect(repo.findByRunAndActor(run.id, 'actor-1')).resolves.toMatchObject({
      details: {
        reasonTags: ['false_or_misleading'],
        commentText: null
      }
    });

    await repo.deleteByRunAndActor(run.id, 'actor-1');
    await expect(repo.findByRunAndActor(run.id, 'actor-1')).resolves.toBeNull();
  });

  it('writes thumbs-down shared feedback and sidecar details atomically', async () => {
    const { repos, run } = await seedFeedbackTarget(dbConfig);
    const service = new PlaygroundRunFeedbackService(dbConfig, {
      idGenerator: () => 'feedback-1',
      now: () => new Date('2026-01-01T00:00:00.000Z')
    });

    const feedback = await service.setRunFeedback({
      threadId: 'thread-1',
      runId: run.id,
      feedbackActorId: 'actor-1',
      value: 'thumbs_down',
      details: {
        reasonTags: ['other', 'not_helpful', 'other'],
        commentText: '  Needs sources.  '
      }
    });

    expect(feedback).toMatchObject({
      runId: run.id,
      feedbackActorId: 'actor-1',
      value: 'thumbs_down'
    });
    await expect(repos.runFeedbackRepo.listByRunIds([run.id], 'actor-1')).resolves.toMatchObject([
      { runId: run.id, value: 'thumbs_down' }
    ]);
    await expect(new PlaygroundRunFeedbackDetailsRepo(dbConfig).findByRunAndActor(run.id, 'actor-1')).resolves.toMatchObject({
      details: {
        reasonTags: ['not_helpful', 'other'],
        commentText: 'Needs sources.'
      }
    });
  });

  it('clears sidecar details when feedback changes to thumbs up', async () => {
    const { run } = await seedFeedbackTarget(dbConfig);
    const service = new PlaygroundRunFeedbackService(dbConfig, {
      idGenerator: () => 'feedback-1',
      now: () => new Date('2026-01-01T00:00:00.000Z')
    });
    await service.setRunFeedback({
      threadId: 'thread-1',
      runId: run.id,
      feedbackActorId: 'actor-1',
      value: 'thumbs_down',
      details: {
        reasonTags: ['not_helpful'],
        commentText: 'bad'
      }
    });

    await service.setRunFeedback({
      threadId: 'thread-1',
      runId: run.id,
      feedbackActorId: 'actor-1',
      value: 'thumbs_up'
    });

    await expect(new PlaygroundRunFeedbackDetailsRepo(dbConfig).findByRunAndActor(run.id, 'actor-1')).resolves.toBeNull();
  });

  it('clears sidecar details when feedback is deleted', async () => {
    const { run } = await seedFeedbackTarget(dbConfig);
    const service = new PlaygroundRunFeedbackService(dbConfig, {
      idGenerator: () => 'feedback-1',
      now: () => new Date('2026-01-01T00:00:00.000Z')
    });
    await service.setRunFeedback({
      threadId: 'thread-1',
      runId: run.id,
      feedbackActorId: 'actor-1',
      value: 'thumbs_down',
      details: {
        reasonTags: [],
        commentText: null
      }
    });

    await service.clearRunFeedback({
      threadId: 'thread-1',
      runId: run.id,
      feedbackActorId: 'actor-1'
    });

    await expect(new PlaygroundRunFeedbackDetailsRepo(dbConfig).findByRunAndActor(run.id, 'actor-1')).resolves.toBeNull();
  });

  it('rejects details on thumbs-up requests', async () => {
    const { run } = await seedFeedbackTarget(dbConfig);
    const service = new PlaygroundRunFeedbackService(dbConfig);

    await expect(service.setRunFeedback({
      threadId: 'thread-1',
      runId: run.id,
      feedbackActorId: 'actor-1',
      value: 'thumbs_up',
      details: {
        reasonTags: []
      }
    })).rejects.toBeInstanceOf(InvalidPlaygroundRunFeedbackDetailsError);
  });

  it('rolls back shared feedback when sidecar writing fails', async () => {
    const { repos, run } = await seedFeedbackTarget(dbConfig);
    const service = new PlaygroundRunFeedbackService(dbConfig, {
      idGenerator: () => 'feedback-1',
      createDetailsRepo: () => ({
        async upsert() {
          throw new Error('sidecar failed');
        },
        async deleteByRunAndActor() {}
      })
    });

    await expect(service.setRunFeedback({
      threadId: 'thread-1',
      runId: run.id,
      feedbackActorId: 'actor-1',
      value: 'thumbs_down',
      details: {
        reasonTags: ['not_helpful'],
        commentText: null
      }
    })).rejects.toThrow('sidecar failed');

    await expect(repos.runFeedbackRepo.listByRunIds([run.id], 'actor-1')).resolves.toEqual([]);
  });

  it('does not write sidecar details when shared feedback validation fails', async () => {
    await seedFeedbackTarget(dbConfig);
    const service = new PlaygroundRunFeedbackService(dbConfig, {
      idGenerator: () => 'feedback-1'
    });
    const repo = new PlaygroundRunFeedbackDetailsRepo(dbConfig);

    await expect(service.setRunFeedback({
      threadId: 'thread-1',
      runId: 'missing-run',
      feedbackActorId: 'actor-1',
      value: 'thumbs_down',
      details: {
        reasonTags: ['not_helpful'],
        commentText: null
      }
    })).rejects.toThrow();

    await expect(repo.findByRunAndActor('missing-run', 'actor-1')).resolves.toBeNull();
  });
});
