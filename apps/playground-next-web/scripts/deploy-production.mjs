import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const repoRoot = path.resolve(import.meta.dirname, '../../..');
const appName = 'playground-next-web';
const defaultBaseUrl = 'https://deepseek.zhangdawei.org';

function parseArgs(argv) {
  const options = {
    baseUrl: process.env.PLAYGROUND_NEXT_WEB_BASE_URL ?? defaultBaseUrl,
    productionOrigin: process.env.PLAYGROUND_NEXT_WEB_PRODUCTION_ORIGIN ?? defaultBaseUrl,
    skipEnv: false,
    skipBootstrap: false,
    skipBuild: false,
    skipDeploy: false,
    skipVerify: false,
    verifySignupCode: false
  };

  for (const arg of argv) {
    if (arg === '--') {
      continue;
    } else if (arg === '--skip-env') {
      options.skipEnv = true;
    } else if (arg === '--skip-bootstrap') {
      options.skipBootstrap = true;
    } else if (arg === '--skip-build') {
      options.skipBuild = true;
    } else if (arg === '--skip-deploy') {
      options.skipDeploy = true;
    } else if (arg === '--skip-verify') {
      options.skipVerify = true;
    } else if (arg === '--verify-signup-code') {
      options.verifySignupCode = true;
    } else if (arg.startsWith('--base-url=')) {
      options.baseUrl = arg.slice('--base-url='.length);
    } else if (arg.startsWith('--production-origin=')) {
      options.productionOrigin = arg.slice('--production-origin='.length);
    } else {
      throw new Error(`Unknown deploy option: ${arg}`);
    }
  }

  options.baseUrl = normalizeBaseUrl(options.baseUrl);
  options.productionOrigin = normalizeBaseUrl(options.productionOrigin);
  return options;
}

function normalizeBaseUrl(value) {
  return value.replace(/\/+$/, '');
}

function loadRootEnv() {
  const envPath = path.join(repoRoot, '.env');
  if (!fs.existsSync(envPath)) {
    throw new Error('Root .env is required for deployment env sync');
  }

  const env = {};
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) {
      continue;
    }

    const separatorIndex = trimmed.indexOf('=');
    const key = trimmed.slice(0, separatorIndex).trim();
    let value = trimmed.slice(separatorIndex + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    env[key] = value.trim();
  }

  return env;
}

function buildProductionEnv(rootEnv, options) {
  const localOrigins = (rootEnv.AUTH_ALLOWED_ORIGINS ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  const origins = Array.from(new Set([...localOrigins, options.productionOrigin]));

  const productionEnv = {
    PLAYGROUND_DB_MODE: 'turso',
    TURSO_DATABASE_URL: rootEnv.TURSO_DATABASE_URL,
    TURSO_AUTH_TOKEN: rootEnv.TURSO_AUTH_TOKEN,
    DEEPSEEK_API_KEY: rootEnv.DEEPSEEK_API_KEY,
    OPENAI_API_KEY: rootEnv.OPENAI_API_KEY,
    OPENAI_MODEL: rootEnv.OPENAI_MODEL,
    TAVILY_API_KEY: rootEnv.TAVILY_API_KEY,
    PLAYGROUND_DUAL_ANSWER_ENABLED: rootEnv.PLAYGROUND_DUAL_ANSWER_ENABLED,
    NEXT_PUBLIC_PLAYGROUND_DUAL_ANSWER_ENABLED: rootEnv.NEXT_PUBLIC_PLAYGROUND_DUAL_ANSWER_ENABLED,
    AUTH_CODE_SECRET: rootEnv.AUTH_CODE_SECRET,
    AUTH_ALLOWED_ORIGINS: origins.join(','),
    RESEND_API_KEY: rootEnv.RESEND_API_KEY,
    AUTH_EMAIL_FROM: rootEnv.AUTH_EMAIL_FROM
  };

  const required = [
    'TURSO_DATABASE_URL',
    'TURSO_AUTH_TOKEN',
    'AUTH_CODE_SECRET',
    'AUTH_ALLOWED_ORIGINS',
    'RESEND_API_KEY',
    'AUTH_EMAIL_FROM'
  ];
  const missing = required.filter((key) => !productionEnv[key]?.trim());
  if (!productionEnv.DEEPSEEK_API_KEY?.trim() && !productionEnv.OPENAI_API_KEY?.trim()) {
    missing.push('DEEPSEEK_API_KEY or OPENAI_API_KEY');
  }

  if (missing.length > 0) {
    throw new Error(`Missing deployment env values: ${missing.join(', ')}`);
  }

  return Object.fromEntries(
    Object.entries(productionEnv)
      .filter(([, value]) => value?.trim())
      .map(([key, value]) => [key, value.trim()])
  );
}

function isSensitiveEnvKey(key) {
  return ![
    'PLAYGROUND_DB_MODE',
    'AUTH_ALLOWED_ORIGINS',
    'AUTH_EMAIL_FROM',
    'OPENAI_MODEL',
    'PLAYGROUND_DUAL_ANSWER_ENABLED',
    'NEXT_PUBLIC_PLAYGROUND_DUAL_ANSWER_ENABLED'
  ].includes(key);
}

function run(command, args, options = {}) {
  const label = options.label ?? `${command} ${args.join(' ')}`;
  console.log(`[deploy-production] ${label}`);

  const result = spawnSync(command, args, {
    cwd: repoRoot,
    env: {
      ...process.env,
      ...options.env
    },
    encoding: 'utf8',
    input: options.input,
    stdio: options.capture ? ['pipe', 'pipe', 'pipe'] : ['pipe', 'inherit', 'inherit']
  });

  if (result.status !== 0) {
    if (options.capture) {
      process.stdout.write(result.stdout ?? '');
      process.stderr.write(result.stderr ?? '');
    }
    throw new Error(`${label} failed with exit code ${result.status ?? 'unknown'}`);
  }

  return result;
}

function syncVercelEnv(productionEnv) {
  for (const [key, value] of Object.entries(productionEnv)) {
    const args = ['env', 'add', key, 'production', '--force'];
    if (isSensitiveEnvKey(key)) {
      args.push('--sensitive');
    }

    run('vercel', args, {
      capture: true,
      input: value,
      label: `sync Vercel env ${key}`
    });
  }
}

function bootstrapTurso(productionEnv) {
  const result = run(
    'pnpm',
    ['--silent', '--filter', appName, 'bootstrap:db'],
    {
      capture: true,
      env: {
        NODE_ENV: 'production',
        PLAYGROUND_DB_MODE: 'turso',
        TURSO_DATABASE_URL: productionEnv.TURSO_DATABASE_URL,
        TURSO_AUTH_TOKEN: productionEnv.TURSO_AUTH_TOKEN
      },
      label: 'bootstrap Turso schema'
    }
  );
  const output = (result.stdout ?? '').trim();
  const summary = JSON.parse(output);
  console.log(`[deploy-production] bootstrap ok dbMode=${summary.dbMode}`);
}

async function fetchJson(url, init) {
  const response = await fetch(url, init);
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`${init?.method ?? 'GET'} ${url} failed with ${response.status}: ${text}`);
  }
  return JSON.parse(text);
}

async function verifyDeployment(options, productionEnv) {
  console.log(`[deploy-production] verify ${options.baseUrl}`);
  const meta = await fetchJson(`${options.baseUrl}/api/meta`);
  if (meta.dbMode !== 'turso') {
    throw new Error(`Expected dbMode=turso, received ${meta.dbMode}`);
  }
  if (!meta.runtimeConfigured) {
    throw new Error(`Runtime is not configured: ${meta.runtimeConfigError ?? 'unknown error'}`);
  }

  const authMe = await fetchJson(`${options.baseUrl}/api/auth/me`);
  if (!Object.prototype.hasOwnProperty.call(authMe, 'user')) {
    throw new Error('Expected /api/auth/me to return a user field');
  }

  if (options.verifySignupCode) {
    const email = process.env.PLAYGROUND_NEXT_WEB_SIGNUP_SMOKE_EMAIL?.trim() ||
      `deploy-smoke-${Date.now()}@example.com`;
    const result = await fetchJson(`${options.baseUrl}/api/auth/email/request-signup-code`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin: options.baseUrl
      },
      body: JSON.stringify({ email })
    });
    if (result.ok !== true) {
      throw new Error(`Expected signup code smoke to return ok=true: ${JSON.stringify(result)}`);
    }
  }

  console.log(
    `[deploy-production] verified dbMode=${meta.dbMode} runtime=${meta.runtimeProvider}:${meta.runtimeModel}`
  );
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const rootEnv = loadRootEnv();
  const productionEnv = buildProductionEnv(rootEnv, options);

  run('vercel', ['whoami'], { capture: true, label: 'check Vercel login' });

  if (!options.skipEnv) {
    syncVercelEnv(productionEnv);
  }

  if (!options.skipBootstrap) {
    bootstrapTurso(productionEnv);
  }

  if (!options.skipBuild) {
    run('pnpm', ['--filter', appName, 'typecheck'], { label: `${appName} typecheck` });
    run('pnpm', ['--filter', appName, 'build'], {
      env: {
        PLAYGROUND_DB_MODE: 'turso',
        TURSO_DATABASE_URL: productionEnv.TURSO_DATABASE_URL,
        TURSO_AUTH_TOKEN: productionEnv.TURSO_AUTH_TOKEN,
        PLAYGROUND_DUAL_ANSWER_ENABLED: productionEnv.PLAYGROUND_DUAL_ANSWER_ENABLED,
        NEXT_PUBLIC_PLAYGROUND_DUAL_ANSWER_ENABLED: productionEnv.NEXT_PUBLIC_PLAYGROUND_DUAL_ANSWER_ENABLED
      },
      label: `${appName} production build`
    });
  }

  if (!options.skipDeploy) {
    run('vercel', ['--prod', '--yes'], { label: 'deploy Vercel production' });
  }

  if (!options.skipVerify) {
    await verifyDeployment(options, productionEnv);
  }
}

main().catch((error) => {
  console.error(`[deploy-production] ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
