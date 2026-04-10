import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  transpilePackages: [
    '@agent-infra/core',
    '@agent-infra/db',
    '@agent-infra/runtime-pi',
    '@mariozechner/pi-agent-core',
    '@mariozechner/pi-ai',
    '@mariozechner/pi-web-ui',
    '@mariozechner/mini-lit'
  ],
  serverExternalPackages: ['better-sqlite3'],
  webpack: (config, { isServer }) => {
    if (isServer) {
      config.externals ??= [];
      config.externals.push({ 'better-sqlite3': 'commonjs better-sqlite3' });
    }
    return config;
  }
};

export default nextConfig;
