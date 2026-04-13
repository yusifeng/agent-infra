'use client';

import type { ThreadDto } from '@agent-infra/contracts';
import clsx from 'clsx';
import { ChevronDown, Library, MessageSquarePlus, PanelLeftClose, Search, X } from 'lucide-react';
import { useState } from 'react';

import { IconButton } from './shared';
import { ui } from './ui';

function ThreadTitle({ thread }: { thread: ThreadDto }) {
  const title = thread.title?.trim() || 'Untitled thread';
  return (
    <div className="flex min-w-0 flex-1 items-center gap-2">
      <span className="overflow-hidden text-ellipsis whitespace-nowrap text-sm leading-[1.2]">
        {title}
      </span>
    </div>
  );
}

type ChatSidebarProps = {
  sidebarOpen: boolean;
  threads: ThreadDto[];
  activeThreadId: string | null;
  onClose: () => void;
  onNewChat: () => void;
  onOpenThread: (threadId: string) => void;
};

export function ChatSidebar({
  sidebarOpen,
  threads,
  activeThreadId,
  onClose,
  onNewChat,
  onOpenThread
}: ChatSidebarProps) {
  const [threadsExpanded, setThreadsExpanded] = useState(true);

  return (
    <>
      {sidebarOpen ? (
        <div className="fixed inset-0 z-20 bg-slate-950/30 backdrop-blur-sm lg:hidden" onClick={onClose} />
      ) : null}

      <div
        className={clsx(
          'relative shrink-0 overflow-hidden transition-[width] duration-300 ease-out',
          sidebarOpen ? 'w-[276px]' : 'w-0'
        )}
      >
        <aside
          className={clsx(
            'absolute inset-y-0 left-0 z-30 flex w-[276px] flex-col overflow-hidden transition-transform duration-300 ease-out',
            sidebarOpen ? 'translate-x-0' : '-translate-x-full'
          )}
        >
          <div className={clsx('h-full min-w-0 overflow-y-auto', ui.sidebar)}>
            <div className="flex shrink-0 items-center justify-between px-4 pt-2">
              <h1 className="mb-2 text-3xl font-bold tracking-tight text-slate-900">Forma</h1>
              <IconButton icon={PanelLeftClose} onClick={onClose} title="关闭侧边栏" />
            </div>

            <aside className="sticky z-20 px-2 pb-5" style={{ top: 0 }}>
              <button
                type="button"
                className={clsx('flex h-9 w-full items-center gap-2 bg-transparent px-[10px] py-[6px] text-sm', ui.navItem)}
                onClick={onNewChat}
              >
                <MessageSquarePlus size={18} />
                <span>新聊天</span>
              </button>
              <button
                type="button"
                disabled
                className={clsx('mt-1 flex h-9 w-full items-center gap-2 bg-transparent px-[10px] py-[6px] text-sm', ui.navItem)}
              >
                <Search size={18} />
                <span>搜索聊天</span>
              </button>
              <button
                type="button"
                disabled
                className={clsx('mt-1 flex h-9 w-full items-center gap-2 bg-transparent px-[10px] py-[6px] text-sm', ui.navItem)}
              >
                <Library size={18} />
                <span>库</span>
              </button>
            </aside>

            <button
              type="button"
              onClick={() => setThreadsExpanded((current) => !current)}
              className="mb-1 flex w-full items-center px-5 py-1 text-left text-xs text-slate-400 transition hover:text-slate-500"
            >
              <span>聊天</span>
              <ChevronDown className={clsx('ml-1 h-4 w-4 transition-transform', !threadsExpanded && '-rotate-90')} />
            </button>

            <div className="min-h-0 px-3 pb-2">
              <div className="flex flex-col">
                {!threadsExpanded ? null : threads.length === 0 ? (
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
                        onClick={() => onOpenThread(thread.id)}
                        className={clsx(
                          'group relative flex h-[38px] w-full items-center justify-between bg-transparent px-[10px] py-[6px] text-left',
                          ui.threadItem,
                          active && ui.threadItemActive
                        )}
                      >
                        <ThreadTitle thread={thread} />
                        <div className={ui.threadAction} onClick={(event) => event.stopPropagation()}>
                          <span className="flex h-5 w-5 items-center justify-center rounded-md text-slate-400">
                            <X className="h-3.5 w-3.5" />
                          </span>
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        </aside>
      </div>
    </>
  );
}
