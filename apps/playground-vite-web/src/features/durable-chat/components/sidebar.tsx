import type { ThreadDto } from '@agent-infra/contracts';
import clsx from 'clsx';
import { ChevronDown, MessageSquarePlus, PanelLeftClose } from 'lucide-react';
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
          <div className={clsx('flex h-full min-h-0 min-w-0 flex-col overflow-hidden', ui.sidebar)}>
            <div className="flex shrink-0 items-center justify-between px-4 pt-2">
              <h1 className="mb-2 text-3xl font-bold tracking-tight text-slate-900">Forma</h1>
              <IconButton icon={PanelLeftClose} onClick={onClose} title="关闭侧边栏" />
            </div>

            <aside className="px-2 pb-2">
              <button
                type="button"
                className={clsx('flex h-9 w-full items-center gap-2 bg-transparent px-[10px] py-[6px] text-sm', ui.navItem)}
                onClick={onNewChat}
              >
                <MessageSquarePlus size={18} />
                <span>新聊天</span>
              </button>
            </aside>

            <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-2">
              <button
                type="button"
                onClick={() => setThreadsExpanded((current) => !current)}
                className="mb-1 flex w-full items-center px-2 py-1 text-left text-xs text-slate-400 transition hover:text-slate-500"
              >
                <span>聊天</span>
                <ChevronDown className={clsx('ml-1 h-4 w-4 transition-transform', !threadsExpanded && '-rotate-90')} />
              </button>

              <div className="flex flex-col">
                {!threadsExpanded || threads.length === 0
                  ? null
                  : threads.map((thread) => {
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
                        </button>
                      );
                    })}
              </div>
            </div>
          </div>
        </aside>
      </div>
    </>
  );
}
