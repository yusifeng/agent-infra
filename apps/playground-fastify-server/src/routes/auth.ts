import type { FastifyInstance } from 'fastify';

import { createPlaygroundAuthConfigFromEnv, type PlaygroundAuthConfig } from '../features/auth/service/auth-config.js';
import { type AuthEmailSender, createAuthEmailSenderFromEnv } from '../features/auth/service/email-sender.js';
import { assertAllowedOrigin } from '../features/auth/service/origin-check.js';
import { PlaygroundAuthService } from '../features/auth/service/auth-service.js';
import { getPlaygroundAppServices } from '../playground-app-services.js';
import type { PlaygroundAppServices } from '../playground-base-services.js';

function asRecord(value: unknown) {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

function asString(value: unknown) {
  return typeof value === 'string' ? value : '';
}

function extractClientIp(request: { ip: string; headers: Record<string, unknown> }) {
  const forwardedFor = request.headers['x-forwarded-for'];
  if (typeof forwardedFor === 'string' && forwardedFor.trim()) {
    return forwardedFor.split(',')[0]?.trim() || request.ip;
  }

  return request.ip;
}

export type AuthRouteDependencies = {
  getAppServices?: () => Promise<PlaygroundAppServices>;
  authConfig?: PlaygroundAuthConfig;
  emailSender?: AuthEmailSender;
  now?: () => Date;
};

export async function registerAuthRoutes(app: FastifyInstance, dependencies: AuthRouteDependencies = {}) {
  const getAppServices = dependencies.getAppServices ?? getPlaygroundAppServices;
  const authConfig = dependencies.authConfig ?? createPlaygroundAuthConfigFromEnv();
  const emailSender = dependencies.emailSender ?? createAuthEmailSenderFromEnv();
  const now = dependencies.now ?? (() => new Date());

  async function buildAuthService() {
    const services = await getAppServices();
    return new PlaygroundAuthService(services.dbConfig, authConfig, emailSender, now);
  }

  function applySessionCookie(reply: {
    setCookie: (name: string, value: string, options: Record<string, unknown>) => void;
  }, sessionToken: string) {
    reply.setCookie(authConfig.sessionCookieName, sessionToken, {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      secure: authConfig.secureCookies,
      maxAge: Math.floor(authConfig.sessionTtlMs / 1000)
    });
  }

  function clearSessionCookie(reply: {
    clearCookie: (name: string, options: Record<string, unknown>) => void;
  }) {
    reply.clearCookie(authConfig.sessionCookieName, {
      path: '/',
      secure: authConfig.secureCookies
    });
  }

  app.post(
    '/api/auth/email/request-signup-code',
    {
      config: {
        rateLimit: {
          max: 5,
          timeWindow: '1 minute'
        }
      }
    },
    async (request, reply) => {
      try {
        assertAllowedOrigin(request.headers.origin, authConfig.allowedOrigins);
      } catch (error) {
        return reply.code(403).send({ ok: false, error: 'ORIGIN_NOT_ALLOWED' });
      }

      const body = asRecord(request.body);
      const authService = await buildAuthService();
      const result = await authService.requestSignupCode(asString(body.email));

      if (!result.ok) {
        const statusCode = result.error === 'RATE_LIMITED' ? 429 : result.error === 'AUTH_EMAIL_UNAVAILABLE' ? 503 : 400;
        return reply.code(statusCode).send({ ok: false, error: result.error });
      }

      return reply.send({ ok: true });
    }
  );

  app.post(
    '/api/auth/email/request-password-reset-code',
    {
      config: {
        rateLimit: {
          max: 5,
          timeWindow: '1 minute'
        }
      }
    },
    async (request, reply) => {
      try {
        assertAllowedOrigin(request.headers.origin, authConfig.allowedOrigins);
      } catch {
        return reply.code(403).send({ ok: false, error: 'ORIGIN_NOT_ALLOWED' });
      }

      const body = asRecord(request.body);
      const authService = await buildAuthService();
      const result = await authService.requestPasswordResetCode(asString(body.email));

      if (!result.ok) {
        const statusCode = result.error === 'RATE_LIMITED' ? 429 : 400;
        return reply.code(statusCode).send({ ok: false, error: result.error });
      }

      return reply.send({ ok: true });
    }
  );

  app.post(
    '/api/auth/sign-up',
    {
      config: {
        rateLimit: {
          max: 10,
          timeWindow: '1 minute'
        }
      }
    },
    async (request, reply) => {
      try {
        assertAllowedOrigin(request.headers.origin, authConfig.allowedOrigins);
      } catch {
        return reply.code(403).send({ ok: false, error: 'ORIGIN_NOT_ALLOWED' });
      }

      const body = asRecord(request.body);
      const authService = await buildAuthService();
      const result = await authService.signUp({
        email: asString(body.email),
        code: asString(body.code),
        password: asString(body.password),
        ipAddress: extractClientIp(request),
        userAgent: request.headers['user-agent'] ? String(request.headers['user-agent']) : null
      });

      if (!result.ok) {
        const statusCode = result.error === 'RATE_LIMITED' ? 429 : result.error === 'AUTH_EMAIL_UNAVAILABLE' ? 503 : 400;
        return reply.code(statusCode).send({ error: result.error });
      }

      applySessionCookie(reply, result.data.sessionToken);
      return reply.send({
        user: result.data.user
      });
    }
  );

  app.post(
    '/api/auth/sign-in',
    {
      config: {
        rateLimit: {
          max: 10,
          timeWindow: '1 minute'
        }
      }
    },
    async (request, reply) => {
      try {
        assertAllowedOrigin(request.headers.origin, authConfig.allowedOrigins);
      } catch {
        return reply.code(403).send({ ok: false, error: 'ORIGIN_NOT_ALLOWED' });
      }

      const body = asRecord(request.body);
      const authService = await buildAuthService();
      const result = await authService.signIn({
        email: asString(body.email),
        password: asString(body.password),
        ipAddress: extractClientIp(request),
        userAgent: request.headers['user-agent'] ? String(request.headers['user-agent']) : null
      });

      if (!result.ok) {
        const statusCode = result.error === 'RATE_LIMITED' ? 429 : 401;
        return reply.code(statusCode).send({ error: result.error });
      }

      applySessionCookie(reply, result.data.sessionToken);
      return reply.send({
        user: result.data.user
      });
    }
  );

  app.post(
    '/api/auth/reset-password',
    {
      config: {
        rateLimit: {
          max: 10,
          timeWindow: '1 minute'
        }
      }
    },
    async (request, reply) => {
      try {
        assertAllowedOrigin(request.headers.origin, authConfig.allowedOrigins);
      } catch {
        return reply.code(403).send({ ok: false, error: 'ORIGIN_NOT_ALLOWED' });
      }

      const body = asRecord(request.body);
      const authService = await buildAuthService();
      const result = await authService.resetPassword({
        email: asString(body.email),
        code: asString(body.code),
        newPassword: asString(body.newPassword)
      });

      if (!result.ok) {
        const statusCode = result.error === 'RATE_LIMITED' ? 429 : 400;
        return reply.code(statusCode).send({ ok: false, error: result.error });
      }

      clearSessionCookie(reply);
      return reply.send({ ok: true });
    }
  );

  app.get('/api/auth/me', async (request, reply) => {
    const authService = await buildAuthService();
    const sessionToken = request.cookies?.[authConfig.sessionCookieName];
    const user = await authService.getCurrentUser(sessionToken);

    return reply.send({
      user
    });
  });

  app.post(
    '/api/auth/logout',
    {
      config: {
        rateLimit: {
          max: 10,
          timeWindow: '1 minute'
        }
      }
    },
    async (request, reply) => {
      try {
        assertAllowedOrigin(request.headers.origin, authConfig.allowedOrigins);
      } catch {
        return reply.code(403).send({ ok: false, error: 'ORIGIN_NOT_ALLOWED' });
      }

      const authService = await buildAuthService();
      const sessionToken = request.cookies?.[authConfig.sessionCookieName];
      await authService.logout(sessionToken);
      clearSessionCookie(reply);

      return reply.send({
        ok: true
      });
    }
  );
}
