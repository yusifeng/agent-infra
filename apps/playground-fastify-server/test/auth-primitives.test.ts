import { describe, expect, it } from 'vitest';

import { normalizeEmail } from '../src/features/auth/identity/normalize-email.js';
import {
  createEmailChallengeCode,
  EMAIL_CHALLENGE_CODE_LENGTH,
  hashEmailChallengeCode
} from '../src/features/auth/service/email-challenge-code.js';
import { hashPassword, PASSWORD_ALGO, verifyPasswordHash } from '../src/features/auth/service/password-hasher.js';
import { createSessionToken, hashSessionToken } from '../src/features/auth/service/session-token.js';

describe('auth primitives', () => {
  it('normalizes email with trim and lowercase only', () => {
    expect(normalizeEmail('  Alice.Example+Tag@QQ.COM  ')).toBe('alice.example+tag@qq.com');
  });

  it('creates six-digit email challenge codes with zero padding', () => {
    expect(createEmailChallengeCode(() => 42)).toBe('000042');
    expect(createEmailChallengeCode(() => 999999)).toBe('999999');
    expect(createEmailChallengeCode().length).toBe(EMAIL_CHALLENGE_CODE_LENGTH);
  });

  it('hashes email challenge codes with a secret and challenge-specific context', () => {
    const baseInput = {
      challengeId: 'challenge-1',
      emailNormalized: 'user@example.com',
      purpose: 'sign_up',
      code: '123456',
      secret: 'secret-1'
    };

    expect(hashEmailChallengeCode(baseInput)).toBe(hashEmailChallengeCode(baseInput));
    expect(
      hashEmailChallengeCode({
        ...baseInput,
        challengeId: 'challenge-2'
      })
    ).not.toBe(hashEmailChallengeCode(baseInput));
    expect(
      hashEmailChallengeCode({
        ...baseInput,
        secret: 'secret-2'
      })
    ).not.toBe(hashEmailChallengeCode(baseInput));
  });

  it('creates random session tokens and hashes them deterministically', () => {
    const token = createSessionToken();

    expect(token.length).toBeGreaterThan(20);
    expect(hashSessionToken(token)).toBe(hashSessionToken(token));
    expect(hashSessionToken(token)).not.toBe(hashSessionToken(`${token}-other`));
  });

  it('hashes and verifies passwords with argon2id', async () => {
    const passwordHash = await hashPassword('correct horse battery staple');

    expect(passwordHash).toContain(PASSWORD_ALGO);
    await expect(verifyPasswordHash(passwordHash, 'correct horse battery staple')).resolves.toBe(true);
    await expect(verifyPasswordHash(passwordHash, 'wrong password')).resolves.toBe(false);
  });
});
