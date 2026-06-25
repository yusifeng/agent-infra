import { randomUUID } from 'node:crypto';

import type { Message, MessagePart, Thread, Workspace } from '@agent-infra/core';

import type { AgentProviderId } from './provider-config';
import { withCloudAgentTransaction, getCloudAgentRepositories } from './db';

export type ChatRole = 'user' | 'assistant';

export interface CloudThread {
  id: string;
  ownerUserId: string;
  workspaceId: string;
  providerSessionId?: string | null;
  providerSessionMetadata?: Record<string, unknown> | null;
  providerProjectKey?: string | null;
  title: string;
  provider: AgentProviderId;
  createdAt: string;
  updatedAt: string;
}

export interface CloudMessage {
  id: string;
  threadId: string;
  runId?: string | null;
  role: ChatRole;
  content: string;
  createdAt: string;
}

const CLOUD_AGENT_APP_ID = 'cloud-agent-next-web';
const DEFAULT_WORKSPACE_TITLE = 'Default workspace';

function titleFromText(text: string): string {
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (!normalized) {
    return 'New thread';
  }

  return normalized.length > 36 ? `${normalized.slice(0, 36).trimEnd()}...` : normalized;
}

function defaultWorkspaceId(ownerUserId: string): string {
  return `cloud-agent:${CLOUD_AGENT_APP_ID}:${ownerUserId}:default`;
}

function readThreadProvider(thread: Thread): AgentProviderId {
  const provider = thread.metadata?.provider;
  return provider === 'codex' ? 'codex' : 'claude';
}

function readThreadWorkspaceId(thread: Thread): string {
  const workspaceId = thread.metadata?.workspaceId;
  return typeof workspaceId === 'string' && workspaceId.trim() ? workspaceId : defaultWorkspaceId(thread.userId ?? 'admin');
}

function textFromParts(parts: MessagePart[]): string {
  return parts
    .filter((part) => part.type === 'text' && part.textValue)
    .map((part) => part.textValue)
    .join('');
}

async function ensureDefaultWorkspace(ownerUserId: string, repositories: Awaited<ReturnType<typeof getCloudAgentRepositories>>): Promise<Workspace> {
  const existing = await repositories.workspaceRepo.findDefaultByUser({
    appId: CLOUD_AGENT_APP_ID,
    userId: ownerUserId
  });
  if (existing) {
    return existing;
  }

  return repositories.workspaceRepo.create({
    id: defaultWorkspaceId(ownerUserId),
    appId: CLOUD_AGENT_APP_ID,
    userId: ownerUserId,
    title: DEFAULT_WORKSPACE_TITLE,
    status: 'active',
    defaultForUser: true,
    metadata: { slug: 'default' },
    archivedAt: null
  });
}

async function toCloudThread(thread: Thread, repositories: Awaited<ReturnType<typeof getCloudAgentRepositories>>): Promise<CloudThread> {
  const provider = readThreadProvider(thread);
  const providerBinding = await repositories.providerSessionBindingRepo.findActiveByThread({
    threadId: thread.id,
    provider
  });
  return {
    id: thread.id,
    ownerUserId: thread.userId ?? 'admin',
    workspaceId: readThreadWorkspaceId(thread),
    providerSessionId: providerBinding?.providerSessionId ?? null,
    providerSessionMetadata: providerBinding?.metadata ?? null,
    providerProjectKey: providerBinding?.providerProjectKey ?? null,
    title: thread.title || 'New thread',
    provider,
    createdAt: thread.createdAt.toISOString(),
    updatedAt: thread.updatedAt.toISOString()
  };
}

function toCloudMessage(message: Message & { parts: MessagePart[] }): CloudMessage {
  return {
    id: message.id,
    threadId: message.threadId,
    runId: message.runId ?? null,
    role: message.role === 'assistant' ? 'assistant' : 'user',
    content: textFromParts(message.parts),
    createdAt: message.createdAt.toISOString()
  };
}

export async function listThreads(ownerUserId: string): Promise<CloudThread[]> {
  const repositories = await getCloudAgentRepositories();
  await ensureDefaultWorkspace(ownerUserId, repositories);
  const threads = (await repositories.threadRepo.listByApp(CLOUD_AGENT_APP_ID))
    .filter((thread) => thread.userId === ownerUserId)
    .sort((left, right) => right.updatedAt.getTime() - left.updatedAt.getTime());

  return Promise.all(threads.map((thread) => toCloudThread(thread, repositories)));
}

export async function getThread(ownerUserId: string, threadId: string): Promise<CloudThread | null> {
  const repositories = await getCloudAgentRepositories();
  const thread = await repositories.threadRepo.findById(threadId);
  if (!thread || thread.userId !== ownerUserId || thread.appId !== CLOUD_AGENT_APP_ID || thread.status !== 'active') {
    return null;
  }

  return toCloudThread(thread, repositories);
}

export async function listMessages(ownerUserId: string, threadId: string): Promise<CloudMessage[]> {
  const thread = await getThread(ownerUserId, threadId);
  if (!thread) {
    return [];
  }

  const repositories = await getCloudAgentRepositories();
  const messages = await repositories.messageRepo.listByThread(threadId);
  return messages.map(toCloudMessage);
}

export async function createThread(input: {
  ownerUserId: string;
  title?: string | null;
  provider: AgentProviderId;
}): Promise<CloudThread> {
  return withCloudAgentTransaction(async (repositories) => {
    const workspace = await ensureDefaultWorkspace(input.ownerUserId, repositories);
    const thread = await repositories.threadRepo.create({
      id: randomUUID(),
      appId: CLOUD_AGENT_APP_ID,
      userId: input.ownerUserId,
      title: input.title?.trim() || 'New thread',
      status: 'active',
      metadata: {
        provider: input.provider,
        workspaceId: workspace.id
      },
      archivedAt: null
    });

    return toCloudThread(thread, repositories);
  });
}

export async function appendUserTurn(input: {
  ownerUserId: string;
  threadId?: string | null;
  provider: AgentProviderId;
  content: string;
  assistantContent?: string;
}): Promise<{ thread: CloudThread; messages: CloudMessage[] }> {
  const userResult = await appendUserMessage(input);
  const assistantMessage = await appendAssistantMessage({
    ownerUserId: input.ownerUserId,
    threadId: userResult.thread.id,
    content:
      input.assistantContent ??
      [
        `Claude Code adapter is not connected yet.`,
        `Provider selected: ${userResult.thread.provider}.`,
        `Your message was persisted and will become the input to the real AgentAdapter.`
      ].join('\n')
  });

  return {
    thread: assistantMessage.thread,
    messages: assistantMessage.messages
  };
}

export async function appendUserMessage(input: {
  ownerUserId: string;
  threadId?: string | null;
  provider: AgentProviderId;
  content: string;
}): Promise<{ thread: CloudThread; message: CloudMessage; messages: CloudMessage[] }> {
  return withCloudAgentTransaction(async (repositories) => {
    const workspace = await ensureDefaultWorkspace(input.ownerUserId, repositories);
    let thread = input.threadId ? await repositories.threadRepo.findById(input.threadId) : null;

    if (!thread || thread.userId !== input.ownerUserId || thread.appId !== CLOUD_AGENT_APP_ID || thread.status !== 'active') {
      thread = await repositories.threadRepo.create({
        id: randomUUID(),
        appId: CLOUD_AGENT_APP_ID,
        userId: input.ownerUserId,
        title: titleFromText(input.content),
        status: 'active',
        metadata: {
          provider: input.provider,
          workspaceId: workspace.id
        },
        archivedAt: null
      });
    }

    const userMessage = await repositories.messageRepo.createWithNextSeq({
      id: randomUUID(),
      threadId: thread.id,
      runId: null,
      role: 'user',
      status: 'completed',
      metadata: null
    });
    await repositories.messageRepo.createPart({
      id: randomUUID(),
      messageId: userMessage.id,
      partIndex: 0,
      type: 'text',
      textValue: input.content,
      jsonValue: null
    });
    const touchedThread = await repositories.threadRepo.touch(thread.id, userMessage.createdAt);
    const messages = await repositories.messageRepo.listByThread(touchedThread.id);

    return {
      thread: await toCloudThread(touchedThread, repositories),
      message: toCloudMessage({ ...userMessage, parts: [{ id: '', messageId: userMessage.id, partIndex: 0, type: 'text', textValue: input.content, jsonValue: null, createdAt: userMessage.createdAt }] }),
      messages: messages.map(toCloudMessage)
    };
  });
}

export async function appendAssistantMessage(input: {
  ownerUserId: string;
  threadId: string;
  content: string;
  runId?: string | null;
}): Promise<{ thread: CloudThread; message: CloudMessage; messages: CloudMessage[] }> {
  return withCloudAgentTransaction(async (repositories) => {
    const thread = await repositories.threadRepo.findById(input.threadId);
    if (!thread || thread.userId !== input.ownerUserId || thread.appId !== CLOUD_AGENT_APP_ID || thread.status !== 'active') {
      throw new Error(`Thread not found: ${input.threadId}`);
    }

    const assistantMessage = await repositories.messageRepo.createWithNextSeq({
      id: randomUUID(),
      threadId: thread.id,
      runId: input.runId ?? null,
      role: 'assistant',
      status: 'completed',
      metadata: null
    });
    await repositories.messageRepo.createPart({
      id: randomUUID(),
      messageId: assistantMessage.id,
      partIndex: 0,
      type: 'text',
      textValue: input.content,
      jsonValue: null
    });
    const touchedThread = await repositories.threadRepo.touch(thread.id, assistantMessage.createdAt);
    const messages = await repositories.messageRepo.listByThread(touchedThread.id);

    return {
      thread: await toCloudThread(touchedThread, repositories),
      message: toCloudMessage({
        ...assistantMessage,
        parts: [
          {
            id: '',
            messageId: assistantMessage.id,
            partIndex: 0,
            type: 'text',
            textValue: input.content,
            jsonValue: null,
            createdAt: assistantMessage.createdAt
          }
        ]
      }),
      messages: messages.map(toCloudMessage)
    };
  });
}

export async function bindThreadProviderSession(input: {
  ownerUserId: string;
  threadId: string;
  providerSessionId: string;
  runId?: string | null;
  providerProjectKey?: string | null;
}): Promise<CloudThread> {
  return withCloudAgentTransaction(async (repositories) => {
    const thread = await repositories.threadRepo.findById(input.threadId);
    if (!thread || thread.userId !== input.ownerUserId || thread.appId !== CLOUD_AGENT_APP_ID || thread.status !== 'active') {
      throw new Error(`Thread not found: ${input.threadId}`);
    }

    const workspaceId = readThreadWorkspaceId(thread);
    await repositories.providerSessionBindingRepo.upsertActive({
      workspaceId,
      threadId: thread.id,
      runId: input.runId ?? null,
      provider: readThreadProvider(thread),
      providerSessionId: input.providerSessionId,
      providerProjectKey: input.providerProjectKey ?? null,
      metadata: null
    });

    const touchedThread = await repositories.threadRepo.touch(thread.id, new Date());
    return toCloudThread(touchedThread, repositories);
  });
}

export async function archiveThreadProviderSession(input: {
  ownerUserId: string;
  threadId: string;
  provider: AgentProviderId;
  reason: string;
  runId?: string | null;
}): Promise<CloudThread> {
  return withCloudAgentTransaction(async (repositories) => {
    const thread = await repositories.threadRepo.findById(input.threadId);
    if (!thread || thread.userId !== input.ownerUserId || thread.appId !== CLOUD_AGENT_APP_ID || thread.status !== 'active') {
      throw new Error(`Thread not found: ${input.threadId}`);
    }

    const binding = await repositories.providerSessionBindingRepo.findActiveByThread({
      threadId: thread.id,
      provider: input.provider
    });
    if (binding) {
      await repositories.providerSessionBindingRepo.updateStatus(binding.id, 'archived', {
        archivedAt: new Date(),
        metadata: {
          ...(binding.metadata ?? {}),
          archivedReason: input.reason,
          archivedByRunId: input.runId ?? null
        }
      });
    }

    const touchedThread = await repositories.threadRepo.touch(thread.id, new Date());
    return toCloudThread(touchedThread, repositories);
  });
}
