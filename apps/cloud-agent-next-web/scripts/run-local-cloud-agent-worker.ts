process.env.CLOUD_AGENT_RUN_QUEUE_PROVIDER = process.env.CLOUD_AGENT_RUN_QUEUE_PROVIDER?.trim() || 'db-queue';
process.env.CLOUD_AGENT_WORKER_ID = process.env.CLOUD_AGENT_WORKER_ID?.trim() || `local-worker-${process.pid}`;
process.env.CLOUD_AGENT_ENV_FORCE_KEYS = appendForcedEnvKey(
  process.env.CLOUD_AGENT_ENV_FORCE_KEYS,
  'CLOUD_AGENT_RUN_QUEUE_PROVIDER'
);

await import('./run-cloud-agent-worker-loop');

export {};

function appendForcedEnvKey(current: string | undefined, key: string): string {
  const keys = new Set(
    current
      ?.split(',')
      .map((item) => item.trim())
      .filter(Boolean) ?? []
  );
  keys.add(key);
  return [...keys].join(',');
}
