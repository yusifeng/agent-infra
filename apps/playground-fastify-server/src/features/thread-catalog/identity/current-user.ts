import type { DbConfig } from '@agent-infra/db';

import type { AuthUserDto } from '../../auth/dto/project-auth-user-dto.js';
import { projectAuthUserDto } from '../../auth/dto/project-auth-user-dto.js';
import { AuthIdentityRepo } from '../../auth/repo/auth-identity-repo.js';
import { AuthSessionRepo } from '../../auth/repo/auth-session-repo.js';
import { AuthUserRepo } from '../../auth/repo/auth-user-repo.js';
import { hashSessionToken } from '../../auth/service/session-token.js';

export const LOCAL_DEV_USER_ID = 'local-dev-user';

export type PlaygroundCurrentUser = AuthUserDto;

declare module 'fastify' {
  interface FastifyRequest {
    currentUser: PlaygroundCurrentUser | null;
  }
}

export async function resolveCurrentUser(input: {
  dbConfig: DbConfig;
  sessionToken: string | undefined;
  now?: Date;
}): Promise<PlaygroundCurrentUser | null> {
  if (!input.sessionToken) {
    return null;
  }

  const now = input.now ?? new Date();
  const sessions = new AuthSessionRepo(input.dbConfig);
  const session = await sessions.findActiveByTokenHash(hashSessionToken(input.sessionToken), now);
  if (!session) {
    return null;
  }

  const users = new AuthUserRepo(input.dbConfig);
  const identities = new AuthIdentityRepo(input.dbConfig);
  const [user, identity] = await Promise.all([users.findById(session.userId), identities.findFirstByUserId(session.userId)]);
  if (!user || user.status !== 'active' || !identity) {
    return null;
  }

  return projectAuthUserDto(user, identity);
}
