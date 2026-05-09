import { sql } from 'drizzle-orm';
import { integer as pgInteger, pgTable, text, timestamp } from 'drizzle-orm/pg-core';
import { integer, sqliteTable, text as sqliteText } from 'drizzle-orm/sqlite-core';
import type { DbConfig } from '@agent-infra/db';

export const authUsersSqlite = sqliteTable('auth_users', {
  id: sqliteText('id').primaryKey(),
  status: sqliteText('status').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  lastLoginAt: integer('last_login_at', { mode: 'timestamp_ms' })
});

export const authUsersPg = pgTable('auth_users', {
  id: text('id').primaryKey(),
  status: text('status').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  lastLoginAt: timestamp('last_login_at', { withTimezone: true })
});

export const authIdentitiesSqlite = sqliteTable('auth_identities', {
  id: sqliteText('id').primaryKey(),
  userId: sqliteText('user_id').notNull(),
  identityType: sqliteText('identity_type').notNull(),
  identityValueNormalized: sqliteText('identity_value_normalized').notNull(),
  verifiedAt: integer('verified_at', { mode: 'timestamp_ms' }),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull()
});

export const authIdentitiesPg = pgTable('auth_identities', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
  identityType: text('identity_type').notNull(),
  identityValueNormalized: text('identity_value_normalized').notNull(),
  verifiedAt: timestamp('verified_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull()
});

export const authPasswordsSqlite = sqliteTable('auth_passwords', {
  userId: sqliteText('user_id').primaryKey(),
  passwordHash: sqliteText('password_hash').notNull(),
  passwordAlgo: sqliteText('password_algo').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull()
});

export const authPasswordsPg = pgTable('auth_passwords', {
  userId: text('user_id').primaryKey(),
  passwordHash: text('password_hash').notNull(),
  passwordAlgo: text('password_algo').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull()
});

export const authEmailChallengesSqlite = sqliteTable('auth_email_challenges', {
  id: sqliteText('id').primaryKey(),
  emailNormalized: sqliteText('email_normalized').notNull(),
  purpose: sqliteText('purpose').notNull(),
  codeHmac: sqliteText('code_hmac').notNull(),
  expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
  consumedAt: integer('consumed_at', { mode: 'timestamp_ms' }),
  attemptCount: integer('attempt_count').notNull(),
  lastSentAt: integer('last_sent_at', { mode: 'timestamp_ms' }).notNull(),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull()
});

export const authEmailChallengesPg = pgTable('auth_email_challenges', {
  id: text('id').primaryKey(),
  emailNormalized: text('email_normalized').notNull(),
  purpose: text('purpose').notNull(),
  codeHmac: text('code_hmac').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  consumedAt: timestamp('consumed_at', { withTimezone: true }),
  attemptCount: pgInteger('attempt_count').notNull(),
  lastSentAt: timestamp('last_sent_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull()
});

export const authSessionsSqlite = sqliteTable('auth_sessions', {
  id: sqliteText('id').primaryKey(),
  userId: sqliteText('user_id').notNull(),
  tokenHash: sqliteText('token_hash').notNull(),
  expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
  revokedAt: integer('revoked_at', { mode: 'timestamp_ms' }),
  ipAddress: sqliteText('ip_address'),
  userAgent: sqliteText('user_agent'),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull()
});

export const authSessionsPg = pgTable('auth_sessions', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
  tokenHash: text('token_hash').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull()
});

const SQLITE_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS auth_users (
    id text PRIMARY KEY NOT NULL,
    status text NOT NULL,
    created_at integer NOT NULL,
    last_login_at integer
  )`,
  `CREATE TABLE IF NOT EXISTS auth_identities (
    id text PRIMARY KEY NOT NULL,
    user_id text NOT NULL REFERENCES auth_users(id),
    identity_type text NOT NULL,
    identity_value_normalized text NOT NULL,
    verified_at integer,
    created_at integer NOT NULL
  )`,
  'CREATE UNIQUE INDEX IF NOT EXISTS auth_identities_type_value_unique_idx ON auth_identities (identity_type, identity_value_normalized)',
  'CREATE INDEX IF NOT EXISTS auth_identities_user_id_idx ON auth_identities (user_id)',
  `CREATE TABLE IF NOT EXISTS auth_passwords (
    user_id text PRIMARY KEY NOT NULL REFERENCES auth_users(id),
    password_hash text NOT NULL,
    password_algo text NOT NULL,
    created_at integer NOT NULL,
    updated_at integer NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS auth_email_challenges (
    id text PRIMARY KEY NOT NULL,
    email_normalized text NOT NULL,
    purpose text NOT NULL,
    code_hmac text NOT NULL,
    expires_at integer NOT NULL,
    consumed_at integer,
    attempt_count integer NOT NULL,
    last_sent_at integer NOT NULL,
    created_at integer NOT NULL
  )`,
  'CREATE INDEX IF NOT EXISTS auth_email_challenges_lookup_idx ON auth_email_challenges (email_normalized, purpose, created_at)',
  'CREATE INDEX IF NOT EXISTS auth_email_challenges_expires_at_idx ON auth_email_challenges (expires_at)',
  `CREATE TABLE IF NOT EXISTS auth_sessions (
    id text PRIMARY KEY NOT NULL,
    user_id text NOT NULL REFERENCES auth_users(id),
    token_hash text NOT NULL,
    expires_at integer NOT NULL,
    revoked_at integer,
    ip_address text,
    user_agent text,
    created_at integer NOT NULL,
    updated_at integer NOT NULL
  )`,
  'CREATE UNIQUE INDEX IF NOT EXISTS auth_sessions_token_hash_unique_idx ON auth_sessions (token_hash)',
  'CREATE INDEX IF NOT EXISTS auth_sessions_user_id_idx ON auth_sessions (user_id)',
  'CREATE INDEX IF NOT EXISTS auth_sessions_expires_at_idx ON auth_sessions (expires_at)'
];

const POSTGRES_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS auth_users (
    id text PRIMARY KEY,
    status text NOT NULL,
    created_at timestamptz NOT NULL,
    last_login_at timestamptz
  )`,
  `CREATE TABLE IF NOT EXISTS auth_identities (
    id text PRIMARY KEY,
    user_id text NOT NULL REFERENCES auth_users(id),
    identity_type text NOT NULL,
    identity_value_normalized text NOT NULL,
    verified_at timestamptz,
    created_at timestamptz NOT NULL
  )`,
  'CREATE UNIQUE INDEX IF NOT EXISTS auth_identities_type_value_unique_idx ON auth_identities (identity_type, identity_value_normalized)',
  'CREATE INDEX IF NOT EXISTS auth_identities_user_id_idx ON auth_identities (user_id)',
  `CREATE TABLE IF NOT EXISTS auth_passwords (
    user_id text PRIMARY KEY REFERENCES auth_users(id),
    password_hash text NOT NULL,
    password_algo text NOT NULL,
    created_at timestamptz NOT NULL,
    updated_at timestamptz NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS auth_email_challenges (
    id text PRIMARY KEY,
    email_normalized text NOT NULL,
    purpose text NOT NULL,
    code_hmac text NOT NULL,
    expires_at timestamptz NOT NULL,
    consumed_at timestamptz,
    attempt_count integer NOT NULL,
    last_sent_at timestamptz NOT NULL,
    created_at timestamptz NOT NULL
  )`,
  'CREATE INDEX IF NOT EXISTS auth_email_challenges_lookup_idx ON auth_email_challenges (email_normalized, purpose, created_at)',
  'CREATE INDEX IF NOT EXISTS auth_email_challenges_expires_at_idx ON auth_email_challenges (expires_at)',
  `CREATE TABLE IF NOT EXISTS auth_sessions (
    id text PRIMARY KEY,
    user_id text NOT NULL REFERENCES auth_users(id),
    token_hash text NOT NULL,
    expires_at timestamptz NOT NULL,
    revoked_at timestamptz,
    ip_address text,
    user_agent text,
    created_at timestamptz NOT NULL,
    updated_at timestamptz NOT NULL
  )`,
  'CREATE UNIQUE INDEX IF NOT EXISTS auth_sessions_token_hash_unique_idx ON auth_sessions (token_hash)',
  'CREATE INDEX IF NOT EXISTS auth_sessions_user_id_idx ON auth_sessions (user_id)',
  'CREATE INDEX IF NOT EXISTS auth_sessions_expires_at_idx ON auth_sessions (expires_at)'
];

export async function bootstrapPlaygroundAuthSchema(dbConfig: DbConfig) {
  const statements = dbConfig.mode === 'postgres' ? POSTGRES_STATEMENTS : SQLITE_STATEMENTS;

  for (const statement of statements) {
    if (dbConfig.mode === 'sqlite') {
      dbConfig.db.$client.exec(statement);
      continue;
    }

    if (dbConfig.mode === 'turso') {
      await dbConfig.db.$client.execute(statement);
      continue;
    }

    await dbConfig.db.execute(sql.raw(statement));
  }
}
