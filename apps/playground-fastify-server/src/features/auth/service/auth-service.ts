import crypto from 'node:crypto';

import { type DbConfig, withDbTransaction } from '@agent-infra/db';

import { projectAuthUserDto } from '../dto/project-auth-user-dto.js';
import { normalizeEmail } from '../identity/normalize-email.js';
import { AuthEmailChallengeRepo } from '../repo/auth-email-challenge-repo.js';
import { AuthIdentityRepo } from '../repo/auth-identity-repo.js';
import { AuthPasswordRepo } from '../repo/auth-password-repo.js';
import { AuthSessionRepo } from '../repo/auth-session-repo.js';
import { AuthUserRepo } from '../repo/auth-user-repo.js';
import { createEmailChallengeCode, hashEmailChallengeCode } from './email-challenge-code.js';
import type { AuthEmailSender } from './email-sender.js';
import { hashPassword, PASSWORD_ALGO, verifyPasswordHash } from './password-hasher.js';
import type { PlaygroundAuthConfig } from './auth-config.js';
import { createSessionToken, hashSessionToken } from './session-token.js';

export type AuthErrorCode =
  | 'INVALID_EMAIL'
  | 'EMAIL_ALREADY_REGISTERED'
  | 'INVALID_CODE'
  | 'CODE_EXPIRED'
  | 'PASSWORD_TOO_SHORT'
  | 'INVALID_CREDENTIALS'
  | 'RATE_LIMITED'
  | 'AUTH_EMAIL_UNAVAILABLE';

type AuthUserResult = {
  user: ReturnType<typeof projectAuthUserDto>;
  sessionToken: string;
};

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function isValidPassword(value: string) {
  return value.length >= 8;
}

function isIdentityUniqueConstraintError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  const normalizedMessage = message.toLowerCase();

  return (
    normalizedMessage.includes('auth_identities_type_value_unique_idx') ||
    normalizedMessage.includes('auth_identities.identity_type, auth_identities.identity_value_normalized') ||
    normalizedMessage.includes('duplicate key value violates unique constraint')
  );
}

export class PlaygroundAuthService {
  private readonly users: AuthUserRepo;
  private readonly identities: AuthIdentityRepo;
  private readonly passwords: AuthPasswordRepo;
  private readonly emailChallenges: AuthEmailChallengeRepo;
  private readonly sessions: AuthSessionRepo;

  constructor(
    private readonly dbConfig: DbConfig,
    private readonly config: PlaygroundAuthConfig,
    private readonly emailSender: AuthEmailSender,
    private readonly now: () => Date = () => new Date()
  ) {
    this.users = new AuthUserRepo(dbConfig);
    this.identities = new AuthIdentityRepo(dbConfig);
    this.passwords = new AuthPasswordRepo(dbConfig);
    this.emailChallenges = new AuthEmailChallengeRepo(dbConfig);
    this.sessions = new AuthSessionRepo(dbConfig);
  }

  async requestSignupCode(email: string): Promise<{ ok: true } | { ok: false; error: AuthErrorCode }> {
    const emailNormalized = normalizeEmail(email);
    if (!isValidEmail(emailNormalized)) {
      return { ok: false, error: 'INVALID_EMAIL' };
    }

    const existingIdentity = await this.identities.findByTypeAndValue('email', emailNormalized);
    if (existingIdentity) {
      return { ok: false, error: 'EMAIL_ALREADY_REGISTERED' };
    }

    const currentTime = this.now();
    const latestChallenge = await this.emailChallenges.findLatestByEmailAndPurpose(emailNormalized, 'sign_up');
    if (
      latestChallenge &&
      latestChallenge.lastSentAt.getTime() + this.config.signupCodeCooldownMs > currentTime.getTime()
    ) {
      return { ok: false, error: 'RATE_LIMITED' };
    }

    const challengeId = crypto.randomUUID();
    const code = createEmailChallengeCode();
    const codeHmac = hashEmailChallengeCode({
      challengeId,
      emailNormalized,
      purpose: 'sign_up',
      code,
      secret: this.config.codeSecret
    });

    await this.emailChallenges.create({
      id: challengeId,
      emailNormalized,
      purpose: 'sign_up',
      codeHmac,
      expiresAt: new Date(currentTime.getTime() + this.config.signupCodeTtlMs),
      consumedAt: null,
      attemptCount: 0,
      lastSentAt: currentTime,
      createdAt: currentTime
    });

    try {
      await this.emailSender.sendSignupCodeEmail({
        toEmail: emailNormalized,
        code,
        expiresInMinutes: Math.floor(this.config.signupCodeTtlMs / 60000)
      });
    } catch {
      await this.emailChallenges.delete(challengeId);
      return { ok: false, error: 'AUTH_EMAIL_UNAVAILABLE' };
    }

    return { ok: true };
  }

  async signUp(input: {
    email: string;
    code: string;
    password: string;
    ipAddress?: string | null;
    userAgent?: string | null;
  }): Promise<{ ok: true; data: AuthUserResult } | { ok: false; error: AuthErrorCode }> {
    const emailNormalized = normalizeEmail(input.email);
    if (!isValidEmail(emailNormalized)) {
      return { ok: false, error: 'INVALID_EMAIL' };
    }

    if (!isValidPassword(input.password)) {
      return { ok: false, error: 'PASSWORD_TOO_SHORT' };
    }

    const existingIdentity = await this.identities.findByTypeAndValue('email', emailNormalized);
    if (existingIdentity) {
      return { ok: false, error: 'EMAIL_ALREADY_REGISTERED' };
    }

    const currentTime = this.now();
    const latestChallenge = await this.emailChallenges.findLatestByEmailAndPurpose(emailNormalized, 'sign_up');
    if (!latestChallenge) {
      return { ok: false, error: 'INVALID_CODE' };
    }

    if (latestChallenge.expiresAt.getTime() <= currentTime.getTime()) {
      return { ok: false, error: 'CODE_EXPIRED' };
    }

    if (latestChallenge.consumedAt || latestChallenge.attemptCount >= this.config.maxChallengeAttempts) {
      return { ok: false, error: 'INVALID_CODE' };
    }

    const expectedCodeHmac = hashEmailChallengeCode({
      challengeId: latestChallenge.id,
      emailNormalized,
      purpose: 'sign_up',
      code: input.code,
      secret: this.config.codeSecret
    });

    if (expectedCodeHmac !== latestChallenge.codeHmac) {
      await this.emailChallenges.updateAttemptCount(latestChallenge.id, latestChallenge.attemptCount + 1);
      return { ok: false, error: 'INVALID_CODE' };
    }

    const passwordHash = await hashPassword(input.password);
    const sessionToken = createSessionToken();
    const sessionTokenHash = hashSessionToken(sessionToken);

    let created: { user: Awaited<ReturnType<AuthUserRepo['create']>>; identity: Awaited<ReturnType<AuthIdentityRepo['create']>> };
    try {
      created = await withDbTransaction(this.dbConfig, async (tx) => {
        const users = new AuthUserRepo({ mode: this.dbConfig.mode, db: tx });
        const identities = new AuthIdentityRepo({ mode: this.dbConfig.mode, db: tx });
        const passwords = new AuthPasswordRepo({ mode: this.dbConfig.mode, db: tx });
        const challenges = new AuthEmailChallengeRepo({ mode: this.dbConfig.mode, db: tx });
        const sessions = new AuthSessionRepo({ mode: this.dbConfig.mode, db: tx });

        const user = await users.create({
          id: crypto.randomUUID(),
          status: 'active',
          createdAt: currentTime,
          lastLoginAt: currentTime
        });
        const identity = await identities.create({
          id: crypto.randomUUID(),
          userId: user.id,
          identityType: 'email',
          identityValueNormalized: emailNormalized,
          verifiedAt: currentTime,
          createdAt: currentTime
        });
        await passwords.create({
          userId: user.id,
          passwordHash,
          passwordAlgo: PASSWORD_ALGO,
          createdAt: currentTime,
          updatedAt: currentTime
        });
        await sessions.create({
          id: crypto.randomUUID(),
          userId: user.id,
          tokenHash: sessionTokenHash,
          expiresAt: new Date(currentTime.getTime() + this.config.sessionTtlMs),
          revokedAt: null,
          ipAddress: input.ipAddress ?? null,
          userAgent: input.userAgent ?? null,
          createdAt: currentTime,
          updatedAt: currentTime
        });
        await challenges.consume(latestChallenge.id, currentTime);

        return {
          user,
          identity
        };
      });
    } catch (error) {
      if (isIdentityUniqueConstraintError(error)) {
        return { ok: false, error: 'EMAIL_ALREADY_REGISTERED' };
      }

      throw error;
    }

    return {
      ok: true,
      data: {
        user: projectAuthUserDto(created.user, created.identity),
        sessionToken
      }
    };
  }

  async signIn(input: {
    email: string;
    password: string;
    ipAddress?: string | null;
    userAgent?: string | null;
  }): Promise<{ ok: true; data: AuthUserResult } | { ok: false; error: AuthErrorCode }> {
    const emailNormalized = normalizeEmail(input.email);
    const identity = await this.identities.findByTypeAndValue('email', emailNormalized);
    if (!identity) {
      return { ok: false, error: 'INVALID_CREDENTIALS' };
    }

    const user = await this.users.findById(identity.userId);
    const password = await this.passwords.findByUserId(identity.userId);
    if (!user || user.status !== 'active' || !password) {
      return { ok: false, error: 'INVALID_CREDENTIALS' };
    }

    const passwordMatches = await verifyPasswordHash(password.passwordHash, input.password);
    if (!passwordMatches) {
      return { ok: false, error: 'INVALID_CREDENTIALS' };
    }

    const currentTime = this.now();
    const sessionToken = createSessionToken();
    const sessionTokenHash = hashSessionToken(sessionToken);

    await withDbTransaction(this.dbConfig, async (tx) => {
      const users = new AuthUserRepo({ mode: this.dbConfig.mode, db: tx });
      const sessions = new AuthSessionRepo({ mode: this.dbConfig.mode, db: tx });

      await users.updateLastLoginAt(user.id, currentTime);
      await sessions.create({
        id: crypto.randomUUID(),
        userId: user.id,
        tokenHash: sessionTokenHash,
        expiresAt: new Date(currentTime.getTime() + this.config.sessionTtlMs),
        revokedAt: null,
        ipAddress: input.ipAddress ?? null,
        userAgent: input.userAgent ?? null,
        createdAt: currentTime,
        updatedAt: currentTime
      });
    });

    return {
      ok: true,
      data: {
        user: projectAuthUserDto(user, identity),
        sessionToken
      }
    };
  }

  async getCurrentUser(sessionToken: string | undefined) {
    if (!sessionToken) {
      return null;
    }

    const session = await this.sessions.findActiveByTokenHash(hashSessionToken(sessionToken), this.now());
    if (!session) {
      return null;
    }

    const [user, identity] = await Promise.all([
      this.users.findById(session.userId),
      this.identities.findFirstByUserId(session.userId)
    ]);
    if (!user || user.status !== 'active' || !identity) {
      return null;
    }

    return projectAuthUserDto(user, identity);
  }

  async logout(sessionToken: string | undefined) {
    if (!sessionToken) {
      return;
    }

    await this.sessions.revokeByTokenHash(hashSessionToken(sessionToken), this.now());
  }
}
