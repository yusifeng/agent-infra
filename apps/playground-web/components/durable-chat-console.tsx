'use client';

import type {
  CreateThreadResponseDto,
  MessageDto,
  MessagePartDto,
  RunDto,
  RunEventDto,
  RunStreamAssistantSnapshotDto,
  RunStreamEventDto,
  RunTimelineResponseDto,
  RuntimePiMetaDto,
  ThreadMessagesResponseDto,
  ThreadRunsResponseDto,
  ThreadDto,
  ThreadsResponseDto,
  ToolInvocationDto
} from '@agent-infra/contracts';
import { createStyles } from 'antd-style';
import clsx from 'clsx';
import {
  Blocks,
  CircleStop,
  ChevronDown,
  Eraser,
  GalleryVerticalEnd,
  Globe,
  Library,
  Loader2,
  Menu,
  Mic,
  MessageSquarePlus,
  PanelLeftClose,
  PanelLeftOpen,
  Search,
  Send,
  SlidersHorizontal,
  Workflow
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type ComponentType } from 'react';

const SELECTED_RUN_STORAGE_KEY = 'agent-infra.chat-console.selected-run-id';
const RECENT_RUNS_LIMIT = 8;
const LOBE_AVATAR_URL = 'https://registry.npmmirror.com/@lobehub/fluent-emoji-3d/latest/files/assets/1f92f.webp';
const WAVING_HAND_EMOJI_URL = 'https://registry.npmmirror.com/@lobehub/fluent-emoji-anim-1/latest/files/assets/1f44b.webp';

const SUGGESTED_PROMPTS = [
  'Use getCurrentTime and summarize the result in one short paragraph.',
  'Call getRuntimeInfo, then explain what runtime is being exercised.',
  'Use echoText to repeat this sentence, then tell me why the tool was useful.'
];

const maxWithTW = 'max-w-3xl';
const composerMaxWithTW = 'max-w-[820px]';

const useStyles = createStyles(({ css, token }) => ({
  shell: css`
    height: 100%;
    overflow: hidden;
    background: ${token.colorBgContainer};
  `,
  secondarySurface: css`
    border: 1px solid ${token.colorBorderSecondary};
    background: ${token.colorBgContainer};
  `,
  sidebar: css`
    background: ${token.colorBgLayout};
    border-right: 1px solid ${token.colorBorderSecondary};
  `,
  threadItem: css`
    border-radius: ${token.borderRadius}px;
    color: ${token.colorTextSecondary};
    transition:
      background-color ${token.motionDurationMid},
      color ${token.motionDurationMid},
      border-color ${token.motionDurationMid};

    &:hover {
      background: ${token.colorFillSecondary};
      color: ${token.colorText};
    }
  `,
  threadItemActive: css`
    background: ${token.colorFillSecondary};
    color: ${token.colorTextSecondary};
  `,
  navItem: css`
    border-radius: ${token.borderRadius}px;
    color: ${token.colorTextSecondary};
    transition:
      background-color ${token.motionDurationMid},
      color ${token.motionDurationMid};

    &:hover {
      background: ${token.colorFillSecondary};
      color: ${token.colorText};
    }
  `,
  chatHeaderTitle: css`
    overflow: hidden;
    font-size: 14px;
    font-weight: bold;
    line-height: 1.2;
    text-overflow: ellipsis;
    white-space: nowrap;
  `,
  chatPane: css`
    background: ${token.colorBgContainer};
  `,
  messageViewport: css`
    background: ${token.colorBgContainer};
  `,
  assistantBubble: css`
    color: ${token.colorText};
  `,
  userBubble: css`
    background: ${token.colorFillTertiary};
    color: ${token.colorText};
  `,
  subtlePanel: css`
    border: 1px solid ${token.colorBorderSecondary};
    background: ${token.colorBgElevated};
  `,
  reasoning: css`
    border: 1px solid ${token.colorBorderSecondary};
    background: ${token.colorFillQuaternary};
  `,
  toolCall: css`
    border: 1px solid rgba(99, 102, 241, 0.22);
    background: rgba(99, 102, 241, 0.08);
  `,
  toolResult: css`
    border: 1px solid rgba(16, 185, 129, 0.22);
    background: rgba(16, 185, 129, 0.08);
  `,
  codeBlock: css`
    background: #0f172a;
    color: #e2e8f0;
  `,
  composerDock: css`
    background: rgba(248, 250, 252, 0.9);
    backdrop-filter: blur(8px);
  `,
  composerCard: css`
    border: 1px solid ${token.colorBorderSecondary};
    background: ${token.colorBgContainer};
    border-radius: 12px;
  `,
  textarea: css`
    color: ${token.colorText};
    background: transparent;
    border: none;
    outline: none;
    resize: none;

    &::placeholder {
      color: ${token.colorTextPlaceholder};
    }
  `,
  messageAppear: css`
    animation: message-enter 180ms ease-out;

    @keyframes message-enter {
      from {
        opacity: 0;
        transform: translateY(6px);
      }

      to {
        opacity: 1;
        transform: translateY(0);
      }
    }
  `,
  scrollButton: css`
    border: 1px solid ${token.colorBorderSecondary};
    background: ${token.colorBgContainer};
  `,
  logPane: css`
    background: ${token.colorBgLayout};
  `,
  badge: css`
    border: 1px solid ${token.colorBorderSecondary};
    background: ${token.colorFillQuaternary};
    color: ${token.colorTextSecondary};
  `,
  welcomeTitle: css`
    margin-block: 0.2em 0;
    font-weight: bolder;
    line-height: 1;
    color: ${token.colorText};
  `,
  welcomeDesc: css`
    text-align: center;
    color: ${token.colorTextSecondary};
  `,
  warningBanner: css`
    border: 1px solid rgba(245, 158, 11, 0.35);
    background: rgba(245, 158, 11, 0.12);
    color: #92400e;
  `,
  infoBanner: css`
    border: 1px solid rgba(14, 165, 233, 0.28);
    background: rgba(14, 165, 233, 0.12);
    color: #075985;
  `,
  errorBanner: css`
    border: 1px solid rgba(244, 63, 94, 0.3);
    background: rgba(244, 63, 94, 0.1);
    color: #9f1239;
  `
}));

function normalizeRuntimeMeta(data: Partial<RuntimePiMetaDto>): RuntimePiMetaDto {
  const modelOptions = Array.isArray(data.modelOptions) ? data.modelOptions : [];

  return {
    dbMode: data.dbMode ?? 'unknown',
    dbConnection: data.dbConnection ?? 'unknown',
    runtimeConfigured: data.runtimeConfigured ?? false,
    runtimeProvider: data.runtimeProvider ?? modelOptions[0]?.provider ?? 'unknown',
    runtimeModel: data.runtimeModel ?? modelOptions[0]?.model ?? 'unknown',
    defaultModelKey: data.defaultModelKey ?? modelOptions[0]?.key ?? null,
    modelOptions,
    runtimeConfigError: data.runtimeConfigError ?? null
  };
}

type IconButtonProps = {
  icon: ComponentType<{ className?: string }>;
  onClick?: () => void;
  title: string;
  size?: 'default' | 'small';
  disabled?: boolean;
  className?: string;
};

function IconButton({ icon: Icon, onClick, title, size = 'default', disabled = false, className }: IconButtonProps) {
  const frameClass = size === 'small' ? 'h-6 w-6 rounded-md' : 'h-8 w-8 rounded-md';
  const iconClass = size === 'small' ? 'h-[14px] w-[14px]' : 'h-[18px] w-[18px]';

  return (
    <button
      type="button"
      aria-label={title}
      title={title}
      disabled={disabled}
      onClick={onClick}
      className={clsx(
        'flex items-center justify-center text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 disabled:pointer-events-none disabled:opacity-50',
        frameClass,
        className
      )}
    >
      <Icon className={iconClass} />
    </button>
  );
}

function ChatAvatar({ title, size = 28 }: { title: string; size?: number }) {
  return (
    <img
      alt={title}
      className="rounded-full object-cover"
      height={size}
      loading="lazy"
      src={LOBE_AVATAR_URL}
      width={size}
    />
  );
}

function AnimatedEmoji({ emoji, size = 40 }: { emoji: string; size?: number }) {
  return (
    <img
      alt={emoji}
      className="object-contain"
      height={size}
      loading="lazy"
      src={WAVING_HAND_EMOJI_URL}
      width={size}
    />
  );
}

function ProviderMonogram({ provider }: { provider: string }) {
  return (
    <span className="flex h-[18px] w-[18px] items-center justify-center rounded-full bg-slate-200 text-[10px] font-semibold uppercase text-slate-500">
      {provider.slice(0, 1)}
    </span>
  );
}

function formatDateTime(value?: string | null) {
  if (!value) {
    return '';
  }

  return new Intl.DateTimeFormat(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    month: 'short',
    day: 'numeric'
  }).format(new Date(value));
}

function formatDuration(startedAt?: string | null, finishedAt?: string | null) {
  if (!startedAt) {
    return 'Not started';
  }

  const start = new Date(startedAt).getTime();
  const end = finishedAt ? new Date(finishedAt).getTime() : Date.now();
  const durationMs = Math.max(0, end - start);

  if (durationMs < 1000) {
    return `${durationMs} ms`;
  }

  const seconds = durationMs / 1000;
  if (seconds < 60) {
    return `${seconds.toFixed(seconds < 10 ? 1 : 0)} s`;
  }

  const roundedSeconds = Math.round(seconds);
  const minutes = Math.floor(roundedSeconds / 60);
  const remainingSeconds = roundedSeconds % 60;
  return `${minutes}m ${remainingSeconds}s`;
}

function deriveLatestRunId(messages: MessageDto[]) {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const runId = messages[index]?.runId;
    if (runId) {
      return runId;
    }
  }

  return null;
}

function chooseInitialRunId(messages: MessageDto[], runs: RunDto[], preferredRunId: string | null) {
  if (preferredRunId && runs.some((run) => run.id === preferredRunId)) {
    return preferredRunId;
  }

  return runs[0]?.id ?? deriveLatestRunId(messages);
}

function readPersistedRunId() {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    return window.localStorage.getItem(SELECTED_RUN_STORAGE_KEY);
  } catch {
    return null;
  }
}

function persistSelectedRunId(runId: string | null) {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    if (runId) {
      window.localStorage.setItem(SELECTED_RUN_STORAGE_KEY, runId);
    } else {
      window.localStorage.removeItem(SELECTED_RUN_STORAGE_KEY);
    }
  } catch {
    // Storage may be unavailable in privacy-restricted contexts.
  }
}

function readThreadIdFromPathname(pathname: string) {
  const match = pathname.match(/^\/chat\/([^/?#]+)/);
  return match?.[1] ?? null;
}

function compareRunsByCreatedAt(left: RunDto, right: RunDto) {
  return new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime();
}

function upsertMessage(messages: MessageDto[], nextMessage: MessageDto) {
  const existingIndex = messages.findIndex((message) => message.id === nextMessage.id);
  if (existingIndex === -1) {
    return [...messages, nextMessage].sort((left, right) => left.seq - right.seq);
  }

  const nextMessages = [...messages];
  nextMessages[existingIndex] = nextMessage;
  return nextMessages;
}

function upsertRun(runs: RunDto[], nextRun: RunDto) {
  const existingIndex = runs.findIndex((run) => run.id === nextRun.id);
  if (existingIndex === -1) {
    return [...runs, nextRun].sort(compareRunsByCreatedAt).slice(0, RECENT_RUNS_LIMIT);
  }

  const nextRuns = [...runs];
  nextRuns[existingIndex] = nextRun;
  return nextRuns.sort(compareRunsByCreatedAt).slice(0, RECENT_RUNS_LIMIT);
}

function includeSelectedRun(runs: RunDto[], selectedRun: RunDto | null) {
  if (!selectedRun) {
    return runs;
  }

  const existing = runs.some((run) => run.id === selectedRun.id);
  if (existing) {
    return runs;
  }

  return [...runs, selectedRun].sort(compareRunsByCreatedAt);
}

function upsertRunEvent(events: RunEventDto[], nextEvent: RunEventDto) {
  const existingIndex = events.findIndex((event) => event.id === nextEvent.id);
  if (existingIndex === -1) {
    return [...events, nextEvent].sort((left, right) => left.seq - right.seq);
  }

  const nextEvents = [...events];
  nextEvents[existingIndex] = nextEvent;
  return nextEvents.sort((left, right) => left.seq - right.seq);
}

function upsertToolInvocation(invocations: ToolInvocationDto[], nextInvocation: ToolInvocationDto) {
  const existingIndex = invocations.findIndex((invocation) => invocation.id === nextInvocation.id);
  if (existingIndex === -1) {
    return [...invocations, nextInvocation];
  }

  const nextInvocations = [...invocations];
  nextInvocations[existingIndex] = nextInvocation;
  return nextInvocations;
}

function applyRunStreamEvent(current: RunTimelineResponseDto | null, event: RunStreamEventDto): RunTimelineResponseDto {
  switch (event.type) {
    case 'run.ready':
      return {
        run: event.run,
        runEvents: [],
        toolInvocations: []
      };
    case 'run.state':
      return {
        run: event.run,
        runEvents: current?.runEvents ?? [],
        toolInvocations: current?.toolInvocations ?? []
      };
    case 'run.event':
      return {
        run: current?.run ?? null,
        runEvents: upsertRunEvent(current?.runEvents ?? [], event.event),
        toolInvocations: current?.toolInvocations ?? []
      };
    case 'run.tool':
      return {
        run: current?.run ?? null,
        runEvents: current?.runEvents ?? [],
        toolInvocations: upsertToolInvocation(current?.toolInvocations ?? [], event.toolInvocation)
      };
    case 'run.completed':
      return {
        run: event.run,
        runEvents: current?.runEvents ?? [],
        toolInvocations: current?.toolInvocations ?? []
      };
    case 'run.failed':
      return {
        run: event.run,
        runEvents: current?.runEvents ?? [],
        toolInvocations: current?.toolInvocations ?? []
      };
    case 'run.assistant':
      return current ?? {
        run: null,
        runEvents: [],
        toolInvocations: []
      };
    default:
      return current ?? {
        run: null,
        runEvents: [],
        toolInvocations: []
      };
  }
}

function parseSseChunk(buffer: string) {
  const frames = buffer.split('\n\n');
  const remainder = frames.pop() ?? '';
  const events: RunStreamEventDto[] = [];

  for (const frame of frames) {
    const lines = frame.split('\n');
    let eventName = '';
    let data = '';

    for (const line of lines) {
      if (line.startsWith('event:')) {
        eventName = line.slice(6).trim();
        continue;
      }

      if (line.startsWith('data:')) {
        data += line.slice(5).trim();
      }
    }

    if (!eventName || !data) {
      continue;
    }

    try {
      const parsed = JSON.parse(data) as RunStreamEventDto;
      if (parsed.type === eventName) {
        events.push(parsed);
      }
    } catch {
      continue;
    }
  }

  return {
    events,
    remainder
  };
}

function statusBadgeTone(status: RunDto['status'] | ToolInvocationDto['status'] | MessageDto['status'] | 'idle') {
  switch (status) {
    case 'running':
      return 'bg-amber-100 text-amber-800';
    case 'queued':
    case 'created':
      return 'bg-slate-200 text-slate-700';
    case 'completed':
      return 'bg-emerald-100 text-emerald-800';
    case 'failed':
      return 'bg-rose-100 text-rose-800';
    default:
      return 'bg-slate-100 text-slate-600';
  }
}

type LiveAssistantDraft = {
  runId: string;
  messageId: string;
  partialText: string;
  partialReasoning: string | null;
  eventType: RunStreamAssistantSnapshotDto['eventType'];
};

function ThreadTitle({ thread }: { thread: ThreadDto }) {
  const title = thread.title?.trim() || 'Untitled thread';
  return (
    <>
      <p className="truncate text-sm">{title}</p>
    </>
  );
}

function WelcomeMessage({
  activeThreadId,
}: {
  activeThreadId: string | null;
}) {
  const { styles } = useStyles();
  const greeting = (() => {
    const hour = new Date().getHours();
    if (hour < 6) return '夜深了';
    if (hour < 12) return '早上好';
    if (hour < 18) return '下午好';
    return '晚上好';
  })();

  return (
    <div className="flex h-full items-center justify-center">
      <div className="flex w-full max-w-[800px] flex-col items-center gap-4 p-4">
        <div className="flex items-center gap-2">
          <AnimatedEmoji emoji="👋" size={40} />
          <h1 className={clsx('my-1 text-[32px]', styles.welcomeTitle)}>
            {activeThreadId ? '继续这个 durable chat' : greeting}
          </h1>
        </div>
        <div className={clsx('max-w-[720px] text-sm leading-7', styles.welcomeDesc)}>
          {activeThreadId
            ? '这里保留真实的 durable thread、run、message 与 tool timeline，只把左侧 threads 和中间聊天区域的视觉对齐到参考实现。'
            : '我是您的 durable chat 助手，请问现在能帮您做什么？'}
        </div>
      </div>
    </div>
  );
}

function ToolRow({ invocation }: { invocation: ToolInvocationDto }) {
  const { styles } = useStyles();

  return (
    <article className={clsx('rounded-2xl p-4', styles.subtlePanel)}>
      <header className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-slate-900">{invocation.toolName}</p>
          <p className="truncate text-xs text-slate-500">{invocation.toolCallId}</p>
        </div>
        <span className={clsx('rounded-full px-2 py-1 text-[11px] font-medium uppercase tracking-wide', statusBadgeTone(invocation.status))}>
          {invocation.status}
        </span>
      </header>

      <div className="mt-3 space-y-3">
        <div>
          <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-slate-500">Input</p>
          <pre className={clsx('overflow-auto rounded-2xl p-3 text-xs', styles.codeBlock)}>
            {JSON.stringify(invocation.input ?? null, null, 2)}
          </pre>
        </div>

        <div>
          <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-slate-500">Output</p>
          <pre className={clsx('overflow-auto rounded-2xl p-3 text-xs', styles.codeBlock)}>
            {JSON.stringify(invocation.output ?? null, null, 2)}
          </pre>
        </div>

        {invocation.error ? (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">{invocation.error}</div>
        ) : null}
      </div>
    </article>
  );
}

function EventRow({ event }: { event: RunEventDto }) {
  const { styles } = useStyles();

  return (
    <article className={clsx('rounded-2xl p-4', styles.subtlePanel)}>
      <header className="flex items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-slate-100 px-2 py-1 font-medium text-slate-700">#{event.seq}</span>
          <span className="font-medium uppercase tracking-wide text-slate-600">{event.type}</span>
        </div>
        <span className="text-slate-500">{formatDateTime(event.createdAt)}</span>
      </header>

      {event.payload ? (
        <details className="mt-3">
          <summary className="cursor-pointer text-xs font-medium text-sky-700">Raw payload</summary>
          <pre className={clsx('mt-2 overflow-auto rounded-2xl p-3 text-xs', styles.codeBlock)}>
            {JSON.stringify(event.payload, null, 2)}
          </pre>
        </details>
      ) : null}
    </article>
  );
}

function MessagePartView({ part }: { part: MessagePartDto }) {
  const { styles } = useStyles();

  if (part.type === 'text') {
    return <p className="whitespace-pre-wrap text-sm leading-7 text-slate-800">{part.textValue ?? ''}</p>;
  }

  if (part.type === 'reasoning') {
    return (
      <details className={clsx('rounded-2xl px-4 py-3', styles.reasoning)}>
        <summary className="cursor-pointer text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Reasoning</summary>
        <pre className="mt-3 overflow-x-auto whitespace-pre-wrap text-xs leading-6 text-slate-600">{part.textValue ?? ''}</pre>
      </details>
    );
  }

  if (part.type === 'tool-call') {
    const json = part.jsonValue ?? {};
    return (
      <div className={clsx('space-y-2 rounded-2xl px-4 py-3', styles.toolCall)}>
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-indigo-700">Tool Call · {String(json.toolName ?? 'unknown')}</p>
        <pre className={clsx('overflow-auto rounded-2xl p-3 text-xs', styles.codeBlock)}>
          {JSON.stringify({ toolCallId: json.toolCallId ?? 'n/a', input: json.input ?? null }, null, 2)}
        </pre>
      </div>
    );
  }

  if (part.type === 'tool-result') {
    const json = part.jsonValue ?? {};
    return (
      <div className={clsx('space-y-2 rounded-2xl px-4 py-3', styles.toolResult)}>
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-emerald-700">
          Tool Result · {String(json.toolName ?? 'unknown')}
        </p>
        {part.textValue ? <p className="whitespace-pre-wrap text-sm leading-6 text-slate-700">{part.textValue}</p> : null}
        <pre className={clsx('overflow-auto rounded-2xl p-3 text-xs', styles.codeBlock)}>{JSON.stringify(json, null, 2)}</pre>
      </div>
    );
  }

  return <pre className={clsx('overflow-auto rounded-2xl p-3 text-xs', styles.codeBlock)}>{JSON.stringify(part, null, 2)}</pre>;
}

function MessageCard({ message }: { message: MessageDto }) {
  const { styles } = useStyles();
  const isUser = message.role === 'user';

  if (isUser) {
    return (
      <div className={clsx('group relative flex w-full max-w-screen justify-end px-4', styles.messageAppear)}>
        <div className="max-w-[65%]">
          <div className={clsx('relative flex flex-col gap-3 rounded-lg px-3 py-2', styles.userBubble)}>
            <div className="space-y-3">{message.parts.map((part) => <MessagePartView key={part.id} part={part} />)}</div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={clsx('group relative w-[90%] max-w-screen px-4', styles.messageAppear)}>
      <div className={clsx('relative flex flex-col gap-2 pt-1.5', styles.assistantBubble)}>
        <div className="space-y-3">{message.parts.map((part) => <MessagePartView key={part.id} part={part} />)}</div>
      </div>
    </div>
  );
}

function LiveAssistantCard({ liveAssistantDraft }: { liveAssistantDraft: LiveAssistantDraft }) {
  const { styles } = useStyles();

  return (
    <div className={clsx('group relative w-[90%] max-w-screen px-4', styles.messageAppear)}>
      <div className={clsx('relative flex flex-col gap-2 pt-1.5', styles.assistantBubble)}>
        {liveAssistantDraft.partialReasoning ? (
          <details className={clsx('rounded-2xl px-4 py-3', styles.reasoning)}>
            <summary className="cursor-pointer text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
              Reasoning
            </summary>
            <pre className="mt-3 overflow-x-auto whitespace-pre-wrap text-xs leading-6 text-slate-600">
              {liveAssistantDraft.partialReasoning}
            </pre>
          </details>
        ) : null}

        {liveAssistantDraft.partialText ? (
          <p className="whitespace-pre-wrap text-sm leading-7 text-slate-800">{liveAssistantDraft.partialText}</p>
        ) : (
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>Assistant is responding...</span>
          </div>
        )}

        <div className="flex gap-2 text-[11px] text-slate-400">
          <span>streaming</span>
        </div>
      </div>
    </div>
  );
}

type DurableChatConsoleProps = {
  initialThreadId?: string | null;
};

export function DurableChatConsole({ initialThreadId = null }: DurableChatConsoleProps) {
  const { styles, cx } = useStyles();
  const [threads, setThreads] = useState<ThreadDto[]>([]);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [messages, setMessages] = useState<MessageDto[]>([]);
  const [draft, setDraft] = useState('');
  const [meta, setMeta] = useState<RuntimePiMetaDto | null>(null);
  const [selectedModelKey, setSelectedModelKey] = useState('');
  const [sending, setSending] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [recentRuns, setRecentRuns] = useState<RunDto[]>([]);
  const [recentRunsLoading, setRecentRunsLoading] = useState(false);
  const [recentRunsError, setRecentRunsError] = useState<string | null>(null);
  const [timeline, setTimeline] = useState<RunTimelineResponseDto | null>(null);
  const [timelineLoading, setTimelineLoading] = useState(false);
  const [timelineError, setTimelineError] = useState<string | null>(null);
  const [liveStreamRunId, setLiveStreamRunId] = useState<string | null>(null);
  const [liveAssistantDraft, setLiveAssistantDraft] = useState<LiveAssistantDraft | null>(null);
  const [durableRecoveryNotice, setDurableRecoveryNotice] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(() => (typeof window === 'undefined' ? true : window.innerWidth >= 1024));
  const [logOpen, setLogOpen] = useState(false);
  const [showScrollToBottom, setShowScrollToBottom] = useState(false);
  const runSelectionPersistenceReadyRef = useRef(false);
  const activeThreadIdRef = useRef<string | null>(null);
  const messagesRequestIdRef = useRef(0);
  const messagesAbortControllerRef = useRef<AbortController | null>(null);
  const timelineRequestIdRef = useRef(0);
  const timelineAbortControllerRef = useRef<AbortController | null>(null);
  const sendRequestIdRef = useRef(0);
  const sendAbortControllerRef = useRef<AbortController | null>(null);
  const messagesViewportRef = useRef<HTMLDivElement>(null);
  const shouldAutoScrollRef = useRef(true);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const activeThread = useMemo(() => threads.find((thread) => thread.id === activeThreadId) ?? null, [threads, activeThreadId]);
  const selectedModelOption = useMemo(
    () => meta?.modelOptions.find((option) => option.key === selectedModelKey) ?? meta?.modelOptions[0] ?? null,
    [meta, selectedModelKey]
  );
  const selectedRun = timeline?.run ?? null;
  const runEvents = timeline?.runEvents ?? [];
  const toolInvocations = timeline?.toolInvocations ?? [];
  const currentThreadTitle = activeThread?.title?.trim() || activeThreadId || 'New chat';
  const sendingDisabled = !draft.trim() || sending || !meta?.runtimeConfigured || !selectedModelOption;

  async function readJsonOrEmpty<T>(response: Response): Promise<Partial<T>> {
    const text = await response.text();
    if (!text) {
      return {};
    }

    try {
      return JSON.parse(text) as Partial<T>;
    } catch {
      return {};
    }
  }

  useEffect(() => {
    activeThreadIdRef.current = activeThreadId;
  }, [activeThreadId]);

  useEffect(() => {
    if (!runSelectionPersistenceReadyRef.current) {
      return;
    }

    persistSelectedRunId(selectedRunId);
  }, [selectedRunId]);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) {
      return;
    }

    textarea.style.height = '0px';
    textarea.style.height = `${Math.min(textarea.scrollHeight, 220)}px`;
  }, [draft]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    if (window.innerWidth < 1024) {
      setSidebarOpen(false);
    }
  }, []);

  useEffect(() => {
    const viewport = messagesViewportRef.current;
    if (!viewport) {
      return;
    }

    const handleScroll = () => {
      const distance = viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight;
      const nearBottom = distance < 140;
      shouldAutoScrollRef.current = nearBottom;
      setShowScrollToBottom(!nearBottom);
    };

    handleScroll();
    viewport.addEventListener('scroll', handleScroll);
    return () => {
      viewport.removeEventListener('scroll', handleScroll);
    };
  }, []);

  useEffect(() => {
    const viewport = messagesViewportRef.current;
    if (!viewport || !shouldAutoScrollRef.current) {
      return;
    }

    window.requestAnimationFrame(() => {
      viewport.scrollTo({
        top: viewport.scrollHeight,
        behavior: messages.length > 0 ? 'smooth' : 'auto'
      });
    });
  }, [messages, liveAssistantDraft?.partialText, liveAssistantDraft?.partialReasoning, activeThreadId, loadingMessages]);

  function scrollToMessagesBottom() {
    const viewport = messagesViewportRef.current;
    if (!viewport) {
      return;
    }

    shouldAutoScrollRef.current = true;
    viewport.scrollTo({
      top: viewport.scrollHeight,
      behavior: 'smooth'
    });
  }

  function updateHistoryPath(pathname: string, options?: { replace?: boolean }) {
    if (typeof window === 'undefined') {
      return;
    }

    const method = options?.replace ? 'replaceState' : 'pushState';
    window.history[method](window.history.state, '', pathname);
  }

  function resetDraftThreadState() {
    messagesRequestIdRef.current += 1;
    messagesAbortControllerRef.current?.abort();
    timelineRequestIdRef.current += 1;
    timelineAbortControllerRef.current?.abort();
    sendRequestIdRef.current += 1;
    sendAbortControllerRef.current?.abort();
    setSending(false);
    setActiveThreadId(null);
    setDraft('');
    setMessages([]);
    setRecentRuns([]);
    setSelectedRunId(null);
    setTimeline(null);
    setTimelineError(null);
    setTimelineLoading(false);
    setLiveAssistantDraft(null);
    setLiveStreamRunId(null);
    setRecentRunsLoading(false);
    setRecentRunsError(null);
    setLoadingMessages(false);
    shouldAutoScrollRef.current = true;
  }

  async function activateThread(threadId: string, options?: { preferredRunId?: string | null }) {
    setActiveThreadId(threadId);
    activeThreadIdRef.current = threadId;
    shouldAutoScrollRef.current = true;
    const restoredRunId = await loadThreadMessages(threadId, options);
    if (options?.preferredRunId) {
      setDurableRecoveryNotice(
        restoredRunId
          ? 'Restored the focused run from durable records. Live stream drafts are transient and may not survive refresh.'
          : null
      );
    } else {
      setDurableRecoveryNotice(null);
    }

    return restoredRunId;
  }

  async function navigateToThread(threadId: string, options?: { replace?: boolean; preferredRunId?: string | null }) {
    updateHistoryPath(`/chat/${threadId}`, options);
    await activateThread(threadId, options);
  }

  async function navigateToNewChat(options?: { replace?: boolean }) {
    updateHistoryPath('/new', options);
    resetDraftThreadState();
    setDurableRecoveryNotice(null);
    setError(null);
    await refreshThreads();
  }

  async function refreshThreads() {
    const response = await fetch('/api/threads');
    const data = (await readJsonOrEmpty<ThreadsResponseDto>(response)) as ThreadsResponseDto;
    if (!response.ok) {
      throw new Error(data.error ?? `Failed to load threads (${response.status})`);
    }

    setThreads(data.threads);
    return data.threads;
  }

  async function loadRunTimeline(runId: string | null) {
    timelineRequestIdRef.current += 1;
    const requestId = timelineRequestIdRef.current;
    timelineAbortControllerRef.current?.abort();
    setSelectedRunId(runId);
    setLiveAssistantDraft((current) => (current?.runId === runId ? current : null));

    if (!runId) {
      timelineAbortControllerRef.current = null;
      setTimeline(null);
      setTimelineError(null);
      setTimelineLoading(false);
      return;
    }

    const controller = new AbortController();
    timelineAbortControllerRef.current = controller;
    setTimeline(null);
    setTimelineLoading(true);
    setTimelineError(null);

    try {
      const response = await fetch(`/api/runs/${runId}/timeline`, {
        signal: controller.signal
      });
      const data = (await response.json()) as RunTimelineResponseDto;
      if (!response.ok) {
        throw new Error(data.error ?? `Failed to load run timeline (${response.status})`);
      }

      if (requestId !== timelineRequestIdRef.current) {
        return;
      }

      setTimeline(data);
    } catch (loadError) {
      if (controller.signal.aborted || requestId !== timelineRequestIdRef.current) {
        return;
      }

      setTimeline(null);
      setTimelineError(loadError instanceof Error ? loadError.message : 'Failed to load run timeline');
    } finally {
      if (requestId === timelineRequestIdRef.current) {
        timelineAbortControllerRef.current = null;
        setTimelineLoading(false);
      }
    }
  }

  async function tryResolvePreferredRun(threadId: string, runId: string, signal: AbortSignal) {
    try {
      const response = await fetch(`/api/runs/${runId}/timeline`, {
        signal
      });
      const data = (await response.json()) as RunTimelineResponseDto;
      if (!response.ok || !data.run || data.run.threadId !== threadId) {
        return null;
      }

      return data.run;
    } catch {
      return null;
    }
  }

  async function refreshMeta() {
    const response = await fetch('/api/meta');
    const data = normalizeRuntimeMeta((await readJsonOrEmpty<RuntimePiMetaDto>(response)) as Partial<RuntimePiMetaDto>);
    setMeta(data);
    if (!response.ok) {
      setError(data.runtimeConfigError ?? `Failed to load runtime metadata (${response.status})`);
      return;
    }

    setSelectedModelKey((current) => {
      if (current && data.modelOptions.some((option) => option.key === current)) {
        return current;
      }

      return data.defaultModelKey ?? data.modelOptions[0]?.key ?? '';
    });
  }

  async function loadThreadMessages(threadId: string, options?: { preferredRunId?: string | null }) {
    messagesRequestIdRef.current += 1;
    const requestId = messagesRequestIdRef.current;
    messagesAbortControllerRef.current?.abort();
    const controller = new AbortController();
    messagesAbortControllerRef.current = controller;
    setLoadingMessages(true);
    setRecentRunsLoading(true);
    setRecentRunsError(null);

    try {
      const [messagesResponse, runsResponse] = await Promise.all([
        fetch(`/api/threads/${threadId}/messages`, {
          signal: controller.signal
        }),
        fetch(`/api/threads/${threadId}/runs?limit=${RECENT_RUNS_LIMIT}`, {
          signal: controller.signal
        })
      ]);

      const messagesData = (await messagesResponse.json()) as ThreadMessagesResponseDto;
      if (!messagesResponse.ok) {
        throw new Error(messagesData.error ?? `Failed to load messages (${messagesResponse.status})`);
      }

      const runsData = (await readJsonOrEmpty<ThreadRunsResponseDto>(runsResponse)) as ThreadRunsResponseDto;
      if (!runsResponse.ok) {
        throw new Error(runsData.error ?? `Failed to load thread runs (${runsResponse.status})`);
      }

      if (controller.signal.aborted || requestId !== messagesRequestIdRef.current) {
        return;
      }

      const nextMessages = messagesData.messages ?? [];
      let nextRuns = (runsData.runs ?? []).slice().sort(compareRunsByCreatedAt);
      let preferredResolvedRun: RunDto | null = null;

      if (options?.preferredRunId && !nextRuns.some((run) => run.id === options.preferredRunId)) {
        preferredResolvedRun = await tryResolvePreferredRun(threadId, options.preferredRunId, controller.signal);

        if (controller.signal.aborted || requestId !== messagesRequestIdRef.current) {
          return;
        }

        nextRuns = includeSelectedRun(nextRuns, preferredResolvedRun);
      }

      const nextSelectedRunId = chooseInitialRunId(
        nextMessages,
        nextRuns,
        preferredResolvedRun?.id ?? options?.preferredRunId ?? null
      );

      setMessages(nextMessages);
      setRecentRuns(nextRuns);
      setLiveAssistantDraft(null);
      setRecentRunsError(null);
      setRecentRunsLoading(false);
      setError(null);
      await loadRunTimeline(nextSelectedRunId);
      return nextSelectedRunId;
    } catch (loadError) {
      if (controller.signal.aborted || requestId !== messagesRequestIdRef.current) {
        return;
      }

      setRecentRuns([]);
      setRecentRunsLoading(false);
      setRecentRunsError(loadError instanceof Error ? loadError.message : 'Failed to load thread runs');
      setLiveAssistantDraft(null);
      setSelectedRunId(null);
      setTimeline(null);
      setTimelineError(null);
      setError(loadError instanceof Error ? loadError.message : 'Failed to load thread messages');
      return null;
    } finally {
      if (requestId === messagesRequestIdRef.current) {
        messagesAbortControllerRef.current = null;
        setLoadingMessages(false);
      }
    }
  }

  async function createThreadRecord() {
    const response = await fetch('/api/threads', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({})
    });
    const data = (await response.json()) as CreateThreadResponseDto;
    if (!response.ok || !data.thread) {
      throw new Error(data.error ?? `Failed to create thread (${response.status})`);
    }

    const createdThread = data.thread;
    setThreads((current) => [...current, createdThread].sort((left, right) => new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime()));
    return createdThread;
  }

  async function sendMessage() {
    if (!draft.trim() || sending || !selectedModelOption) {
      return;
    }

    let threadId = activeThreadId;
    const text = draft.trim();
    const requestId = sendRequestIdRef.current + 1;
    sendRequestIdRef.current = requestId;
    sendAbortControllerRef.current?.abort();
    const controller = new AbortController();
    sendAbortControllerRef.current = controller;

    let streamedRunId: string | null = null;
    let streamSessionStarted = false;
    let terminalStreamError: string | null = null;
    setSending(true);
    setError(null);
    setLiveStreamRunId(null);
    setLiveAssistantDraft(null);
    timelineRequestIdRef.current += 1;
    timelineAbortControllerRef.current?.abort();
    setSelectedRunId(null);
    setTimeline(null);
    setTimelineLoading(false);
    setTimelineError(null);
    shouldAutoScrollRef.current = true;

    try {
      if (!threadId) {
        const nextThread = await createThreadRecord();
        threadId = nextThread.id;
        setActiveThreadId(threadId);
        activeThreadIdRef.current = threadId;
        updateHistoryPath(`/chat/${threadId}`, { replace: true });
      }

      const response = await fetch(`/api/threads/${threadId}/runs/stream`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          text,
          provider: selectedModelOption.provider,
          model: selectedModelOption.model
        }),
        signal: controller.signal
      });

      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? `request failed (${response.status})`);
      }

      if (!response.body) {
        throw new Error('stream response body is unavailable');
      }

      streamSessionStarted = true;
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }

        if (controller.signal.aborted || requestId !== sendRequestIdRef.current) {
          return;
        }

        buffer += decoder.decode(value, { stream: true });
        const parsed = parseSseChunk(buffer);
        buffer = parsed.remainder;

        for (const event of parsed.events) {
          if (controller.signal.aborted || requestId !== sendRequestIdRef.current) {
            return;
          }

          streamedRunId = event.runId;
          setLiveStreamRunId(event.runId);
          setSelectedRunId(event.runId);
          setTimeline((current) => applyRunStreamEvent(current, event));

          if (event.type === 'run.ready') {
            setDraft('');
            setMessages((current) => upsertMessage(current, event.userMessage));
            setRecentRuns((current) => upsertRun(current, event.run));
            continue;
          }

          if (event.type === 'run.assistant') {
            setLiveAssistantDraft({
              runId: event.runId,
              messageId: event.assistant.messageId,
              partialText: event.assistant.partialText,
              partialReasoning: event.assistant.partialReasoning,
              eventType: event.assistant.eventType
            });
            continue;
          }

          if (event.type === 'run.state' || event.type === 'run.completed') {
            setRecentRuns((current) => upsertRun(current, event.run));
          }

          if (event.type === 'run.failed' && event.run) {
            const failedRun = event.run;
            setRecentRuns((current) => upsertRun(current, failedRun));
          }

          if (event.type === 'run.failed') {
            terminalStreamError = event.error;
            setError(event.error);
            continue;
          }

          if (event.type === 'run.completed') {
            setError(null);
            setLiveAssistantDraft((current) => (current?.runId === event.runId ? null : current));
          }
        }
      }

      const finalChunk = decoder.decode();
      if (finalChunk) {
        const parsed = parseSseChunk(`${buffer}${finalChunk}\n\n`);
        for (const event of parsed.events) {
          streamedRunId = event.runId;
          setLiveStreamRunId(event.runId);
          setSelectedRunId(event.runId);
          setTimeline((current) => applyRunStreamEvent(current, event));

          if (event.type === 'run.ready') {
            setDraft('');
            setMessages((current) => upsertMessage(current, event.userMessage));
            setRecentRuns((current) => upsertRun(current, event.run));
          } else if (event.type === 'run.assistant') {
            setLiveAssistantDraft({
              runId: event.runId,
              messageId: event.assistant.messageId,
              partialText: event.assistant.partialText,
              partialReasoning: event.assistant.partialReasoning,
              eventType: event.assistant.eventType
            });
          } else if (event.type === 'run.failed') {
            setRecentRuns((current) => (event.run ? upsertRun(current, event.run) : current));
            terminalStreamError = event.error;
            setError(event.error);
            setLiveAssistantDraft((current) => (current?.runId === event.runId ? current : null));
          } else if (event.type === 'run.state' || event.type === 'run.completed') {
            setRecentRuns((current) => upsertRun(current, event.run));
            if (event.type === 'run.completed') {
              setLiveAssistantDraft((current) => (current?.runId === event.runId ? null : current));
            }
          }
        }
      }
    } catch (sendError) {
      if (controller.signal.aborted || requestId !== sendRequestIdRef.current) {
        return;
      }

      setError(sendError instanceof Error ? sendError.message : 'Failed to send message');
    } finally {
      if (requestId === sendRequestIdRef.current) {
        sendAbortControllerRef.current = null;
        setSending(false);
        setLiveStreamRunId(null);
      }

      if (!controller.signal.aborted && requestId === sendRequestIdRef.current && (streamSessionStarted || streamedRunId)) {
        if (threadId && activeThreadIdRef.current === threadId) {
          await loadThreadMessages(threadId);
        } else {
          await refreshThreads();
        }

        if (terminalStreamError) {
          setError(terminalStreamError);
        }
      }
    }
  }

  useEffect(() => {
    void (async () => {
      try {
        await refreshThreads();

        if (initialThreadId) {
          await activateThread(initialThreadId, {
            preferredRunId: readPersistedRunId()
          });
        } else {
          resetDraftThreadState();
          setDurableRecoveryNotice(null);
        }
      } catch (refreshError) {
        setError(refreshError instanceof Error ? refreshError.message : 'Failed to load threads');
      } finally {
        runSelectionPersistenceReadyRef.current = true;
      }
    })();

    void refreshMeta();
  }, [initialThreadId]);

  useEffect(() => {
    const handlePopState = () => {
      const pathname = window.location.pathname;
      const threadId = readThreadIdFromPathname(window.location.pathname);
      void (async () => {
        try {
          sendAbortControllerRef.current?.abort();

          if (threadId) {
            await activateThread(threadId, {
              preferredRunId: readPersistedRunId()
            });
            return;
          }

          if (pathname === '/new') {
            resetDraftThreadState();
            setDurableRecoveryNotice(null);
            setError(null);
            await refreshThreads();
          }
        } catch (navigationError) {
          setError(navigationError instanceof Error ? navigationError.message : 'Failed to load thread');
        }
      })();
    };

    window.addEventListener('popstate', handlePopState);
    return () => {
      window.removeEventListener('popstate', handlePopState);
    };
  }, []);

  useEffect(
    () => () => {
      sendAbortControllerRef.current?.abort();
      messagesAbortControllerRef.current?.abort();
      timelineAbortControllerRef.current?.abort();
    },
    []
  );

  return (
    <main className={clsx('flex h-full min-h-0 overflow-hidden', styles.shell)}>
      {sidebarOpen ? <div className="fixed inset-0 z-20 bg-slate-950/30 backdrop-blur-sm lg:hidden" onClick={() => setSidebarOpen(false)} /> : null}

      <div className={clsx('relative shrink-0 overflow-hidden transition-[width] duration-300 ease-out', sidebarOpen ? 'w-[276px]' : 'w-0')}>
        <aside
          className={clsx(
            'absolute inset-y-0 left-0 z-30 flex w-[276px] flex-col overflow-hidden transition-transform duration-300 ease-out',
            sidebarOpen ? 'translate-x-0' : '-translate-x-full'
          )}
        >
          <div className={clsx('h-full min-w-0 overflow-y-auto', styles.sidebar)}>
            <div className="flex shrink-0 items-center justify-between px-4 pt-2">
              <h1 className="mb-2 text-3xl font-bold tracking-tight text-slate-900">Forma</h1>
              <IconButton icon={PanelLeftClose} onClick={() => setSidebarOpen(false)} title="关闭侧边栏" />
            </div>

            <aside className="sticky z-20 px-2 pb-5" style={{ top: 0 }}>
              <button
                type="button"
                className={clsx('flex h-9 w-full items-center gap-2 bg-transparent px-[10px] py-[6px] text-sm', styles.navItem)}
                onClick={() => {
                  sendAbortControllerRef.current?.abort();
                  if (window.innerWidth < 1024) {
                    setSidebarOpen(false);
                  }
                  void navigateToNewChat();
                }}
              >
                <MessageSquarePlus size={18} />
                <span>新聊天</span>
              </button>
              <button
                type="button"
                disabled
                className={clsx('mt-1 flex h-9 w-full items-center gap-2 bg-transparent px-[10px] py-[6px] text-sm', styles.navItem)}
              >
                <Search size={18} />
                <span>搜索聊天</span>
              </button>
              <button
                type="button"
                disabled
                className={clsx('mt-1 flex h-9 w-full items-center gap-2 bg-transparent px-[10px] py-[6px] text-sm', styles.navItem)}
              >
                <Library size={18} />
                <span>库</span>
              </button>
            </aside>

            <div className="mb-1 flex items-center px-5 py-1 text-xs text-slate-400">
              <span>聊天</span>
              <ChevronDown className="ml-1 h-4 w-4" />
            </div>

            <div className="min-h-0 px-3 pb-2">
              <div className="flex flex-col">
                {threads.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-slate-300 bg-white px-4 py-5 text-sm text-slate-500">
                    Threads will appear here once you start a durable chat.
                  </div>
                ) : (
                  threads.map((thread) => {
                    const active = thread.id === activeThreadId;
                    return (
                      <button
                        key={thread.id}
                        type="button"
                        onClick={() => {
                          sendAbortControllerRef.current?.abort();
                          if (window.innerWidth < 1024) {
                            setSidebarOpen(false);
                          }
                          void navigateToThread(thread.id);
                        }}
                        className={cx(
                          'relative flex h-[38px] w-full items-center justify-between bg-transparent px-[10px] py-[6px] text-left',
                          styles.threadItem,
                          active ? styles.threadItemActive : ''
                        )}
                      >
                        <ThreadTitle thread={thread} />
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        </aside>
      </div>

      <div className="flex min-h-0 min-w-0 flex-1 overflow-hidden">
        <div className="flex min-h-0 min-w-0 flex-1 overflow-hidden">
          <div className="flex min-h-0 min-w-0 flex-1 flex-col">
            <header className="flex h-10 items-center justify-between px-2">
              <div className="flex min-w-0 items-center gap-3">
                {!sidebarOpen ? (
                  <IconButton icon={PanelLeftOpen} onClick={() => setSidebarOpen(true)} size="small" title="打开侧边栏" />
                ) : null}
                <ChatAvatar size={28} title={currentThreadTitle} />
                <div className="relative flex max-w-full flex-1 items-center gap-2 overflow-hidden">
                  <div className={styles.chatHeaderTitle}>{currentThreadTitle}</div>
                </div>
              </div>

              <div className="flex gap-1">
                <IconButton icon={Menu} onClick={() => setLogOpen((current) => !current)} size="small" title="切换日志面板" />
              </div>
            </header>

            <div ref={messagesViewportRef} className="relative flex min-h-0 flex-1 flex-col overflow-y-auto">
              <div className="min-h-0 flex-1 p-6">
                {!meta?.runtimeConfigured && meta?.runtimeConfigError ? (
                  <div className={clsx(`${maxWithTW} mx-auto mb-4 rounded-xl px-4 py-3 text-sm`, styles.warningBanner)}>{meta.runtimeConfigError}</div>
                ) : null}

                {durableRecoveryNotice ? (
                  <div className={clsx(`${maxWithTW} mx-auto mb-4 rounded-xl px-4 py-3 text-sm`, styles.infoBanner)}>{durableRecoveryNotice}</div>
                ) : null}

                {error ? <div className={clsx(`${maxWithTW} mx-auto mb-4 rounded-xl px-4 py-3 text-sm`, styles.errorBanner)}>{error}</div> : null}

                {loadingMessages ? (
                  <div className={`${maxWithTW} mx-auto flex min-h-full items-center`}>
                    <div className="flex items-center gap-3 px-4 py-3 text-sm text-slate-500">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span>Loading thread messages...</span>
                    </div>
                  </div>
                ) : messages.length === 0 ? (
                  <WelcomeMessage activeThreadId={activeThreadId} />
                ) : (
                  <div className={`${maxWithTW} mx-auto`}>
                    <div className="flex flex-col gap-3">
                      {messages.map((message) => (
                        <MessageCard key={message.id} message={message} />
                      ))}
                      {liveAssistantDraft && liveAssistantDraft.runId === liveStreamRunId ? (
                        <LiveAssistantCard liveAssistantDraft={liveAssistantDraft} />
                      ) : null}
                    </div>
                  </div>
                )}
              </div>

              <div className={clsx('sticky bottom-0 z-10 px-4 pb-4', styles.composerDock)}>
                <div className={`${composerMaxWithTW} mx-auto relative`}>
                  <div
                    className={clsx(
                      'absolute bottom-[calc(100%+16px)] left-1/2 z-[1] -translate-x-1/2 transition-transform transition-opacity duration-200 ease-out',
                      !showScrollToBottom && 'pointer-events-none translate-y-2 opacity-0'
                    )}
                  >
                    <button
                      type="button"
                      onClick={scrollToMessagesBottom}
                      className={clsx('flex h-[26px] w-[26px] items-center justify-center rounded-full', styles.scrollButton)}
                      aria-label="Scroll to bottom"
                    >
                      <ChevronDown className="h-4 w-4 text-slate-600" />
                    </button>
                  </div>

                    <form
                      className={styles.composerCard}
                      onSubmit={(event) => {
                      event.preventDefault();
                      if (sendingDisabled) {
                        return;
                      }

                      void sendMessage();
                    }}
                    >
                      <div className="flex flex-col">
                        <div className="px-4 py-3">
                        <textarea
                          ref={textareaRef}
                          value={draft}
                          onChange={(event) => setDraft(event.target.value)}
                          onKeyDown={(event) => {
                            if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
                              event.preventDefault();
                              if (!sendingDisabled) {
                                void sendMessage();
                              }
                            }
                          }}
                          rows={3}
                          placeholder={activeThreadId ? 'Send a prompt in this durable thread...' : 'Send the first prompt to create a durable thread...'}
                          disabled={!meta?.runtimeConfigured || sending || !selectedModelOption}
                          className={clsx('w-full resize-none overflow-y-auto text-sm leading-relaxed', styles.textarea)}
                          style={{
                            minHeight: '90px',
                            maxHeight: '220px'
                          }}
                        />
                      </div>

                        <div className="flex items-center justify-between px-3 py-1.5">
                          <div className="flex min-w-0 items-center gap-1">
                            <button type="button" disabled className="flex h-8 w-8 items-center justify-center rounded-full text-slate-300">
                              <Globe className="h-[18px] w-[18px]" />
                            </button>
                            <button type="button" disabled className="flex h-8 w-8 items-center justify-center rounded-full text-slate-300">
                              <Blocks className="h-[18px] w-[18px]" />
                            </button>
                            <button type="button" disabled className="flex h-8 w-8 items-center justify-center rounded-full text-slate-300">
                              <SlidersHorizontal className="h-[18px] w-[18px]" />
                            </button>
                            <label className="flex h-7 items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-2.5 text-xs text-slate-400">
                              {selectedModelOption?.provider ? <ProviderMonogram provider={selectedModelOption.provider} /> : null}
                              <select
                                value={selectedModelKey}
                                onChange={(event) => setSelectedModelKey(event.target.value)}
                                disabled={sending || !meta || meta.modelOptions.length === 0}
                                className="max-w-[170px] bg-transparent text-xs text-slate-500 outline-none"
                              >
                                {meta?.modelOptions.map((option) => (
                                  <option key={option.key} value={option.key}>
                                    {option.provider} · {option.model}
                                  </option>
                                ))}
                              </select>
                            </label>
                            <span className="flex h-7 items-center gap-1 rounded-md bg-slate-100 px-2.5 text-xs text-slate-400">
                              <Workflow className="h-[14px] w-[14px]" />
                              Artifacts（空）
                            </span>
                            <button type="button" disabled className="flex h-8 w-8 items-center justify-center rounded-full text-slate-300">
                              <Mic className="h-[18px] w-[18px]" />
                            </button>
                            <button type="button" disabled className="flex h-8 w-8 items-center justify-center rounded-full text-slate-300">
                              <Eraser className="h-[18px] w-[18px]" />
                            </button>
                          </div>

                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              disabled
                              className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-300"
                            >
                              <GalleryVerticalEnd className="h-4 w-4" />
                            </button>
                            <button
                              type="submit"
                              disabled={!sending && sendingDisabled}
                              onClick={(event) => {
                                if (sending) {
                                  event.preventDefault();
                                  sendAbortControllerRef.current?.abort();
                                  setSending(false);
                                  setLiveStreamRunId(null);
                                }
                              }}
                              className={clsx(
                                'flex h-8 w-8 items-center justify-center rounded-lg border transition',
                                sending
                                  ? 'border-rose-200 text-rose-600'
                                  : draft.trim()
                                    ? 'border-slate-300 text-slate-500'
                                    : 'border-slate-200 text-slate-300',
                                !sending && sendingDisabled && 'cursor-not-allowed opacity-60'
                              )}
                            >
                              {sending ? <CircleStop className="h-4 w-4" /> : <Send className="h-4 w-4" />}
                            </button>
                          </div>
                        </div>
                      </div>
                  </form>
                </div>
              </div>
            </div>
          </div>

          <aside
            className={clsx(
              'hidden min-h-0 shrink-0 xl:flex xl:flex-col',
              logOpen ? 'w-[360px] border-l border-slate-200' : 'w-0 overflow-hidden border-l-0',
              styles.logPane
            )}
          >
            <header className="border-b border-slate-200 px-5 py-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-slate-900">Durable log</p>
                  <p className="mt-1 text-xs text-slate-500">Runs, tools, and timeline events stay visible here.</p>
                </div>
                <Workflow className="h-4 w-4 text-slate-400" />
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                <span className={clsx('rounded-full px-3 py-1 text-xs', styles.badge)}>DB: {meta?.dbMode ?? 'loading'}</span>
                <span className={clsx('rounded-full px-3 py-1 text-xs', styles.badge)}>Provider: {meta?.runtimeProvider ?? 'loading'}</span>
                <span className={clsx('rounded-full px-3 py-1 text-xs', styles.badge)}>Model: {meta?.runtimeModel ?? 'loading'}</span>
              </div>
            </header>

            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
              <div className="space-y-4">
                <section className={clsx('rounded-2xl p-4', styles.secondarySurface)}>
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Recent runs</p>
                      <p className="mt-1 text-sm text-slate-600">Switch the log between durable runs for this thread.</p>
                    </div>
                    <span className="rounded-full bg-slate-100 px-2 py-1 text-[11px] font-medium text-slate-600">{recentRuns.length}</span>
                  </div>

                  {recentRunsLoading ? <p className="mt-3 text-sm text-slate-500">Loading recent runs...</p> : null}
                  {recentRunsError ? <div className="mt-3 rounded-2xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">{recentRunsError}</div> : null}

                  {!recentRunsLoading && !recentRunsError && activeThreadId && recentRuns.length === 0 ? (
                    <div className="mt-3 rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-3 py-3 text-sm text-slate-500">
                      No runs yet for this thread.
                    </div>
                  ) : null}

                  {!recentRunsLoading && recentRuns.length > 0 ? (
                    <div className="mt-3 max-h-60 space-y-2 overflow-y-auto pr-1">
                      {recentRuns.map((run) => {
                        const selected = run.id === selectedRunId;
                        const live = run.id === liveStreamRunId;

                        return (
                          <button
                            key={run.id}
                            type="button"
                            onClick={() => {
                              void loadRunTimeline(run.id);
                            }}
                            className={clsx(
                              'w-full rounded-2xl border px-3 py-3 text-left text-sm transition',
                              selected ? 'border-sky-300 bg-sky-50 shadow-sm' : 'border-slate-200 bg-white hover:bg-slate-50'
                            )}
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <p className="truncate font-medium text-slate-900">{run.model ?? 'unknown model'}</p>
                                <p className="truncate text-xs text-slate-500">
                                  {run.provider ?? 'unknown provider'} · {formatDateTime(run.createdAt)}
                                </p>
                              </div>
                              <div className="flex flex-col items-end gap-1">
                                <span className={clsx('rounded-full px-2 py-1 text-[10px] font-medium uppercase tracking-wide', statusBadgeTone(run.status))}>
                                  {run.status}
                                </span>
                                {live ? <span className="text-[10px] font-medium uppercase tracking-wide text-sky-600">live</span> : null}
                              </div>
                            </div>
                            <p className="mt-2 truncate text-xs text-slate-500">{run.id}</p>
                            {run.error ? <p className="mt-2 break-words text-xs text-rose-700">{run.error}</p> : null}
                          </button>
                        );
                      })}
                    </div>
                  ) : null}
                </section>

                <section className={clsx('rounded-2xl p-4', styles.secondarySurface)}>
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Current run</p>
                      <p className="mt-1 break-all text-sm font-semibold text-slate-900">{selectedRunId ?? 'No run selected'}</p>
                    </div>
                    <span className={clsx('rounded-full px-3 py-1 text-xs font-medium uppercase tracking-wide', statusBadgeTone(selectedRun?.status ?? 'idle'))}>
                      {selectedRun?.status ?? 'idle'}
                    </span>
                  </div>

                  <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Provider</dt>
                      <dd className="mt-1 text-slate-900">{selectedRun?.provider ?? 'n/a'}</dd>
                    </div>
                    <div>
                      <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Model</dt>
                      <dd className="mt-1 text-slate-900">{selectedRun?.model ?? 'n/a'}</dd>
                    </div>
                    <div>
                      <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Started</dt>
                      <dd className="mt-1 text-slate-900">{selectedRun?.startedAt ? formatDateTime(selectedRun.startedAt) : 'n/a'}</dd>
                    </div>
                    <div>
                      <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Finished</dt>
                      <dd className="mt-1 text-slate-900">{selectedRun?.finishedAt ? formatDateTime(selectedRun.finishedAt) : 'n/a'}</dd>
                    </div>
                    <div>
                      <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Duration</dt>
                      <dd className="mt-1 text-slate-900">{selectedRun ? formatDuration(selectedRun.startedAt, selectedRun.finishedAt) : 'n/a'}</dd>
                    </div>
                    <div>
                      <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Counts</dt>
                      <dd className="mt-1 text-slate-900">{runEvents.length} events · {toolInvocations.length} tools</dd>
                    </div>
                  </dl>

                  {selectedRun?.error ? (
                    <div className="mt-3 rounded-2xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">{selectedRun.error}</div>
                  ) : null}
                </section>

                {timelineLoading ? <p className="text-sm text-slate-500">Loading run timeline...</p> : null}
                {timelineError ? <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{timelineError}</div> : null}

                {!timelineLoading && !timelineError && !selectedRunId ? (
                  <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-4 py-4 text-sm text-slate-600">
                    Select a thread or start a run to inspect durable logs.
                  </div>
                ) : null}

                {(toolInvocations.length > 0 || selectedRunId) && (
                  <section className="space-y-3">
                    <header className="flex items-center justify-between">
                      <h3 className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Tools</h3>
                      <span className="text-xs text-slate-400">{toolInvocations.length}</span>
                    </header>
                    <div className="space-y-3">
                      {toolInvocations.length === 0 ? (
                        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-3 text-sm text-slate-500">
                          No tool activity for this run.
                        </div>
                      ) : (
                        toolInvocations.map((invocation) => <ToolRow key={invocation.id} invocation={invocation} />)
                      )}
                    </div>
                  </section>
                )}

                {(runEvents.length > 0 || selectedRunId) && (
                  <section className="space-y-3">
                    <header className="flex items-center justify-between">
                      <h3 className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Events</h3>
                      <span className="text-xs text-slate-400">{runEvents.length}</span>
                    </header>
                    <div className="space-y-3">
                      {runEvents.length === 0 ? (
                        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-3 text-sm text-slate-500">
                          No run events for this run.
                        </div>
                      ) : (
                        runEvents.map((event) => <EventRow key={event.id} event={event} />)
                      )}
                    </div>
                  </section>
                )}
              </div>
            </div>
          </aside>
        </div>
      </div>
    </main>
  );
}
