import { NextResponse } from 'next/server';

import {
  cleanCloudAgentBullMqCompletedJobs,
  readCloudAgentBullMqQueueSnapshot,
  retryCloudAgentBullMqFailedJobs
} from '@/lib/bullmq-run-queue';
import {
  cancelDeadLetterCloudAgentRuns,
  readCloudAgentRunQueueSnapshot,
  requeueLeaseExpiredCloudAgentRuns,
  retryFailedCloudAgentRuns
} from '@/lib/run-queue-snapshot';
import { getCloudAgentRunQueueDiagnostics } from '@/lib/run-queue-provider';
import { requireRouteUser } from '@/lib/route-auth';
import {
  clearCloudAgentWorkerDrain,
  clearCloudAgentWorkerPoolDrain,
  markStaleCloudAgentWorkersStopped,
  readCloudAgentWorkerRegistrySnapshot,
  requestCloudAgentWorkerDrain,
  requestCloudAgentWorkerPoolDrain,
  safelyMarkCloudAgentWorkerStopped
} from '@/lib/worker-registry';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  const auth = requireRouteUser(request);
  if (auth.response || !auth.user) {
    return auth.response;
  }

  try {
    const diagnostics = getCloudAgentRunQueueDiagnostics();
    const bullmq =
      diagnostics.configuredKind === 'bullmq' && diagnostics.ready
        ? await readCloudAgentBullMqQueueSnapshot().catch((error) => ({
            error: error instanceof Error ? error.message : String(error)
          }))
        : null;
    const dbQueue = await readCloudAgentRunQueueSnapshot().catch((error) => ({
      error: error instanceof Error ? error.message : String(error)
    }));
    const workerRegistry = await readCloudAgentWorkerRegistrySnapshot().catch((error) => ({
      error: error instanceof Error ? error.message : String(error)
    }));
    return NextResponse.json(
      {
        ...diagnostics,
        bullmq,
        dbQueue,
        workerRegistry
      },
      {
        status: diagnostics.ready ? 200 : 501
      }
    );
  } catch (error) {
    return NextResponse.json(
      {
        backends: [],
        configuredKind: null,
        error: error instanceof Error ? error.message : String(error),
        productionIssues: [error instanceof Error ? error.message : String(error)],
        productionReady: false,
        ready: false
      },
      { status: 400 }
    );
  }
}

export async function POST(request: Request) {
  const auth = requireRouteUser(request);
  if (auth.response || !auth.user) {
    return auth.response;
  }

  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const action = typeof body.action === 'string' ? body.action : null;

    if (action === 'retry-db-failed-runs') {
      const result = await retryFailedCloudAgentRuns({
        actorId: auth.user.id,
        includeDeadLetter: readBoolean(body.includeDeadLetter),
        limit: readPositiveInteger(body.limit),
        nextAttemptDelayMs: readPositiveInteger(body.nextAttemptDelayMs),
        reason: readOptionalString(body.reason)
      });
      return NextResponse.json(result);
    }

    if (action === 'requeue-db-lease-expired-runs') {
      const result = await requeueLeaseExpiredCloudAgentRuns({
        actorId: auth.user.id,
        limit: readPositiveInteger(body.limit),
        nextAttemptDelayMs: readPositiveInteger(body.nextAttemptDelayMs),
        reason: readOptionalString(body.reason)
      });
      return NextResponse.json(result);
    }

    if (action === 'cancel-db-dead-letter-runs') {
      const result = await cancelDeadLetterCloudAgentRuns({
        actorId: auth.user.id,
        limit: readPositiveInteger(body.limit),
        reason: readOptionalString(body.reason)
      });
      return NextResponse.json(result);
    }

    if (action === 'drain-worker') {
      const workerId = readRequiredString(body.workerId);
      if (!workerId) {
        return NextResponse.json({ error: 'workerId is required' }, { status: 400 });
      }
      const worker = await requestCloudAgentWorkerDrain({
        actorId: auth.user.id,
        reason: readOptionalString(body.reason),
        workerId
      });
      return worker ? NextResponse.json({ worker }) : NextResponse.json({ error: 'worker not found' }, { status: 404 });
    }

    if (action === 'drain-workers') {
      const result = await requestCloudAgentWorkerPoolDrain({
        actorId: auth.user.id,
        limit: readPositiveInteger(body.limit),
        reason: readOptionalString(body.reason)
      });
      return NextResponse.json(result);
    }

    if (action === 'clear-worker-drain') {
      const workerId = readRequiredString(body.workerId);
      if (!workerId) {
        return NextResponse.json({ error: 'workerId is required' }, { status: 400 });
      }
      const worker = await clearCloudAgentWorkerDrain({
        actorId: auth.user.id,
        reason: readOptionalString(body.reason),
        workerId
      });
      return worker ? NextResponse.json({ worker }) : NextResponse.json({ error: 'worker not found' }, { status: 404 });
    }

    if (action === 'clear-workers-drain') {
      const result = await clearCloudAgentWorkerPoolDrain({
        actorId: auth.user.id,
        limit: readPositiveInteger(body.limit),
        reason: readOptionalString(body.reason)
      });
      return NextResponse.json(result);
    }

    if (action === 'mark-worker-stopped') {
      const workerId = readRequiredString(body.workerId);
      if (!workerId) {
        return NextResponse.json({ error: 'workerId is required' }, { status: 400 });
      }
      const result = await safelyMarkCloudAgentWorkerStopped({
        actorId: auth.user.id,
        force: readBoolean(body.force),
        reason: readOptionalString(body.reason),
        workerId
      });
      if (result.status === 'not_found') {
        return NextResponse.json({ error: 'worker not found' }, { status: 404 });
      }
      if (result.status === 'skipped_active_runs') {
        return NextResponse.json(
          {
            ...result,
            error: 'worker has active runs; pass force=true to mark it stopped anyway'
          },
          { status: 409 }
        );
      }
      return NextResponse.json(result);
    }

    if (action === 'mark-stale-workers-stopped') {
      const result = await markStaleCloudAgentWorkersStopped({
        actorId: auth.user.id,
        limit: readPositiveInteger(body.limit),
        reason: readOptionalString(body.reason),
        staleAfterMs: readPositiveInteger(body.staleAfterMs)
      });
      return NextResponse.json(result);
    }

    if (action === 'retry-failed') {
      const diagnostics = getCloudAgentRunQueueDiagnostics();
      if (diagnostics.configuredKind !== 'bullmq' || !diagnostics.ready) {
        return NextResponse.json(
          {
            error: diagnostics.error ?? 'BullMQ queue provider is not ready.'
          },
          {
            status: diagnostics.ready ? 409 : 501
          }
        );
      }
      const result = await retryCloudAgentBullMqFailedJobs({
        limit: readPositiveInteger(body.limit)
      });
      return NextResponse.json(result);
    }

    if (action === 'clean-completed') {
      const diagnostics = getCloudAgentRunQueueDiagnostics();
      if (diagnostics.configuredKind !== 'bullmq' || !diagnostics.ready) {
        return NextResponse.json(
          {
            error: diagnostics.error ?? 'BullMQ queue provider is not ready.'
          },
          {
            status: diagnostics.ready ? 409 : 501
          }
        );
      }
      const result = await cleanCloudAgentBullMqCompletedJobs({
        graceMs: readPositiveInteger(body.graceMs),
        limit: readPositiveInteger(body.limit)
      });
      return NextResponse.json(result);
    }

    return NextResponse.json(
      {
        error:
          'action must be retry-db-failed-runs, requeue-db-lease-expired-runs, cancel-db-dead-letter-runs, drain-worker, drain-workers, clear-worker-drain, clear-workers-drain, mark-worker-stopped, mark-stale-workers-stopped, retry-failed, or clean-completed'
      },
      { status: 400 }
    );
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : String(error)
      },
      { status: 500 }
    );
  }
}

function readPositiveInteger(value: unknown): number | undefined {
  const parsed = typeof value === 'number' ? value : typeof value === 'string' ? Number(value.trim()) : NaN;
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

function readOptionalString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function readRequiredString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function readBoolean(value: unknown): boolean {
  return value === true || value === 'true';
}
