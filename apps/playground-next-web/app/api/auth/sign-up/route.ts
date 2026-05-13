import { NextResponse } from 'next/server';

import { createPlaygroundAuthConfigFromEnv } from '@/features/auth/service/auth-config';
import {
  assertAuthRouteRateLimit,
  assertAuthWriteAllowed,
  buildAuthService,
  createAuthJsonResponse,
  extractClientIp,
  readAuthInput
} from '@/lib/playground-auth';

export async function POST(request: Request) {
  const authConfig = createPlaygroundAuthConfigFromEnv();

  try {
    assertAuthWriteAllowed(request, authConfig);
  } catch {
    return NextResponse.json({ ok: false, error: 'ORIGIN_NOT_ALLOWED' }, { status: 403 });
  }

  if (!assertAuthRouteRateLimit(request, 'sign-up')) {
    return NextResponse.json({ error: 'RATE_LIMITED' }, { status: 429 });
  }

  const input = readAuthInput(await request.json().catch(() => ({})));
  const authService = await buildAuthService({ authConfig });
  const result = await authService.signUp({
    email: input.email,
    code: input.code,
    password: input.password,
    ipAddress: extractClientIp(request),
    userAgent: request.headers.get('user-agent')
  });

  if (!result.ok) {
    const status = result.error === 'RATE_LIMITED' ? 429 : result.error === 'AUTH_EMAIL_UNAVAILABLE' ? 503 : 400;
    return NextResponse.json({ error: result.error }, { status });
  }

  return createAuthJsonResponse(
    {
      user: result.data.user
    },
    {
      authConfig,
      sessionToken: result.data.sessionToken
    }
  );
}
