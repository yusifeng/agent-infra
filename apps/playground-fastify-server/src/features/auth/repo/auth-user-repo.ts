import { eq } from 'drizzle-orm';
import type { DbConfig } from '@agent-infra/db';

import { authUsersPg, authUsersSqlite } from './schema.js';

export type AuthUserRow = {
  id: string;
  status: string;
  createdAt: Date;
  lastLoginAt: Date | null;
};

function toAuthUserRow(row: AuthUserRow) {
  return {
    id: row.id,
    status: row.status,
    createdAt: row.createdAt,
    lastLoginAt: row.lastLoginAt
  };
}

export class AuthUserRepo {
  constructor(private readonly dbConfig: Pick<DbConfig, 'mode' | 'db'>) {}

  async create(input: AuthUserRow) {
    if (this.dbConfig.mode === 'postgres') {
      const rows = await this.dbConfig.db.insert(authUsersPg).values(input).returning();
      return toAuthUserRow(rows[0]);
    }

    const rows = await this.dbConfig.db.insert(authUsersSqlite).values(input).returning();
    return toAuthUserRow(rows[0]);
  }

  async findById(id: string) {
    if (this.dbConfig.mode === 'postgres') {
      const rows = await this.dbConfig.db.select().from(authUsersPg).where(eq(authUsersPg.id, id)).limit(1);
      return rows[0] ? toAuthUserRow(rows[0]) : null;
    }

    const rows = await this.dbConfig.db.select().from(authUsersSqlite).where(eq(authUsersSqlite.id, id)).limit(1);
    return rows[0] ? toAuthUserRow(rows[0]) : null;
  }

  async updateLastLoginAt(id: string, lastLoginAt: Date) {
    if (this.dbConfig.mode === 'postgres') {
      const rows = await this.dbConfig.db
        .update(authUsersPg)
        .set({ lastLoginAt })
        .where(eq(authUsersPg.id, id))
        .returning();
      return rows[0] ? toAuthUserRow(rows[0]) : null;
    }

    const rows = await this.dbConfig.db
      .update(authUsersSqlite)
      .set({ lastLoginAt })
      .where(eq(authUsersSqlite.id, id))
      .returning();
    return rows[0] ? toAuthUserRow(rows[0]) : null;
  }
}
