import clsx from 'clsx';
import {
  Archive,
  ChevronDown,
  PanelLeftClose,
  MoreHorizontal,
  MessageSquarePlus,
  PencilLine,
  Pin,
  PinOff,
  Share2
} from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import type { DurableThreadDto } from '@/features/durable-chat/types/thread';

import { ChatAvatar, IconButton } from './shared';
import { ui } from './ui';

function ThreadTitle({ thread }: { thread: DurableThreadDto }) {
  const title = thread.title?.trim() || 'New Thread';
  return <span className="overflow-hidden text-ellipsis whitespace-nowrap text-[15px] leading-[1.2]">{title}</span>;
}

function formatGroupLabel(date: Date) {
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfYesterday = new Date(startOfToday);
  startOfYesterday.setDate(startOfYesterday.getDate() - 1);
  const startOfWeek = new Date(startOfToday);
  startOfWeek.setDate(startOfWeek.getDate() - 7);

  if (date >= startOfToday) {
    return '今天';
  }

  if (date >= startOfYesterday) {
    return '昨天';
  }

  if (date >= startOfWeek) {
    return '7 天内';
  }

  return '更早';
}

type ChatSidebarProps = {
  sidebarOpen: boolean;
  threads: DurableThreadDto[];
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
  const [historyExpanded, setHistoryExpanded] = useState(true);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const pinnedSet = new Set(pinnedThreadIds);

  const groupedThreads = useMemo(() => {
    const activeThreads = threads.filter((thread) => thread.status === 'active');
    const pinnedThreads = activeThreads.filter((thread) => pinnedSet.has(thread.id));
    const unpinnedThreads = activeThreads.filter((thread) => !pinnedSet.has(thread.id));

    const groups = new Map<string, DurableThreadDto[]>();
    for (const thread of unpinnedThreads) {
      const label = formatGroupLabel(new Date(thread.updatedAt));
      const current = groups.get(label) ?? [];
      current.push(thread);
      groups.set(label, current);
    }

    const orderedGroupLabels = ['今天', '昨天', '7 天内', '更早'];
    const groupedUnpinned = orderedGroupLabels
      .map((label) => ({
        label,
        threads: groups.get(label) ?? []
      }))
      .filter((group) => group.threads.length > 0);

    return { pinnedThreads, groupedUnpinned };
  }, [pinnedSet, threads]);

  return (
    <>
      {sidebarOpen ? (
        <div className="fixed inset-0 z-20 bg-[color:var(--chat-overlay)] backdrop-blur-sm lg:hidden" onClick={onClose} />
      ) : null}

      <div
        className={clsx(
          'relative shrink-0 overflow-hidden transition-[width] duration-300 ease-out',
          sidebarOpen ? 'w-[261px]' : 'w-0'
        )}
      >
        <aside
          className={clsx(
            'absolute inset-y-0 left-0 z-30 flex w-[261px] flex-col overflow-hidden transition-transform duration-300 ease-out',
            sidebarOpen ? 'translate-x-0' : '-translate-x-full'
          )}
        >
          <div className={clsx('flex h-full min-h-0 min-w-0 flex-col overflow-hidden bg-[var(--chat-sidebar-bg)]', ui.sidebar)}>
            <div className="flex shrink-0 items-center justify-between px-3 pt-4">
              <ChatAvatar title="DeepSeek" />
              <IconButton icon={PanelLeftClose} onClick={onClose} title="收起侧边栏" />
            </div>

            <aside className="px-3 pb-3 pt-6">
              <button
                type="button"
                className="flex h-10 w-full items-center justify-center gap-2 rounded-full border border-[color:var(--chat-border)] bg-[var(--chat-surface)] px-3 text-[14px] font-semibold text-[color:var(--chat-text)] shadow-[0_1px_0_rgba(255,255,255,0.75),0_1px_3px_rgba(15,23,42,0.04)] transition hover:border-[color:var(--chat-border-strong)]"
                onClick={onNewChat}
              >
                <MessageSquarePlus size={16} strokeWidth={2.2} />
                <span>开启新对话</span>
              </button>
            </aside>

            <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-3">
              <Section title="置顶" empty={!groupedThreads.pinnedThreads.length}>
                {groupedThreads.pinnedThreads.map((thread) => (
                  <ThreadRow
                    key={thread.id}
                    thread={thread}
                    active={thread.id === activeThreadId}
                    pinned
                    menuOpen={openThreadMenuId === thread.id}
                    onOpenThread={onOpenThread}
                    onOpenThreadMenu={onOpenThreadMenu}
                    onCloseThreadMenu={onCloseThreadMenu}
                    onRenameThread={onRenameThread}
                    onTogglePinThread={onTogglePinThread}
                    onShareThread={onShareThread}
                    onArchiveThread={onArchiveThread}
                  />
                ))}
              </Section>

              {groupedThreads.groupedUnpinned.map((group) => (
                <Section key={group.label} title={group.label} empty={group.threads.length === 0}>
                  {group.threads.map((thread) => (
                    <ThreadRow
                      key={thread.id}
                      thread={thread}
                      active={thread.id === activeThreadId}
                      pinned={false}
                      menuOpen={openThreadMenuId === thread.id}
                      onOpenThread={onOpenThread}
                      onOpenThreadMenu={onOpenThreadMenu}
                      onCloseThreadMenu={onCloseThreadMenu}
                      onRenameThread={onRenameThread}
                      onTogglePinThread={onTogglePinThread}
                      onShareThread={onShareThread}
                      onArchiveThread={onArchiveThread}
                    />
                  ))}
                </Section>
              ))}

              <button
                type="button"
                onClick={() => setHistoryExpanded((current) => !current)}
                className="mt-1 flex w-full items-center justify-between px-1 py-2 text-left text-xs font-semibold text-[color:var(--chat-text-tertiary)]"
              >
                <span>更多历史</span>
                <ChevronDown className={clsx('h-4 w-4 transition-transform', !historyExpanded && '-rotate-90')} />
              </button>

              {historyExpanded ? null : null}
            </div>

            <div className="shrink-0 border-t border-[color:var(--chat-border)] px-3 py-4">
              <button
                type="button"
                onClick={() => setAccountMenuOpen((current) => !current)}
                className="flex w-full items-center justify-between rounded-2xl px-2 py-1.5 text-left transition hover:bg-[var(--chat-hover)]"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-full bg-[#dcedb8] text-sm font-semibold text-[#7a8b39]">
                    A
                  </div>
                  <div className="min-w-0">
                    <div className="truncate text-[15px] font-medium text-[color:var(--chat-text)]">工作区</div>
                    <div className="truncate text-xs text-[color:var(--chat-text-tertiary)]">账户与设置</div>
                  </div>
                </div>
                <ChevronDown className={clsx('h-4 w-4 shrink-0 text-[color:var(--chat-text-tertiary)] transition-transform', accountMenuOpen && 'rotate-180')} />
              </button>
            </div>
          </div>
        </aside>
      </div>
    </>
  );
}

function Section({
  title,
  empty,
  hideTitle = false,
  children
}: {
  title: string;
  empty: boolean;
  hideTitle?: boolean;
  children: ReactNode;
}) {
  if (empty) {
    return null;
  }

  return (
    <section className="mb-5">
      {hideTitle ? null : <div className="px-1 pb-2 text-[15px] font-semibold text-[color:var(--chat-text-tertiary)]">{title}</div>}
      <div className="flex flex-col gap-1">{children}</div>
    </section>
  );
}

function ThreadRow({
  thread,
  active,
  pinned,
  menuOpen,
  onOpenThread,
  onOpenThreadMenu,
  onCloseThreadMenu,
  onRenameThread,
  onTogglePinThread,
  onShareThread,
  onArchiveThread
}: {
  thread: DurableThreadDto;
  active: boolean;
  pinned: boolean;
  menuOpen: boolean;
  onOpenThread: (threadId: string) => void;
  onOpenThreadMenu: (threadId: string) => void;
  onCloseThreadMenu: () => void;
  onRenameThread: (threadId: string) => void;
  onTogglePinThread: (threadId: string, pinned: boolean) => void;
  onShareThread: (threadId: string) => void;
  onArchiveThread: (threadId: string) => void;
}) {
  return (
    <div
      className={clsx(
        'group relative flex h-10 w-full items-center justify-between rounded-2xl px-3 transition',
        active ? 'bg-[#dce7ff] text-[#3867ff]' : 'text-[color:var(--chat-text)] hover:bg-[color:var(--chat-hover)]'
      )}
    >
      <button type="button" onClick={() => onOpenThread(thread.id)} data-thread-id={thread.id} className="flex min-w-0 flex-1 items-center text-left">
        {pinned ? <Pin className="h-3.5 w-3.5 shrink-0 text-[color:var(--chat-text-tertiary)]" /> : null}
        <ThreadTitle thread={thread} />
      </button>
      <DropdownMenu
        open={menuOpen}
        onOpenChange={(nextOpen) => {
          if (nextOpen) {
            onOpenThreadMenu(thread.id);
          } else {
            onCloseThreadMenu();
          }
        }}
      >
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label="会话操作"
            title="会话操作"
            data-thread-menu-button={thread.id}
            className={clsx('ml-2 shrink-0 opacity-0 transition group-hover:opacity-100', menuOpen && 'opacity-100')}
          >
            <MoreHorizontal className="h-[14px] w-[14px]" />
          </Button>
        </DropdownMenuTrigger>

        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => onRenameThread(thread.id)}>
            <PencilLine className="h-4 w-4" />
            <span>重命名</span>
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => onTogglePinThread(thread.id, pinned)}>
            {pinned ? <PinOff className="h-4 w-4" /> : <Pin className="h-4 w-4" />}
            <span>{pinned ? '取消置顶' : '置顶'}</span>
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => onShareThread(thread.id)}>
            <Share2 className="h-4 w-4" />
            <span>分享</span>
          </DropdownMenuItem>
          <DropdownMenuItem variant="destructive" onSelect={() => onArchiveThread(thread.id)}>
            <Archive className="h-4 w-4" />
            <span>删除</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
