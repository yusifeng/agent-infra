import type { CloudRunEventPayloadV1 } from '@agent-infra/core';

export interface CloudRunEventRecord {
  id: string;
  threadId: string;
  runId: string;
  seq: number;
  type: CloudRunEventPayloadV1['type'];
  payload: CloudRunEventPayloadV1;
  createdAt: string;
}

export interface CloudRunEventHubSubscriber {
  send(event: CloudRunEventRecord): void;
  close?(): void;
}

export interface CloudRunEventHubSubscription {
  unsubscribe(): void;
}

export interface CloudRunEventHub {
  publish(event: CloudRunEventRecord): boolean;
  subscribe(runId: string, subscriber: CloudRunEventHubSubscriber): CloudRunEventHubSubscription;
  closeRun(runId: string): boolean;
}

export class InMemoryCloudRunEventHub implements CloudRunEventHub {
  private readonly subscribersByRunId = new Map<string, Set<CloudRunEventHubSubscriber>>();

  publish(event: CloudRunEventRecord): boolean {
    const subscribers = this.subscribersByRunId.get(event.runId);
    if (!subscribers || subscribers.size === 0) {
      return false;
    }

    for (const subscriber of subscribers) {
      subscriber.send(event);
    }
    return true;
  }

  subscribe(runId: string, subscriber: CloudRunEventHubSubscriber): CloudRunEventHubSubscription {
    const subscribers = this.subscribersByRunId.get(runId) ?? new Set<CloudRunEventHubSubscriber>();
    subscribers.add(subscriber);
    this.subscribersByRunId.set(runId, subscribers);

    return {
      unsubscribe: () => {
        subscribers.delete(subscriber);
        if (subscribers.size === 0) {
          this.subscribersByRunId.delete(runId);
        }
      }
    };
  }

  closeRun(runId: string): boolean {
    const subscribers = this.subscribersByRunId.get(runId);
    if (!subscribers) {
      return false;
    }

    for (const subscriber of subscribers) {
      subscriber.close?.();
    }
    this.subscribersByRunId.delete(runId);
    return true;
  }
}
