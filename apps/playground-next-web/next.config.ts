import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  transpilePackages: ['@agent-infra/core', '@agent-infra/db'],
  serverExternalPackages: [
    'better-sqlite3',
    '@agent-infra/runtime-pi',
    '@agent-infra/runtime-pi/lazy',
    '@agent-infra/runtime-pi/runtime',
    '@agent-infra/runtime-pi/tools',
    '@mariozechner/pi-agent-core',
    '@mariozechner/pi-agent-core/dist/index.js',
    '@mariozechner/pi-ai',
    '@mariozechner/pi-ai/dist/index.js'
  ],
  webpack: (config, { isServer }) => {
    if (isServer) {
      config.externals ??= [];
      config.externals.push({ 'better-sqlite3': 'commonjs better-sqlite3' });
    }
    return config;
  }
};

export default nextConfig;
