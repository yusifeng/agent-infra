import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  SqliteDatasetExampleRepository,
  SqliteDatasetRepository,
  SqliteEvalExampleResultRepository,
  SqliteEvalRunCompareTriageRepository,
  SqliteEvalRunRepository,
  SqliteThreadRepository
} from '../src/repositories-sqlite';
import { SQLITE_SCHEMA_STATEMENTS } from '../src/schema-sqlite';

describe('Sqlite eval repositories', () => {
  let sqlite: Database.Database | undefined;
  let datasetRepo: SqliteDatasetRepository;
  let datasetExampleRepo: SqliteDatasetExampleRepository;
  let evalRunRepo: SqliteEvalRunRepository;
  let evalResultRepo: SqliteEvalExampleResultRepository;
  let evalRunCompareTriageRepo: SqliteEvalRunCompareTriageRepository;
  let threadRepo: SqliteThreadRepository;

  beforeEach(async () => {
    sqlite = new Database(':memory:');
    sqlite.pragma('foreign_keys = ON');

    for (const statement of SQLITE_SCHEMA_STATEMENTS) {
      sqlite.exec(statement);
    }

    const db = drizzle(sqlite);
    datasetRepo = new SqliteDatasetRepository(db);
    datasetExampleRepo = new SqliteDatasetExampleRepository(db);
    evalRunRepo = new SqliteEvalRunRepository(db);
    evalResultRepo = new SqliteEvalExampleResultRepository(db);
    evalRunCompareTriageRepo = new SqliteEvalRunCompareTriageRepository(db);
    threadRepo = new SqliteThreadRepository(db);

    await datasetRepo.create({
      id: 'dataset-1',
      appId: 'app-1',
      name: 'Regression Seeds',
      description: null,
      visibility: 'private',
      metadata: null,
      createdByActorId: 'actor-1'
    });
  });

  afterEach(() => {
    sqlite?.close();
  });

  async function createExample(id: string) {
    return datasetExampleRepo.create({
      id,
      datasetId: 'dataset-1',
      sourceRunId: null,
      sourceThreadId: null,
      triggerMessageId: `trigger-${id}`,
      inputJson: {
        schemaVersion: 1,
        kind: 'chat_turn',
        triggerMessageId: `trigger-${id}`,
        messages: []
      },
      baselineOutputJson: null,
      expectedOutputJson: {
        schemaVersion: 1,
        kind: 'assistant_text',
        text: `expected ${id}`
      },
      metadataJson: {
        schemaVersion: 1,
        evaluation: { defaultEligible: true }
      },
      contextSnapshotJson: null,
      toolInvocationsSnapshotJson: null,
      createdByActorId: 'actor-1'
    });
  }

  async function createEvalRun(id: string) {
    return evalRunRepo.create({
      id,
      appId: 'app-1',
      datasetId: 'dataset-1',
      status: 'completed',
      name: null,
      configJson: { schemaVersion: 1 },
      summaryJson: { schemaVersion: 1 },
      error: null,
      createdByActorId: 'actor-1',
      startedAt: null,
      finishedAt: null
    });
  }

  function triageInput(overrides: Partial<Parameters<typeof evalRunCompareTriageRepo.createOrUpdate>[0]> = {}) {
    return {
      id: 'triage-1',
      appId: 'app-1',
      datasetId: 'dataset-1',
      baselineEvalRunId: 'baseline-run',
      candidateEvalRunId: 'candidate-run',
      datasetExampleId: 'example-1',
      triageStatus: 'regression' as const,
      reviewerNote: 'needs fix',
      triagedByActorId: 'actor-1',
      triagedAt: new Date('2026-05-20T00:00:00.000Z'),
      observedProjectionKind: 'eval_run_compare' as const,
      observedProjectionSchemaVersion: 1 as const,
      observedCompareStrategy: null,
      observedOutcome: 'regression',
      observedReason: 'manual_pass_to_fail',
      observedBaselineResultId: 'baseline-result',
      observedCandidateResultId: 'candidate-result',
      observedBaselineResultStatus: 'completed',
      observedCandidateResultStatus: 'completed',
      observedBaselineReviewStatus: 'pass',
      observedCandidateReviewStatus: 'fail',
      observedBaselineSignal: 'manual_pass',
      observedCandidateSignal: 'manual_fail',
      observedBaselineComparisonOutcome: 'match',
      observedCandidateComparisonOutcome: 'mismatch',
      observedBaselineComparisonReason: 'normalized_text_equal',
      observedCandidateComparisonReason: 'normalized_text_different',
      observedResultComparisonStrategy: 'normalized_text_v1',
      ...overrides
    };
  }

  it('creates, updates, finds, and lists eval runs by dataset', async () => {
    const first = await evalRunRepo.create({
      id: 'eval-run-1',
      appId: 'app-1',
      datasetId: 'dataset-1',
      status: 'queued',
      name: 'Nightly',
      configJson: {
        schemaVersion: 1,
        kind: 'eval_run_config',
        execution: { mode: 'current_runtime' }
      },
      summaryJson: {
        schemaVersion: 1,
        kind: 'eval_run_summary',
        selection: { selectedCount: 0 }
      },
      error: null,
      createdByActorId: 'actor-1',
      startedAt: null,
      finishedAt: null
    });

    await evalRunRepo.create({
      id: 'eval-run-2',
      appId: 'app-1',
      datasetId: 'dataset-1',
      status: 'queued',
      name: null,
      configJson: { schemaVersion: 1 },
      summaryJson: { schemaVersion: 1 },
      error: null,
      createdByActorId: null,
      startedAt: null,
      finishedAt: null
    });

    await expect(evalRunRepo.findById(first.id)).resolves.toMatchObject({
      id: first.id,
      status: 'queued',
      configJson: expect.objectContaining({ kind: 'eval_run_config' }),
      summaryJson: expect.objectContaining({ kind: 'eval_run_summary' })
    });

    const updated = await evalRunRepo.update(
      first.id,
      {
        status: 'running',
        startedAt: new Date('2026-05-18T01:00:00.000Z'),
        summaryJson: { schemaVersion: 1, updated: true }
      },
      new Date('2026-05-18T01:00:01.000Z')
    );
    expect(updated).toMatchObject({
      id: first.id,
      status: 'running',
      summaryJson: { schemaVersion: 1, updated: true }
    });
    expect(updated.startedAt?.toISOString()).toBe('2026-05-18T01:00:00.000Z');
    expect(updated.updatedAt.toISOString()).toBe('2026-05-18T01:00:01.000Z');

    const listed = await evalRunRepo.listByDataset('dataset-1');
    expect(new Set(listed.map((run) => run.id))).toEqual(new Set(['eval-run-1', 'eval-run-2']));
    const expectedOrder = [...listed]
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime() || a.id.localeCompare(b.id))
      .map((run) => run.id);
    expect(listed.map((run) => run.id)).toEqual(expectedOrder);
  });

  it('creates, updates, finds, and lists eval example results with JSON snapshots', async () => {
    const [firstExample, secondExample] = await Promise.all([createExample('example-1'), createExample('example-2')]);
    const evalRun = await evalRunRepo.create({
      id: 'eval-run-1',
      appId: 'app-1',
      datasetId: 'dataset-1',
      status: 'queued',
      name: null,
      configJson: { schemaVersion: 1 },
      summaryJson: { schemaVersion: 1 },
      error: null,
      createdByActorId: 'actor-1',
      startedAt: null,
      finishedAt: null
    });

    const results = await evalResultRepo.createMany([
      {
        id: 'result-2',
        evalRunId: evalRun.id,
        datasetExampleId: secondExample.id,
        exampleOrdinal: 2,
        status: 'queued',
        evalThreadId: null,
        outputRunId: null,
        expectedOutputJson: secondExample.expectedOutputJson ?? {},
        actualOutputJson: null,
        inputJson: null,
        usageJson: null,
        metadataJson: { selection: { source: 'test' } },
        error: null,
        startedAt: null,
        finishedAt: null
      },
      {
        id: 'result-1',
        evalRunId: evalRun.id,
        datasetExampleId: firstExample.id,
        exampleOrdinal: 1,
        status: 'queued',
        evalThreadId: null,
        outputRunId: null,
        expectedOutputJson: firstExample.expectedOutputJson ?? {},
        actualOutputJson: null,
        inputJson: { triggerMessageId: 'trigger-example-1' },
        usageJson: null,
        metadataJson: null,
        error: null,
        startedAt: null,
        finishedAt: null
      }
    ]);

    expect(results).toHaveLength(2);
    await expect(evalResultRepo.findById('result-1')).resolves.toMatchObject({
      id: 'result-1',
      expectedOutputJson: expect.objectContaining({ text: 'expected example-1' }),
      inputJson: { triggerMessageId: 'trigger-example-1' }
    });

    const updated = await evalResultRepo.update(
      'result-1',
      {
        status: 'failed',
        actualOutputJson: {
          schemaVersion: 1,
          kind: 'eval_run_output',
          assistantMessages: []
        },
        usageJson: { tokens: { input: 12, output: 0 } },
        error: 'outputless_completed_run',
        finishedAt: new Date('2026-05-18T02:00:00.000Z')
      },
      new Date('2026-05-18T02:00:01.000Z')
    );
    expect(updated).toMatchObject({
      id: 'result-1',
      status: 'failed',
      error: 'outputless_completed_run',
      usageJson: { tokens: { input: 12, output: 0 } }
    });
    expect(updated.finishedAt?.toISOString()).toBe('2026-05-18T02:00:00.000Z');

    const listed = await evalResultRepo.listByEvalRun(evalRun.id);
    expect(listed.map((result) => result.id)).toEqual(['result-1', 'result-2']);
  });

  it('enforces eval result identity and ordinal uniqueness in sqlite', async () => {
    const example = await createExample('example-1');
    const otherExample = await createExample('example-2');
    const evalRun = await evalRunRepo.create({
      id: 'eval-run-1',
      appId: 'app-1',
      datasetId: 'dataset-1',
      status: 'queued',
      name: null,
      configJson: { schemaVersion: 1 },
      summaryJson: { schemaVersion: 1 },
      error: null,
      createdByActorId: null,
      startedAt: null,
      finishedAt: null
    });

    await evalResultRepo.create({
      id: 'result-1',
      evalRunId: evalRun.id,
      datasetExampleId: example.id,
      exampleOrdinal: 1,
      status: 'queued',
      evalThreadId: null,
      outputRunId: null,
      expectedOutputJson: example.expectedOutputJson ?? {},
      actualOutputJson: null,
      inputJson: null,
      usageJson: null,
      metadataJson: null,
      error: null,
      startedAt: null,
      finishedAt: null
    });

    await expect(
      evalResultRepo.create({
        id: 'duplicate-example',
        evalRunId: evalRun.id,
        datasetExampleId: example.id,
        exampleOrdinal: 2,
        status: 'queued',
        evalThreadId: null,
        outputRunId: null,
        expectedOutputJson: example.expectedOutputJson ?? {},
        actualOutputJson: null,
        inputJson: null,
        usageJson: null,
        metadataJson: null,
        error: null,
        startedAt: null,
        finishedAt: null
      })
    ).rejects.toThrow(/UNIQUE constraint failed/);

    await expect(
      evalResultRepo.create({
        id: 'duplicate-ordinal',
        evalRunId: evalRun.id,
        datasetExampleId: otherExample.id,
        exampleOrdinal: 1,
        status: 'queued',
        evalThreadId: null,
        outputRunId: null,
        expectedOutputJson: otherExample.expectedOutputJson ?? {},
        actualOutputJson: null,
        inputJson: null,
        usageJson: null,
        metadataJson: null,
        error: null,
        startedAt: null,
        finishedAt: null
      })
    ).rejects.toThrow(/UNIQUE constraint failed/);
  });

  it('keeps sqlite bootstrap idempotent for eval tables and indexes', () => {
    for (const statement of SQLITE_SCHEMA_STATEMENTS) {
      sqlite?.exec(statement);
    }

    const tableRows = sqlite
      ?.prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('eval_runs', 'eval_example_results', 'eval_run_compare_triage') ORDER BY name"
      )
      .all();
    expect(tableRows).toEqual([{ name: 'eval_example_results' }, { name: 'eval_run_compare_triage' }, { name: 'eval_runs' }]);

    const resultIndexes = sqlite
      ?.prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'eval_example_results' ORDER BY name")
      .all()
      .map((row: any) => row.name);
    expect(resultIndexes).toEqual([
      'eval_example_results_dataset_example_id_idx',
      'eval_example_results_eval_run_dataset_example_unique',
      'eval_example_results_eval_run_example_ordinal_unique',
      'eval_example_results_eval_run_id_idx',
      'eval_example_results_example_ordinal_idx',
      'eval_example_results_status_idx',
      'sqlite_autoindex_eval_example_results_1'
    ]);

    const triageIndexes = sqlite
      ?.prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'eval_run_compare_triage' ORDER BY name")
      .all()
      .map((row: any) => row.name);
    expect(triageIndexes).toEqual([
      'eval_run_compare_triage_app_dataset_idx',
      'eval_run_compare_triage_pair_example_unique',
      'eval_run_compare_triage_pair_idx',
      'eval_run_compare_triage_status_idx',
      'sqlite_autoindex_eval_run_compare_triage_1'
    ]);
  });

  it('creates, updates, lists, and deletes compare triage rows by ordered pair', async () => {
    await createExample('example-1');
    await createExample('example-2');
    await createEvalRun('baseline-run');
    await createEvalRun('candidate-run');

    const created = await evalRunCompareTriageRepo.createOrUpdate(triageInput());
    expect(created).toMatchObject({
      id: 'triage-1',
      baselineEvalRunId: 'baseline-run',
      candidateEvalRunId: 'candidate-run',
      datasetExampleId: 'example-1',
      triageStatus: 'regression',
      reviewerNote: 'needs fix',
      observedCandidateComparisonReason: 'normalized_text_different'
    });

    await evalRunCompareTriageRepo.createOrUpdate(triageInput({
      id: 'triage-2',
      datasetExampleId: 'example-2',
      triageStatus: 'accepted',
      reviewerNote: null,
      observedOutcome: 'same_pass',
      observedReason: 'manual_same_pass'
    }));

    const updated = await evalRunCompareTriageRepo.createOrUpdate(triageInput({
      id: 'ignored-new-id',
      triageStatus: 'expected_changed',
      reviewerNote: 'update expected output',
      observedOutcome: 'changed_unresolved',
      observedReason: 'unreviewed_text_changed'
    }));
    expect(updated).toMatchObject({
      id: 'triage-1',
      triageStatus: 'expected_changed',
      reviewerNote: 'update expected output',
      observedReason: 'unreviewed_text_changed'
    });
    expect(updated.createdAt.getTime()).toBe(created.createdAt.getTime());
    expect(updated.updatedAt.getTime()).toBeGreaterThanOrEqual(created.updatedAt.getTime());

    const listed = await evalRunCompareTriageRepo.listByPair({
      baselineEvalRunId: 'baseline-run',
      candidateEvalRunId: 'candidate-run'
    });
    expect(listed.map((row) => row.datasetExampleId)).toEqual(['example-1', 'example-2']);

    await expect(evalRunCompareTriageRepo.findByPairAndExample({
      baselineEvalRunId: 'candidate-run',
      candidateEvalRunId: 'baseline-run',
      datasetExampleId: 'example-1'
    })).resolves.toBeNull();

    await evalRunCompareTriageRepo.deleteByPairAndExample({
      baselineEvalRunId: 'baseline-run',
      candidateEvalRunId: 'candidate-run',
      datasetExampleId: 'example-1'
    });
    await expect(evalRunCompareTriageRepo.findByPairAndExample({
      baselineEvalRunId: 'baseline-run',
      candidateEvalRunId: 'candidate-run',
      datasetExampleId: 'example-1'
    })).resolves.toBeNull();
  });

  it('enforces unique compare triage row per pair and dataset example in sqlite', async () => {
    await createExample('example-1');
    await createEvalRun('baseline-run');
    await createEvalRun('candidate-run');

    await evalRunCompareTriageRepo.createOrUpdate(triageInput());

    expect(() => {
      sqlite?.prepare(`
        INSERT INTO eval_run_compare_triage (
          id,
          app_id,
          dataset_id,
          baseline_eval_run_id,
          candidate_eval_run_id,
          dataset_example_id,
          triage_status,
          triaged_at,
          observed_projection_kind,
          observed_projection_schema_version,
          observed_outcome,
          observed_reason,
          created_at,
          updated_at
        ) VALUES (
          'triage-duplicate',
          'app-1',
          'dataset-1',
          'baseline-run',
          'candidate-run',
          'example-1',
          'accepted',
          1779300000000,
          'eval_run_compare',
          1,
          'same_pass',
          'manual_same_pass',
          1779300000000,
          1779300000000
        )
      `).run();
    }).toThrow(/UNIQUE constraint failed/);
  });

  it('roundtrips eval-only thread metadata through existing thread storage', async () => {
    const thread = await threadRepo.create({
      id: 'eval-thread-1',
      appId: 'app-1',
      userId: null,
      title: null,
      status: 'active',
      metadata: {
        kind: 'eval_thread',
        evalRunId: 'eval-run-1',
        evalExampleResultId: 'result-1',
        datasetId: 'dataset-1',
        datasetExampleId: 'example-1'
      },
      archivedAt: null
    });

    await expect(threadRepo.findById(thread.id)).resolves.toMatchObject({
      id: thread.id,
      metadata: {
        kind: 'eval_thread',
        evalRunId: 'eval-run-1',
        evalExampleResultId: 'result-1',
        datasetId: 'dataset-1',
        datasetExampleId: 'example-1'
      }
    });
  });
});
