'use client';

import type { AgentMessage, AgentState, ThinkingLevel } from '@mariozechner/pi-agent-core';
import type { Message, Model } from '@mariozechner/pi-ai';
import { useEffect, useRef, useState } from 'react';

import { initializePiNarrowStorage, type PiNarrowStorageContext } from './storage';
import { SessionListDialog, type SessionMetadata } from './vendor';

type PiAgent = import('@mariozechner/pi-agent-core').Agent;
type AgentConstructor = typeof import('@mariozechner/pi-agent-core').Agent;
type PiAiModule = typeof import('@mariozechner/pi-ai');
type PiRuntimeDeps = {
  Agent: AgentConstructor;
  piAi: PiAiModule;
};
type RuntimeStatus = 'loading' | 'ready' | 'error';
type FauxResponseFactory = (context: { messages: Array<{ role: string; content?: unknown; toolName?: string }> }) => unknown;
type FauxRegistration = {
  getModel(modelId?: string): Model<any>;
  setResponses(responses: FauxResponseFactory[]): void;
  appendResponses(responses: FauxResponseFactory[]): void;
};

export type ProviderSettingsState = {
  openaiKey: string;
  anthropicKey: string;
  googleKey: string;
  deepseekKey: string;
  proxyEnabled: boolean;
  proxyUrl: string;
};

export type ModelOption = {
  key: string;
  label: string;
  description: string;
  model: Model<any>;
};

export type PiNarrowAgentSnapshot = Pick<
  AgentState,
  'messages' | 'streamingMessage' | 'pendingToolCalls' | 'isStreaming' | 'model' | 'thinkingLevel' | 'errorMessage'
>;

const DEFAULT_PROXY_URL = 'http://localhost:3001';
const DEEPSEEK_PROVIDER = 'deepseek';
const DEEPSEEK_BASE_URL = 'https://api.deepseek.com/v1';

const DEFAULT_SYSTEM_PROMPT = [
  'You are the pi-web-ui narrow experiment running inside the agent-infra monorepo.',
  'Keep replies concise and easy to scan.',
  'This page is for evaluating the pi runtime feel, agent loop, tools, and local browser session storage.',
  'Use the get_current_time tool only when the user is explicitly asking for the current date, time, or timezone.'
].join(' ');

let runtimeDepsPromise: Promise<PiRuntimeDeps> | null = null;

function cloneValue<T>(value: T): T {
  if (value == null) {
    return value;
  }

  if (typeof structuredClone === 'function') {
    return structuredClone(value);
  }

  return JSON.parse(JSON.stringify(value)) as T;
}

async function loadPiRuntimeDeps(): Promise<PiRuntimeDeps> {
  if (!runtimeDepsPromise) {
    runtimeDepsPromise = (async () => {
      const [agentModule, piAi] = await Promise.all([import('@mariozechner/pi-agent-core'), import('@mariozechner/pi-ai')]);

      return {
        Agent: agentModule.Agent,
        piAi
      };
    })();
  }

  return await runtimeDepsPromise;
}

function getTextFromContent(content: unknown): string {
  if (typeof content === 'string') {
    return content.trim();
  }

  if (!Array.isArray(content)) {
    return '';
  }

  return content
    .filter((block): block is { type: string; text?: string; thinking?: string } => typeof block === 'object' && block !== null && 'type' in block)
    .map((block) => {
      if (block.type === 'text' && typeof block.text === 'string') return block.text;
      if (block.type === 'thinking' && typeof block.thinking === 'string') return block.thinking;
      return '';
    })
    .filter(Boolean)
    .join('\n')
    .trim();
}

function getFirstUserText(messages: AgentMessage[]): string {
  for (const message of messages) {
    if (message.role === 'user') {
      const text = getTextFromContent(message.content);
      if (text) return text;
    }
  }

  return '';
}

function truncateText(text: string, maxLength: number): string {
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (!normalized) return '';
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, Math.max(0, maxLength - 3)).trimEnd()}...`;
}

function buildSessionTitle(messages: AgentMessage[]): string {
  const firstUserText = getFirstUserText(messages);
  if (!firstUserText) return 'pi-web-ui narrow experiment';

  const sentenceEnd = firstUserText.search(/[.!?]/);
  if (sentenceEnd > 0 && sentenceEnd <= 64) {
    return firstUserText.slice(0, sentenceEnd + 1).trim();
  }

  return truncateText(firstUserText, 64);
}

function buildSessionPreview(messages: AgentMessage[]): string {
  const preview = messages
    .filter((message) => message.role === 'user' || message.role === 'assistant')
    .map((message) => getTextFromContent(message.content))
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();

  return truncateText(preview, 240);
}

function buildUsage(messages: AgentMessage[]): SessionMetadata['usage'] {
  return messages.reduce<SessionMetadata['usage']>(
    (usage, message) => {
      if (message.role !== 'assistant' || !message.usage) {
        return usage;
      }

      usage.input += message.usage.input;
      usage.output += message.usage.output;
      usage.cacheRead += message.usage.cacheRead;
      usage.cacheWrite += message.usage.cacheWrite;
      usage.totalTokens += message.usage.totalTokens;
      usage.cost.input += message.usage.cost.input;
      usage.cost.output += message.usage.cost.output;
      usage.cost.cacheRead += message.usage.cost.cacheRead;
      usage.cost.cacheWrite += message.usage.cost.cacheWrite;
      usage.cost.total += message.usage.cost.total;
      return usage;
    },
    {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
      totalTokens: 0,
      cost: {
        input: 0,
        output: 0,
        cacheRead: 0,
        cacheWrite: 0,
        total: 0
      }
    }
  );
}

function shouldPersistSession(messages: AgentMessage[]): boolean {
  return messages.some((message) => message.role === 'user' || message.role === 'assistant');
}

function modelKey(model: Model<any>): string {
  return `${model.provider}:${model.id}`;
}

function snapshotAgentState(agent: PiAgent): PiNarrowAgentSnapshot {
  return {
    messages: agent.state.messages.slice(),
    streamingMessage: agent.state.streamingMessage ? cloneValue(agent.state.streamingMessage) : undefined,
    pendingToolCalls: new Set(agent.state.pendingToolCalls),
    isStreaming: agent.state.isStreaming,
    model: agent.state.model,
    thinkingLevel: agent.state.thinkingLevel,
    errorMessage: agent.state.errorMessage
  };
}

function convertToLlm(messages: AgentMessage[]): Message[] {
  return messages
    .filter((message) => message.role === 'user' || message.role === 'assistant' || message.role === 'toolResult')
    .map((message) => {
      if (message.role === 'user' && typeof message.content === 'string') {
        return {
          ...message,
          content: [{ type: 'text', text: message.content }]
        } satisfies Message;
      }

      return message as Message;
    });
}

function createDeepseekModel(params: {
  id: string;
  name: string;
  reasoning: boolean;
  contextWindow: number;
  maxTokens: number;
}): Model<any> {
  return {
    id: params.id,
    name: params.name,
    api: 'openai-completions',
    provider: DEEPSEEK_PROVIDER,
    baseUrl: DEEPSEEK_BASE_URL,
    reasoning: params.reasoning,
    input: ['text'],
    cost: {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0
    },
    contextWindow: params.contextWindow,
    maxTokens: params.maxTokens
  };
}

function createModelOptions(_piAi: PiAiModule): ModelOption[] {
  const options: ModelOption[] = [];

  const deepseekChat = createDeepseekModel({
    id: 'deepseek-chat',
    name: 'DeepSeek Chat',
    reasoning: false,
    contextWindow: 128_000,
    maxTokens: 8_192
  });
  const deepseekReasoner = createDeepseekModel({
    id: 'deepseek-reasoner',
    name: 'DeepSeek Reasoner',
    reasoning: true,
    contextWindow: 128_000,
    maxTokens: 8_192
  });

  options.push(
    {
      key: modelKey(deepseekChat),
      label: 'DeepSeek · deepseek-chat',
      description: 'Requires a browser-local DeepSeek API key (official OpenAI-compatible endpoint)',
      model: deepseekChat
    },
    {
      key: modelKey(deepseekReasoner),
      label: 'DeepSeek · deepseek-reasoner',
      description: 'Requires a browser-local DeepSeek API key (official OpenAI-compatible endpoint)',
      model: deepseekReasoner
    }
  );

  return options;
}

function resolveModelOption(modelOptions: ModelOption[], key: string): ModelOption | undefined {
  return modelOptions.find((option) => option.key === key);
}

function applyProxyIfEnabled(model: Model<any>, providerSettings: ProviderSettingsState): Model<any> {
  const proxyUrl = providerSettings.proxyUrl.trim();

  if (!providerSettings.proxyEnabled || !proxyUrl || !model.baseUrl) {
    return model;
  }

  const normalizedProxyUrl = proxyUrl.replace(/\/$/, '');
  return {
    ...model,
    baseUrl: `${normalizedProxyUrl}/?url=${encodeURIComponent(model.baseUrl)}`
  };
}

function createAgent(
  deps: PiRuntimeDeps,
  sessionId: string,
  getApiKey: (provider: string) => Promise<string | undefined>,
  providerSettings: ProviderSettingsState,
  initialState?: Partial<{ model: Model<any>; thinkingLevel: ThinkingLevel; messages: AgentMessage[] }>
): PiAgent {
  const defaultModel = createDeepseekModel({
    id: 'deepseek-chat',
    name: 'DeepSeek Chat',
    reasoning: false,
    contextWindow: 128_000,
    maxTokens: 8_192
  });

  return new deps.Agent({
    initialState: {
      systemPrompt: DEFAULT_SYSTEM_PROMPT,
      model: applyProxyIfEnabled(initialState?.model ?? defaultModel, providerSettings),
      thinkingLevel: initialState?.thinkingLevel ?? 'off',
      messages: initialState?.messages ?? [],
      tools: []
    },
    convertToLlm,
    getApiKey,
    sessionId
  });
}

export function usePiNarrowRuntime() {
  const storageRef = useRef<PiNarrowStorageContext | null>(null);
  const depsRef = useRef<PiRuntimeDeps | null>(null);
  const agentRef = useRef<PiAgent | null>(null);
  const unsubscribeRef = useRef<(() => void) | null>(null);
  const currentSessionIdRef = useRef('');
  const currentCreatedAtRef = useRef('');
  const currentTitleRef = useRef('');
  const modelOptionsRef = useRef<ModelOption[]>([]);
  const selectedModelKeyRef = useRef('');
  const providerSettingsRef = useRef<ProviderSettingsState>({
    openaiKey: '',
    anthropicKey: '',
    googleKey: '',
    deepseekKey: '',
    proxyEnabled: false,
    proxyUrl: DEFAULT_PROXY_URL
  });
  const disposedRef = useRef(false);

  const [status, setStatus] = useState<RuntimeStatus>('loading');
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [input, setInput] = useState('');
  const [modelOptions, setModelOptions] = useState<ModelOption[]>([]);
  const [selectedModelKey, setSelectedModelKey] = useState('');
  const [agentState, setAgentState] = useState<PiNarrowAgentSnapshot | null>(null);
  const [providerSettings, setProviderSettings] = useState<ProviderSettingsState>(providerSettingsRef.current);

  const syncProviderSettings = (nextSettings: ProviderSettingsState) => {
    providerSettingsRef.current = nextSettings;
    setProviderSettings(nextSettings);
  };

  const refreshSnapshot = () => {
    if (disposedRef.current || !agentRef.current) {
      return;
    }

    const nextSnapshot = snapshotAgentState(agentRef.current);
    setAgentState(nextSnapshot);
    const nextModelKey = modelKey(agentRef.current.state.model);
    selectedModelKeyRef.current = nextModelKey;
    setSelectedModelKey(nextModelKey);
  };

  const saveCurrentSession = async () => {
    const storage = storageRef.current;
    const agent = agentRef.current;

    if (!storage || !agent || !currentSessionIdRef.current || !shouldPersistSession(agent.state.messages)) {
      return;
    }

    const messages = agent.state.messages;
    const now = new Date().toISOString();
    currentTitleRef.current = currentTitleRef.current || buildSessionTitle(messages);

    await storage.sessions.save(
      {
        id: currentSessionIdRef.current,
        title: currentTitleRef.current,
        model: agent.state.model,
        thinkingLevel: agent.state.thinkingLevel,
        messages,
        createdAt: currentCreatedAtRef.current,
        lastModified: now
      },
      {
        id: currentSessionIdRef.current,
        title: currentTitleRef.current,
        createdAt: currentCreatedAtRef.current,
        lastModified: now,
        messageCount: messages.length,
        usage: buildUsage(messages),
        thinkingLevel: agent.state.thinkingLevel,
        preview: buildSessionPreview(messages)
      }
    );
  };

  const bindAgent = async (nextAgent: PiAgent) => {
    unsubscribeRef.current?.();
    agentRef.current = nextAgent;

    unsubscribeRef.current = nextAgent.subscribe((event) => {
      refreshSnapshot();

      if (event.type === 'agent_end') {
        void saveCurrentSession();
      }
    });

    refreshSnapshot();
  };

  const resolveApiKey = async (provider: string) => {
    const storage = storageRef.current;
    if (!storage) {
      return undefined;
    }

    return (await storage.providerKeys.get(provider)) ?? undefined;
  };

  const createNewSession = async (saveExisting = true, preferredModelKey?: string) => {
    const storage = storageRef.current;
    const deps = depsRef.current;

    if (!storage || !deps) {
      return;
    }

    if (saveExisting) {
      await saveCurrentSession();
    }

    currentSessionIdRef.current = crypto.randomUUID();
    currentCreatedAtRef.current = new Date().toISOString();
    currentTitleRef.current = '';

    const nextModel = preferredModelKey ? resolveModelOption(modelOptionsRef.current, preferredModelKey)?.model : undefined;
    const nextAgent = createAgent(deps, currentSessionIdRef.current, resolveApiKey, providerSettingsRef.current, {
      model: nextModel,
      thinkingLevel: 'off',
      messages: []
    });

    await bindAgent(nextAgent);
  };

  const loadSession = async (sessionId: string) => {
    const storage = storageRef.current;
    const deps = depsRef.current;

    if (!storage || !deps) {
      return;
    }

    await saveCurrentSession();

    const session = await storage.sessions.get(sessionId);
    if (!session) {
      await createNewSession(false);
      return;
    }

    currentSessionIdRef.current = session.id;
    currentCreatedAtRef.current = session.createdAt;
    currentTitleRef.current = session.title;

    const nextAgent = createAgent(deps, currentSessionIdRef.current, resolveApiKey, providerSettingsRef.current, {
      model: session.model,
      thinkingLevel: session.thinkingLevel,
      messages: session.messages
    });

    await bindAgent(nextAgent);
  };

  useEffect(() => {
    disposedRef.current = false;

    async function bootstrap() {
      try {
        setStatus('loading');
        setError(null);

        const [storage, deps] = await Promise.all([initializePiNarrowStorage(), loadPiRuntimeDeps()]);
        if (disposedRef.current) return;

        storageRef.current = storage;
        depsRef.current = deps;

        const [storedOpenAI, storedAnthropic, storedGoogle, storedDeepseek, storedProxyEnabled, storedProxyUrl] = await Promise.all([
          storage.providerKeys.get('openai'),
          storage.providerKeys.get('anthropic'),
          storage.providerKeys.get('google'),
          storage.providerKeys.get(DEEPSEEK_PROVIDER),
          storage.settings.get<boolean>('proxy.enabled'),
          storage.settings.get<string>('proxy.url')
        ]);

        let deepseekKey = storedDeepseek ?? '';
        if (!deepseekKey.trim()) {
          try {
            const response = await fetch('/api/pi-narrow/env-keys', { method: 'GET' });
            if (response.ok) {
              const data = (await response.json()) as { enabled?: boolean; deepseekKey?: string };
              if (data?.enabled && typeof data.deepseekKey === 'string' && data.deepseekKey.trim()) {
                deepseekKey = data.deepseekKey.trim();
                await storage.providerKeys.set(DEEPSEEK_PROVIDER, deepseekKey);
              }
            }
          } catch {
            // Ignore env preload failures; the UI can still accept manual entry.
          }
        }

        const nextProviderSettings: ProviderSettingsState = {
          openaiKey: storedOpenAI ?? '',
          anthropicKey: storedAnthropic ?? '',
          googleKey: storedGoogle ?? '',
          deepseekKey,
          proxyEnabled: storedProxyEnabled ?? false,
          proxyUrl: storedProxyUrl ?? DEFAULT_PROXY_URL
        };
        syncProviderSettings(nextProviderSettings);

        const nextModelOptions = createModelOptions(deps.piAi);
        modelOptionsRef.current = nextModelOptions;
        setModelOptions(nextModelOptions);

        const latestSessionId = await storage.sessions.getLatestSessionId();
        if (disposedRef.current) return;

        if (latestSessionId) {
          await loadSession(latestSessionId);
        } else {
          currentSessionIdRef.current = crypto.randomUUID();
          currentCreatedAtRef.current = new Date().toISOString();
          currentTitleRef.current = '';

          await bindAgent(
            createAgent(deps, currentSessionIdRef.current, resolveApiKey, nextProviderSettings, {
              model: resolveModelOption(nextModelOptions, `${DEEPSEEK_PROVIDER}:deepseek-chat`)?.model,
              thinkingLevel: 'off',
              messages: []
            })
          );
        }

        if (!disposedRef.current) {
          setStatus('ready');
        }
      } catch (bootstrapError) {
        const message = bootstrapError instanceof Error ? bootstrapError.message : 'Unknown bootstrap error';
        if (!disposedRef.current) {
          setError(message);
          setStatus('error');
        }
      }
    }

    void bootstrap();

    return () => {
      disposedRef.current = true;
      unsubscribeRef.current?.();
      unsubscribeRef.current = null;
      void saveCurrentSession();
    };
  }, []);

  const sendMessage = async () => {
    const storage = storageRef.current;
    const agent = agentRef.current;
    const message = input.trim();

    if (!storage || !agent || !message || agent.state.isStreaming) {
      return;
    }

    const provider = agent.state.model.provider;
    const apiKey = ((await storage.providerKeys.get(provider)) ?? '').trim();
    if (!apiKey) {
      setWarning(`Missing ${provider} API key. Open Provider settings and save a browser-local key first.`);
      return;
    }

    setWarning(null);
    setInput('');
    await agent.prompt(message);
    refreshSnapshot();
  };

  const abort = () => {
    agentRef.current?.abort();
  };

  const selectModel = async (key: string) => {
    const agent = agentRef.current;
    if (!agent) {
      return;
    }

    const option = resolveModelOption(modelOptionsRef.current, key);
    if (!option) {
      return;
    }

    agent.state.model = applyProxyIfEnabled(option.model, providerSettingsRef.current);
    selectedModelKeyRef.current = option.key;
    setSelectedModelKey(option.key);
    setWarning(null);
    refreshSnapshot();
  };

  const openSavedSessions = () => {
    void SessionListDialog.open(
      (sessionId: string) => {
        void loadSession(sessionId);
      },
      (deletedSessionId: string) => {
        if (deletedSessionId === currentSessionIdRef.current) {
          void createNewSession(false, selectedModelKeyRef.current);
        }
      }
    );
  };

  const saveProviderKey = async (provider: 'openai' | 'anthropic' | 'google' | 'deepseek', value: string) => {
    const storage = storageRef.current;
    if (!storage) {
      return;
    }

    const trimmed = value.trim();
    if (trimmed) {
      await storage.providerKeys.set(provider, trimmed);
    } else {
      await storage.providerKeys.delete(provider);
    }

    syncProviderSettings({
      ...providerSettingsRef.current,
      [`${provider}Key`]: trimmed
    } as ProviderSettingsState);
    setWarning(null);
  };

  const saveProxySettings = async (nextProxyEnabled: boolean, nextProxyUrl: string) => {
    const storage = storageRef.current;
    if (!storage) {
      return;
    }

    const normalizedProxyUrl = nextProxyUrl.trim() || DEFAULT_PROXY_URL;

    await storage.settings.set('proxy.enabled', nextProxyEnabled);
    await storage.settings.set('proxy.url', normalizedProxyUrl);

    const nextSettings: ProviderSettingsState = {
      ...providerSettingsRef.current,
      proxyEnabled: nextProxyEnabled,
      proxyUrl: normalizedProxyUrl
    };
    syncProviderSettings(nextSettings);

    const selectedOption = resolveModelOption(modelOptionsRef.current, selectedModelKeyRef.current);
    if (agentRef.current && selectedOption) {
      agentRef.current.state.model = applyProxyIfEnabled(selectedOption.model, nextSettings);
      refreshSnapshot();
    }
  };

  return {
    status,
    error,
    warning,
    input,
    setInput,
    agentState,
    modelOptions,
    selectedModelKey,
    providerSettings,
    sendMessage,
    abort,
    selectModel,
    createNewSession: async () => {
      await createNewSession(true, selectedModelKeyRef.current);
    },
    openSavedSessions,
    saveProviderKey,
    saveProxySettings,
    currentSessionId: currentSessionIdRef.current
  };
}
