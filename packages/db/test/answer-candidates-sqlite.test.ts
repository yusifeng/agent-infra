import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  SqliteAnswerCandidateRepository,
  SqliteAnswerSelectionRepository,
  SqliteMessageRepository,
  SqliteRunFeedbackRepository,
  SqliteRunRepository,
  SqliteThreadRepository
} from '../src/repositories-sqlite';
import { SQLITE_SCHEMA_STATEMENTS } from '../src/schema-sqlite';

describe('Sqlite answer candidate repositories', () => {
  let sqlite: Database.Database | undefined;
  let candidateRepo: SqliteAnswerCandidateRepository;
  let selectionRepo: SqliteAnswerSelectionRepository;
  let feedbackRepo: SqliteRunFeedbackRepository;
  let runRepo: SqliteRunRepository;
  let messageRepo: SqliteMessageRepository;

  beforeEach(async () => {
    sqlite = new Database(':memory:');
    sqlite.pragma('foreign_keys = ON');

    for (const statement of SQLITE_SCHEMA_STATEMENTS) {
      sqlite.exec(statement);
    }

    const db = drizzle(sqlite);
    const threadRepo = new SqliteThreadRepository(db);
    runRepo = new SqliteRunRepository(db);
    messageRepo = new SqliteMessageRepository(db);
    candidateRepo = new SqliteAnswerCandidateRepository(db);
    selectionRepo = new SqliteAnswerSelectionRepository(db);
    feedbackRepo = new SqliteRunFeedbackRepository(db);

    await threadRepo.create({
      id: 'thread-1',
      appId: 'test',
      userId: 'user-1',
      title: 'Test Thread',
      status: 'active',
      metadata: null,
      archivedAt: null
    });
    await threadRepo.create({
      id: 'thread-2',
      appId: 'test',
      userId: 'user-1',
      title: 'Other Thread',
      status: 'active',
      metadata: null,
      archivedAt: null
    });
  });

  afterEach(() => {
    sqlite?.close();
    sqlite = undefined;
  });

  async function createTurn() {
    const userMessage = await messageRepo.create({
      id: 'message-user-1',
      threadId: 'thread-1',
      runId: null,
      role: 'user',
      seq: 1,
      status: 'completed',
      metadata: null
    });

    const primaryRun = await runRepo.create({
      id: 'run-primary',
      threadId: 'thread-1',
      triggerMessageId: userMessage.id,
      provider: 'openai',
      model: 'gpt-4o-mini',
      status: 'queued',
      usage: null,
      error: null,
      startedAt: null,
      finishedAt: null
    });
    const alternativeRun = await runRepo.create({
      id: 'run-alternative',
      threadId: 'thread-1',
      triggerMessageId: userMessage.id,
      provider: 'deepseek',
      model: 'deepseek-chat',
      status: 'running',
      usage: null,
      error: null,
      startedAt: null,
      finishedAt: null
    });

    return { userMessage, primaryRun, alternativeRun };
  }

  it('creates answer candidates and lists them by trigger message, run ids, and thread', async () => {
    const { userMessage, primaryRun, alternativeRun } = await createTurn();

    const primary = await candidateRepo.create({
      id: 'candidate-1',
      threadId: 'thread-1',
      triggerMessageId: userMessage.id,
      runId: primaryRun.id,
      ordinal: 0,
      kind: 'primary'
    });
    await candidateRepo.create({
      id: 'candidate-2',
      threadId: 'thread-1',
      triggerMessageId: userMessage.id,
      runId: alternativeRun.id,
      ordinal: 1,
      kind: 'alternative'
    });

    expect((await candidateRepo.findByRunId(primaryRun.id))?.id).toBe(primary.id);
    expect((await candidateRepo.listByRunIds([alternativeRun.id, primaryRun.id])).map((candidate) => candidate.id)).toEqual([
      'candidate-1',
      'candidate-2'
    ]);
    expect((await candidateRepo.listByThread('thread-1')).map((candidate) => candidate.id)).toEqual(['candidate-1', 'candidate-2']);
    expect((await candidateRepo.listByTriggerMessage('thread-1', userMessage.id)).map((candidate) => candidate.id)).toEqual([
      'candidate-1',
      'candidate-2'
    ]);
  });

  it('rejects candidates when run and trigger message do not match', async () => {
    const { userMessage, primaryRun } = await createTurn();
    const otherMessage = await messageRepo.create({
      id: 'message-user-2',
      threadId: 'thread-1',
      runId: null,
      role: 'user',
      seq: 2,
      status: 'completed',
      metadata: null
    });

    await expect(
      candidateRepo.create({
        id: 'candidate-invalid',
        threadId: 'thread-1',
        triggerMessageId: otherMessage.id,
        runId: primaryRun.id,
        ordinal: 0,
        kind: 'primary'
      })
    ).rejects.toThrow(/not a candidate/);

    await expect(
      candidateRepo.create({
        id: 'candidate-cross-thread',
        threadId: 'thread-2',
        triggerMessageId: userMessage.id,
        runId: primaryRun.id,
        ordinal: 0,
        kind: 'primary'
      })
    ).rejects.toThrow(/not a candidate/);
  });

  it('upserts selections only for candidates in the same thread and trigger message', async () => {
    const { userMessage, primaryRun, alternativeRun } = await createTurn();
    await candidateRepo.create({
      id: 'candidate-1',
      threadId: 'thread-1',
      triggerMessageId: userMessage.id,
      runId: primaryRun.id,
      ordinal: 0,
      kind: 'primary'
    });
    await candidateRepo.create({
      id: 'candidate-2',
      threadId: 'thread-1',
      triggerMessageId: userMessage.id,
      runId: alternativeRun.id,
      ordinal: 1,
      kind: 'alternative'
    });

    const defaultSelection = await selectionRepo.upsert({
      threadId: 'thread-1',
      triggerMessageId: userMessage.id,
      selectedRunId: primaryRun.id,
      source: 'default',
      selectedByUserId: null
    });
    expect(defaultSelection.selectedRunId).toBe(primaryRun.id);

    const userSelection = await selectionRepo.upsert({
      threadId: 'thread-1',
      triggerMessageId: userMessage.id,
      selectedRunId: alternativeRun.id,
      source: 'user',
      selectedByUserId: 'user-1'
    });
    expect(userSelection.createdAt).toEqual(defaultSelection.createdAt);
    expect(userSelection.updatedAt.getTime()).toBeGreaterThanOrEqual(defaultSelection.updatedAt.getTime());
    expect(await selectionRepo.getByThreadAndTrigger('thread-1', userMessage.id)).toMatchObject({
      selectedRunId: alternativeRun.id,
      source: 'user',
      selectedByUserId: 'user-1'
    });

    const otherMessage = await messageRepo.create({
      id: 'message-user-2',
      threadId: 'thread-1',
      runId: null,
      role: 'user',
      seq: 2,
      status: 'completed',
      metadata: null
    });
    await expect(
      selectionRepo.upsert({
        threadId: 'thread-1',
        triggerMessageId: otherMessage.id,
        selectedRunId: alternativeRun.id,
        source: 'user',
        selectedByUserId: 'user-1'
      })
    ).rejects.toThrow(/not a candidate/);
  });

  it('sets, replaces, filters, and clears feedback by run and actor', async () => {
    const { userMessage, primaryRun, alternativeRun } = await createTurn();
    await candidateRepo.create({
      id: 'candidate-1',
      threadId: 'thread-1',
      triggerMessageId: userMessage.id,
      runId: primaryRun.id,
      ordinal: 0,
      kind: 'primary'
    });
    await candidateRepo.create({
      id: 'candidate-2',
      threadId: 'thread-1',
      triggerMessageId: userMessage.id,
      runId: alternativeRun.id,
      ordinal: 1,
      kind: 'alternative'
    });

    const first = await feedbackRepo.set({
      id: 'feedback-1',
      threadId: 'thread-1',
      triggerMessageId: userMessage.id,
      runId: primaryRun.id,
      feedbackActorId: 'user:user-1',
      value: 'thumbs_up'
    });
    const replaced = await feedbackRepo.set({
      id: 'feedback-2',
      threadId: 'thread-1',
      triggerMessageId: userMessage.id,
      runId: primaryRun.id,
      feedbackActorId: 'user:user-1',
      value: 'thumbs_down'
    });
    await feedbackRepo.set({
      id: 'feedback-3',
      threadId: 'thread-1',
      triggerMessageId: userMessage.id,
      runId: alternativeRun.id,
      feedbackActorId: 'anon:local',
      value: 'thumbs_up'
    });

    expect(replaced.id).toBe(first.id);
    expect(replaced.value).toBe('thumbs_down');
    expect((await feedbackRepo.listByRunIds([primaryRun.id, alternativeRun.id])).map((feedback) => feedback.id)).toEqual([
      'feedback-3',
      'feedback-1'
    ]);
    expect(await feedbackRepo.listByRunIds([primaryRun.id, alternativeRun.id], 'user:user-1')).toHaveLength(1);

    await feedbackRepo.clear({ runId: primaryRun.id, feedbackActorId: 'user:user-1' });
    expect((await feedbackRepo.listByRunIds([primaryRun.id, alternativeRun.id])).map((feedback) => feedback.id)).toEqual(['feedback-3']);
  });
});
