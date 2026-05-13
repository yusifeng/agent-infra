'use client';

import type { MessageDto } from '@agent-infra/contracts';
import clsx from 'clsx';
import { PanelLeftOpen } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';

import { ChatMessageList } from './chat-shell/message-list';
import { ReplayControlBar } from './chat-shell/replay-control-bar';
import { ChatSidebar } from './chat-shell/sidebar';
import { IconButton } from './chat-shell/shared';
import { ui } from './chat-shell/ui';
import type { AuthUserDto } from '@/features/auth/dto/project-auth-user-dto';
import { fetchReplayThreadBasis } from '@/features/durable-chat/repo/replay-api';
import type { PlaygroundThreadDto } from '@/features/durable-chat/repo/chat-api';

type ReplayStatus = 'idle' | 'playing' | 'paused' | 'completed';

type ReplayConsoleProps = {
  currentUser: AuthUserDto;
  initialThreadId: string;
  onLogout: () => void;
};

const REPLAY_STEP_DELAY_MS = 700;

export function ReplayConsole({ currentUser, initialThreadId, onLogout }: ReplayConsoleProps) {
  const router = useRouter();
  const timerRef = useRef<number | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [threads, setThreads] = useState<PlaygroundThreadDto[]>([]);
  const [messages, setMessages] = useState<MessageDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<ReplayStatus>('idle');
  const [cursor, setCursor] = useState(-1);

  const activeThread = useMemo(
    () => threads.find((thread) => thread.id === initialThreadId) ?? null,
    [initialThreadId, threads]
  );
  const currentThreadTitle = activeThread?.title?.trim() || initialThreadId || 'Replay';
  const visibleMessages = useMemo(
    () => (cursor < 0 ? [] : messages.slice(0, Math.min(cursor + 1, messages.length))),
    [cursor, messages]
  );

  useEffect(() => {
    if (typeof window !== 'undefined' && window.innerWidth < 1024) {
      setSidebarOpen(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    setStatus('idle');
    setCursor(-1);
    setMessages([]);

    void fetchReplayThreadBasis(initialThreadId, controller.signal)
      .then((result) => {
        if (controller.signal.aborted) {
          return;
        }

        if (!result.ok || !result.data) {
          throw new Error(result.error ?? `Failed to load replay thread (${result.status})`);
        }

        setThreads(result.data.threads);
        setMessages(result.data.messages);
      })
      .catch((loadError) => {
        if (controller.signal.aborted) {
          return;
        }
        setError(loadError instanceof Error ? loadError.message : 'Failed to load replay thread');
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      });

    return () => {
      controller.abort();
    };
  }, [initialThreadId]);

  useEffect(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }

    if (status !== 'playing') {
      return;
    }

    if (messages.length === 0) {
      setStatus('completed');
      return;
    }

    if (cursor < 0) {
      setCursor(0);
      return;
    }

    if (cursor >= messages.length - 1) {
      setStatus('completed');
      return;
    }

    timerRef.current = window.setTimeout(() => {
      setCursor((current) => Math.min(current + 1, messages.length - 1));
      timerRef.current = null;
    }, REPLAY_STEP_DELAY_MS);

    return () => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [cursor, messages.length, status]);

  function play() {
    if (messages.length === 0) {
      return;
    }
    setStatus('playing');
  }

  function pause() {
    setStatus((current) => (current === 'playing' ? 'paused' : current));
  }

  function resume() {
    setStatus((current) => (current === 'paused' ? 'playing' : current));
  }

  function restart() {
    setCursor(-1);
    setStatus('idle');
  }

  function stepForward() {
    setStatus('paused');
    setCursor((current) => {
      if (messages.length === 0) {
        return -1;
      }
      return Math.min(current + 1, messages.length - 1);
    });
  }

  return (
    <main className={clsx('flex h-full min-h-0 overflow-hidden', ui.shell)}>
      <ChatSidebar
        sidebarOpen={sidebarOpen}
        threads={threads}
        activeThreadId={initialThreadId}
        currentUser={currentUser}
        onClose={() => setSidebarOpen(false)}
        onNewChat={() => router.push('/new')}
        onOpenThread={(threadId) => router.push(`/replay/${threadId}`)}
        onLogout={onLogout}
      />

      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <header className="z-[11] flex h-10 min-h-10 max-h-10 items-center justify-between border-b border-slate-200 px-2">
          <div className="flex min-w-0 items-center gap-3">
            {!sidebarOpen ? <IconButton icon={PanelLeftOpen} onClick={() => setSidebarOpen(true)} size="small" title="打开侧边栏" /> : null}
            <div className={clsx(ui.chatHeaderTitle)}>{currentThreadTitle}</div>
          </div>
          <button
            type="button"
            className="rounded-md px-2 py-1 text-xs text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
            onClick={() => router.push(`/chat/${initialThreadId}`)}
          >
            Open chat
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto">
          <ChatMessageList
            meta={null}
            error={error}
            durableRecoveryState={{ phase: 'idle', message: null }}
            hasOlderMessages={false}
            historyLoading={false}
            loadingMessages={loading}
            activeThreadId={initialThreadId}
            messages={visibleMessages}
            liveAssistantDraft={null}
            showLoadingText={false}
            centeredEmptyState={!loading && visibleMessages.length === 0}
            onLoadOlderMessages={() => undefined}
          />
        </div>

        <ReplayControlBar
          currentStep={cursor}
          totalSteps={messages.length}
          status={status}
          onPause={pause}
          onPlay={play}
          onRestart={restart}
          onResume={resume}
          onStepForward={stepForward}
        />
      </div>
    </main>
  );
}
