import { randomUUID } from 'node:crypto';

import { ThreadNotActiveError, ThreadNotFoundError } from '@agent-infra/app';
import { createAgentInfraRepositories, type DbConfig, withDbTransaction } from '@agent-infra/db';

import { APP_ID } from '../../../constants.js';
import { PlaygroundThreadCatalogRepo, type PlaygroundThreadCatalogRow } from '../repo/thread-catalog-repo.js';
import type { PlaygroundAppThread } from '../types/playground-app-thread.js';

export class PlaygroundThreadCatalogService {
  readonly repo: PlaygroundThreadCatalogRepo;

  constructor(private readonly dbConfig: DbConfig) {
    this.repo = new PlaygroundThreadCatalogRepo(dbConfig);
  }

  async createCatalogRow(threadId: string, ownerUserId: string, now: Date) {
    return this.repo.create({
      threadId,
      appId: APP_ID,
      ownerUserId,
      pinnedAt: null,
      runtimeProvider: null,
      runtimeModel: null,
      createdAt: now,
      updatedAt: now
    });
  }

  async createThreadWithCatalog(input: {
    ownerUserId: string;
    title?: string | null;
    metadata?: Record<string, unknown> | null;
  }): Promise<{ thread: PlaygroundAppThread; catalogRow: PlaygroundThreadCatalogRow }> {
    return withDbTransaction(this.dbConfig, async (tx) => {
      const repositories = createAgentInfraRepositories(this.dbConfig.mode, tx);
      const catalogRepo = new PlaygroundThreadCatalogRepo({
        mode: this.dbConfig.mode,
        db: tx
      });
      const thread = await repositories.threadRepo.create({
        id: randomUUID(),
        appId: APP_ID,
        userId: null,
        title: input.title?.trim() ? input.title.trim() : null,
        status: 'active',
        metadata: input.metadata ?? null,
        archivedAt: null
      });
      const catalogRow = await catalogRepo.create({
        threadId: thread.id,
        appId: APP_ID,
        ownerUserId: input.ownerUserId,
        pinnedAt: null,
        runtimeProvider: null,
        runtimeModel: null,
        createdAt: thread.createdAt,
        updatedAt: thread.updatedAt
      });

      return {
        thread,
        catalogRow
      };
    });
  }

  async listVisibleCatalogRows(ownerUserId: string) {
    return this.repo.listByOwner(APP_ID, ownerUserId);
  }

  async loadAccessibleThread(
    threadId: string,
    ownerUserId: string,
    loadThread: () => Promise<PlaygroundAppThread | null>
  ): Promise<{ thread: PlaygroundAppThread; catalogRow: PlaygroundThreadCatalogRow }> {
    const catalogRow = await this.repo.findByThreadId(threadId);
    if (!catalogRow || catalogRow.appId !== APP_ID || catalogRow.ownerUserId !== ownerUserId) {
      throw new ThreadNotFoundError(threadId);
    }

    const thread = await loadThread();
    if (!thread || thread.appId !== APP_ID) {
      throw new ThreadNotFoundError(threadId);
    }

    return {
      thread,
      catalogRow
    };
  }

  async pinThread(thread: PlaygroundAppThread, now: Date) {
    if (thread.status !== 'active') {
      throw new ThreadNotActiveError(thread.id, thread.status);
    }

    const row = await this.repo.updatePinnedAt(thread.id, now, now);
    if (!row) {
      throw new ThreadNotFoundError(thread.id);
    }

    return row;
  }

  async unpinThread(threadId: string, now: Date) {
    const row = await this.repo.updatePinnedAt(threadId, null, now);
    if (!row) {
      throw new ThreadNotFoundError(threadId);
    }

    return row;
  }
}
