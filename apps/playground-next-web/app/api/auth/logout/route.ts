import { NextResponse } from 'next/server';

import { createPlaygroundAuthConfigFromEnv } from '@/features/auth/service/auth-config';
import {
  assertAuthRouteRateLimit,
  assertAuthWriteAllowed,
  buildAuthService,
  createAuthJsonResponse,
  readCookie
} from '@/lib/playground-auth';

export async function POST(request: Request) {
  const authConfig = createPlaygroundAuthConfigFromEnv();

  try {
    assertAuthWriteAllowed(request, authConfig);
  } catch {
    return NextResponse.json({ ok: false, error: 'ORIGIN_NOT_ALLOWED' }, { status: 403 });
  }

  if (!assertAuthRouteRateLimit(request, 'logout')) {
    return NextResponse.json({ ok: false, error: 'RATE_LIMITED' }, { status: 429 });
  }

  const authService = await buildAuthService({ authConfig });
  await authService.logout(readCookie(request, authConfig.sessionCookieName));

  return createAuthJsonResponse(
    { ok: true },
    {
      authConfig,
      clearSession: true
    }
  );
}
