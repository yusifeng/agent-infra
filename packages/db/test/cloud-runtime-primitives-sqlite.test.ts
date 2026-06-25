import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  SqliteAgentProfileRepository,
  SqliteRunApprovalRequestRepository,
  SqliteProviderSessionBindingRepository,
  SqliteProviderTranscriptRepository,
  SqliteRunRepository,
  SqliteThreadRepository,
  SqliteWorkspaceChangeSetRepository,
  SqliteWorkspaceFileChangeRepository,
  SqliteWorkspaceFileIndexRepository,
  SqliteWorkspaceSecretRefRepository,
  SqliteWorkspaceRepository
} from '../src/repositories-sqlite';
import { SQLITE_SCHEMA_STATEMENTS } from '../src/schema-sqlite';

describe('cloud runtime sqlite primitives', () => {
  let sqlite: Database.Database | undefined;
  let workspaceRepo: SqliteWorkspaceRepository;
  let threadRepo: SqliteThreadRepository;
  let runRepo: SqliteRunRepository;
  let agentProfileRepo: SqliteAgentProfileRepository;
  let workspaceSecretRefRepo: SqliteWorkspaceSecretRefRepository;
  let workspaceFileIndexRepo: SqliteWorkspaceFileIndexRepository;
  let workspaceChangeSetRepo: SqliteWorkspaceChangeSetRepository;
  let workspaceFileChangeRepo: SqliteWorkspaceFileChangeRepository;
  let approvalRequestRepo: SqliteRunApprovalRequestRepository;
  let bindingRepo: SqliteProviderSessionBindingRepository;
  let transcriptRepo: SqliteProviderTranscriptRepository;

  beforeEach(async () => {
    sqlite = new Database(':memory:');
    sqlite.pragma('foreign_keys = ON');

    for (const statement of SQLITE_SCHEMA_STATEMENTS) {
      sqlite.exec(statement);
    }

    const db = drizzle(sqlite);
    workspaceRepo = new SqliteWorkspaceRepository(db);
    threadRepo = new SqliteThreadRepository(db);
    runRepo = new SqliteRunRepository(db);
    agentProfileRepo = new SqliteAgentProfileRepository(db);
    workspaceSecretRefRepo = new SqliteWorkspaceSecretRefRepository(db);
    workspaceFileIndexRepo = new SqliteWorkspaceFileIndexRepository(db);
    workspaceChangeSetRepo = new SqliteWorkspaceChangeSetRepository(db);
    workspaceFileChangeRepo = new SqliteWorkspaceFileChangeRepository(db);
    approvalRequestRepo = new SqliteRunApprovalRequestRepository(db);
    bindingRepo = new SqliteProviderSessionBindingRepository(db);
    transcriptRepo = new SqliteProviderTranscriptRepository(db);
  });

  afterEach(() => {
    sqlite?.close();
    sqlite = undefined;
  });

  async function createThreadAndRun() {
    const workspace = await workspaceRepo.create({
      id: 'workspace-1',
      appId: 'cloud-agent',
      userId: 'admin',
      title: 'Admin workspace',
      status: 'active',
      defaultForUser: true,
      metadata: null,
      archivedAt: null
    });

    const thread = await threadRepo.create({
      id: 'thread-1',
      appId: 'cloud-agent',
      userId: 'admin',
      title: 'Thread',
      status: 'active',
      metadata: { workspaceId: workspace.id },
      archivedAt: null
    });

    const run = await runRepo.create({
      id: 'run-1',
      threadId: thread.id,
      triggerMessageId: null,
      provider: 'claude',
      model: 'deepseek-v4-flash',
      status: 'running',
      usage: null,
      error: null,
      startedAt: new Date(),
      finishedAt: null
    });

    return { workspace, thread, run };
  }

  it('keeps one default workspace per user without preventing extra workspaces', async () => {
    await workspaceRepo.create({
      id: 'workspace-1',
      appId: 'cloud-agent',
      userId: 'admin',
      title: 'Default workspace',
      status: 'active',
      defaultForUser: true,
      metadata: null,
      archivedAt: null
    });

    await workspaceRepo.create({
      id: 'workspace-2',
      appId: 'cloud-agent',
      userId: 'admin',
      title: 'Secondary workspace',
      status: 'active',
      defaultForUser: false,
      metadata: null,
      archivedAt: null
    });

    await workspaceRepo.create({
      id: 'workspace-3',
      appId: 'cloud-agent',
      userId: 'admin',
      title: 'New default',
      status: 'active',
      defaultForUser: true,
      metadata: null,
      archivedAt: null
    });

    const defaultWorkspace = await workspaceRepo.findDefaultByUser({
      appId: 'cloud-agent',
      userId: 'admin'
    });
    const workspaces = await workspaceRepo.listByUser({
      appId: 'cloud-agent',
      userId: 'admin'
    });

    expect(defaultWorkspace?.id).toBe('workspace-3');
    expect(workspaces.map((workspace) => workspace.id)).toEqual(['workspace-3', 'workspace-1', 'workspace-2']);
    expect(workspaces.find((workspace) => workspace.id === 'workspace-1')?.defaultForUser).toBe(false);
  });

  it('upserts active provider session binding by thread and provider', async () => {
    const { workspace, thread, run } = await createThreadAndRun();

    const first = await bindingRepo.upsertActive({
      id: 'binding-1',
      workspaceId: workspace.id,
      threadId: thread.id,
      runId: run.id,
      provider: 'claude',
      providerSessionId: 'claude-session-1',
      providerProjectKey: null,
      metadata: { source: 'first-run' }
    });

    const second = await bindingRepo.upsertActive({
      workspaceId: workspace.id,
      threadId: thread.id,
      runId: run.id,
      provider: 'claude',
      providerSessionId: 'claude-session-2',
      providerProjectKey: null,
      metadata: { source: 'resume' }
    });

    const active = await bindingRepo.findActiveByThread({
      threadId: thread.id,
      provider: 'claude'
    });
    const all = await bindingRepo.listByThread(thread.id);

    expect(first.id).toBe('binding-1');
    expect(second.id).toBe('binding-1');
    expect(active?.providerSessionId).toBe('claude-session-2');
    expect(all).toHaveLength(1);
  });

  it('marks forked provider session bindings as inactive while preserving lifecycle metadata', async () => {
    const { workspace, thread, run } = await createThreadAndRun();

    const binding = await bindingRepo.upsertActive({
      id: 'binding-1',
      workspaceId: workspace.id,
      threadId: thread.id,
      runId: run.id,
      provider: 'claude',
      providerSessionId: 'claude-session-1',
      providerProjectKey: null,
      metadata: { source: 'first-run' }
    });

    const forkedAt = new Date('2026-01-01T00:00:00.000Z');
    const forked = await bindingRepo.updateStatus(binding.id, 'forked', {
      archivedAt: forkedAt,
      metadata: {
        source: 'first-run',
        lifecycleAction: 'fork',
        lifecycleActorId: 'admin',
        lifecycleAt: forkedAt.toISOString(),
        transcriptReplay: {
          entryCount: 2,
          lastOrdinal: 2
        }
      }
    });

    expect(forked).toMatchObject({
      id: 'binding-1',
      status: 'forked',
      metadata: {
        lifecycleAction: 'fork',
        lifecycleActorId: 'admin',
        transcriptReplay: {
          entryCount: 2,
          lastOrdinal: 2
        }
      }
    });
    expect(forked.archivedAt?.toISOString()).toBe(forkedAt.toISOString());
    expect(
      await bindingRepo.findActiveByThread({
        threadId: thread.id,
        provider: 'claude'
      })
    ).toBeNull();
    expect((await bindingRepo.listByThread(thread.id)).map((item) => item.status)).toEqual(['forked']);
  });

  it('appends provider transcript entries with stable ordinals', async () => {
    const { workspace, thread, run } = await createThreadAndRun();
    const secondRun = await runRepo.create({
      id: 'run-2',
      threadId: thread.id,
      triggerMessageId: null,
      provider: 'claude',
      model: 'deepseek-v4-flash',
      status: 'running',
      usage: null,
      error: null,
      startedAt: new Date(),
      finishedAt: null
    });

    await transcriptRepo.append({
      id: 'entry-1',
      workspaceId: workspace.id,
      threadId: thread.id,
      runId: run.id,
      provider: 'claude',
      providerSessionId: 'claude-session-1',
      providerProjectKey: null,
      providerEntryId: 'sdk-1',
      entryType: 'assistant',
      rawJson: { type: 'assistant', text: 'hello' }
    });
    await transcriptRepo.append({
      id: 'entry-2',
      workspaceId: workspace.id,
      threadId: thread.id,
      runId: run.id,
      provider: 'claude',
      providerSessionId: 'claude-session-1',
      providerProjectKey: null,
      providerEntryId: 'sdk-2',
      entryType: 'tool_result',
      rawJson: { type: 'tool_result', content: 'ok' }
    });
    await transcriptRepo.append({
      id: 'entry-3',
      workspaceId: workspace.id,
      threadId: thread.id,
      runId: secondRun.id,
      provider: 'claude',
      providerSessionId: 'claude-session-1',
      providerProjectKey: null,
      providerEntryId: 'sdk-3',
      entryType: 'assistant',
      rawJson: { type: 'assistant', text: 'next run' }
    });

    const entries = await transcriptRepo.listByProviderSession({
      provider: 'claude',
      providerSessionId: 'claude-session-1',
      providerProjectKey: null
    });
    const runEntries = await transcriptRepo.listByRun(run.id);

    expect(entries.map((entry) => entry.ordinal)).toEqual([1, 2, 3]);
    expect(entries.map((entry) => entry.providerEntryId)).toEqual(['sdk-1', 'sdk-2', 'sdk-3']);
    expect(entries[0]?.rawJson).toEqual({ type: 'assistant', text: 'hello' });
    expect(runEntries.map((entry) => entry.providerEntryId)).toEqual(['sdk-1', 'sdk-2']);
    await expect(
      transcriptRepo.nextOrdinal({
        provider: 'claude',
        providerSessionId: 'claude-session-1',
        providerProjectKey: null
      })
    ).resolves.toBe(4);
  });

  it('tracks durable pending approval requests and decisions for a run', async () => {
    const { workspace, thread, run } = await createThreadAndRun();

    const request = await approvalRequestRepo.create({
      id: 'approval-1',
      workspaceId: workspace.id,
      threadId: thread.id,
      runId: run.id,
      provider: 'claude',
      permissionRequestId: 'toolu_1',
      action: 'Write',
      details: {
        filePath: 'snake/index.html'
      },
      decision: null,
      decisionReason: null,
      resolvedByActorId: null,
      metadata: {
        source: 'canUseTool'
      },
      expiresAt: new Date('2026-01-01T00:05:00.000Z')
    });

    expect(request).toMatchObject({
      id: 'approval-1',
      status: 'pending',
      action: 'Write',
      permissionRequestId: 'toolu_1',
      details: {
        filePath: 'snake/index.html'
      }
    });
    expect(
      await approvalRequestRepo.findByProviderRequest({
        runId: run.id,
        provider: 'claude',
        permissionRequestId: 'toolu_1'
      })
    ).toMatchObject({
      id: 'approval-1',
      status: 'pending'
    });
    expect(
      await approvalRequestRepo.findPendingByProviderRequest({
        runId: run.id,
        provider: 'claude',
        permissionRequestId: 'toolu_1'
      })
    ).toMatchObject({
      id: 'approval-1',
      status: 'pending'
    });

    const resolved = await approvalRequestRepo.resolve('approval-1', 'approved', {
      decision: 'approved',
      decisionReason: 'Allowed by admin.',
      resolvedByActorId: 'admin',
      resolvedAt: new Date('2026-01-01T00:01:00.000Z')
    });

    expect(resolved).toMatchObject({
      status: 'approved',
      decision: 'approved',
      decisionReason: 'Allowed by admin.',
      resolvedByActorId: 'admin'
    });
    expect(resolved.resolvedAt?.toISOString()).toBe('2026-01-01T00:01:00.000Z');
    expect(
      await approvalRequestRepo.findPendingByProviderRequest({
        runId: run.id,
        provider: 'claude',
        permissionRequestId: 'toolu_1'
      })
    ).toBeNull();
    expect(
      await approvalRequestRepo.findByProviderRequest({
        runId: run.id,
        provider: 'claude',
        permissionRequestId: 'toolu_1'
      })
    ).toMatchObject({
      id: 'approval-1',
      status: 'approved'
    });
    expect((await approvalRequestRepo.listByRun(run.id)).map((item) => item.id)).toEqual(['approval-1']);

    await approvalRequestRepo.create({
      id: 'approval-2',
      runId: run.id,
      threadId: run.threadId,
      workspaceId: 'workspace-1',
      provider: 'claude',
      permissionRequestId: 'toolu_2',
      action: 'tool.execute',
      details: {
        toolName: 'Write'
      },
      status: 'pending',
      decision: null,
      decisionReason: null,
      requestedByActorId: 'assistant',
      resolvedByActorId: null,
      expiresAt: null,
      metadata: null,
      requestedAt: new Date('2026-01-01T00:02:00.000Z'),
      resolvedAt: null
    });

    const cancelled = await approvalRequestRepo.resolve('approval-2', 'cancelled', {
      decision: 'denied',
      decisionReason: 'Run was cancelled.',
      resolvedByActorId: 'admin',
      resolvedAt: new Date('2026-01-01T00:03:00.000Z')
    });

    expect(cancelled).toMatchObject({
      status: 'cancelled',
      decision: 'denied',
      decisionReason: 'Run was cancelled.',
      resolvedByActorId: 'admin'
    });
    expect(
      await approvalRequestRepo.findPendingByProviderRequest({
        runId: run.id,
        provider: 'claude',
        permissionRequestId: 'toolu_2'
      })
    ).toBeNull();

    await approvalRequestRepo.create({
      id: 'approval-3',
      runId: run.id,
      threadId: run.threadId,
      workspaceId: 'workspace-1',
      provider: 'claude',
      permissionRequestId: 'toolu_3',
      action: 'tool.execute',
      details: {
        toolName: 'Edit'
      },
      status: 'pending',
      decision: null,
      decisionReason: null,
      requestedByActorId: 'assistant',
      resolvedByActorId: null,
      expiresAt: null,
      metadata: null,
      requestedAt: new Date('2026-01-01T00:04:00.000Z'),
      resolvedAt: null
    });

    const pendingResolved = await approvalRequestRepo.resolvePending('approval-3', 'approved', {
      decision: 'approved',
      decisionReason: 'First decision wins.',
      resolvedByActorId: 'admin-a',
      resolvedAt: new Date('2026-01-01T00:05:00.000Z')
    });
    const duplicateResolve = await approvalRequestRepo.resolvePending('approval-3', 'denied', {
      decision: 'denied',
      decisionReason: 'Late decision loses.',
      resolvedByActorId: 'admin-b',
      resolvedAt: new Date('2026-01-01T00:06:00.000Z')
    });

    expect(pendingResolved).toMatchObject({
      status: 'approved',
      decision: 'approved',
      decisionReason: 'First decision wins.',
      resolvedByActorId: 'admin-a'
    });
    expect(duplicateResolve).toBeNull();
    expect(await approvalRequestRepo.findById('approval-3')).toMatchObject({
      status: 'approved',
      decision: 'approved',
      decisionReason: 'First decision wins.',
      resolvedByActorId: 'admin-a'
    });
  });

  it('stores workspace agent profiles with provider, MCP, skill, and secret refs', async () => {
    const { workspace } = await createThreadAndRun();

    await agentProfileRepo.create({
      id: 'profile-claude',
      workspaceId: workspace.id,
      name: 'Claude default',
      provider: 'claude',
      model: 'deepseek-v4-flash',
      status: 'active',
      defaultForWorkspace: true,
      approvalPolicy: 'acceptEdits',
      sandboxMode: 'workspace-write',
      toolAllowlist: ['Bash', 'Read', 'Write', 'Edit'],
      mcpServers: [{ name: 'internal-docs', transport: 'http' }],
      skillRefs: ['repo-review'],
      secretRefs: ['secret-deepseek'],
      metadata: { purpose: 'smoke' },
      archivedAt: null
    });
    await agentProfileRepo.create({
      id: 'profile-codex',
      workspaceId: workspace.id,
      name: 'Codex default',
      provider: 'codex',
      model: 'gpt-5.5-codex',
      status: 'active',
      defaultForWorkspace: true,
      approvalPolicy: 'never',
      sandboxMode: 'workspace-write',
      toolAllowlist: ['command_execution'],
      mcpServers: [],
      skillRefs: [],
      secretRefs: ['secret-openai'],
      metadata: null,
      archivedAt: null
    });

    const defaultProfile = await agentProfileRepo.findDefaultByWorkspace(workspace.id);
    const profiles = await agentProfileRepo.listByWorkspace(workspace.id);

    expect(defaultProfile?.id).toBe('profile-codex');
    expect(profiles.map((profile) => profile.id)).toEqual(['profile-codex', 'profile-claude']);
    expect(profiles.find((profile) => profile.id === 'profile-claude')?.defaultForWorkspace).toBe(false);
    expect(profiles.find((profile) => profile.id === 'profile-claude')?.mcpServers).toEqual([
      { name: 'internal-docs', transport: 'http' }
    ]);
  });

  it('stores workspace secret references without raw secret values', async () => {
    const { workspace } = await createThreadAndRun();

    await workspaceSecretRefRepo.create({
      id: 'secret-openai',
      workspaceId: workspace.id,
      name: 'OPENAI_API_KEY',
      scope: 'workspace',
      delivery: 'env',
      status: 'active',
      refKey: 'vault://tenant/admin/openai',
      targetName: 'OPENAI_API_KEY',
      metadata: { provider: 'openai' },
      archivedAt: null
    });

    const refs = await workspaceSecretRefRepo.listByWorkspace(workspace.id);

    expect(refs).toHaveLength(1);
    expect(refs[0]).toMatchObject({
      id: 'secret-openai',
      refKey: 'vault://tenant/admin/openai',
      targetName: 'OPENAI_API_KEY'
    });
    expect(JSON.stringify(refs[0])).not.toContain('sk-');
  });

  it('upserts workspace file index entries and marks deleted files', async () => {
    const { workspace } = await createThreadAndRun();

    await workspaceFileIndexRepo.upsert({
      id: 'file-1',
      workspaceId: workspace.id,
      path: 'snake/index.html',
      kind: 'file',
      sizeBytes: 12,
      mimeType: 'text/html',
      contentHash: 'sha256:old',
      previewCapability: 'browser',
      metadata: { producedByRunId: 'run-1' },
      deletedAt: null
    });
    await workspaceFileIndexRepo.upsert({
      workspaceId: workspace.id,
      path: 'snake/index.html',
      kind: 'file',
      sizeBytes: 24,
      mimeType: 'text/html',
      contentHash: 'sha256:new',
      previewCapability: 'browser',
      metadata: { producedByRunId: 'run-2' },
      deletedAt: null
    });

    const activeFiles = await workspaceFileIndexRepo.listByWorkspace(workspace.id);
    expect(activeFiles).toHaveLength(1);
    expect(activeFiles[0]).toMatchObject({
      id: 'file-1',
      path: 'snake/index.html',
      contentHash: 'sha256:new',
      sizeBytes: 24
    });

    await workspaceFileIndexRepo.markDeleted({
      workspaceId: workspace.id,
      path: 'snake/index.html',
      deletedAt: new Date('2026-01-01T00:00:00.000Z')
    });

    await expect(workspaceFileIndexRepo.listByWorkspace(workspace.id)).resolves.toEqual([]);
    await expect(workspaceFileIndexRepo.listByWorkspace(workspace.id, { includeDeleted: true })).resolves.toHaveLength(1);
  });

  it('stores reviewable workspace file changes per run', async () => {
    const { workspace, thread, run } = await createThreadAndRun();

    const changeSet = await workspaceChangeSetRepo.create({
      id: 'changeset-1',
      workspaceId: workspace.id,
      threadId: thread.id,
      runId: run.id,
      status: 'pending',
      baseSnapshotId: 'snapshot-before',
      nextSnapshotId: null,
      metadata: { source: 'sandbox-diff' },
      resolvedAt: null
    });
    await workspaceFileChangeRepo.createMany([
      {
        id: 'change-1',
        changeSetId: changeSet.id,
        workspaceId: workspace.id,
        threadId: thread.id,
        runId: run.id,
        path: 'snake/index.html',
        changeType: 'created',
        beforeContentHash: null,
        afterContentHash: 'sha256:html',
        artifactId: null,
        metadata: { mimeType: 'text/html' }
      },
      {
        id: 'change-2',
        changeSetId: changeSet.id,
        workspaceId: workspace.id,
        threadId: thread.id,
        runId: run.id,
        path: 'README.md',
        changeType: 'modified',
        beforeContentHash: 'sha256:old',
        afterContentHash: 'sha256:new',
        artifactId: null,
        metadata: null
      }
    ]);

    const pending = await workspaceChangeSetRepo.listByWorkspace(workspace.id);
    const byRun = await workspaceChangeSetRepo.listByRun(run.id);
    const changesBySet = await workspaceFileChangeRepo.listByChangeSet(changeSet.id);
    const changesByRun = await workspaceFileChangeRepo.listByRun(run.id);

    expect(pending.map((set) => set.id)).toEqual(['changeset-1']);
    expect(byRun.map((set) => set.id)).toEqual(['changeset-1']);
    expect(changesBySet.map((change) => `${change.changeType}:${change.path}`)).toEqual([
      'modified:README.md',
      'created:snake/index.html'
    ]);
    expect(changesByRun.map((change) => change.id)).toEqual(['change-2', 'change-1']);

    const merged = await workspaceChangeSetRepo.updateStatus(changeSet.id, 'merged', {
      nextSnapshotId: 'snapshot-after',
      metadata: { mergedBy: 'admin' }
    });

    expect(merged.status).toBe('merged');
    expect(merged.resolvedAt).toBeInstanceOf(Date);
    expect(merged.nextSnapshotId).toBe('snapshot-after');
    await expect(workspaceChangeSetRepo.listByWorkspace(workspace.id)).resolves.toEqual([]);
    await expect(workspaceChangeSetRepo.listByWorkspace(workspace.id, { includeResolved: true })).resolves.toHaveLength(1);
  });
});
