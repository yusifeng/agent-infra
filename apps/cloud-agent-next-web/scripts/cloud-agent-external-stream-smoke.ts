import { mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { runCloudAgentRunJob } from '../lib/agent-run-worker';
import { getCloudAgentRepositories } from '../lib/db';
import { getCloudAgentWorkerRunQueueProvider } from '../lib/run-queue-provider';
import { postThreadMessage } from '../lib/thread-message-route-service';

const appRoot = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const repoRoot = path.resolve(appRoot, '../..');
const smokeRoot = path.join(repoRoot, '.cloud-agent-data/cloud-agent-external-stream-smoke');
const ownerUserId = 'external-stream-smoke-admin';
const workerId = 'external-stream-smoke-worker';

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});

async function main(): Promise<void> {
  process.chdir(appRoot);
  setSmokeEnv();
  await rm(smokeRoot, { force: true, recursive: true });
  await mkdir(smokeRoot, { recursive: true });

  const response = await postThreadMessage({
    request: new Request('http://cloud-agent.local/chat/new/message', {
      method: 'POST',
      headers: {
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        content: 'External stream smoke. Return the fallback completion.',
        stream: true
      })
    }),
    threadId: 'new',
    user: {
      id: ownerUserId,
      username: 'ExternalStreamSmoke',
      displayName: 'External Stream Smoke'
    }
  });

  if (!response.body) {
    throw new Error('Expected streaming response body.');
  }

  const events: Record<string, unknown>[] = [];
  let workerDone: Promise<unknown> | null = null;
  for await (const event of readNdjson(response.body)) {
    events.push(event);
    if (event.type === 'user_message' && typeof event.runId === 'string' && !workerDone) {
      workerDone = runClaimedWorkerJob(event.runId);
    }
    if (event.type === 'completed') {
      break;
    }
  }

  await workerDone;
  const completed = events.find((event) => event.type === 'completed');
  const runId = readString(events.find((event) => event.type === 'user_message'), 'runId');
  if (!runId) {
    throw new Error('External stream smoke did not receive user_message runId.');
  }
  if (!events.some((event) => event.type === 'assistant_delta')) {
    throw new Error('External stream smoke did not receive assistant_delta from persisted run events.');
  }
  if (!completed || completed.failed !== false) {
    throw new Error(`External stream smoke did not complete successfully: ${JSON.stringify(completed)}`);
  }

  const repositories = await getCloudAgentRepositories();
  const [run, runEvents] = await Promise.all([
    repositories.runRepo.findById(runId),
    repositories.runEventRepo.listByRun(runId)
  ]);
  if (run?.status !== 'completed') {
    throw new Error(`Expected completed run, got ${run?.status ?? 'missing'}.`);
  }
  if (!runEvents.some((event) => event.type === 'agent_message_delta')) {
    throw new Error('External stream smoke did not persist agent_message_delta.');
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        mode: 'db-queue',
        runId,
        streamedTypes: events.map((event) => event.type),
        persistedEventTypes: runEvents.map((event) => event.type),
        workerId
      },
      null,
      2
    )
  );
}

function setSmokeEnv(): void {
  const forcedKeys = [
    'ANTHROPIC_API_KEY',
    'ANTHROPIC_AUTH_TOKEN',
    'CLOUD_AGENT_DATA_DIR',
    'CLOUD_AGENT_RUN_QUEUE_PROVIDER',
    'CODEX_API_KEY',
    'DEEPSEEK_API_KEY',
    'OPENAI_API_KEY'
  ];
  process.env.ANTHROPIC_API_KEY = '';
  process.env.ANTHROPIC_AUTH_TOKEN = '';
  process.env.CLOUD_AGENT_DATA_DIR = smokeRoot;
  process.env.CLOUD_AGENT_RUN_QUEUE_PROVIDER = 'db-queue';
  process.env.CODEX_API_KEY = '';
  process.env.DEEPSEEK_API_KEY = '';
  process.env.OPENAI_API_KEY = '';
  process.env.CLOUD_AGENT_ENV_FORCE_KEYS = forcedKeys.join(',');
}

async function runClaimedWorkerJob(expectedRunId: string): Promise<void> {
  const queueProvider = getCloudAgentWorkerRunQueueProvider();
  const claimed = await queueProvider.claimNext({ workerId, leaseMs: 60_000 });
  if (!claimed) {
    throw new Error('External stream smoke worker did not claim a queued run.');
  }
  if (claimed.id !== expectedRunId) {
    throw new Error(`External stream smoke claimed ${claimed.id}, expected ${expectedRunId}.`);
  }

  const result = await runCloudAgentRunJob(claimed.id, {
    leaseMs: 60_000,
    maxAttempts: 1,
    workerId
  });
  if (result.failed) {
    throw new Error(result.error ?? 'External stream smoke worker run failed.');
  }
}

async function* readNdjson(stream: ReadableStream<Uint8Array>): AsyncIterable<Record<string, unknown>> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    buffer += decoder.decode(value, { stream: true });
    let newlineIndex = buffer.indexOf('\n');
    while (newlineIndex !== -1) {
      const line = buffer.slice(0, newlineIndex).trim();
      buffer = buffer.slice(newlineIndex + 1);
      if (line) {
        yield JSON.parse(line) as Record<string, unknown>;
      }
      newlineIndex = buffer.indexOf('\n');
    }
  }

  const line = buffer.trim();
  if (line) {
    yield JSON.parse(line) as Record<string, unknown>;
  }
}

function readString(event: Record<string, unknown> | undefined, key: string): string | null {
  const value = event?.[key];
  return typeof value === 'string' ? value : null;
}
