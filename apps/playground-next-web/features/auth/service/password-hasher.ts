import argon2 from 'argon2';

export const PASSWORD_ALGO = 'argon2id';

export async function hashPassword(password: string) {
  return argon2.hash(password, {
    type: argon2.argon2id
  });
}

export async function verifyPasswordHash(passwordHash: string, password: string) {
  return argon2.verify(passwordHash, password);
}
