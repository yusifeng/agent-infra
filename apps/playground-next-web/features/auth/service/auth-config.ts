const DEFAULT_LOCAL_ORIGINS = [
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'http://localhost:4000',
  'http://127.0.0.1:4000',
  'http://localhost:5173',
  'http://127.0.0.1:5173'
];

export type PlaygroundAuthConfig = {
  codeSecret: string;
  sessionTtlMs: number;
  signupCodeTtlMs: number;
  signupCodeCooldownMs: number;
  maxChallengeAttempts: number;
  sessionCookieName: string;
  secureCookies: boolean;
  allowedOrigins: Set<string>;
};

export function createPlaygroundAuthConfigFromEnv(): PlaygroundAuthConfig {
  const isProduction = process.env.NODE_ENV === 'production';
  const authCodeSecret = process.env.AUTH_CODE_SECRET?.trim();

  if (!authCodeSecret && isProduction) {
    throw new Error('AUTH_CODE_SECRET is required in production');
  }

  const extraOrigins = (process.env.AUTH_ALLOWED_ORIGINS ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);

  return {
    codeSecret: authCodeSecret || 'playground-fastify-dev-auth-code-secret',
    sessionTtlMs: 1000 * 60 * 60 * 24 * 30,
    signupCodeTtlMs: 1000 * 60 * 10,
    signupCodeCooldownMs: 1000 * 60,
    maxChallengeAttempts: 5,
    sessionCookieName: isProduction ? '__Host-sid' : 'sid',
    secureCookies: isProduction,
    allowedOrigins: new Set([...DEFAULT_LOCAL_ORIGINS, ...extraOrigins])
  };
}
