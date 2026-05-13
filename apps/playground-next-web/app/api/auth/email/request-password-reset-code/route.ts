import { NextResponse } from 'next/server';

import { createPlaygroundAuthConfigFromEnv } from '@/features/auth/service/auth-config';
import {
  assertAuthRouteRateLimit,
  assertAuthWriteAllowed,
  buildAuthService,
  readAuthInput
} from '@/lib/playground-auth';

export async function POST(request: Request) {
  const authConfig = createPlaygroundAuthConfigFromEnv();

  try {
    assertAuthWriteAllowed(request, authConfig);
  } catch {
    return NextResponse.json({ ok: false, error: 'ORIGIN_NOT_ALLOWED' }, { status: 403 });
  }

  if (!assertAuthRouteRateLimit(request, 'request-password-reset-code', 5)) {
    return NextResponse.json({ ok: false, error: 'RATE_LIMITED' }, { status: 429 });
  }

  const input = readAuthInput(await request.json().catch(() => ({})));
  const authService = await buildAuthService({ authConfig });
  const result = await authService.requestPasswordResetCode(input.email);

  if (!result.ok) {
    const status = result.error === 'RATE_LIMITED' ? 429 : 400;
    return NextResponse.json({ ok: false, error: result.error }, { status });
  }

  return NextResponse.json({ ok: true });
}
