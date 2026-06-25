import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  serverExternalPackages: ['@agent-infra/cloud-agent-runtime', '@agent-infra/db', '@anthropic-ai/claude-agent-sdk', 'better-sqlite3']
};

export default nextConfig;
