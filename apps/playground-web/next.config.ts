import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  transpilePackages: ['@agent-infra/db', '@agent-infra/runtime-ai-sdk', '@agent-infra/core']
};

export default nextConfig;
