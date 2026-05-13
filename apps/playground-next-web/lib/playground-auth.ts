import { NextResponse } from 'next/server';

import { createPlaygroundAuthConfigFromEnv, type PlaygroundAuthConfig } from '@/features/auth/service/auth-config';
import { createAuthEmailSenderFromEnv, type AuthEmailSender } from '@/features/auth/service/email-sender';
import { assertAllowedOrigin } from '@/features/auth/service/origin-check';
import { PlaygroundAuthService } from '@/features/auth/service/auth-service';
import type { AuthUserDto } from '@/features/auth/dto/project-auth-user-dto';
import { getPlaygroundAppServices } from '@/lib/playground-app-services';

type RateLimitBucket = {
  count: number;
  resetAtMs: number;
};

const rateLimitBuckets = new Map<string, RateLimitBucket>();

export type AuthRouteContext = {
  authConfig?: PlaygroundAuthConfig;
  emailSender?: AuthEmailSender;
  now?: () => Date;
};

function asString(value: unknown) {
  return typeof value === 'string' ? value : '';
}

export function asRecord(value: unknown) {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

export function extractClientIp(request: Request) {
  const forwardedFor = request.headers.get('x-forwarded-for');
  if (forwardedFor?.trim()) {
    return forwardedFor.split(',')[0]?.trim() || null;
  }

  const realIp = request.headers.get('x-real-ip');
  return realIp?.trim() || null;
}

export function readCookie(request: Request, name: string) {
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

export function assertAuthWriteAllowed(request: Request, authConfig: PlaygroundAuthConfig) {
  assertAllowedOrigin(request.headers.get('origin') ?? undefined, authConfig.allowedOrigins);
}

export function checkRateLimit(input: {
  key: string;
  max: number;
  windowMs: number;
  nowMs?: number;
}) {
  const nowMs = input.nowMs ?? Date.now();
  const existing = rateLimitBuckets.get(input.key);

  if (!existing || existing.resetAtMs <= nowMs) {
    rateLimitBuckets.set(input.key, {
      count: 1,
      resetAtMs: nowMs + input.windowMs
    });
    return true;
  }

  if (existing.count >= input.max) {
    return false;
  }

  existing.count += 1;
  return true;
}

export function assertAuthRouteRateLimit(request: Request, routeKey: string, max = 10) {
  const ip = extractClientIp(request) ?? 'unknown';
  if (!checkRateLimit({ key: `${routeKey}:${ip}`, max, windowMs: 60_000 })) {
    return false;
  }

  return true;
}

export async function buildAuthService(context: AuthRouteContext = {}) {
  const services = await getPlaygroundAppServices();
  return new PlaygroundAuthService(
    services.dbConfig,
    context.authConfig ?? createPlaygroundAuthConfigFromEnv(),
    context.emailSender ?? createAuthEmailSenderFromEnv(),
    context.now ?? (() => new Date())
  );
}

export function createAuthJsonResponse(
  body: Record<string, unknown>,
  init: ResponseInit & {
    sessionToken?: string;
    clearSession?: boolean;
    authConfig: PlaygroundAuthConfig;
  }
) {
  const { authConfig, clearSession, sessionToken, ...responseInit } = init;
  const response = NextResponse.json(body, responseInit);

  if (sessionToken) {
    response.cookies.set(authConfig.sessionCookieName, sessionToken, {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      secure: authConfig.secureCookies,
      maxAge: Math.floor(authConfig.sessionTtlMs / 1000)
    });
  }

  if (clearSession) {
    response.cookies.set(authConfig.sessionCookieName, '', {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      secure: authConfig.secureCookies,
      maxAge: 0
    });
  }

  return response;
}

export function readAuthInput(body: unknown) {
  const record = asRecord(body);
  return {
    email: asString(record.email),
    code: asString(record.code),
    password: asString(record.password),
    newPassword: asString(record.newPassword)
  };
}

export async function getCurrentAuthUser(request: Request, context: AuthRouteContext = {}): Promise<AuthUserDto | null> {
  const authConfig = context.authConfig ?? createPlaygroundAuthConfigFromEnv();
  const authService = await buildAuthService({ ...context, authConfig });
  return authService.getCurrentUser(readCookie(request, authConfig.sessionCookieName));
}
