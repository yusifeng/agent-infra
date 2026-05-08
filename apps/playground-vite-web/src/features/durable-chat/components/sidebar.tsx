import type { ThreadDto } from '@agent-infra/contracts';
import clsx from 'clsx';
import { Archive, ChevronDown, MoreHorizontal, MessageSquarePlus, PanelLeftClose, PencilLine, Pin, PinOff, Share2 } from 'lucide-react';
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
  pinnedThreadIds: string[];
  activeThreadId: string | null;
  openThreadMenuId: string | null;
  onClose: () => void;
  onNewChat: () => void;
  onOpenThread: (threadId: string) => void;
  onOpenThreadMenu: (threadId: string) => void;
  onCloseThreadMenu: () => void;
  onRenameThread: (threadId: string) => void;
  onTogglePinThread: (threadId: string, pinned: boolean) => void;
  onShareThread: (threadId: string) => void;
  onArchiveThread: (threadId: string) => void;
};

export function ChatSidebar({
  sidebarOpen,
  threads,
  pinnedThreadIds,
  activeThreadId,
  openThreadMenuId,
  onClose,
  onNewChat,
  onOpenThread,
  onOpenThreadMenu,
  onCloseThreadMenu,
  onRenameThread,
  onTogglePinThread,
  onShareThread,
  onArchiveThread
}: ChatSidebarProps) {
  const [threadsExpanded, setThreadsExpanded] = useState(true);
  const pinnedSet = new Set(pinnedThreadIds);

  return (
    <>
      {sidebarOpen ? (
        <div className="fixed inset-0 z-20 bg-[color:var(--chat-overlay)] backdrop-blur-sm lg:hidden" onClick={onClose} />
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
              <h1 className="mb-2 text-3xl font-bold tracking-tight text-[color:var(--chat-text)]">Forma</h1>
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
                className="mb-1 flex w-full items-center px-2 py-1 text-left text-xs text-[color:var(--chat-text-tertiary)] transition hover:text-[color:var(--chat-text-secondary)]"
              >
                <span>聊天</span>
                <ChevronDown className={clsx('ml-1 h-4 w-4 transition-transform', !threadsExpanded && '-rotate-90')} />
              </button>

              <div className="flex flex-col">
                {!threadsExpanded || threads.length === 0
                  ? null
                  : threads.map((thread) => {
                      const active = thread.id === activeThreadId;
                      const pinned = pinnedSet.has(thread.id);
                      const menuOpen = openThreadMenuId === thread.id;
                      return (
                        <div
                          key={thread.id}
                          className={clsx(
                            'group relative flex h-[38px] w-full items-center justify-between px-[10px] py-[6px]',
                            ui.threadItem,
                            active && ui.threadItemActive
                          )}
                        >
                          <button
                            type="button"
                            onClick={() => onOpenThread(thread.id)}
                            data-thread-id={thread.id}
                            className="flex min-w-0 flex-1 items-center gap-2 text-left"
                          >
                            {pinned ? <Pin className="h-3.5 w-3.5 shrink-0 text-[color:var(--chat-text-tertiary)]" /> : null}
                            <ThreadTitle thread={thread} />
                          </button>
                          <div className="relative ml-2 shrink-0">
                            <IconButton
                              icon={MoreHorizontal}
                              title="会话操作"
                              size="small"
                              className={clsx('opacity-0 group-hover:opacity-100', menuOpen && 'opacity-100')}
                              data-thread-menu-button={thread.id}
                              onClick={() => {
                                if (menuOpen) {
                                  onCloseThreadMenu();
                                } else {
                                  onOpenThreadMenu(thread.id);
                                }
                              }}
                            />

                            {menuOpen ? (
                              <div className="absolute right-0 top-[calc(100%+8px)] z-20 w-44 rounded-2xl border border-slate-200 bg-white p-1.5 shadow-[0_18px_60px_rgba(15,23,42,0.18)]">
                                <button
                                  type="button"
                                  onClick={() => onRenameThread(thread.id)}
                                  className="flex h-10 w-full items-center gap-3 rounded-xl px-3 text-sm text-slate-700 transition hover:bg-slate-100"
                                >
                                  <PencilLine className="h-4 w-4" />
                                  <span>重命名</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => onTogglePinThread(thread.id, pinned)}
                                  className="flex h-10 w-full items-center gap-3 rounded-xl px-3 text-sm text-slate-700 transition hover:bg-slate-100"
                                >
                                  {pinned ? <PinOff className="h-4 w-4" /> : <Pin className="h-4 w-4" />}
                                  <span>{pinned ? '取消置顶' : '置顶'}</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => onShareThread(thread.id)}
                                  className="flex h-10 w-full items-center gap-3 rounded-xl px-3 text-sm text-slate-700 transition hover:bg-slate-100"
                                >
                                  <Share2 className="h-4 w-4" />
                                  <span>分享</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => onArchiveThread(thread.id)}
                                  className="flex h-10 w-full items-center gap-3 rounded-xl px-3 text-sm text-red-600 transition hover:bg-red-50"
                                >
                                  <Archive className="h-4 w-4" />
                                  <span>删除</span>
                                </button>
                              </div>
                            ) : null}
                          </div>
                        </div>
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
