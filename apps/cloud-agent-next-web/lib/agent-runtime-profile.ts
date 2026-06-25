import { writeFile } from 'node:fs/promises';
import path from 'node:path';

import type { ClaudeAgentConfigInput, RuntimeScope } from '@agent-infra/cloud-agent-runtime';
import type { AgentProfile, McpProfileAuditEntryV1, SkillProfileAuditEntryV1 } from '@agent-infra/core';

import { getCloudAgentRepositories } from './db';
import type { AgentProviderId } from './provider-config';
import { appendCloudRunEvent } from './run-store';
import { publishCloudRunEvent } from './run-event-hub';
import type { CloudThread } from './thread-store';

const SKILL_MATERIALIZATION_MANIFEST_FILE = 'skill-materialization.json';

type ClaudeMcpServers = NonNullable<ClaudeAgentConfigInput['mcpServers']>;
type ClaudeMcpServerConfig = ClaudeMcpServers[string];

export async function resolveAgentProfile(input: {
  provider: AgentProviderId;
  workspaceId: string;
}): Promise<AgentProfile | null> {
  const repositories = await getCloudAgentRepositories();
  const profiles = await repositories.agentProfileRepo.listByWorkspace(input.workspaceId);
  const activeProfiles = profiles.filter((profile) => profile.status === 'active' && profile.provider === input.provider);
  return activeProfiles.find((profile) => profile.defaultForWorkspace) ?? activeProfiles[0] ?? null;
}

export function applyAgentProfileEnv(
  provider: AgentProviderId,
  env: Record<string, string | undefined>,
  profile: AgentProfile | null
): Record<string, string | undefined> {
  if (!profile) {
    return env;
  }

  if (provider === 'codex') {
    return {
      ...env,
      CODEX_APPROVAL_POLICY: profile.approvalPolicy?.trim() || env.CODEX_APPROVAL_POLICY,
      CODEX_MODEL: profile.model?.trim() || env.CODEX_MODEL,
      CODEX_SANDBOX_MODE: profile.sandboxMode?.trim() || env.CODEX_SANDBOX_MODE
    };
  }

  return {
    ...env,
    ANTHROPIC_MODEL: profile.model?.trim() || env.ANTHROPIC_MODEL,
    CLAUDE_AGENT_PERMISSION_MODE: profile.approvalPolicy?.trim() || env.CLAUDE_AGENT_PERMISSION_MODE
  };
}

export function readProfileToolAllowlist(profile: AgentProfile | null): string[] | null {
  if (!profile?.toolAllowlist?.length) {
    return null;
  }

  return profile.toolAllowlist.map((tool) => tool.trim()).filter(Boolean);
}

export function resolveProfileMcpServers(
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

export function resolveProfileSkills(profile: AgentProfile | null, skillRefAllowlist: string[] | null): {
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

export async function materializeProfileSkills(input: {
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

export function applySkillMaterializationAudit(
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

export async function recordMcpProfileAuditEvent(input: {
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

export function readMcpRemoteHostAllowlist(env: Record<string, string | undefined>): string[] | null {
  const configured = env.CLOUD_AGENT_MCP_REMOTE_HOST_ALLOWLIST?.trim();
  return readCommaSeparatedAllowlist(configured)?.map((host) => host.toLowerCase()) ?? null;
}

export function readMcpStdioCommandAllowlist(env: Record<string, string | undefined>): string[] | null {
  const configured = env.CLOUD_AGENT_MCP_STDIO_COMMAND_ALLOWLIST?.trim();
  return readCommaSeparatedAllowlist(configured);
}

export function readMcpInlineHeadersEnabled(env: Record<string, string | undefined>): boolean {
  return env.CLOUD_AGENT_MCP_ALLOW_INLINE_HEADERS?.trim().toLowerCase() === 'true';
}

export function readMcpInsecureHttpEnabled(env: Record<string, string | undefined>): boolean {
  return env.CLOUD_AGENT_MCP_ALLOW_INSECURE_HTTP?.trim().toLowerCase() === 'true';
}

export function readSkillRefAllowlist(env: Record<string, string | undefined>): string[] | null {
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
