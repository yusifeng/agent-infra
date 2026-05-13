import { InMemoryRunStreamHub } from '@agent-infra/durable-chat-server';

const globalForRunStreamHub = globalThis as typeof globalThis & {
  __playgroundNextRunStreamHub?: InMemoryRunStreamHub;
};

export function getPlaygroundRunStreamHub() {
  if (!globalForRunStreamHub.__playgroundNextRunStreamHub) {
    globalForRunStreamHub.__playgroundNextRunStreamHub = new InMemoryRunStreamHub();
  }

  return globalForRunStreamHub.__playgroundNextRunStreamHub;
}
