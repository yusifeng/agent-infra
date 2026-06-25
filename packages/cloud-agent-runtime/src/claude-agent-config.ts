import type { McpServerConfig, PermissionMode, SettingSource } from '@anthropic-ai/claude-agent-sdk';

import type { ClaudeAgentAdapterOptions } from './claude-agent-adapter.js';

export const DEFAULT_CLAUDE_AGENT_TIMEOUT_MS = 5_000;
export const DEFAULT_DEEPSEEK_MODEL = 'deepseek-v4-flash';
export const DEFAULT_CLAUDE_WORKSPACE_TOOLS = ['Bash', 'Read', 'Write', 'Edit'] as const;

export interface ClaudeAgentConfigInput {
  env: Record<string, string | undefined>;
  configDir: string;
  clientApp: string;
  defaultTimeoutMs?: number;
  defaultDeepSeekModel?: string;
  enableBashTool?: boolean;
  mcpServers?: Record<string, McpServerConfig> | null;
  skills?: string[] | 'all' | null;
  strictMcpConfig?: boolean;
  toolAllowlist?: string[] | null;
}

export interface ResolvedClaudeAgentConfig {
  adapterOptions: Omit<ClaudeAgentAdapterOptions, 'cwd' | 'query'>;
  baseUrl: string | null;
  configured: boolean;
  isCustomBaseUrl: boolean;
  isDeepSeek: boolean;
  model?: string;
  tokenSource: 'ANTHROPIC_AUTH_TOKEN' | 'ANTHROPIC_API_KEY' | null;
}

export function resolveClaudeAgentConfig(input: ClaudeAgentConfigInput): ResolvedClaudeAgentConfig {
  const defaultDeepSeekModel = input.defaultDeepSeekModel ?? DEFAULT_DEEPSEEK_MODEL;
  const baseUrl = readEnv(input.env, 'ANTHROPIC_BASE_URL');
  const isCustomBaseUrl = Boolean(baseUrl && !isOfficialAnthropicBaseUrl(baseUrl));
  const isDeepSeek = Boolean(baseUrl?.includes('api.deepseek.com'));
  const token = resolveAuthToken(input.env, isCustomBaseUrl);
  const model = readEnv(input.env, 'ANTHROPIC_MODEL') ?? (isDeepSeek ? defaultDeepSeekModel : undefined);
  const workspaceTools = input.toolAllowlist?.length ? input.toolAllowlist : [...DEFAULT_CLAUDE_WORKSPACE_TOOLS];

  return {
    adapterOptions: {
      env: buildClaudeProcessEnv({
        baseUrl,
        clientApp: input.clientApp,
        configDir: input.configDir,
        defaultDeepSeekModel,
        env: input.env,
        isCustomBaseUrl,
        isDeepSeek,
        model,
        token: token.value
      }),
      model,
      mcpServers: input.mcpServers ?? undefined,
      permissionMode: readPermissionMode(input.env),
      settingSources: [] satisfies SettingSource[],
      skills: input.skills ?? undefined,
      strictMcpConfig: input.strictMcpConfig,
      thinking: isDeepSeek ? { type: 'disabled' } : undefined,
      timeoutMs: readTimeoutMs(input.env, input.defaultTimeoutMs ?? DEFAULT_CLAUDE_AGENT_TIMEOUT_MS),
      ...(input.enableBashTool
        ? {
            allowedTools: workspaceTools,
            includePartialMessages: true,
            tools: workspaceTools
          }
        : {
            tools: isDeepSeek ? [] : undefined
          })
    },
    baseUrl,
    configured: Boolean(token.value),
    isCustomBaseUrl,
    isDeepSeek,
    model,
    tokenSource: token.source
  };
}

function buildClaudeProcessEnv(input: {
  baseUrl: string | null;
  clientApp: string;
  configDir: string;
  defaultDeepSeekModel: string;
  env: Record<string, string | undefined>;
  isCustomBaseUrl: boolean;
  isDeepSeek: boolean;
  model?: string;
  token: string | null;
}): Record<string, string | undefined> {
  if (input.isCustomBaseUrl) {
    const model = input.isDeepSeek ? input.model ?? input.defaultDeepSeekModel : input.model;
    return compactEnv({
      PATH: input.env.PATH,
      HOME: input.env.HOME,
      TMPDIR: input.env.TMPDIR,
      ANTHROPIC_BASE_URL: input.baseUrl ?? undefined,
      ANTHROPIC_AUTH_TOKEN: input.token ?? undefined,
      ANTHROPIC_MODEL: model ?? undefined,
      ANTHROPIC_DEFAULT_OPUS_MODEL: readEnv(input.env, 'ANTHROPIC_DEFAULT_OPUS_MODEL') ?? model ?? undefined,
      ANTHROPIC_DEFAULT_SONNET_MODEL: readEnv(input.env, 'ANTHROPIC_DEFAULT_SONNET_MODEL') ?? model ?? undefined,
      ANTHROPIC_DEFAULT_HAIKU_MODEL:
        readEnv(input.env, 'ANTHROPIC_DEFAULT_HAIKU_MODEL') ??
        (input.isDeepSeek ? input.defaultDeepSeekModel : undefined),
      CLAUDE_AGENT_SDK_CLIENT_APP: input.clientApp,
      CLAUDE_CODE_DISABLE_AUTO_MEMORY: '1',
      CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1',
      CLAUDE_CODE_ENABLE_PROMPT_SUGGESTION: 'false',
      CLAUDE_CODE_SUBAGENT_MODEL:
        readEnv(input.env, 'CLAUDE_CODE_SUBAGENT_MODEL') ?? (input.isDeepSeek ? input.defaultDeepSeekModel : undefined),
      CLAUDE_CODE_EFFORT_LEVEL: readEnv(input.env, 'CLAUDE_CODE_EFFORT_LEVEL') ?? undefined,
      CLAUDE_CONFIG_DIR: input.configDir
    });
  }

  return compactEnv({
    ...input.env,
    ANTHROPIC_API_KEY: input.token ?? undefined,
    ANTHROPIC_AUTH_TOKEN: readEnv(input.env, 'ANTHROPIC_AUTH_TOKEN') ?? undefined,
    ANTHROPIC_BASE_URL: input.baseUrl ?? undefined,
    CLAUDE_AGENT_SDK_CLIENT_APP: input.clientApp,
    CLAUDE_CODE_DISABLE_AUTO_MEMORY: '1',
    CLAUDE_CODE_ENABLE_PROMPT_SUGGESTION: 'false',
    CLAUDE_CONFIG_DIR: input.configDir
  });
}

function resolveAuthToken(
  env: Record<string, string | undefined>,
  isCustomBaseUrl: boolean
): { source: 'ANTHROPIC_AUTH_TOKEN' | 'ANTHROPIC_API_KEY' | null; value: string | null } {
  const authToken = readEnv(env, 'ANTHROPIC_AUTH_TOKEN');
  const apiKey = readEnv(env, 'ANTHROPIC_API_KEY');

  if (isCustomBaseUrl) {
    return authToken
      ? { source: 'ANTHROPIC_AUTH_TOKEN', value: authToken }
      : { source: apiKey ? 'ANTHROPIC_API_KEY' : null, value: apiKey ?? null };
  }

  return apiKey
    ? { source: 'ANTHROPIC_API_KEY', value: apiKey }
    : { source: authToken ? 'ANTHROPIC_AUTH_TOKEN' : null, value: authToken ?? null };
}

function readPermissionMode(env: Record<string, string | undefined>): PermissionMode {
  const configured = readEnv(env, 'CLAUDE_AGENT_PERMISSION_MODE');
  if (configured && isPermissionMode(configured)) {
    return configured;
  }

  return 'acceptEdits';
}

function isPermissionMode(value: string): value is PermissionMode {
  return (
    value === 'default' ||
    value === 'acceptEdits' ||
    value === 'bypassPermissions' ||
    value === 'plan' ||
    value === 'dontAsk'
  );
}

function readTimeoutMs(env: Record<string, string | undefined>, fallback: number): number {
  const configured = Number(readEnv(env, 'CLAUDE_AGENT_TIMEOUT_MS'));
  return Number.isFinite(configured) && configured > 0 ? configured : fallback;
}

function readEnv(env: Record<string, string | undefined>, key: string): string | null {
  const value = env[key]?.trim();
  return value ? value : null;
}

function isOfficialAnthropicBaseUrl(baseUrl: string): boolean {
  try {
    const { hostname } = new URL(baseUrl);
    return hostname === 'api.anthropic.com';
  } catch {
    return false;
  }
}

function compactEnv(env: Record<string, string | undefined>): Record<string, string | undefined> {
  return Object.fromEntries(Object.entries(env).filter(([, value]) => value !== undefined));
}
