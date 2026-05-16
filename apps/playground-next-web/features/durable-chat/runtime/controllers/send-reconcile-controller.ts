import type { MessageDto, ThreadMessagesPageInfoDto } from '@agent-infra/contracts';

import type { PlaygroundThreadDto } from '@/features/durable-chat/repo/chat-api';
import { runReconcileCompletedTurn as runDurableReconcileCompletedTurn } from '@/features/durable-chat/runtime/reconcile-completed-turn';

type DurableReconcileArgs = Parameters<typeof runDurableReconcileCompletedTurn>[0];

export type ReconcileCompletedTurnControllerArgs = {
  threadId: string;
  preferredRunId: string | null;
  requestId: number;
  state: {
    messages: MessageDto[];
    pageInfo: ThreadMessagesPageInfoDto | null;
  };
  refs: DurableReconcileArgs['refs'];
  actions: DurableReconcileArgs['actions'];
  operations: {
    getThreads: () => PlaygroundThreadDto[];
    isDefaultThreadTitle: (title: string | null | undefined) => boolean;
    refreshThreadAfterCompletedRun: (threadId: string) => Promise<unknown>;
    refreshThreads: () => Promise<unknown>;
    reconcileCompletedTurn?: typeof runDurableReconcileCompletedTurn;
  };
};

export async function runReconcileCompletedTurnController(args: ReconcileCompletedTurnControllerArgs) {
  const reconcileCompletedTurn = args.operations.reconcileCompletedTurn ?? runDurableReconcileCompletedTurn;

  await reconcileCompletedTurn({
    threadId: args.threadId,
    preferredRunId: args.preferredRunId,
    requestId: args.requestId,
    state: {
      messages: args.state.messages,
      pageInfo: args.state.pageInfo
    },
    refs: args.refs,
    actions: args.actions
  });

  const currentThread = args.operations.getThreads().find((thread) => thread.id === args.threadId) ?? null;
  if (!currentThread || args.operations.isDefaultThreadTitle(currentThread.title)) {
    try {
      await args.operations.refreshThreadAfterCompletedRun(args.threadId);
    } catch {
      // Thread title refresh is a best-effort fallback after the durable turn reconciles.
    }
    return;
  }

  try {
    await args.operations.refreshThreads();
  } catch {
    // Thread list refresh is best-effort after a completed durable turn.
  }
}
