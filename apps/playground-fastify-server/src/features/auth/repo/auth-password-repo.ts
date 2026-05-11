import { eq } from 'drizzle-orm';
import type { DbConfig } from '@agent-infra/db';

import { authPasswordsPg, authPasswordsSqlite } from './schema.js';

export type AuthPasswordRow = {
  userId: string;
  passwordHash: string;
  passwordAlgo: string;
  createdAt: Date;
  updatedAt: Date;
};

function toAuthPasswordRow(row: AuthPasswordRow) {
  return {
    userId: row.userId,
    passwordHash: row.passwordHash,
    passwordAlgo: row.passwordAlgo,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  };
}

export class AuthPasswordRepo {
  constructor(private readonly dbConfig: Pick<DbConfig, 'mode' | 'db'>) {}

  async create(input: AuthPasswordRow) {
    if (this.dbConfig.mode === 'postgres') {
      const rows = await this.dbConfig.db.insert(authPasswordsPg).values(input).returning();
      return toAuthPasswordRow(rows[0]);
    }

    const rows = await this.dbConfig.db.insert(authPasswordsSqlite).values(input).returning();
    return toAuthPasswordRow(rows[0]);
  }

  async findByUserId(userId: string) {
    if (this.dbConfig.mode === 'postgres') {
      const rows = await this.dbConfig.db
        .select()
        .from(authPasswordsPg)
        .where(eq(authPasswordsPg.userId, userId))
        .limit(1);
      return rows[0] ? toAuthPasswordRow(rows[0]) : null;
    }

    const rows = await this.dbConfig.db
      .select()
      .from(authPasswordsSqlite)
      .where(eq(authPasswordsSqlite.userId, userId))
      .limit(1);
    return rows[0] ? toAuthPasswordRow(rows[0]) : null;
  }

  async updateByUserId(userId: string, input: Pick<AuthPasswordRow, 'passwordHash' | 'passwordAlgo' | 'updatedAt'>) {
    if (this.dbConfig.mode === 'postgres') {
      const rows = await this.dbConfig.db
        .update(authPasswordsPg)
        .set(input)
        .where(eq(authPasswordsPg.userId, userId))
        .returning();
      return rows[0] ? toAuthPasswordRow(rows[0]) : null;
    }

    const rows = await this.dbConfig.db
      .update(authPasswordsSqlite)
      .set(input)
      .where(eq(authPasswordsSqlite.userId, userId))
      .returning();
    return rows[0] ? toAuthPasswordRow(rows[0]) : null;
  }
}
