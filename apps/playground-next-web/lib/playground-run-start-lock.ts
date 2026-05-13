const threadRunStartLocks = new Map<string, Promise<void>>();

export async function withThreadRunStartLock<T>(threadId: string, work: () => Promise<T>) {
  const previous = threadRunStartLocks.get(threadId) ?? Promise.resolve();
  let releaseCurrentLock!: () => void;
  const current = new Promise<void>((resolve) => {
    releaseCurrentLock = resolve;
  });
  const chained = previous.then(() => current);
  threadRunStartLocks.set(threadId, chained);
  await previous;

  try {
    return await work();
  } finally {
    releaseCurrentLock();
    if (threadRunStartLocks.get(threadId) === chained) {
      threadRunStartLocks.delete(threadId);
    }
  }
}
