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

  if (!assertAuthRouteRateLimit(request, 'sign-in')) {
    return NextResponse.json({ error: 'RATE_LIMITED' }, { status: 429 });
  }

  const input = readAuthInput(await request.json().catch(() => ({})));
  const authService = await buildAuthService({ authConfig });
  const result = await authService.signIn({
    email: input.email,
    password: input.password,
    ipAddress: extractClientIp(request),
    userAgent: request.headers.get('user-agent')
  });

  if (!result.ok) {
    const status = result.error === 'RATE_LIMITED' ? 429 : 401;
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
