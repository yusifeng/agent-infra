import { NextResponse } from 'next/server';

import {
  cloudAgentSessionCookieName,
  createSessionCookieOptions,
  getAdminSessionToken,
  isValidSessionToken,
  validateAdminCredentials
} from './auth';

function readCookie(request: Request, name: string): string | undefined {
  const cookieHeader = request.headers.get('cookie');
  if (!cookieHeader) {
    return undefined;
  }

  for (const pair of cookieHeader.split(';')) {
    const [rawName, ...rawValueParts] = pair.trim().split('=');
    if (rawName === name) {
      return decodeURIComponent(rawValueParts.join('='));
    }
  }

  return undefined;
}

export function requireRouteUser(request: Request) {
  if (!isValidSessionToken(readCookie(request, cloudAgentSessionCookieName))) {
    return {
      user: null,
      response: NextResponse.json({ error: 'unauthorized' }, { status: 401 })
    };
  }

  return {
    user: {
      id: 'admin',
      username: 'Admin',
      displayName: 'Admin'
    },
    response: null
  };
}

export async function POSTSignIn(request: Request) {
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const user = validateAdminCredentials({
    username: typeof body.username === 'string' ? body.username : '',
    password: typeof body.password === 'string' ? body.password : ''
  });

  if (!user) {
    return NextResponse.json({ error: 'invalid credentials' }, { status: 401 });
  }

  const response = NextResponse.json({ user });
  response.cookies.set(cloudAgentSessionCookieName, getAdminSessionToken(), createSessionCookieOptions());
  return response;
}

export function POSTLogout() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set(cloudAgentSessionCookieName, '', {
    ...createSessionCookieOptions(),
    maxAge: 0
  });
  return response;
}
