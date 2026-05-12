import { and, desc, eq, isNull } from 'drizzle-orm';
import type { DbConfig } from '@agent-infra/db';

import { playgroundThreadCatalogPg, playgroundThreadCatalogSqlite } from './schema.js';

export type PlaygroundThreadCatalogRow = {
  threadId: string;
  appId: string;
  ownerUserId: string;
  pinnedAt: Date | null;
  runtimeProvider: string | null;
  runtimeModel: string | null;
  createdAt: Date;
  updatedAt: Date;
};

function toCatalogRow(row: {
  threadId: string;
  appId: string;
  ownerUserId: string;
  pinnedAt: Date | null;
  runtimeProvider: string | null;
  runtimeModel: string | null;
  createdAt: Date;
  updatedAt: Date;
}): PlaygroundThreadCatalogRow {
  return {
    threadId: row.threadId,
    appId: row.appId,
    ownerUserId: row.ownerUserId,
    pinnedAt: row.pinnedAt,
    runtimeProvider: row.runtimeProvider,
    runtimeModel: row.runtimeModel,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  };
}

export class PlaygroundThreadCatalogRepo {
  constructor(private readonly dbConfig: Pick<DbConfig, 'mode' | 'db'>) {}

  async create(input: {
    threadId: string;
    appId: string;
    ownerUserId: string;
    pinnedAt?: Date | null;
    runtimeProvider?: string | null;
    runtimeModel?: string | null;
    createdAt: Date;
    updatedAt: Date;
  }) {
    const values = {
      threadId: input.threadId,
      appId: input.appId,
      ownerUserId: input.ownerUserId,
      pinnedAt: input.pinnedAt ?? null,
      runtimeProvider: input.runtimeProvider ?? null,
      runtimeModel: input.runtimeModel ?? null,
      createdAt: input.createdAt,
      updatedAt: input.updatedAt
    };

    if (this.dbConfig.mode === 'postgres') {
      const rows = await this.dbConfig.db.insert(playgroundThreadCatalogPg).values(values).returning();
      return toCatalogRow(rows[0]);
    }

    const rows = await this.dbConfig.db.insert(playgroundThreadCatalogSqlite).values(values).returning();
    return toCatalogRow(rows[0]);
  }

  async listByOwner(appId: string, ownerUserId: string) {
    if (this.dbConfig.mode === 'postgres') {
      const rows = await this.dbConfig.db
        .select()
        .from(playgroundThreadCatalogPg)
        .where(and(eq(playgroundThreadCatalogPg.appId, appId), eq(playgroundThreadCatalogPg.ownerUserId, ownerUserId)))
        .orderBy(desc(playgroundThreadCatalogPg.pinnedAt), desc(playgroundThreadCatalogPg.updatedAt));
      return rows.map(toCatalogRow);
    }

    const rows = await this.dbConfig.db
      .select()
      .from(playgroundThreadCatalogSqlite)
      .where(and(eq(playgroundThreadCatalogSqlite.appId, appId), eq(playgroundThreadCatalogSqlite.ownerUserId, ownerUserId)))
      .orderBy(desc(playgroundThreadCatalogSqlite.pinnedAt), desc(playgroundThreadCatalogSqlite.updatedAt));
    return rows.map(toCatalogRow);
  }

  async findByThreadId(threadId: string) {
    if (this.dbConfig.mode === 'postgres') {
      const rows = await this.dbConfig.db
        .select()
        .from(playgroundThreadCatalogPg)
        .where(eq(playgroundThreadCatalogPg.threadId, threadId))
        .limit(1);
      return rows[0] ? toCatalogRow(rows[0]) : null;
    }

    const rows = await this.dbConfig.db
      .select()
      .from(playgroundThreadCatalogSqlite)
      .where(eq(playgroundThreadCatalogSqlite.threadId, threadId))
      .limit(1);
    return rows[0] ? toCatalogRow(rows[0]) : null;
  }

  async updatePinnedAt(threadId: string, pinnedAt: Date | null, updatedAt: Date) {
    if (this.dbConfig.mode === 'postgres') {
      const rows = await this.dbConfig.db
        .update(playgroundThreadCatalogPg)
        .set({ pinnedAt, updatedAt })
        .where(eq(playgroundThreadCatalogPg.threadId, threadId))
        .returning();
      return rows[0] ? toCatalogRow(rows[0]) : null;
    }

    const rows = await this.dbConfig.db
      .update(playgroundThreadCatalogSqlite)
      .set({ pinnedAt, updatedAt })
      .where(eq(playgroundThreadCatalogSqlite.threadId, threadId))
      .returning();
    return rows[0] ? toCatalogRow(rows[0]) : null;
  }

  async bindRuntimeIfUnset(threadId: string, runtimeProvider: string, runtimeModel: string, updatedAt: Date) {
    if (this.dbConfig.mode === 'postgres') {
      const rows = await this.dbConfig.db
        .update(playgroundThreadCatalogPg)
        .set({ runtimeProvider, runtimeModel, updatedAt })
        .where(
          and(
            eq(playgroundThreadCatalogPg.threadId, threadId),
            isNull(playgroundThreadCatalogPg.runtimeProvider),
            isNull(playgroundThreadCatalogPg.runtimeModel)
          )
        )
        .returning();
      return rows[0] ? toCatalogRow(rows[0]) : null;
    }

    const rows = await this.dbConfig.db
      .update(playgroundThreadCatalogSqlite)
      .set({ runtimeProvider, runtimeModel, updatedAt })
      .where(
        and(
          eq(playgroundThreadCatalogSqlite.threadId, threadId),
          isNull(playgroundThreadCatalogSqlite.runtimeProvider),
          isNull(playgroundThreadCatalogSqlite.runtimeModel)
        )
      )
      .returning();
    return rows[0] ? toCatalogRow(rows[0]) : null;
  }
}
