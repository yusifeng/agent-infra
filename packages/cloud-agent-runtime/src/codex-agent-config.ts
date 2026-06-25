import type { ApprovalMode, ModelReasoningEffort, SandboxMode, WebSearchMode } from '@openai/codex-sdk';

import type { CodexAgentAdapterOptions } from './codex-agent-adapter.js';
import { compactConfig, compactEnv, readBooleanEnv, readEnv } from './provider-config-env.js';

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
    | 'CODEX_HOME_AUTH'
    | null;
  authMode: 'api-key' | 'codex-home' | null;
  codexHomeAuthSource: string | null;
  baseUrl: string | null;
  configured: boolean;
  diagnostics: {
    apiKeySource: ResolvedCodexAgentConfig['apiKeySource'];
    approvalPolicy: ApprovalMode;
    authMode: ResolvedCodexAgentConfig['authMode'];
    baseUrl: string | null;
    codexHomeAuthSourceConfigured: boolean;
    configured: boolean;
    isDeepSeek: boolean;
    model: string | null;
    modelReasoningEffort: ModelReasoningEffort | null;
    networkAccessEnabled: boolean | null;
    sandboxMode: SandboxMode;
    timeoutMs: number;
  };
  isDeepSeek: boolean;
  model?: string;
}

export function resolveCodexAgentConfig(input: CodexAgentConfigInput): ResolvedCodexAgentConfig {
  const defaultDeepSeekModel = input.defaultDeepSeekModel ?? DEFAULT_CODEX_DEEPSEEK_MODEL;
  const codexHomeAuthSource = resolveCodexHomeAuthSource(input.env);
  const apiKey = resolveApiKey(input.env, {
    allowAnthropicDeepSeekFallback: !codexHomeAuthSource
  });
  const baseUrl = resolveBaseUrl(input.env, apiKey.source, {
    allowAnthropicDeepSeekFallback: !codexHomeAuthSource
  });
  const isDeepSeek = Boolean(baseUrl?.includes('api.deepseek.com'));
  const model = readEnv(input.env, 'CODEX_MODEL') ?? readEnv(input.env, 'OPENAI_MODEL') ?? (isDeepSeek ? defaultDeepSeekModel : undefined);
  const modelReasoningEffort = readModelReasoningEffort(input.env);
  const sandboxMode = readSandboxMode(input.env);
  const approvalPolicy = readApprovalPolicy(input.env);
  const networkAccessEnabled = readBooleanEnv(input.env, 'CODEX_NETWORK_ACCESS_ENABLED');
  const webSearchMode = readWebSearchMode(input.env);
  const timeoutMs = readTimeoutMs(input.env, input.defaultTimeoutMs ?? DEFAULT_CODEX_AGENT_TIMEOUT_MS);
  const apiKeySource = apiKey.source ?? (codexHomeAuthSource ? 'CODEX_HOME_AUTH' : null);
  const authMode = apiKey.value ? 'api-key' : codexHomeAuthSource ? 'codex-home' : null;
  const configured = Boolean(apiKey.value || codexHomeAuthSource);

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
      timeoutMs
    },
    apiKeySource,
    authMode,
    codexHomeAuthSource,
    baseUrl,
    configured,
    diagnostics: {
      apiKeySource,
      approvalPolicy,
      authMode,
      baseUrl,
      codexHomeAuthSourceConfigured: Boolean(codexHomeAuthSource),
      configured,
      isDeepSeek,
      model: model ?? null,
      modelReasoningEffort: modelReasoningEffort ?? null,
      networkAccessEnabled: networkAccessEnabled ?? null,
      sandboxMode,
      timeoutMs
    },
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

function resolveApiKey(
  env: Record<string, string | undefined>,
  options: {
    allowAnthropicDeepSeekFallback: boolean;
  }
): {
  source: ResolvedCodexAgentConfig['apiKeySource'];
  value: string | null;
} {
  const codexApiKey = readEnv(env, 'CODEX_API_KEY');
  if (codexApiKey) return { source: 'CODEX_API_KEY', value: codexApiKey };

  const openAiApiKey = readEnv(env, 'OPENAI_API_KEY');
  if (openAiApiKey) return { source: 'OPENAI_API_KEY', value: openAiApiKey };

  const deepSeekApiKey = readEnv(env, 'DEEPSEEK_API_KEY');
  if (deepSeekApiKey) return { source: 'DEEPSEEK_API_KEY', value: deepSeekApiKey };

  if (options.allowAnthropicDeepSeekFallback && readEnv(env, 'ANTHROPIC_BASE_URL')?.includes('api.deepseek.com')) {
    const anthropicAuthToken = readEnv(env, 'ANTHROPIC_AUTH_TOKEN');
    if (anthropicAuthToken) return { source: 'ANTHROPIC_AUTH_TOKEN', value: anthropicAuthToken };

    const anthropicApiKey = readEnv(env, 'ANTHROPIC_API_KEY');
    if (anthropicApiKey) return { source: 'ANTHROPIC_API_KEY', value: anthropicApiKey };
  }

  return { source: null, value: null };
}

function resolveCodexHomeAuthSource(env: Record<string, string | undefined>): string | null {
  if (readEnv(env, 'CODEX_AUTH_MODE') !== 'codex-home') {
    return null;
  }

  return readEnv(env, 'CODEX_AUTH_HOME') ?? readEnv(env, 'CODEX_HOME');
}

function resolveBaseUrl(
  env: Record<string, string | undefined>,
  apiKeySource: ResolvedCodexAgentConfig['apiKeySource'],
  options: {
    allowAnthropicDeepSeekFallback: boolean;
  }
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
    (options.allowAnthropicDeepSeekFallback && readEnv(env, 'ANTHROPIC_BASE_URL')?.includes('api.deepseek.com'))
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
