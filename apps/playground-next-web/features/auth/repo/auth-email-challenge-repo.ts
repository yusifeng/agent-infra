import { and, desc, eq } from 'drizzle-orm';
import type { DbConfig } from '@agent-infra/db';

import { authEmailChallengesPg, authEmailChallengesSqlite } from './schema';

export type AuthEmailChallengeRow = {
  id: string;
  emailNormalized: string;
  purpose: string;
  codeHmac: string;
  expiresAt: Date;
  consumedAt: Date | null;
  attemptCount: number;
  lastSentAt: Date;
  createdAt: Date;
};

function toAuthEmailChallengeRow(row: AuthEmailChallengeRow) {
  return {
    id: row.id,
    emailNormalized: row.emailNormalized,
    purpose: row.purpose,
    codeHmac: row.codeHmac,
    expiresAt: row.expiresAt,
    consumedAt: row.consumedAt,
    attemptCount: row.attemptCount,
    lastSentAt: row.lastSentAt,
    createdAt: row.createdAt
  };
}

export class AuthEmailChallengeRepo {
  constructor(private readonly dbConfig: Pick<DbConfig, 'mode' | 'db'>) {}

  async create(input: AuthEmailChallengeRow) {
    if (this.dbConfig.mode === 'postgres') {
      const rows = await this.dbConfig.db.insert(authEmailChallengesPg).values(input).returning();
      return toAuthEmailChallengeRow(rows[0]);
    }

    const rows = await this.dbConfig.db.insert(authEmailChallengesSqlite).values(input).returning();
    return toAuthEmailChallengeRow(rows[0]);
  }

  async findLatestByEmailAndPurpose(emailNormalized: string, purpose: string) {
    if (this.dbConfig.mode === 'postgres') {
      const rows = await this.dbConfig.db
        .select()
        .from(authEmailChallengesPg)
        .where(
          and(eq(authEmailChallengesPg.emailNormalized, emailNormalized), eq(authEmailChallengesPg.purpose, purpose))
        )
        .orderBy(desc(authEmailChallengesPg.createdAt))
        .limit(1);
      return rows[0] ? toAuthEmailChallengeRow(rows[0]) : null;
    }

    const rows = await this.dbConfig.db
      .select()
      .from(authEmailChallengesSqlite)
      .where(
        and(
          eq(authEmailChallengesSqlite.emailNormalized, emailNormalized),
          eq(authEmailChallengesSqlite.purpose, purpose)
        )
      )
      .orderBy(desc(authEmailChallengesSqlite.createdAt))
      .limit(1);
    return rows[0] ? toAuthEmailChallengeRow(rows[0]) : null;
  }

  async updateAttemptCount(id: string, attemptCount: number) {
    if (this.dbConfig.mode === 'postgres') {
      const rows = await this.dbConfig.db
        .update(authEmailChallengesPg)
        .set({ attemptCount })
        .where(eq(authEmailChallengesPg.id, id))
        .returning();
      return rows[0] ? toAuthEmailChallengeRow(rows[0]) : null;
    }

    const rows = await this.dbConfig.db
      .update(authEmailChallengesSqlite)
      .set({ attemptCount })
      .where(eq(authEmailChallengesSqlite.id, id))
      .returning();
    return rows[0] ? toAuthEmailChallengeRow(rows[0]) : null;
  }

  async consume(id: string, consumedAt: Date) {
    if (this.dbConfig.mode === 'postgres') {
      const rows = await this.dbConfig.db
        .update(authEmailChallengesPg)
        .set({ consumedAt })
        .where(eq(authEmailChallengesPg.id, id))
        .returning();
      return rows[0] ? toAuthEmailChallengeRow(rows[0]) : null;
    }

    const rows = await this.dbConfig.db
      .update(authEmailChallengesSqlite)
      .set({ consumedAt })
      .where(eq(authEmailChallengesSqlite.id, id))
      .returning();
    return rows[0] ? toAuthEmailChallengeRow(rows[0]) : null;
  }

  async delete(id: string) {
    if (this.dbConfig.mode === 'postgres') {
      const rows = await this.dbConfig.db.delete(authEmailChallengesPg).where(eq(authEmailChallengesPg.id, id)).returning();
      return rows[0] ? toAuthEmailChallengeRow(rows[0]) : null;
    }

    const rows = await this.dbConfig.db
      .delete(authEmailChallengesSqlite)
      .where(eq(authEmailChallengesSqlite.id, id))
      .returning();
    return rows[0] ? toAuthEmailChallengeRow(rows[0]) : null;
  }
}
