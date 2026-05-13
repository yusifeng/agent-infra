import { and, asc, eq } from 'drizzle-orm';
import type { DbConfig } from '@agent-infra/db';

import { authIdentitiesPg, authIdentitiesSqlite } from './schema';

export type AuthIdentityRow = {
  id: string;
  userId: string;
  identityType: string;
  identityValueNormalized: string;
  verifiedAt: Date | null;
  createdAt: Date;
};

function toAuthIdentityRow(row: AuthIdentityRow) {
  return {
    id: row.id,
    userId: row.userId,
    identityType: row.identityType,
    identityValueNormalized: row.identityValueNormalized,
    verifiedAt: row.verifiedAt,
    createdAt: row.createdAt
  };
}

export class AuthIdentityRepo {
  constructor(private readonly dbConfig: Pick<DbConfig, 'mode' | 'db'>) {}

  async create(input: AuthIdentityRow) {
    if (this.dbConfig.mode === 'postgres') {
      const rows = await this.dbConfig.db.insert(authIdentitiesPg).values(input).returning();
      return toAuthIdentityRow(rows[0]);
    }

    const rows = await this.dbConfig.db.insert(authIdentitiesSqlite).values(input).returning();
    return toAuthIdentityRow(rows[0]);
  }

  async findByTypeAndValue(identityType: string, identityValueNormalized: string) {
    if (this.dbConfig.mode === 'postgres') {
      const rows = await this.dbConfig.db
        .select()
        .from(authIdentitiesPg)
        .where(
          and(
            eq(authIdentitiesPg.identityType, identityType),
            eq(authIdentitiesPg.identityValueNormalized, identityValueNormalized)
          )
        )
        .limit(1);
      return rows[0] ? toAuthIdentityRow(rows[0]) : null;
    }

    const rows = await this.dbConfig.db
      .select()
      .from(authIdentitiesSqlite)
      .where(
        and(
          eq(authIdentitiesSqlite.identityType, identityType),
          eq(authIdentitiesSqlite.identityValueNormalized, identityValueNormalized)
        )
      )
      .limit(1);
    return rows[0] ? toAuthIdentityRow(rows[0]) : null;
  }

  async findFirstByUserId(userId: string) {
    if (this.dbConfig.mode === 'postgres') {
      const rows = await this.dbConfig.db
        .select()
        .from(authIdentitiesPg)
        .where(eq(authIdentitiesPg.userId, userId))
        .orderBy(asc(authIdentitiesPg.createdAt))
        .limit(1);
      return rows[0] ? toAuthIdentityRow(rows[0]) : null;
    }

    const rows = await this.dbConfig.db
      .select()
      .from(authIdentitiesSqlite)
      .where(eq(authIdentitiesSqlite.userId, userId))
      .orderBy(asc(authIdentitiesSqlite.createdAt))
      .limit(1);
    return rows[0] ? toAuthIdentityRow(rows[0]) : null;
  }
}
