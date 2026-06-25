import { InMemoryCloudRunEventHub, type CloudRunEventRecord } from '@agent-infra/cloud-agent-runtime';

const globalForCloudRunEventHub = globalThis as typeof globalThis & {
  __cloudAgentRunEventHub?: InMemoryCloudRunEventHub;
};

export function getCloudRunEventHub(): InMemoryCloudRunEventHub {
  if (!globalForCloudRunEventHub.__cloudAgentRunEventHub) {
    globalForCloudRunEventHub.__cloudAgentRunEventHub = new InMemoryCloudRunEventHub();
  }

  return globalForCloudRunEventHub.__cloudAgentRunEventHub;
}

export function publishCloudRunEvent(event: CloudRunEventRecord): void {
  getCloudRunEventHub().publish(event);
}

export function closeCloudRunEventStream(runId: string): void {
  getCloudRunEventHub().closeRun(runId);
}
