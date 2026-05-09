import { and, eq, gt, isNull } from 'drizzle-orm';
import type { DbConfig } from '@agent-infra/db';

import { authSessionsPg, authSessionsSqlite } from './schema.js';

export type AuthSessionRow = {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: Date;
  revokedAt: Date | null;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: Date;
  updatedAt: Date;
};

function toAuthSessionRow(row: AuthSessionRow) {
  return {
    id: row.id,
    userId: row.userId,
    tokenHash: row.tokenHash,
    expiresAt: row.expiresAt,
    revokedAt: row.revokedAt,
    ipAddress: row.ipAddress,
    userAgent: row.userAgent,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  };
}

export class AuthSessionRepo {
  constructor(private readonly dbConfig: Pick<DbConfig, 'mode' | 'db'>) {}

  async create(input: AuthSessionRow) {
    if (this.dbConfig.mode === 'postgres') {
      const rows = await this.dbConfig.db.insert(authSessionsPg).values(input).returning();
      return toAuthSessionRow(rows[0]);
    }

    const rows = await this.dbConfig.db.insert(authSessionsSqlite).values(input).returning();
    return toAuthSessionRow(rows[0]);
  }

  async findActiveByTokenHash(tokenHash: string, now: Date) {
    if (this.dbConfig.mode === 'postgres') {
      const rows = await this.dbConfig.db
        .select()
        .from(authSessionsPg)
        .where(
          and(
            eq(authSessionsPg.tokenHash, tokenHash),
            isNull(authSessionsPg.revokedAt),
            gt(authSessionsPg.expiresAt, now)
          )
        )
        .limit(1);
      return rows[0] ? toAuthSessionRow(rows[0]) : null;
    }

    const rows = await this.dbConfig.db
      .select()
      .from(authSessionsSqlite)
      .where(
        and(
          eq(authSessionsSqlite.tokenHash, tokenHash),
          isNull(authSessionsSqlite.revokedAt),
          gt(authSessionsSqlite.expiresAt, now)
        )
      )
      .limit(1);
    return rows[0] ? toAuthSessionRow(rows[0]) : null;
  }

  async revokeByTokenHash(tokenHash: string, revokedAt: Date) {
    if (this.dbConfig.mode === 'postgres') {
      const rows = await this.dbConfig.db
        .update(authSessionsPg)
        .set({ revokedAt, updatedAt: revokedAt })
        .where(eq(authSessionsPg.tokenHash, tokenHash))
        .returning();
      return rows[0] ? toAuthSessionRow(rows[0]) : null;
    }

    const rows = await this.dbConfig.db
      .update(authSessionsSqlite)
      .set({ revokedAt, updatedAt: revokedAt })
      .where(eq(authSessionsSqlite.tokenHash, tokenHash))
      .returning();
    return rows[0] ? toAuthSessionRow(rows[0]) : null;
  }
}
