import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { SqliteCloudAgentWorkerRepository, SqliteRunRepository, SqliteThreadRepository } from '../src/repositories-sqlite';
import { SQLITE_SCHEMA_STATEMENTS } from '../src/schema-sqlite';

describe('SqliteRunRepository', () => {
  let sqlite: Database.Database | undefined;
  let cloudAgentWorkerRepo: SqliteCloudAgentWorkerRepository;
  let runRepo: SqliteRunRepository;
  let threadRepo: SqliteThreadRepository;

  beforeEach(async () => {
    sqlite = new Database(':memory:');
    sqlite.pragma('foreign_keys = ON');

    for (const statement of SQLITE_SCHEMA_STATEMENTS) {
      sqlite.exec(statement);
    }

    const db = drizzle(sqlite);
    cloudAgentWorkerRepo = new SqliteCloudAgentWorkerRepository(db);
    threadRepo = new SqliteThreadRepository(db);
    runRepo = new SqliteRunRepository(db);

    await threadRepo.create({
      id: 'thread-1',
      appId: 'test',
      userId: null,
      title: 'Test Thread',
      status: 'active',
      metadata: null,
      archivedAt: null
    });
  });

  afterEach(() => {
    sqlite?.close();
    sqlite = undefined;
  });

  it('lists recent runs for a thread in descending createdAt order and respects limit', async () => {
    const first = await runRepo.create({
      id: 'run-1',
      threadId: 'thread-1',
      triggerMessageId: null,
      provider: 'openai',
      model: 'gpt-4o-mini',
      status: 'queued',
      usage: null,
      error: null,
      startedAt: null,
      finishedAt: null
    });

    await new Promise((resolve) => setTimeout(resolve, 5));

    const second = await runRepo.create({
      id: 'run-2',
      threadId: 'thread-1',
      triggerMessageId: null,
      provider: 'deepseek',
      model: 'deepseek-v4-flash',
      status: 'running',
      usage: null,
      error: null,
      startedAt: null,
      finishedAt: null
    });

    const allRuns = await runRepo.listByThread('thread-1');
    expect(allRuns.map((run) => run.id)).toEqual([second.id, first.id]);

    const limitedRuns = await runRepo.listByThread('thread-1', { limit: 1 });
    expect(limitedRuns.map((run) => run.id)).toEqual([second.id]);
  });

  it('finds the latest active run for a thread', async () => {
    const first = await runRepo.create({
      id: 'run-1',
      threadId: 'thread-1',
      triggerMessageId: null,
      provider: 'openai',
      model: 'gpt-4o-mini',
      status: 'queued',
      usage: null,
      error: null,
      startedAt: null,
      finishedAt: null
    });

    await new Promise((resolve) => setTimeout(resolve, 5));

    const second = await runRepo.create({
      id: 'run-2',
      threadId: 'thread-1',
      triggerMessageId: null,
      provider: 'deepseek',
      model: 'deepseek-v4-flash',
      status: 'running',
      usage: null,
      error: null,
      startedAt: null,
      finishedAt: null
    });

    await new Promise((resolve) => setTimeout(resolve, 5));

    await runRepo.create({
      id: 'run-3',
      threadId: 'thread-1',
      triggerMessageId: null,
      provider: 'deepseek',
      model: 'deepseek-v4-flash',
      status: 'completed',
      usage: null,
      error: null,
      startedAt: null,
      finishedAt: null
    });

    expect((await runRepo.findLatestActiveByThread('thread-1'))?.id).toBe(second.id);

    await runRepo.updateStatus(second.id, 'completed');
    expect((await runRepo.findLatestActiveByThread('thread-1'))?.id).toBe(first.id);

    await runRepo.updateStatus(first.id, 'failed');
    expect(await runRepo.findLatestActiveByThread('thread-1')).toBeNull();
  });

  it('lists all active runs for a thread in descending createdAt order', async () => {
    const first = await runRepo.create({
      id: 'run-1',
      threadId: 'thread-1',
      triggerMessageId: null,
      provider: 'openai',
      model: 'gpt-4o-mini',
      status: 'queued',
      usage: null,
      error: null,
      startedAt: null,
      finishedAt: null
    });

    await new Promise((resolve) => setTimeout(resolve, 5));

    const second = await runRepo.create({
      id: 'run-2',
      threadId: 'thread-1',
      triggerMessageId: null,
      provider: 'deepseek',
      model: 'deepseek-v4-flash',
      status: 'running',
      usage: null,
      error: null,
      startedAt: null,
      finishedAt: null
    });

    await runRepo.create({
      id: 'run-3',
      threadId: 'thread-1',
      triggerMessageId: null,
      provider: 'deepseek',
      model: 'deepseek-v4-flash',
      status: 'completed',
      usage: null,
      error: null,
      startedAt: null,
      finishedAt: null
    });

    expect((await runRepo.listActiveByThread('thread-1')).map((run) => run.id)).toEqual([second.id, first.id]);
  });

  it('claims queued and lease-expired runs by app scope', async () => {
    await threadRepo.create({
      id: 'thread-other-app',
      appId: 'other-app',
      userId: null,
      title: 'Other app thread',
      status: 'active',
      metadata: null,
      archivedAt: null
    });
    await runRepo.create({
      id: 'run-other-app',
      threadId: 'thread-other-app',
      triggerMessageId: null,
      provider: 'openai',
      model: 'gpt-4o-mini',
      status: 'queued',
      usage: null,
      error: null,
      startedAt: null,
      finishedAt: null
    });
    const queued = await runRepo.create({
      id: 'run-queued',
      threadId: 'thread-1',
      triggerMessageId: null,
      provider: 'openai',
      model: 'gpt-4o-mini',
      status: 'queued',
      usage: null,
      error: null,
      startedAt: null,
      finishedAt: null
    });

    const now = new Date('2026-01-01T00:00:00.000Z');
    const leaseExpiresAt = new Date('2026-01-01T00:05:00.000Z');
    const claimed = await runRepo.claimNextQueued({
      appId: 'test',
      workerId: 'worker-1',
      leaseExpiresAt,
      now
    });

    expect(claimed).toMatchObject({
      id: queued.id,
      status: 'running',
      claimOwner: 'worker-1',
      claimExpiresAt: leaseExpiresAt,
      attemptCount: 1
    });
    expect(claimed?.startedAt?.toISOString()).toBe(now.toISOString());

    const noClaim = await runRepo.claimNextQueued({
      appId: 'test',
      workerId: 'worker-2',
      leaseExpiresAt,
      now: new Date('2026-01-01T00:01:00.000Z')
    });
    expect(noClaim).toBeNull();

    const reclaimed = await runRepo.claimNextQueued({
      appId: 'test',
      workerId: 'worker-2',
      leaseExpiresAt: new Date('2026-01-01T00:10:00.000Z'),
      now: new Date('2026-01-01T00:06:00.000Z')
    });
    expect(reclaimed).toMatchObject({
      id: queued.id,
      status: 'running',
      claimOwner: 'worker-2',
      attemptCount: 2
    });

    const completed = await runRepo.updateStatus(queued.id, 'completed', {
      finishedAt: new Date('2026-01-01T00:07:00.000Z')
    });
    expect(completed.claimOwner).toBeNull();
    expect(completed.claimExpiresAt).toBeNull();

    const cancelledRun = await runRepo.create({
      id: 'run-cancel-claim',
      threadId: 'thread-1',
      triggerMessageId: null,
      provider: 'openai',
      model: 'gpt-4o-mini',
      status: 'running',
      usage: null,
      error: null,
      startedAt: new Date('2026-01-01T00:00:00.000Z'),
      finishedAt: null,
      claimOwner: 'worker-1',
      claimExpiresAt: new Date('2026-01-01T00:08:00.000Z')
    });
    const cancelled = await runRepo.updateStatus(cancelledRun.id, 'cancelled', {
      finishedAt: new Date('2026-01-01T00:08:00.000Z')
    });
    expect(cancelled.claimOwner).toBeNull();
    expect(cancelled.claimExpiresAt).toBeNull();
  });

  it('claims a queued run by id for external queue workers', async () => {
    const queued = await runRepo.create({
      id: 'run-bullmq-queued',
      threadId: 'thread-1',
      triggerMessageId: null,
      provider: 'openai',
      model: 'gpt-4o-mini',
      status: 'queued',
      usage: null,
      error: null,
      startedAt: null,
      finishedAt: null
    });

    const now = new Date('2026-01-01T00:00:00.000Z');
    const leaseExpiresAt = new Date('2026-01-01T00:05:00.000Z');
    const claimed = await runRepo.claimById({
      runId: queued.id,
      workerId: 'bullmq-worker-1',
      leaseExpiresAt,
      now
    });
    const duplicate = await runRepo.claimById({
      runId: queued.id,
      workerId: 'bullmq-worker-2',
      leaseExpiresAt: new Date('2026-01-01T00:06:00.000Z'),
      now: new Date('2026-01-01T00:01:00.000Z')
    });

    expect(claimed).toMatchObject({
      id: queued.id,
      status: 'running',
      claimOwner: 'bullmq-worker-1',
      claimExpiresAt: leaseExpiresAt,
      attemptCount: 1
    });
    expect(duplicate).toBeNull();
  });

  it('summarizes runs by app scope for queue diagnostics', async () => {
    await threadRepo.create({
      id: 'thread-other-app',
      appId: 'other-app',
      userId: null,
      title: 'Other app thread',
      status: 'active',
      metadata: null,
      archivedAt: null
    });
    await runRepo.create({
      id: 'run-other-app',
      threadId: 'thread-other-app',
      triggerMessageId: null,
      provider: 'openai',
      model: 'gpt-4o-mini',
      status: 'queued',
      usage: null,
      error: null,
      startedAt: null,
      finishedAt: null
    });
    await runRepo.create({
      id: 'run-queued-app',
      threadId: 'thread-1',
      triggerMessageId: null,
      provider: 'openai',
      model: 'gpt-4o-mini',
      status: 'queued',
      usage: null,
      error: null,
      startedAt: null,
      finishedAt: null
    });
    await runRepo.create({
      id: 'run-failed-app',
      threadId: 'thread-1',
      triggerMessageId: null,
      provider: 'openai',
      model: 'gpt-4o-mini',
      status: 'failed',
      usage: null,
      error: 'boom',
      startedAt: new Date('2026-01-01T00:00:00.000Z'),
      finishedAt: new Date('2026-01-01T00:01:00.000Z')
    });

    expect(await runRepo.countByApp('test')).toMatchObject({
      failed: 1,
      queued: 1
    });
    expect((await runRepo.listByApp('test', { statuses: ['queued', 'failed'] })).map((run) => run.id)).toEqual([
      'run-failed-app',
      'run-queued-app'
    ]);
  });

  it('records worker heartbeats and stopped state', async () => {
    const startedAt = new Date('2026-01-01T00:00:00.000Z');
    const firstHeartbeat = await cloudAgentWorkerRepo.heartbeat({
      id: 'worker-1',
      appId: 'test',
      queueProvider: 'bullmq',
      status: 'active',
      concurrency: 2,
      activeRunIds: ['run-1'],
      metadata: { host: 'worker-host-a' },
      startedAt,
      lastHeartbeatAt: startedAt,
      heartbeatAt: new Date('2026-01-01T00:00:05.000Z'),
      stoppedAt: null
    });

    const secondHeartbeat = await cloudAgentWorkerRepo.heartbeat({
      ...firstHeartbeat,
      activeRunIds: ['run-1', 'run-2'],
      heartbeatAt: new Date('2026-01-01T00:00:10.000Z'),
      lastHeartbeatAt: firstHeartbeat.lastHeartbeatAt,
      status: 'active'
    });

    expect(firstHeartbeat).toMatchObject({
      id: 'worker-1',
      queueProvider: 'bullmq',
      status: 'active',
      concurrency: 2,
      activeRunIds: ['run-1']
    });
    expect(secondHeartbeat.createdAt.toISOString()).toBe(firstHeartbeat.createdAt.toISOString());
    expect(secondHeartbeat.lastHeartbeatAt.toISOString()).toBe('2026-01-01T00:00:10.000Z');
    expect(secondHeartbeat.activeRunIds).toEqual(['run-1', 'run-2']);
    expect(await cloudAgentWorkerRepo.findById('worker-1')).toMatchObject({
      id: 'worker-1',
      activeRunIds: ['run-1', 'run-2']
    });
    expect(
      await cloudAgentWorkerRepo.listByApp('test', {
        since: new Date('2026-01-01T00:00:06.000Z')
      })
    ).toHaveLength(1);

    const stopped = await cloudAgentWorkerRepo.markStopped({
      actorId: 'admin',
      id: 'worker-1',
      reason: 'manual cleanup',
      stoppedAt: new Date('2026-01-01T00:00:15.000Z')
    });

    expect(stopped).toMatchObject({
      id: 'worker-1',
      metadata: {
        control: {
          desiredStatus: 'stopped',
          stoppedByActorId: 'admin',
          stoppedReason: 'manual cleanup'
        }
      },
      status: 'stopped'
    });
    expect(stopped?.stoppedAt?.toISOString()).toBe('2026-01-01T00:00:15.000Z');
  });

  it('preserves worker drain control metadata across heartbeats', async () => {
    const startedAt = new Date('2026-01-01T00:00:00.000Z');
    await cloudAgentWorkerRepo.heartbeat({
      id: 'worker-drain',
      appId: 'test',
      queueProvider: 'db-queue',
      status: 'active',
      concurrency: 1,
      activeRunIds: [],
      metadata: { pid: 123 },
      startedAt,
      lastHeartbeatAt: startedAt,
      heartbeatAt: startedAt,
      stoppedAt: null
    });

    const draining = await cloudAgentWorkerRepo.requestDrain({
      actorId: 'admin',
      id: 'worker-drain',
      reason: 'maintenance',
      requestedAt: new Date('2026-01-01T00:01:00.000Z')
    });
    const heartbeat = await cloudAgentWorkerRepo.heartbeat({
      id: 'worker-drain',
      appId: 'test',
      queueProvider: 'db-queue',
      status: 'active',
      concurrency: 1,
      activeRunIds: [],
      metadata: { pid: 456 },
      startedAt,
      lastHeartbeatAt: startedAt,
      heartbeatAt: new Date('2026-01-01T00:01:05.000Z'),
      stoppedAt: null
    });

    expect(draining).toMatchObject({
      id: 'worker-drain',
      status: 'draining'
    });
    expect(heartbeat).toMatchObject({
      id: 'worker-drain',
      metadata: {
        control: {
          desiredStatus: 'draining',
          drainReason: 'maintenance',
          drainRequestedByActorId: 'admin'
        },
        pid: 456
      },
      status: 'draining'
    });
  });

  it('clears worker drain control metadata for subsequent heartbeats', async () => {
    const startedAt = new Date('2026-01-01T00:00:00.000Z');
    await cloudAgentWorkerRepo.heartbeat({
      id: 'worker-drain-clear',
      appId: 'test',
      queueProvider: 'db-queue',
      status: 'active',
      concurrency: 1,
      activeRunIds: [],
      metadata: { pid: 123 },
      startedAt,
      lastHeartbeatAt: startedAt,
      heartbeatAt: startedAt,
      stoppedAt: null
    });

    await cloudAgentWorkerRepo.requestDrain({
      actorId: 'admin',
      id: 'worker-drain-clear',
      reason: 'maintenance',
      requestedAt: new Date('2026-01-01T00:01:00.000Z')
    });
    const cleared = await cloudAgentWorkerRepo.clearDrain({
      actorId: 'admin',
      id: 'worker-drain-clear',
      reason: 'maintenance cancelled',
      requestedAt: new Date('2026-01-01T00:01:30.000Z')
    });
    const heartbeat = await cloudAgentWorkerRepo.heartbeat({
      id: 'worker-drain-clear',
      appId: 'test',
      queueProvider: 'db-queue',
      status: 'active',
      concurrency: 1,
      activeRunIds: [],
      metadata: { pid: 456 },
      startedAt,
      lastHeartbeatAt: startedAt,
      heartbeatAt: new Date('2026-01-01T00:01:35.000Z'),
      stoppedAt: null
    });

    expect(cleared).toMatchObject({
      id: 'worker-drain-clear',
      metadata: {
        control: {
          desiredStatus: 'active',
          drainClearReason: 'maintenance cancelled',
          drainClearedByActorId: 'admin'
        }
      },
      status: 'active'
    });
    expect(heartbeat).toMatchObject({
      id: 'worker-drain-clear',
      metadata: {
        control: {
          desiredStatus: 'active',
          drainClearReason: 'maintenance cancelled',
          drainClearedByActorId: 'admin'
        },
        pid: 456
      },
      status: 'active'
    });
  });

  it('does not double-claim runs when multiple workers claim concurrently', async () => {
    for (const runId of ['run-queued-1', 'run-queued-2', 'run-queued-3']) {
      await runRepo.create({
        id: runId,
        threadId: 'thread-1',
        triggerMessageId: null,
        provider: 'openai',
        model: 'gpt-4o-mini',
        status: 'queued',
        usage: null,
        error: null,
        startedAt: null,
        finishedAt: null
      });
    }

    const now = new Date('2026-01-01T00:00:00.000Z');
    const claims = await Promise.all(
      Array.from({ length: 8 }, (_value, index) =>
        runRepo.claimNextQueued({
          appId: 'test',
          workerId: `worker-${index}`,
          leaseExpiresAt: new Date('2026-01-01T00:05:00.000Z'),
          now
        })
      )
    );

    const claimedRuns = claims.filter((claim) => claim !== null);
    expect(claimedRuns.length).toBeGreaterThan(0);
    expect(new Set(claimedRuns.map((run) => run.id)).size).toBe(claimedRuns.length);
    expect(new Set(claimedRuns.map((run) => run.claimOwner)).size).toBe(claimedRuns.length);
    for (const run of claimedRuns) {
      expect(run).toMatchObject({
        status: 'running',
        attemptCount: 1
      });
      expect(run.claimOwner).toMatch(/^worker-\d+$/);
    }

    const remainingClaims = [];
    for (let index = 0; index < 3; index += 1) {
      remainingClaims.push(
        await runRepo.claimNextQueued({
          appId: 'test',
          workerId: `drain-worker-${index}`,
          leaseExpiresAt: new Date('2026-01-01T00:05:00.000Z'),
          now
        })
      );
    }

    const allClaimedRuns = [...claimedRuns, ...remainingClaims.filter((claim) => claim !== null)];
    expect(allClaimedRuns).toHaveLength(3);
    expect(new Set(allClaimedRuns.map((run) => run.id)).size).toBe(3);
  });

  it('does not claim queued runs before nextAttemptAt', async () => {
    await runRepo.create({
      id: 'run-retry',
      threadId: 'thread-1',
      triggerMessageId: null,
      provider: 'openai',
      model: 'gpt-4o-mini',
      status: 'queued',
      usage: null,
      error: 'transient worker failure',
      startedAt: null,
      finishedAt: null,
      nextAttemptAt: new Date('2026-01-01T00:10:00.000Z')
    });

    const earlyClaim = await runRepo.claimNextQueued({
      appId: 'test',
      workerId: 'worker-1',
      leaseExpiresAt: new Date('2026-01-01T00:06:00.000Z'),
      now: new Date('2026-01-01T00:05:00.000Z')
    });
    expect(earlyClaim).toBeNull();

    const dueClaim = await runRepo.claimNextQueued({
      appId: 'test',
      workerId: 'worker-1',
      leaseExpiresAt: new Date('2026-01-01T00:16:00.000Z'),
      now: new Date('2026-01-01T00:10:00.000Z')
    });
    expect(dueClaim).toMatchObject({
      id: 'run-retry',
      claimOwner: 'worker-1',
      attemptCount: 1,
      status: 'running'
    });
  });

  it('extends active claims only for the current worker before lease expiry', async () => {
    await runRepo.create({
      id: 'run-queued',
      threadId: 'thread-1',
      triggerMessageId: null,
      provider: 'openai',
      model: 'gpt-4o-mini',
      status: 'queued',
      usage: null,
      error: null,
      startedAt: null,
      finishedAt: null
    });

    const claimed = await runRepo.claimNextQueued({
      appId: 'test',
      workerId: 'worker-1',
      leaseExpiresAt: new Date('2026-01-01T00:05:00.000Z'),
      now: new Date('2026-01-01T00:00:00.000Z')
    });
    expect(claimed?.claimOwner).toBe('worker-1');

    const wrongWorker = await runRepo.extendClaim({
      runId: 'run-queued',
      workerId: 'worker-2',
      leaseExpiresAt: new Date('2026-01-01T00:10:00.000Z'),
      now: new Date('2026-01-01T00:01:00.000Z')
    });
    expect(wrongWorker).toBeNull();

    const extended = await runRepo.extendClaim({
      runId: 'run-queued',
      workerId: 'worker-1',
      leaseExpiresAt: new Date('2026-01-01T00:10:00.000Z'),
      now: new Date('2026-01-01T00:01:00.000Z')
    });
    expect(extended?.claimExpiresAt?.toISOString()).toBe('2026-01-01T00:10:00.000Z');

    const expired = await runRepo.extendClaim({
      runId: 'run-queued',
      workerId: 'worker-1',
      leaseExpiresAt: new Date('2026-01-01T00:20:00.000Z'),
      now: new Date('2026-01-01T00:11:00.000Z')
    });
    expect(expired).toBeNull();
  });
});
