import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { SqliteDatasetExampleRepository, SqliteDatasetRepository } from '../src/repositories-sqlite';
import { SQLITE_SCHEMA_STATEMENTS } from '../src/schema-sqlite';

describe('Sqlite dataset repositories', () => {
  let sqlite: Database.Database | undefined;
  let datasetRepo: SqliteDatasetRepository;
  let datasetExampleRepo: SqliteDatasetExampleRepository;

  beforeEach(() => {
    sqlite = new Database(':memory:');
    sqlite.pragma('foreign_keys = ON');

    for (const statement of SQLITE_SCHEMA_STATEMENTS) {
      sqlite.exec(statement);
    }

    const db = drizzle(sqlite);
    datasetRepo = new SqliteDatasetRepository(db);
    datasetExampleRepo = new SqliteDatasetExampleRepository(db);
  });

  afterEach(() => {
    sqlite?.close();
  });

  it('creates, updates, and lists datasets by app and actor visibility', async () => {
    const owned = await datasetRepo.create({
      id: 'dataset-owned',
      appId: 'app-1',
      name: 'Owned',
      description: null,
      visibility: 'private',
      metadata: { source: 'test' },
      createdByActorId: 'actor-1'
    });
    await datasetRepo.create({
      id: 'dataset-app',
      appId: 'app-1',
      name: 'App visible',
      description: null,
      visibility: 'app',
      metadata: null,
      createdByActorId: 'actor-2'
    });
    await datasetRepo.create({
      id: 'dataset-other',
      appId: 'app-2',
      name: 'Other app',
      description: null,
      visibility: 'app',
      metadata: null,
      createdByActorId: 'actor-1'
    });

    await expect(datasetRepo.findById(owned.id)).resolves.toMatchObject({
      id: owned.id,
      visibility: 'private',
      metadata: { source: 'test' }
    });

    await expect(datasetRepo.listByApp({ appId: 'app-1', actorId: 'actor-1' })).resolves.toEqual([
      expect.objectContaining({ id: 'dataset-owned' }),
      expect.objectContaining({ id: 'dataset-app' })
    ]);
    await expect(datasetRepo.listByApp({ appId: 'app-1', actorId: 'actor-1', includeAppVisible: false })).resolves.toEqual([
      expect.objectContaining({ id: 'dataset-owned' })
    ]);
    await expect(datasetRepo.listByApp({ appId: 'app-1', actorId: null })).resolves.toEqual([
      expect.objectContaining({ id: 'dataset-app' })
    ]);

    const updated = await datasetRepo.update(owned.id, { name: 'Renamed', visibility: 'app' }, new Date('2026-05-17T00:00:00.000Z'));
    expect(updated).toMatchObject({
      id: owned.id,
      name: 'Renamed',
      visibility: 'app'
    });
    expect(updated.updatedAt.toISOString()).toBe('2026-05-17T00:00:00.000Z');
  });

  it('roundtrips examples with nullable soft source refs and structured JSON snapshots', async () => {
    const dataset = await datasetRepo.create({
      id: 'dataset-1',
      appId: 'app-1',
      name: 'Regression Seeds',
      description: 'Captured from production runs',
      visibility: 'private',
      metadata: null,
      createdByActorId: 'actor-1'
    });

    const example = await datasetExampleRepo.create({
      id: 'example-1',
      datasetId: dataset.id,
      sourceRunId: 'missing-run-id',
      sourceThreadId: null,
      triggerMessageId: 'missing-message-id',
      inputJson: {
        schemaVersion: 1,
        kind: 'chat_turn',
        messages: [{ id: 'message-1', role: 'user', parts: [{ type: 'text', textValue: 'hello' }] }]
      },
      baselineOutputJson: {
        schemaVersion: 1,
        kind: 'run_output',
        assistantMessages: [{ id: 'message-2', role: 'assistant', parts: [{ type: 'text', textValue: 'hi' }] }]
      },
      expectedOutputJson: null,
      metadataJson: {
        schemaVersion: 1,
        capture: { kind: 'normal_example' },
        evaluation: { defaultEligible: true }
      },
      contextSnapshotJson: {
        schemaVersion: 1,
        kind: 'run_context',
        provider: 'openai',
        usage: { tokens: { input: 12, output: 8 } }
      },
      toolInvocationsSnapshotJson: {
        schemaVersion: 1,
        kind: 'tool_invocations',
        state: 'captured',
        toolInvocations: [{ id: 'tool-1', input: { q: 'x' }, output: { ok: true } }]
      },
      createdByActorId: 'actor-1'
    });

    expect(example.sourceRunId).toBe('missing-run-id');
    await expect(datasetExampleRepo.findById(example.id)).resolves.toMatchObject({
      id: example.id,
      sourceRunId: 'missing-run-id',
      sourceThreadId: null,
      triggerMessageId: 'missing-message-id',
      inputJson: expect.objectContaining({ kind: 'chat_turn' }),
      baselineOutputJson: expect.objectContaining({ kind: 'run_output' }),
      expectedOutputJson: null,
      metadataJson: expect.objectContaining({
        evaluation: { defaultEligible: true }
      }),
      contextSnapshotJson: expect.objectContaining({ provider: 'openai' }),
      toolInvocationsSnapshotJson: expect.objectContaining({ state: 'captured' })
    });
    await expect(datasetExampleRepo.listByDataset(dataset.id)).resolves.toEqual([
      expect.objectContaining({ id: example.id })
    ]);

    const updated = await datasetExampleRepo.updateExpectedOutput(
      example.id,
      {
        expectedOutputJson: { rubric: 'must answer politely' },
        metadataJson: { schemaVersion: 1, annotation: { reviewer: 'actor-2' } }
      },
      new Date('2026-05-17T01:00:00.000Z')
    );
    expect(updated.expectedOutputJson).toEqual({ rubric: 'must answer politely' });
    expect(updated.metadataJson).toEqual({ schemaVersion: 1, annotation: { reviewer: 'actor-2' } });
    expect(updated.updatedAt.toISOString()).toBe('2026-05-17T01:00:00.000Z');
  });

  it('requires an existing dataset but does not require existing source run/thread/message rows', async () => {
    await expect(
      datasetExampleRepo.create({
        id: 'orphan-example',
        datasetId: 'missing-dataset',
        sourceRunId: 'missing-run',
        sourceThreadId: 'missing-thread',
        triggerMessageId: 'missing-message',
        inputJson: { schemaVersion: 1 },
        baselineOutputJson: null,
        expectedOutputJson: null,
        metadataJson: null,
        contextSnapshotJson: null,
        toolInvocationsSnapshotJson: null,
        createdByActorId: null
      })
    ).rejects.toThrow();
  });

  it('keeps sqlite bootstrap idempotent for dataset tables and indexes', () => {
    for (const statement of SQLITE_SCHEMA_STATEMENTS) {
      sqlite?.exec(statement);
    }

    const tableRows = sqlite
      ?.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('datasets', 'dataset_examples') ORDER BY name")
      .all();
    expect(tableRows).toEqual([{ name: 'dataset_examples' }, { name: 'datasets' }]);

    const indexes = sqlite
      ?.prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'dataset_examples' ORDER BY name")
      .all()
      .map((row: any) => row.name);
    expect(indexes).toEqual([
      'dataset_examples_dataset_id_idx',
      'dataset_examples_source_run_id_idx',
      'dataset_examples_source_thread_id_idx',
      'dataset_examples_trigger_message_id_idx',
      'sqlite_autoindex_dataset_examples_1'
    ]);
  });
});
