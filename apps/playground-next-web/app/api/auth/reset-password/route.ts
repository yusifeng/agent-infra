import { NextResponse } from 'next/server';

import { createPlaygroundAuthConfigFromEnv } from '@/features/auth/service/auth-config';
import {
  assertAuthRouteRateLimit,
  assertAuthWriteAllowed,
  buildAuthService,
  createAuthJsonResponse,
  readAuthInput
} from '@/lib/playground-auth';

export async function POST(request: Request) {
  const authConfig = createPlaygroundAuthConfigFromEnv();

  try {
    assertAuthWriteAllowed(request, authConfig);
  } catch {
    return NextResponse.json({ ok: false, error: 'ORIGIN_NOT_ALLOWED' }, { status: 403 });
  }

  if (!assertAuthRouteRateLimit(request, 'reset-password')) {
    return NextResponse.json({ ok: false, error: 'RATE_LIMITED' }, { status: 429 });
  }

  const input = readAuthInput(await request.json().catch(() => ({})));
  const authService = await buildAuthService({ authConfig });
  const result = await authService.resetPassword({
    email: input.email,
    code: input.code,
    newPassword: input.newPassword
  });

  if (!result.ok) {
    const status = result.error === 'RATE_LIMITED' ? 429 : 400;
    return NextResponse.json({ ok: false, error: result.error }, { status });
  }

  return createAuthJsonResponse(
    { ok: true },
    {
      authConfig,
      clearSession: true
    }
  );
}
