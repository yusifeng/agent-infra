import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  transpilePackages: [
    '@agent-infra/core',
    '@agent-infra/db',
    '@agent-infra/runtime-pi',
    '@mariozechner/pi-agent-core',
    '@mariozechner/pi-ai'
  ],
  outputFileTracingIncludes: {
    '/api/threads/[threadId]/runs': [
      '../../packages/runtime-pi/node_modules/@mariozechner/pi-agent-core/**/*',
      '../../packages/runtime-pi/node_modules/@mariozechner/pi-ai/**/*'
    ],
    '/api/threads/[threadId]/runs/stream': [
      '../../packages/runtime-pi/node_modules/@mariozechner/pi-agent-core/**/*',
      '../../packages/runtime-pi/node_modules/@mariozechner/pi-ai/**/*'
    ]
  },
  serverExternalPackages: ['better-sqlite3', 'argon2'],
};

export default nextConfig;
