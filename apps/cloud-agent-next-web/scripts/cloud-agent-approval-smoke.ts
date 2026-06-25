import { mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { PermissionRequest } from '@agent-infra/cloud-agent-runtime';

const appRoot = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const repoRoot = path.resolve(appRoot, '../..');
const smokeRoot = path.join(repoRoot, '.cloud-agent-data/cloud-agent-approval-smoke');
const ownerUserId = 'approval-smoke-admin';
const permissionRequestId = 'approval-smoke-permission-1';

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});

async function main(): Promise<void> {
  process.chdir(appRoot);
  process.env.CLOUD_AGENT_DATA_DIR = smokeRoot;
  process.env.CLOUD_AGENT_APPROVAL_POLL_MS = '50';
  process.env.CLOUD_AGENT_APPROVAL_TIMEOUT_MS = '5000';

  await rm(smokeRoot, { force: true, recursive: true });
  await mkdir(smokeRoot, { recursive: true });

  const [
    { DurablePermissionBroker },
    { getCloudAgentRepositories },
    { recordCloudAgentRuntimeEvent },
    { listRunApprovalRequestsForOwner, resolveRunApprovalRequestForOwner },
    { createCloudAgentRun },
    { appendUserMessage }
  ] = await Promise.all([
    import('../lib/durable-permission-broker'),
    import('../lib/db'),
    import('../lib/runtime-event-recorder'),
    import('../lib/run-approval-store'),
    import('../lib/run-store'),
    import('../lib/thread-store')
  ]);

  const userTurn = await appendUserMessage({
    ownerUserId,
    provider: 'claude',
    content: 'approval smoke'
  });
  const run = await createCloudAgentRun({
    threadId: userTurn.thread.id,
    triggerMessageId: userTurn.message.id,
    provider: 'claude'
  });
  const scope = {
    tenantId: 'local-dev',
    userId: ownerUserId,
    workspaceId: userTurn.thread.workspaceId,
    threadId: userTurn.thread.id,
    runId: run.id
  };
  const permissionRequest: PermissionRequest = {
    scope,
    provider: 'claude',
    permissionRequestId,
    toolName: 'Bash',
    input: {
      command: 'pwd'
    },
    title: 'Claude wants to run Bash',
    displayName: null,
    description: null,
    blockedPath: null,
    decisionReason: null,
    suggestions: null,
    agentId: null
  };
  const broker = new DurablePermissionBroker({
    pollMs: 50,
    timeoutMs: 5_000
  });
  const decisionPromise = broker.resolve(permissionRequest);

  await recordCloudAgentRuntimeEvent({
    ownerUserId,
    provider: 'claude',
    thread: userTurn.thread,
    runId: run.id,
    event: {
      type: 'permission_requested',
      payload: {
        provider: 'claude',
        permissionRequestId,
        action: 'Bash',
        details: {
          input: {
            command: 'pwd'
          },
          title: 'Claude wants to run Bash',
          toolName: 'Bash'
        }
      }
    }
  });

  const pending = await listRunApprovalRequestsForOwner({
    ownerUserId,
    runId: run.id
  });
  const approvalRequest = pending?.approvalRequests?.find((request) => request.permissionRequestId === permissionRequestId);
  if (!approvalRequest || approvalRequest.status !== 'pending') {
    throw new Error('Approval smoke did not persist a pending approval request.');
  }

  const resolved = await resolveRunApprovalRequestForOwner({
    approvalRequestId: approvalRequest.id,
    body: {
      decision: 'approved',
      reason: 'Approved by cloud-agent approval smoke.'
    },
    ownerUserId,
    runId: run.id
  });
  if (resolved.status !== 200) {
    throw new Error(`Approval smoke failed to approve request: ${resolved.response.error ?? resolved.status}`);
  }

  const decision = await decisionPromise;
  if (decision.decision !== 'approved') {
    throw new Error(`Expected broker decision approved, got ${decision.decision}.`);
  }

  await recordCloudAgentRuntimeEvent({
    ownerUserId,
    provider: 'claude',
    thread: userTurn.thread,
    runId: run.id,
    event: {
      type: 'approval_resolved',
      payload: {
        provider: 'claude',
        permissionRequestId,
        decision: decision.decision,
        status: decision.approvalStatus ?? decision.decision,
        reason: decision.reason ?? null,
        resolvedByActorId: decision.resolvedByActorId ?? null
      }
    }
  });

  const repositories = await getCloudAgentRepositories();
  const [approvalRequests, events] = await Promise.all([
    repositories.runApprovalRequestRepo.listByRun(run.id),
    repositories.runEventRepo.listByRun(run.id)
  ]);
  const finalApproval = approvalRequests.find((request) => request.permissionRequestId === permissionRequestId);
  if (!finalApproval || finalApproval.status !== 'approved') {
    throw new Error('Approval smoke did not persist an approved approval request.');
  }

  const eventTypes = events.map((event) => event.type);
  assertIncludes(eventTypes, 'permission_requested', 'run events');
  assertIncludes(eventTypes, 'approval_resolved', 'run events');

  console.log(
    JSON.stringify(
      {
        ok: true,
        runId: run.id,
        threadId: userTurn.thread.id,
        workspaceId: userTurn.thread.workspaceId,
        brokerDecision: decision.decision,
        approvalStatus: finalApproval.status,
        approvalAction: finalApproval.action,
        eventTypes
      },
      null,
      2
    )
  );
}

function assertIncludes(values: string[], expected: string, label: string): void {
  if (!values.includes(expected)) {
    throw new Error(`Expected ${label} to include ${expected}; saw: ${values.join(', ')}`);
  }
}
