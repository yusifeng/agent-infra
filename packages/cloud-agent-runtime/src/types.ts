export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };
export type JsonObject = { [key: string]: JsonValue };

export interface RuntimeScope {
  tenantId: string;
  userId: string;
  workspaceId: string;
  threadId?: string | null;
  runId?: string | null;
}

export interface ResourceLimits {
  timeoutMs?: number;
  cpuCount?: number;
  memoryBytes?: number;
  maxOutputBytes?: number;
  maxFileBytes?: number;
}

export interface SecretRef {
  id: string;
  name: string;
  scope: 'tenant' | 'user' | 'workspace';
  refKey?: string | null;
  targetName?: string | null;
  delivery?: 'env' | 'file' | 'proxy' | null;
  metadata?: JsonObject | null;
}

export interface ScopedSecret {
  ref: SecretRef;
  delivery: 'env' | 'file' | 'proxy';
  name?: string | null;
  value?: string | null;
  expiresAt?: Date | null;
}

export interface SecretBroker {
  resolve(input: {
    scope: RuntimeScope;
    refs: SecretRef[];
    purpose: 'agent' | 'mcp' | 'tool' | 'storage';
  }): Promise<ScopedSecret[]>;
}

export interface SecretBrokerAuditEvent {
  scope: RuntimeScope;
  purpose: 'agent' | 'mcp' | 'tool' | 'storage';
  refId: string;
  refName: string;
  refKey?: string | null;
  delivery?: ScopedSecret['delivery'] | null;
  targetName?: string | null;
  decision: 'issued' | 'rejected';
  reason?: string | null;
  issuedAt: Date;
  expiresAt?: Date | null;
}

export interface SecretBrokerAuditSink {
  record(event: SecretBrokerAuditEvent): void | Promise<void>;
}

export interface PermissionRequest {
  scope: RuntimeScope;
  provider: string;
  permissionRequestId: string;
  toolName: string;
  input: JsonObject;
  title?: string | null;
  displayName?: string | null;
  description?: string | null;
  blockedPath?: string | null;
  decisionReason?: string | null;
  suggestions?: JsonValue | null;
  agentId?: string | null;
}

export interface PermissionDecision {
  decision: 'approved' | 'denied';
  approvalStatus?: 'approved' | 'denied' | 'expired' | 'cancelled' | null;
  reason?: string | null;
  interrupt?: boolean;
  updatedInput?: JsonObject | null;
  updatedPermissions?: JsonValue | null;
  resolvedByActorId?: string | null;
  classification?: 'user_temporary' | 'user_permanent' | 'user_reject' | null;
}

export interface PermissionBroker {
  resolve(request: PermissionRequest): Promise<PermissionDecision>;
}

export interface NetworkPolicy {
  mode: 'none' | 'allowlist' | 'open';
  allowedHosts?: string[];
}

export interface FilesystemPolicy {
  workspaceMode: 'read-only' | 'read-write';
  writablePaths?: string[];
  readonlyPaths?: string[];
}

export interface SandboxPolicy {
  filesystem: FilesystemPolicy;
  network: NetworkPolicy;
  envAllowlist?: string[];
  secretRefs?: SecretRef[];
}

export interface WorkspaceSnapshotRef {
  id: string;
  storageProvider: string;
  storageKey: string;
  version?: string | null;
  contentHash?: string | null;
}

export interface WorkspaceMaterialization {
  snapshot: WorkspaceSnapshotRef;
  workspacePath: string;
  cleanup?: () => Promise<void>;
}

export type WorkspaceChangeType = 'created' | 'modified' | 'deleted';

export interface WorkspaceChange {
  path: string;
  type: WorkspaceChangeType;
  contentHash?: string | null;
  artifactKey?: string | null;
}

export interface WorkspaceChangeSet {
  baseSnapshot: WorkspaceSnapshotRef;
  changes: WorkspaceChange[];
  nextSnapshot?: WorkspaceSnapshotRef | null;
}

export interface StorageProvider {
  name: string;
  materialize(input: {
    scope: RuntimeScope;
    snapshot: WorkspaceSnapshotRef;
  }): Promise<WorkspaceMaterialization>;
  persistChanges(input: {
    scope: RuntimeScope;
    materialization: WorkspaceMaterialization;
    changes: WorkspaceChange[];
  }): Promise<WorkspaceSnapshotRef>;
}

export interface SandboxSession {
  id: string;
  provider: string;
  scope: RuntimeScope;
  status: 'starting' | 'running' | 'stopped' | 'failed';
  workspacePath: string;
  createdAt: Date;
}

export interface SandboxExecInput {
  sessionId: string;
  command: string[];
  cwd?: string;
  env?: Record<string, string>;
  limits?: ResourceLimits;
}

export interface SandboxExecResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

export interface SandboxFileEntry {
  path: string;
  type: 'file' | 'directory';
  size?: number | null;
  contentHash?: string | null;
}

export interface SandboxProvider {
  name: string;
  create(input: {
    scope: RuntimeScope;
    workspace: WorkspaceMaterialization;
    image: string;
    policy: SandboxPolicy;
    limits?: ResourceLimits;
  }): Promise<SandboxSession>;
  exec(input: SandboxExecInput): Promise<SandboxExecResult>;
  readFile(input: { sessionId: string; path: string; encoding?: 'utf8' | 'base64' }): Promise<string>;
  writeFile(input: { sessionId: string; path: string; content: string; encoding?: 'utf8' | 'base64' }): Promise<void>;
  listFiles(input: { sessionId: string; path: string }): Promise<SandboxFileEntry[]>;
  collectChanges(input: { sessionId: string; baseSnapshot: WorkspaceSnapshotRef }): Promise<WorkspaceChangeSet>;
  destroy(input: { sessionId: string }): Promise<void>;
}

export interface ProviderSessionBinding {
  provider: string;
  workspaceId: string;
  threadId: string;
  providerSessionId: string;
  providerProjectKey?: string | null;
  status: 'active' | 'forked' | 'archived';
  metadata?: JsonObject | null;
}

export interface ProviderTranscriptKey {
  provider: string;
  providerSessionId: string;
  providerProjectKey?: string | null;
  subpath?: string | null;
}

export interface ProviderTranscriptEntryInput {
  entryType: string;
  rawJson: JsonValue;
  runId?: string | null;
  providerEntryId?: string | null;
}

export interface ProviderTranscriptEntry extends ProviderTranscriptEntryInput {
  id: string;
  scope: RuntimeScope;
  key: ProviderTranscriptKey;
  ordinal: number;
  createdAt: Date;
}

export interface ProviderTranscriptStore {
  append(input: {
    scope: RuntimeScope;
    key: ProviderTranscriptKey;
    entries: ProviderTranscriptEntryInput[];
  }): Promise<ProviderTranscriptEntry[]>;
  load(input: {
    scope: RuntimeScope;
    key: ProviderTranscriptKey;
  }): Promise<ProviderTranscriptEntry[]>;
}

export type AgentRuntimeEventType =
  | 'agent_start'
  | 'agent_message_delta'
  | 'agent_message_completed'
  | 'tool_call_started'
  | 'file_change_detected'
  | 'tool_call_completed'
  | 'tool_call_failed'
  | 'permission_requested'
  | 'approval_resolved'
  | 'usage_updated'
  | 'provider_session_bound'
  | 'provider_session_recovery'
  | 'provider_transcript_mirrored'
  | 'agent_completed'
  | 'agent_failed';

export interface AgentRuntimeEventPayloadByType {
  agent_start: JsonObject & {
    cwd?: string | null;
    provider: string;
    runId?: string | null;
    threadId?: string | null;
  };
  agent_message_delta: JsonObject & {
    content: string;
    provider: string;
  };
  agent_message_completed: JsonObject & {
    content?: string | null;
    provider: string;
    providerSessionId?: string | null;
  };
  tool_call_started: JsonObject & {
    command?: string | null;
    input?: JsonObject | null;
    inputSummary?: string | null;
    provider: string;
    toolCallId: string;
    toolName: string;
  };
  file_change_detected: JsonObject & {
    changeType: WorkspaceChangeType;
    path: string;
    provider: string;
    toolCallId?: string | null;
  };
  tool_call_completed: JsonObject & {
    command?: string | null;
    exitCode?: number | null;
    filePath?: string | null;
    output?: JsonObject | null;
    provider: string;
    resultSummary?: string | null;
    toolCallId: string;
    toolName?: string | null;
  };
  tool_call_failed: JsonObject & {
    command?: string | null;
    error?: string | null;
    filePath?: string | null;
    provider: string;
    resultSummary?: string | null;
    toolCallId: string;
    toolName?: string | null;
  };
  permission_requested: JsonObject & {
    action: string;
    details?: JsonObject | null;
    permissionRequestId: string;
    provider: string;
  };
  approval_resolved: JsonObject & {
    decision: PermissionDecision['decision'];
    permissionRequestId: string;
    provider: string;
    reason?: string | null;
    resolvedByActorId?: string | null;
    status?: string | null;
  };
  usage_updated: JsonObject & {
    provider: string;
    usage: JsonObject;
  };
  provider_session_bound: JsonObject & {
    provider: string;
    providerSessionId: string;
    threadId?: string | null;
    workspaceId?: string | null;
  };
  provider_session_recovery: JsonObject;
  provider_transcript_mirrored: JsonObject;
  agent_completed: JsonObject & {
    content: string;
    provider: string;
    providerSessionId?: string | null;
  };
  agent_failed: JsonObject & {
    error: string;
    provider: string;
    providerSessionId?: string | null;
  };
}

export type TypedAgentRuntimeEvent<TType extends AgentRuntimeEventType = AgentRuntimeEventType> = {
  [K in TType]: {
    type: K;
    payload: AgentRuntimeEventPayloadByType[K] | null;
  };
}[TType];

export interface AgentRuntimeEvent {
  type: AgentRuntimeEventType;
  payload?: JsonObject | null;
}

export interface AgentRunInput {
  continuity?: AgentContinuityContext | null;
  scope: RuntimeScope;
  prompt: string;
  sandbox: SandboxSession;
  providerSession?: ProviderSessionBinding | null;
  secrets?: ScopedSecret[];
  metadata?: JsonObject | null;
}

export interface AgentContinuityContext {
  entries?: AgentContinuityEntrySummary[];
  fromOrdinal?: number | null;
  previousProviderSessionId?: string | null;
  sourceRunIds?: string[];
  strategy: 'compact' | 'replay_transcript';
  summary?: string | null;
  toOrdinal?: number | null;
}

export interface AgentContinuityEntrySummary {
  entryType: string;
  ordinal: number;
  providerEntryId?: string | null;
  runId?: string | null;
  summary?: string | null;
}

export interface AgentAdapter {
  provider: string;
  run(input: AgentRunInput): AsyncIterable<AgentRuntimeEvent>;
}

export interface AgentRunResult {
  content: string;
  events: AgentRuntimeEvent[];
  failure?: string | null;
  providerSessionId?: string | null;
}

export interface AgentRunner {
  run(input: AgentRunInput): Promise<AgentRunResult>;
}
