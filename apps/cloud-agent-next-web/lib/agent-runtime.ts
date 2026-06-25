import {
  type AgentAdapter,
  type AgentContinuityContext,
  type AgentRuntimeEvent,
  type JsonObject,
  type ProviderSessionBinding,
  type RuntimeScope,
  type SandboxSession
} from '@agent-infra/cloud-agent-runtime';

import type { CloudAgentUser } from './auth';
import { readAgentExecutionMode } from './agent-runtime-config';
import { buildProviderSessionContinuity } from './agent-runtime-continuity';
import {
  createClaudeAdapterForTurn,
  createCodexAdapterForTurn
} from './agent-runtime-provider-factory';
import { prepareRuntimeScope } from './agent-runtime-scope';
import {
  applyAgentProfileEnv,
  applySkillMaterializationAudit,
  materializeProfileSkills,
  readMcpInlineHeadersEnabled,
  readMcpInsecureHttpEnabled,
  readMcpRemoteHostAllowlist,
  readMcpStdioCommandAllowlist,
  readProfileToolAllowlist,
  readSkillRefAllowlist,
  recordMcpProfileAuditEvent,
  resolveAgentProfile,
  resolveProfileMcpServers,
  resolveProfileSkills
} from './agent-runtime-profile';
import { resolveAgentSecretEnv } from './agent-runtime-secrets';
import type { AgentProviderId } from './provider-config';
import { readServerEnv } from './server-env';
import type { CloudThread } from './thread-store';

const DOCKER_GUEST_CREDENTIALS_DIR = '/agent-credentials';

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
  const env = readServerEnv();
  const {
    credentialsDir,
    runtimePaths,
    scope
  } = await prepareRuntimeScope({
    provider: input.provider,
    runId: input.runId ?? null,
    thread: input.thread,
    user: input.user
  });
  const agentProfile = await resolveAgentProfile({
    provider: input.provider,
    workspaceId: scope.workspaceId
  });
  const executionMode = readAgentExecutionMode(input.provider, env, agentProfile);
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
  const envWithProfile = applyAgentProfileEnv(input.provider, envWithSecrets, agentProfile);
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

  if (input.provider === 'codex') {
    const codexFactoryResult = await createCodexAdapterForTurn({
      credentialsDir,
      env: envWithProfile,
      executionMode,
      guestCredentialsDir: DOCKER_GUEST_CREDENTIALS_DIR,
      runtimePaths
    });
    if ('fallbackContent' in codexFactoryResult) {
      return {
        fallbackContent: codexFactoryResult.fallbackContent
      };
    }

    return {
      adapter: codexFactoryResult.adapter,
      continuity: buildProviderSessionContinuity(input.thread),
      providerSession,
      sandbox,
      scope
    };
  }

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
  const claudeFactoryResult = createClaudeAdapterForTurn({
    credentialsDir,
    env: envWithSkillMaterialization,
    executionMode,
    guestCredentialsDir: DOCKER_GUEST_CREDENTIALS_DIR,
    mcpServers: mcpResolution.servers,
    runtimePaths,
    skills: skillResolution.skills,
    toolAllowlist: readProfileToolAllowlist(agentProfile)
  });
  if ('fallbackContent' in claudeFactoryResult) {
    return {
      fallbackContent: claudeFactoryResult.fallbackContent
    };
  }

  return {
    adapter: claudeFactoryResult.adapter,
    continuity: buildProviderSessionContinuity(input.thread),
    providerSession,
    sandbox,
    scope
  };
}

function readEventString(event: AgentRuntimeEvent, key: string): string | null {
  const value = event.payload?.[key];
  return typeof value === 'string' ? value : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
