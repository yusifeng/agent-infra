import { cookies } from 'next/headers';

import { readServerEnv } from './server-env';

export interface CloudAgentUser {
  id: string;
  username: string;
  displayName: string;
}

export const cloudAgentSessionCookieName = 'cloud_agent_session';

const adminUser: CloudAgentUser = {
  id: 'admin',
  username: 'Admin',
  displayName: 'Admin'
};

function expectedPassword(): string {
  return readServerEnv().CLOUD_AGENT_ADMIN_PASSWORD?.trim() || '123456';
}

function sessionToken(): string {
  return readServerEnv().CLOUD_AGENT_ADMIN_SESSION_TOKEN?.trim() || 'cloud-agent-admin-dev-session';
}

export function validateAdminCredentials(input: { username: string; password: string }): CloudAgentUser | null {
  if (input.username.trim().toLowerCase() !== adminUser.username.toLowerCase()) {
    return null;
  }

  if (input.password !== expectedPassword()) {
    return null;
  }

  return adminUser;
}

export function isValidSessionToken(value: string | undefined): boolean {
  return value === sessionToken();
}

export async function getCurrentUserFromCookies(): Promise<CloudAgentUser | null> {
  const cookieStore = await cookies();
  if (!isValidSessionToken(cookieStore.get(cloudAgentSessionCookieName)?.value)) {
    return null;
  }

  return adminUser;
}

export function createSessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 24 * 7
  };
}

export function getAdminSessionToken(): string {
  return sessionToken();
}
