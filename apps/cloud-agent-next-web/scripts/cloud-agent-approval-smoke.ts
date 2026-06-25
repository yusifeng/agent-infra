import { mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { PermissionRequest } from '@agent-infra/cloud-agent-runtime';

const appRoot = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const repoRoot = path.resolve(appRoot, '../..');
const smokeRoot = path.join(repoRoot, '.cloud-agent-data/cloud-agent-approval-smoke');
const ownerUserId = 'approval-smoke-admin';
const approvedPermissionRequestId = 'approval-smoke-permission-approved';
const deniedPermissionRequestId = 'approval-smoke-permission-denied';

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
  await exerciseApprovalDecision({
    decision: 'approved',
    permissionRequestId: approvedPermissionRequestId,
    reason: 'Approved by cloud-agent approval smoke.',
    scope,
    services: {
      DurablePermissionBroker,
      listRunApprovalRequestsForOwner,
      recordCloudAgentRuntimeEvent,
      resolveRunApprovalRequestForOwner
    },
    thread: userTurn.thread,
    runId: run.id
  });
  await exerciseApprovalDecision({
    decision: 'denied',
    permissionRequestId: deniedPermissionRequestId,
    reason: 'Denied by cloud-agent approval smoke.',
    scope,
    services: {
      DurablePermissionBroker,
      listRunApprovalRequestsForOwner,
      recordCloudAgentRuntimeEvent,
      resolveRunApprovalRequestForOwner
    },
    thread: userTurn.thread,
    runId: run.id
  });

  const repositories = await getCloudAgentRepositories();
  const [approvalRequests, events] = await Promise.all([
    repositories.runApprovalRequestRepo.listByRun(run.id),
    repositories.runEventRepo.listByRun(run.id)
  ]);
  const approvedRequest = approvalRequests.find((request) => request.permissionRequestId === approvedPermissionRequestId);
  const deniedRequest = approvalRequests.find((request) => request.permissionRequestId === deniedPermissionRequestId);
  if (!approvedRequest || approvedRequest.status !== 'approved') {
    throw new Error('Approval smoke did not persist an approved approval request.');
  }
  if (!deniedRequest || deniedRequest.status !== 'denied') {
    throw new Error('Approval smoke did not persist a denied approval request.');
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
        approvedStatus: approvedRequest.status,
        deniedStatus: deniedRequest.status,
        approvalActions: approvalRequests.map((request) => request.action).sort(),
        eventTypes
      },
      null,
      2
    )
  );
}

async function exerciseApprovalDecision(input: {
  decision: 'approved' | 'denied';
  permissionRequestId: string;
  reason: string;
  runId: string;
  scope: PermissionRequest['scope'];
  services: {
    DurablePermissionBroker: typeof import('../lib/durable-permission-broker').DurablePermissionBroker;
    listRunApprovalRequestsForOwner: typeof import('../lib/run-approval-store').listRunApprovalRequestsForOwner;
    recordCloudAgentRuntimeEvent: typeof import('../lib/runtime-event-recorder').recordCloudAgentRuntimeEvent;
    resolveRunApprovalRequestForOwner: typeof import('../lib/run-approval-store').resolveRunApprovalRequestForOwner;
  };
  thread: Awaited<ReturnType<typeof import('../lib/thread-store').appendUserMessage>>['thread'];
}): Promise<void> {
  const permissionRequest: PermissionRequest = {
    scope: input.scope,
    provider: 'claude',
    permissionRequestId: input.permissionRequestId,
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
  const broker = new input.services.DurablePermissionBroker({
    pollMs: 50,
    timeoutMs: 5_000
  });
  const decisionPromise = broker.resolve(permissionRequest);

  await input.services.recordCloudAgentRuntimeEvent({
    ownerUserId,
    provider: 'claude',
    thread: input.thread,
    runId: input.runId,
    event: {
      type: 'permission_requested',
      payload: {
        provider: 'claude',
        permissionRequestId: input.permissionRequestId,
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

  const pending = await input.services.listRunApprovalRequestsForOwner({
    ownerUserId,
    runId: input.runId
  });
  const approvalRequest = pending?.approvalRequests?.find(
    (request) => request.permissionRequestId === input.permissionRequestId
  );
  if (!approvalRequest || approvalRequest.status !== 'pending') {
    throw new Error(`Approval smoke did not persist a pending ${input.decision} approval request.`);
  }

  const resolved = await input.services.resolveRunApprovalRequestForOwner({
    approvalRequestId: approvalRequest.id,
    body: {
      decision: input.decision,
      reason: input.reason
    },
    ownerUserId,
    runId: input.runId
  });
  if (resolved.status !== 200) {
    throw new Error(`Approval smoke failed to resolve request: ${resolved.response.error ?? resolved.status}`);
  }

  const decision = await decisionPromise;
  if (decision.decision !== input.decision) {
    throw new Error(`Expected broker decision ${input.decision}, got ${decision.decision}.`);
  }

  await input.services.recordCloudAgentRuntimeEvent({
    ownerUserId,
    provider: 'claude',
    thread: input.thread,
    runId: input.runId,
    event: {
      type: 'approval_resolved',
      payload: {
        provider: 'claude',
        permissionRequestId: input.permissionRequestId,
        decision: decision.decision,
        status: decision.approvalStatus ?? decision.decision,
        reason: decision.reason ?? null,
        resolvedByActorId: decision.resolvedByActorId ?? null
      }
    }
  });
}

function assertIncludes(values: string[], expected: string, label: string): void {
  if (!values.includes(expected)) {
    throw new Error(`Expected ${label} to include ${expected}; saw: ${values.join(', ')}`);
  }
}
