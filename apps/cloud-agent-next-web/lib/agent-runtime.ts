import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

import {
  ClaudeAgentAdapter,
  DEFAULT_CLAUDE_AGENT_DOCKER_IMAGE,
  DockerClaudeAgentAdapter,
  resolveClaudeAgentConfig,
  type AgentAdapter,
  type AgentContinuityContext,
  type AgentContinuityEntrySummary,
  type AgentRuntimeEvent,
  type ClaudeAgentConfigInput,
  type JsonObject,
  type ProviderSessionBinding,
  type RuntimeScope,
  type SecretRef,
  type SandboxSession
} from '@agent-infra/cloud-agent-runtime';
import type { AgentProfile, McpProfileAuditEntryV1, SkillProfileAuditEntryV1 } from '@agent-infra/core';

import type { CloudAgentUser } from './auth';
import { getCloudAgentRepositories } from './db';
import { createDbProviderTranscriptStore } from './provider-transcript-store';
import {
  createDurablePermissionBrokerFromEnv,
  shouldUseDurablePermissionBroker
} from './durable-permission-broker';
import type { AgentProviderId } from './provider-config';
import { createCloudAgentSecretBroker } from './secret-broker-provider';
import { readServerEnv } from './server-env';
import type { CloudThread } from './thread-store';
import {
  CLOUD_AGENT_TENANT_ID,
  resolveCloudWorkspaceRuntimePaths,
  resolveRunCredentialsDir,
  safePathSegment
} from './workspace-runtime';
import { appendCloudRunEvent } from './run-store';
import { publishCloudRunEvent } from './run-event-hub';

const DEFAULT_WEB_CLAUDE_AGENT_TIMEOUT_MS = 120_000;
const DOCKER_GUEST_CREDENTIALS_DIR = '/agent-credentials';
const SKILL_MATERIALIZATION_MANIFEST_FILE = 'skill-materialization.json';

interface RunCloudAgentTurnInput {
  user: CloudAgentUser;
  thread: CloudThread;
  provider: AgentProviderId;
  content: string;
  runId?: string | null;
}

export async function runCloudAgentTurn(input: RunCloudAgentTurnInput): Promise<string> {
  let content = '';
  let failure: string | null = null;

  for await (const event of streamCloudAgentTurn(input)) {
    if (event.type === 'agent_message_delta') {
      content += readEventString(event, 'content') ?? '';
    }

    if (event.type === 'agent_completed') {
      content = readEventString(event, 'content') ?? content;
    }

    if (event.type === 'agent_failed') {
      failure = readEventString(event, 'error') ?? 'Agent run failed.';
    }
  }

  return content || failure || 'Claude completed without returning assistant text.';
}

export async function* streamCloudAgentTurn(input: RunCloudAgentTurnInput): AsyncIterable<AgentRuntimeEvent> {
  const prepared = await prepareCloudAgentTurn(input);
  if ('fallbackContent' in prepared) {
    yield {
      type: 'agent_message_delta',
      payload: {
        provider: input.provider,
        content: prepared.fallbackContent
      }
    };
    yield {
      type: 'agent_completed',
      payload: {
        provider: input.provider,
        content: prepared.fallbackContent
      }
    };
    return;
  }

  yield* prepared.adapter.run({
    continuity: prepared.continuity,
    providerSession: prepared.providerSession,
    scope: prepared.scope,
    prompt: input.content,
    sandbox: prepared.sandbox
  });
}

type PreparedCloudAgentTurn =
  | {
      fallbackContent: string;
    }
  | {
      adapter: AgentAdapter;
      continuity: AgentContinuityContext | null;
      providerSession: ProviderSessionBinding | null;
      sandbox: SandboxSession;
      scope: RuntimeScope;
    };

async function prepareCloudAgentTurn(input: RunCloudAgentTurnInput): Promise<PreparedCloudAgentTurn> {
  if (input.provider === 'codex') {
    return { fallbackContent: 'Codex adapter is planned but not connected in this slice.' };
  }

  const env = readServerEnv();
  const runtimePaths = resolveCloudWorkspaceRuntimePaths({
    userId: input.user.id,
    workspaceId: input.thread.workspaceId,
    provider: input.provider
  });
  if (!runtimePaths.providerConfigDir) {
    throw new Error(`Missing provider config directory for provider: ${input.provider}`);
  }

  const scope: RuntimeScope = {
    tenantId: CLOUD_AGENT_TENANT_ID,
    userId: input.user.id,
    workspaceId: runtimePaths.workspaceId,
    threadId: input.thread.id,
    runId: input.runId ?? null
  };
  const agentProfile = await resolveAgentProfile({
    provider: input.provider,
    workspaceId: scope.workspaceId
  });
  const executionMode = readClaudeExecutionMode(env, agentProfile);
  const credentialsDir = resolveRunCredentialsDir(runtimePaths.credentialsDir, input.runId);
  if (input.runId) {
    await rm(credentialsDir, { force: true, recursive: true });
  }
  await Promise.all([
    mkdir(runtimePaths.hostWorkspacePath, { recursive: true }),
    mkdir(runtimePaths.providerConfigDir, { recursive: true }),
    mkdir(credentialsDir, { recursive: true })
  ]);
  const secretEnv = await resolveAgentSecretEnv({
    credentialsDir,
    guestCredentialsDir: executionMode === 'docker' ? DOCKER_GUEST_CREDENTIALS_DIR : credentialsDir,
    provider: input.provider,
    scope
  });
  const envWithSecrets = {
    ...env,
    ...secretEnv
  };
  const envWithProfile = applyAgentProfileEnv(envWithSecrets, agentProfile);
  const mcpRemoteHostAllowlist = readMcpRemoteHostAllowlist(envWithProfile);
  const mcpStdioCommandAllowlist = readMcpStdioCommandAllowlist(envWithProfile);
  const allowInlineMcpHeaders = readMcpInlineHeadersEnabled(envWithProfile);
  const allowInsecureRemoteMcp = readMcpInsecureHttpEnabled(envWithProfile);
  const skillRefAllowlist = readSkillRefAllowlist(envWithProfile);
  const mcpResolution = resolveProfileMcpServers(
    agentProfile,
    executionMode,
    mcpRemoteHostAllowlist,
    mcpStdioCommandAllowlist,
    allowInlineMcpHeaders,
    allowInsecureRemoteMcp
  );
  const skillResolution = resolveProfileSkills(agentProfile, skillRefAllowlist);
  const skillMaterialization = await materializeProfileSkills({
    credentialsDir,
    executionMode,
    guestCredentialsDir: executionMode === 'docker' ? DOCKER_GUEST_CREDENTIALS_DIR : credentialsDir,
    skills: skillResolution.skills ?? []
  });
  const envWithSkillMaterialization = {
    ...envWithProfile,
    ...skillMaterialization.env
  };
  await recordMcpProfileAuditEvent({
    executionMode,
    mcpAuditEntries: mcpResolution.auditEntries,
    profile: agentProfile,
    provider: input.provider,
    remoteHostAllowlist: mcpRemoteHostAllowlist,
    stdioCommandAllowlist: mcpStdioCommandAllowlist,
    runId: input.runId ?? null,
    scope,
    skillRefAllowlist,
    skillAuditEntries: applySkillMaterializationAudit(
      skillResolution.auditEntries,
      skillMaterialization.manifestPath
    ),
    thread: input.thread
  });
  const claudeConfig = resolveClaudeAgentConfig({
    clientApp: 'agent-infra/cloud-agent-next-web',
    configDir: runtimePaths.providerConfigDir,
    defaultTimeoutMs: readWebClaudeAgentTimeoutMs(envWithSkillMaterialization),
    enableBashTool: true,
    env: envWithSkillMaterialization,
    mcpServers: mcpResolution.servers,
    skills: skillResolution.skills,
    strictMcpConfig: true,
    toolAllowlist: readProfileToolAllowlist(agentProfile)
  });

  if (!claudeConfig.configured) {
    return {
      fallbackContent: [
        'ClaudeAgentAdapter is wired, but ANTHROPIC_API_KEY / ANTHROPIC_AUTH_TOKEN is empty.',
        'Add it to apps/cloud-agent-next-web/.env.local or configure a workspace secret ref and restart the dev server.'
      ].join('\n')
    };
  }
  const sandbox: SandboxSession = {
    id: `local-${input.thread.id}`,
    provider: executionMode,
    scope,
    status: 'running',
    workspacePath: runtimePaths.hostWorkspacePath,
    createdAt: new Date()
  };
  const providerSession: ProviderSessionBinding | null = input.thread.providerSessionId
    ? {
        provider: input.provider,
        metadata: isRecord(input.thread.providerSessionMetadata) ? (input.thread.providerSessionMetadata as JsonObject) : null,
        providerProjectKey: input.thread.providerProjectKey ?? null,
        providerSessionId: input.thread.providerSessionId,
        status: 'active',
        threadId: input.thread.id,
        workspaceId: runtimePaths.workspaceId
      }
    : null;
  const permissionBroker = shouldUseDurablePermissionBroker(env) ? createDurablePermissionBrokerFromEnv(env) : undefined;
  const adapter =
    executionMode === 'docker'
      ? new DockerClaudeAgentAdapter({
          ...claudeConfig.adapterOptions,
          guestWorkspacePath: runtimePaths.guestWorkspacePath,
          hostConfigDir: runtimePaths.providerConfigDir,
          hostCredentialsDir: credentialsDir,
          guestCredentialsDir: DOCKER_GUEST_CREDENTIALS_DIR,
          hostWorkspacePath: runtimePaths.hostWorkspacePath,
          image: env.CLOUD_AGENT_CLAUDE_DOCKER_IMAGE?.trim() || DEFAULT_CLAUDE_AGENT_DOCKER_IMAGE,
          permissionBroker,
          transcriptStore: createDbProviderTranscriptStore()
        })
      : new ClaudeAgentAdapter({
          ...claudeConfig.adapterOptions,
          cwd: runtimePaths.hostWorkspacePath,
          permissionBroker,
          transcriptStore: createDbProviderTranscriptStore()
        });

  return {
    adapter,
    continuity: buildProviderSessionContinuity(input.thread),
    providerSession,
    sandbox,
    scope
  };
}

function buildProviderSessionContinuity(thread: CloudThread): AgentContinuityContext | null {
  const metadata = thread.providerSessionMetadata;
  if (!isRecord(metadata) || (metadata.lifecycleAction !== 'replay' && metadata.lifecycleAction !== 'compact')) {
    return null;
  }

  const transcriptReplay = metadata.transcriptReplay;
  if (!isRecord(transcriptReplay)) {
    return null;
  }

  const plan = isRecord(transcriptReplay.plan) ? transcriptReplay.plan : null;
  if (!plan || plan.available !== true) {
    return null;
  }

  const summary = isRecord(transcriptReplay.summary) ? transcriptReplay.summary : null;
  const sourceRunIds = Array.isArray(plan.sourceRunIds)
    ? plan.sourceRunIds.filter((runId): runId is string => typeof runId === 'string')
    : [];
  const entryCount = typeof summary?.entryCount === 'number' ? summary.entryCount : null;
  const entries = readContinuityEntrySummaries(plan.entries);

  return {
    entries,
    fromOrdinal: typeof plan.fromOrdinal === 'number' ? plan.fromOrdinal : null,
    previousProviderSessionId: thread.providerSessionId ?? null,
    sourceRunIds,
    strategy: metadata.lifecycleAction === 'compact' ? 'compact' : 'replay_transcript',
    summary: entryCount == null ? null : `${entryCount} provider transcript entries are available for continuity.`,
    toOrdinal: typeof plan.toOrdinal === 'number' ? plan.toOrdinal : null
  };
}

function readContinuityEntrySummaries(value: unknown): AgentContinuityEntrySummary[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((entry) => {
    if (!isRecord(entry) || typeof entry.entryType !== 'string' || typeof entry.ordinal !== 'number') {
      return [];
    }

    return [
      {
        entryType: entry.entryType,
        ordinal: entry.ordinal,
        providerEntryId: typeof entry.providerEntryId === 'string' ? entry.providerEntryId : null,
        runId: typeof entry.runId === 'string' ? entry.runId : null,
        summary: typeof entry.summary === 'string' && entry.summary.trim() ? entry.summary : null
      }
    ];
  });
}

async function resolveAgentSecretEnv(input: {
  credentialsDir: string;
  guestCredentialsDir: string;
  provider: AgentProviderId;
  scope: RuntimeScope;
}): Promise<Record<string, string>> {
  const repositories = await getCloudAgentRepositories();
  const secretRefs = (await repositories.workspaceSecretRefRepo.listByWorkspace(input.scope.workspaceId))
    .filter((ref) => ref.status === 'active')
    .map((ref): SecretRef => ({
      id: ref.id,
      name: ref.name,
      scope: ref.scope,
      refKey: ref.refKey,
      targetName: ref.targetName,
      delivery: ref.delivery,
      metadata: null
    }));
  if (secretRefs.length === 0) {
    return {};
  }

  const usesProxyDelivery = secretRefs.some((ref) => ref.delivery === 'proxy');
  const proxyExchangeUrl = usesProxyDelivery ? readSecretProxyExchangeUrl() : null;
  if (usesProxyDelivery && !proxyExchangeUrl) {
    throw new Error('CLOUD_AGENT_SECRET_PROXY_URL is required when a workspace secret uses delivery=proxy.');
  }

  const broker = createCloudAgentSecretBroker({
    provider: input.provider,
    scope: input.scope
  });
  const secrets = await broker.resolve({
    scope: input.scope,
    refs: secretRefs,
    purpose: 'agent'
  });
  const env: Record<string, string> = {};
  if (proxyExchangeUrl) {
    env.CLOUD_AGENT_SECRET_PROXY_URL = proxyExchangeUrl;
  }

  for (const secret of secrets) {
    if ((secret.delivery === 'env' || secret.delivery === 'proxy') && secret.name && secret.value) {
      env[secret.name] = secret.value;
      continue;
    }

    if (secret.delivery === 'file' && secret.name && secret.value) {
      const fileName = secretFileName(secret.name, secret.ref.id);
      await writeFile(path.join(input.credentialsDir, fileName), secret.value, { mode: 0o600 });
      env[secret.name] = path.posix.join(input.guestCredentialsDir, fileName);
    }
  }

  return env;
}

function readSecretProxyExchangeUrl(): string | null {
  return readServerEnv().CLOUD_AGENT_SECRET_PROXY_URL?.trim() || null;
}

function secretFileName(targetName: string, refId: string): string {
  const safeTarget = safePathSegment(targetName.toLowerCase());
  const safeRef = safePathSegment(refId.toLowerCase());
  return `${safeTarget}-${safeRef}`;
}

async function resolveAgentProfile(input: {
  provider: AgentProviderId;
  workspaceId: string;
}): Promise<AgentProfile | null> {
  const repositories = await getCloudAgentRepositories();
  const profiles = await repositories.agentProfileRepo.listByWorkspace(input.workspaceId);
  const activeProfiles = profiles.filter((profile) => profile.status === 'active' && profile.provider === input.provider);
  return activeProfiles.find((profile) => profile.defaultForWorkspace) ?? activeProfiles[0] ?? null;
}

function applyAgentProfileEnv(
  env: Record<string, string | undefined>,
  profile: AgentProfile | null
): Record<string, string | undefined> {
  if (!profile) {
    return env;
  }

  return {
    ...env,
    ANTHROPIC_MODEL: profile.model?.trim() || env.ANTHROPIC_MODEL,
    CLAUDE_AGENT_PERMISSION_MODE: profile.approvalPolicy?.trim() || env.CLAUDE_AGENT_PERMISSION_MODE
  };
}

function readProfileToolAllowlist(profile: AgentProfile | null): string[] | null {
  if (!profile?.toolAllowlist?.length) {
    return null;
  }

  return profile.toolAllowlist.map((tool) => tool.trim()).filter(Boolean);
}

type ClaudeMcpServers = NonNullable<ClaudeAgentConfigInput['mcpServers']>;
type ClaudeMcpServerConfig = ClaudeMcpServers[string];

function resolveProfileMcpServers(
  profile: AgentProfile | null,
  executionMode: 'docker' | 'local',
  remoteHostAllowlist: string[] | null,
  stdioCommandAllowlist: string[] | null,
  allowInlineHeaders: boolean,
  allowInsecureRemoteMcp: boolean
): { auditEntries: McpProfileAuditEntryV1[]; servers: ClaudeMcpServers | null } {
  const servers: ClaudeMcpServers = {};
  const auditEntries: McpProfileAuditEntryV1[] = [];
  for (const entry of profile?.mcpServers ?? []) {
    if (!isRecord(entry)) {
      auditEntries.push({
        decision: 'skipped',
        reason: 'invalid_mcp_entry'
      });
      continue;
    }

    const name = readRecordString(entry, 'name') ?? readRecordString(entry, 'id');
    const transport = readRecordString(entry, 'transport') ?? readRecordString(entry, 'type');
    if (!name) {
      auditEntries.push({
        transport,
        decision: 'skipped',
        reason: 'missing_name'
      });
      continue;
    }

    if (transport === 'http' || transport === 'sse') {
      const url = readRecordString(entry, 'url');
      if (!url) {
        auditEntries.push({
          name,
          transport,
          decision: 'skipped',
          reason: 'missing_url'
        });
        continue;
      }
      const target = parseRemoteMcpTarget(url);
      if (!target) {
        auditEntries.push({
          name,
          transport,
          decision: 'skipped',
          reason: 'invalid_url',
          target: url
        });
        continue;
      }
      if (target.protocol !== 'https:' && !allowInsecureRemoteMcp) {
        auditEntries.push({
          name,
          transport,
          decision: 'skipped',
          reason: 'remote_insecure_http_not_allowed',
          target: url
        });
        continue;
      }
      if (remoteHostAllowlist && !remoteHostAllowlist.includes(target.hostname)) {
        auditEntries.push({
          name,
          transport,
          decision: 'skipped',
          reason: 'remote_host_not_allowlisted',
          target: url
        });
        continue;
      }

      const headers = readRecordStringMap(entry.headers);
      if (headers && !allowInlineHeaders) {
        auditEntries.push({
          name,
          transport,
          decision: 'skipped',
          reason: 'inline_headers_not_allowed',
          target: url
        });
        continue;
      }

      const toolAllowlist = readRecordStringArray(entry.toolAllowlist);
      servers[name] = compactMcpServerConfig({
        type: transport,
        url,
        headers,
        tools: toolAllowlist?.map((tool) => ({
          name: tool,
          permission_policy: 'always_allow'
        })),
        timeout: readRecordPositiveNumber(entry, 'timeout'),
        alwaysLoad: readRecordBoolean(entry, 'alwaysLoad')
      });
      auditEntries.push({
        name,
        transport,
        decision: 'enabled',
        target: url,
        toolAllowlist: toolAllowlist ?? null
      });
      continue;
    }

    if (transport === 'stdio' && executionMode === 'docker') {
      const command = readRecordString(entry, 'command');
      if (!command) {
        auditEntries.push({
          name,
          transport,
          decision: 'skipped',
          reason: 'missing_command'
        });
        continue;
      }
      if (stdioCommandAllowlist && !stdioCommandAllowlist.includes(command)) {
        auditEntries.push({
          name,
          transport,
          decision: 'skipped',
          reason: 'stdio_command_not_allowlisted',
          target: command
        });
        continue;
      }

      servers[name] = compactMcpServerConfig({
        type: 'stdio',
        command,
        args: readRecordStringArray(entry.args),
        env: readRecordStringMap(entry.env),
        timeout: readRecordPositiveNumber(entry, 'timeout'),
        alwaysLoad: readRecordBoolean(entry, 'alwaysLoad')
      });
      auditEntries.push({
        name,
        transport,
        decision: 'enabled',
        target: command
      });
      continue;
    }

    auditEntries.push({
      name,
      transport,
      decision: 'skipped',
      reason: transport === 'stdio' ? 'stdio_requires_docker_execution' : 'unsupported_transport'
    });
  }

  return {
    auditEntries,
    servers: Object.keys(servers).length > 0 ? servers : null
  };
}

function resolveProfileSkills(profile: AgentProfile | null, skillRefAllowlist: string[] | null): {
  auditEntries: SkillProfileAuditEntryV1[];
  skills: string[] | null;
} {
  const auditEntries: SkillProfileAuditEntryV1[] = [];
  const skills: string[] = [];
  for (const skill of profile?.skillRefs ?? []) {
    const ref = skill.trim();
    if (!ref) {
      continue;
    }

    if (skillRefAllowlist && !skillRefAllowlist.includes(ref)) {
      auditEntries.push({
        ref,
        decision: 'skipped',
        reason: 'skill_ref_not_allowlisted'
      });
      continue;
    }

    skills.push(ref);
    auditEntries.push({
      ref,
      decision: 'enabled'
    });
  }

  return {
    auditEntries,
    skills: skills.length > 0 ? skills : null
  };
}

async function materializeProfileSkills(input: {
  credentialsDir: string;
  executionMode: 'docker' | 'local';
  guestCredentialsDir: string;
  skills: string[];
}): Promise<{
  env: Record<string, string>;
  manifestPath: string | null;
}> {
  if (input.skills.length === 0) {
    return {
      env: {},
      manifestPath: null
    };
  }

  const hostManifestPath = path.join(input.credentialsDir, SKILL_MATERIALIZATION_MANIFEST_FILE);
  const guestManifestPath = path.posix.join(input.guestCredentialsDir, SKILL_MATERIALIZATION_MANIFEST_FILE);
  await writeFile(
    hostManifestPath,
    `${JSON.stringify(
      {
        schemaVersion: 1,
        executionMode: input.executionMode,
        generatedAt: new Date().toISOString(),
        skills: input.skills.map((ref) => ({
          ref,
          source: 'agent_profile',
          status: 'enabled'
        }))
      },
      null,
      2
    )}\n`,
    { mode: 0o600 }
  );

  return {
    env: {
      CLOUD_AGENT_SKILL_REFS: input.skills.join(','),
      CLOUD_AGENT_SKILLS_MANIFEST: guestManifestPath
    },
    manifestPath: guestManifestPath
  };
}

function applySkillMaterializationAudit(
  auditEntries: SkillProfileAuditEntryV1[],
  manifestPath: string | null
): SkillProfileAuditEntryV1[] {
  if (!manifestPath) {
    return auditEntries;
  }

  return auditEntries.map((entry) =>
    entry.decision === 'enabled'
      ? {
          ...entry,
          manifestPath,
          materialization: 'manifest'
        }
      : entry
  );
}

async function recordMcpProfileAuditEvent(input: {
  executionMode: 'docker' | 'local';
  mcpAuditEntries: McpProfileAuditEntryV1[];
  profile: AgentProfile | null;
  provider: AgentProviderId;
  remoteHostAllowlist: string[] | null;
  stdioCommandAllowlist: string[] | null;
  runId: string | null;
  scope: RuntimeScope;
  skillRefAllowlist: string[] | null;
  skillAuditEntries: SkillProfileAuditEntryV1[];
  thread: CloudThread;
}): Promise<void> {
  if (!input.runId || (!input.mcpAuditEntries.length && !input.skillAuditEntries.length)) {
    return;
  }

  const record = await appendCloudRunEvent({
    threadId: input.thread.id,
    runId: input.runId,
    type: 'mcp_profile_audit',
    payload: {
      schemaVersion: 1,
      type: 'mcp_profile_audit',
      provider: input.provider,
      workspaceId: input.scope.workspaceId,
      threadId: input.thread.id,
      runId: input.runId,
      profileId: input.profile?.id ?? null,
      executionMode: input.executionMode,
      strictMcpConfig: true,
      remoteHostAllowlist: input.remoteHostAllowlist,
      stdioCommandAllowlist: input.stdioCommandAllowlist,
      skillRefAllowlist: input.skillRefAllowlist,
      servers: input.mcpAuditEntries,
      skills: input.skillAuditEntries
    }
  });
  publishCloudRunEvent(record);
}

function readMcpRemoteHostAllowlist(env: Record<string, string | undefined>): string[] | null {
  const configured = env.CLOUD_AGENT_MCP_REMOTE_HOST_ALLOWLIST?.trim();
  return readCommaSeparatedAllowlist(configured)?.map((host) => host.toLowerCase()) ?? null;
}

function readMcpStdioCommandAllowlist(env: Record<string, string | undefined>): string[] | null {
  const configured = env.CLOUD_AGENT_MCP_STDIO_COMMAND_ALLOWLIST?.trim();
  return readCommaSeparatedAllowlist(configured);
}

function readMcpInlineHeadersEnabled(env: Record<string, string | undefined>): boolean {
  return env.CLOUD_AGENT_MCP_ALLOW_INLINE_HEADERS?.trim().toLowerCase() === 'true';
}

function readMcpInsecureHttpEnabled(env: Record<string, string | undefined>): boolean {
  return env.CLOUD_AGENT_MCP_ALLOW_INSECURE_HTTP?.trim().toLowerCase() === 'true';
}

function readSkillRefAllowlist(env: Record<string, string | undefined>): string[] | null {
  const configured = env.CLOUD_AGENT_SKILL_REF_ALLOWLIST?.trim();
  return readCommaSeparatedAllowlist(configured);
}

function readCommaSeparatedAllowlist(configured: string | undefined): string[] | null {
  if (!configured) {
    return null;
  }

  const values = configured
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  return values.length > 0 ? [...new Set(values)] : null;
}

function parseRemoteMcpTarget(rawUrl: string): { hostname: string; protocol: string } | null {
  try {
    const url = new URL(rawUrl);
    return { hostname: url.hostname.toLowerCase(), protocol: url.protocol };
  } catch {
    return null;
  }
}

function readWebClaudeAgentTimeoutMs(env: Record<string, string | undefined>): number {
  const configured = Number(env.CLOUD_AGENT_WEB_CLAUDE_TIMEOUT_MS?.trim());
  return Number.isFinite(configured) && configured > 0 ? configured : DEFAULT_WEB_CLAUDE_AGENT_TIMEOUT_MS;
}

function readClaudeExecutionMode(env: Record<string, string | undefined>, profile: AgentProfile | null): 'docker' | 'local' {
  if (profile?.sandboxMode === 'local' || profile?.sandboxMode === 'docker') {
    return profile.sandboxMode;
  }

  return env.CLOUD_AGENT_CLAUDE_EXECUTION?.trim() === 'local' ? 'local' : 'docker';
}

function readEventString(event: AgentRuntimeEvent, key: string): string | null {
  const value = event.payload?.[key];
  return typeof value === 'string' ? value : null;
}

function compactMcpServerConfig(config: ClaudeMcpServerConfig): ClaudeMcpServerConfig {
  return Object.fromEntries(Object.entries(config).filter(([, value]) => value !== undefined)) as ClaudeMcpServerConfig;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readRecordString(record: Record<string, unknown>, key: string): string | null {
  const value = record[key];
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function readRecordStringMap(value: unknown): Record<string, string> | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const entries = Object.entries(value).filter((entry): entry is [string, string] => typeof entry[1] === 'string');
  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
}

function readRecordStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const items = value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
  return items.length > 0 ? items : undefined;
}

function readRecordPositiveNumber(record: Record<string, unknown>, key: string): number | undefined {
  const value = record[key];
  const parsed = typeof value === 'number' ? value : typeof value === 'string' ? Number(value.trim()) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function readRecordBoolean(record: Record<string, unknown>, key: string): boolean | undefined {
  const value = record[key];
  return typeof value === 'boolean' ? value : undefined;
}
