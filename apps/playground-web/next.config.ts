import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  transpilePackages: ['@agent-infra/core', '@agent-infra/db'],
  serverExternalPackages: ['better-sqlite3', '@agent-infra/runtime-pi', '@mariozechner/pi-agent-core', '@mariozechner/pi-ai'],
  webpack: (config, { isServer }) => {
    if (isServer) {
      config.externals ??= [];
      config.externals.push({ 'better-sqlite3': 'commonjs better-sqlite3' });
    }
    return config;
  }
};

export default nextConfig;
