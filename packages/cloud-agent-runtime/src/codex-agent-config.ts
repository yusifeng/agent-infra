import type { ApprovalMode, ModelReasoningEffort, SandboxMode, WebSearchMode } from '@openai/codex-sdk';

import type { CodexAgentAdapterOptions } from './codex-agent-adapter.js';

export const DEFAULT_CODEX_DEEPSEEK_BASE_URL = 'https://api.deepseek.com';
export const DEFAULT_CODEX_DEEPSEEK_MODEL = 'deepseek-v4-flash';
export const DEFAULT_CODEX_AGENT_TIMEOUT_MS = 5_000;

export interface CodexAgentConfigInput {
  env: Record<string, string | undefined>;
  configDir: string;
  defaultDeepSeekModel?: string;
  defaultTimeoutMs?: number;
}

export interface ResolvedCodexAgentConfig {
  adapterOptions: Omit<CodexAgentAdapterOptions, 'codex' | 'transcriptStore' | 'workingDirectory'>;
  apiKeySource:
    | 'CODEX_API_KEY'
    | 'OPENAI_API_KEY'
    | 'DEEPSEEK_API_KEY'
    | 'ANTHROPIC_AUTH_TOKEN'
    | 'ANTHROPIC_API_KEY'
    | null;
  baseUrl: string | null;
  configured: boolean;
  isDeepSeek: boolean;
  model?: string;
}

export function resolveCodexAgentConfig(input: CodexAgentConfigInput): ResolvedCodexAgentConfig {
  const defaultDeepSeekModel = input.defaultDeepSeekModel ?? DEFAULT_CODEX_DEEPSEEK_MODEL;
  const apiKey = resolveApiKey(input.env);
  const baseUrl = resolveBaseUrl(input.env, apiKey.source);
  const isDeepSeek = Boolean(baseUrl?.includes('api.deepseek.com'));
  const model = readEnv(input.env, 'CODEX_MODEL') ?? readEnv(input.env, 'OPENAI_MODEL') ?? (isDeepSeek ? defaultDeepSeekModel : undefined);
  const modelReasoningEffort = readModelReasoningEffort(input.env);
  const sandboxMode = readSandboxMode(input.env);
  const approvalPolicy = readApprovalPolicy(input.env);
  const networkAccessEnabled = readBooleanEnv(input.env, 'CODEX_NETWORK_ACCESS_ENABLED');
  const webSearchMode = readWebSearchMode(input.env);

  return {
    adapterOptions: {
      apiKey: apiKey.value ?? undefined,
      approvalPolicy,
      baseUrl: baseUrl ?? undefined,
      config: compactConfig({
        ...(webSearchMode ? { web_search: webSearchMode } : {}),
        ...(readBooleanEnv(input.env, 'CODEX_SHOW_RAW_AGENT_REASONING') === true
          ? { show_raw_agent_reasoning: true }
          : {})
      }),
      env: buildCodexProcessEnv({
        configDir: input.configDir,
        env: input.env
      }),
      model,
      modelReasoningEffort,
      networkAccessEnabled,
      sandboxMode,
      skipGitRepoCheck: readBooleanEnv(input.env, 'CODEX_SKIP_GIT_REPO_CHECK') ?? true,
      timeoutMs: readTimeoutMs(input.env, input.defaultTimeoutMs ?? DEFAULT_CODEX_AGENT_TIMEOUT_MS)
    },
    apiKeySource: apiKey.source,
    baseUrl,
    configured: Boolean(apiKey.value),
    isDeepSeek,
    model
  };
}

function buildCodexProcessEnv(input: {
  configDir: string;
  env: Record<string, string | undefined>;
}): Record<string, string> {
  return compactEnv({
    PATH: input.env.PATH,
    HOME: input.env.HOME,
    TMPDIR: input.env.TMPDIR,
    CODEX_HOME: input.configDir
  });
}

function resolveApiKey(env: Record<string, string | undefined>): {
  source: ResolvedCodexAgentConfig['apiKeySource'];
  value: string | null;
} {
  const codexApiKey = readEnv(env, 'CODEX_API_KEY');
  if (codexApiKey) return { source: 'CODEX_API_KEY', value: codexApiKey };

  const openAiApiKey = readEnv(env, 'OPENAI_API_KEY');
  if (openAiApiKey) return { source: 'OPENAI_API_KEY', value: openAiApiKey };

  const deepSeekApiKey = readEnv(env, 'DEEPSEEK_API_KEY');
  if (deepSeekApiKey) return { source: 'DEEPSEEK_API_KEY', value: deepSeekApiKey };

  if (readEnv(env, 'ANTHROPIC_BASE_URL')?.includes('api.deepseek.com')) {
    const anthropicAuthToken = readEnv(env, 'ANTHROPIC_AUTH_TOKEN');
    if (anthropicAuthToken) return { source: 'ANTHROPIC_AUTH_TOKEN', value: anthropicAuthToken };

    const anthropicApiKey = readEnv(env, 'ANTHROPIC_API_KEY');
    if (anthropicApiKey) return { source: 'ANTHROPIC_API_KEY', value: anthropicApiKey };
  }

  return { source: null, value: null };
}

function resolveBaseUrl(
  env: Record<string, string | undefined>,
  apiKeySource: ResolvedCodexAgentConfig['apiKeySource']
): string | null {
  const explicit =
    readEnv(env, 'CODEX_BASE_URL') ?? readEnv(env, 'OPENAI_BASE_URL') ?? readEnv(env, 'DEEPSEEK_BASE_URL');
  if (explicit) {
    return normalizeDeepSeekBaseUrl(explicit);
  }

  if (
    apiKeySource === 'DEEPSEEK_API_KEY' ||
    apiKeySource === 'ANTHROPIC_API_KEY' ||
    apiKeySource === 'ANTHROPIC_AUTH_TOKEN' ||
    readEnv(env, 'ANTHROPIC_BASE_URL')?.includes('api.deepseek.com')
  ) {
    return DEFAULT_CODEX_DEEPSEEK_BASE_URL;
  }

  return null;
}

function normalizeDeepSeekBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/anthropic\/?$/, '');
}

function readTimeoutMs(env: Record<string, string | undefined>, fallback: number): number {
  const configured = Number(readEnv(env, 'CODEX_AGENT_TIMEOUT_MS') ?? readEnv(env, 'OPENAI_AGENT_TIMEOUT_MS'));
  return Number.isFinite(configured) && configured > 0 ? configured : fallback;
}

function readModelReasoningEffort(env: Record<string, string | undefined>): ModelReasoningEffort | undefined {
  const value = readEnv(env, 'CODEX_MODEL_REASONING_EFFORT') ?? readEnv(env, 'OPENAI_MODEL_REASONING_EFFORT');
  return value && isModelReasoningEffort(value) ? value : undefined;
}

function readSandboxMode(env: Record<string, string | undefined>): SandboxMode {
  const value = readEnv(env, 'CODEX_SANDBOX_MODE');
  return value && isSandboxMode(value) ? value : 'workspace-write';
}

function readApprovalPolicy(env: Record<string, string | undefined>): ApprovalMode {
  const value = readEnv(env, 'CODEX_APPROVAL_POLICY');
  return value && isApprovalMode(value) ? value : 'never';
}

function readWebSearchMode(env: Record<string, string | undefined>): WebSearchMode | undefined {
  const value = readEnv(env, 'CODEX_WEB_SEARCH_MODE');
  return value && isWebSearchMode(value) ? value : undefined;
}

function readBooleanEnv(env: Record<string, string | undefined>, key: string): boolean | undefined {
  const value = readEnv(env, key)?.toLowerCase();
  if (value === '1' || value === 'true' || value === 'yes') return true;
  if (value === '0' || value === 'false' || value === 'no') return false;
  return undefined;
}

function isModelReasoningEffort(value: string): value is ModelReasoningEffort {
  return value === 'minimal' || value === 'low' || value === 'medium' || value === 'high' || value === 'xhigh';
}

function isSandboxMode(value: string): value is SandboxMode {
  return value === 'read-only' || value === 'workspace-write' || value === 'danger-full-access';
}

function isApprovalMode(value: string): value is ApprovalMode {
  return value === 'never' || value === 'on-request' || value === 'on-failure' || value === 'untrusted';
}

function isWebSearchMode(value: string): value is WebSearchMode {
  return value === 'disabled' || value === 'cached' || value === 'live';
}

function readEnv(env: Record<string, string | undefined>, key: string): string | null {
  const value = env[key]?.trim();
  return value ? value : null;
}

function compactEnv(env: Record<string, string | undefined>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(env).filter((entry): entry is [string, string] => entry[1] !== undefined)
  );
}

function compactConfig<T extends Record<string, unknown>>(config: T): T | undefined {
  return Object.keys(config).length > 0 ? config : undefined;
}
