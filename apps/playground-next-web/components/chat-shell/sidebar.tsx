import clsx from 'clsx';
import {
  Archive,
  ChevronDown,
  LogOut,
  PanelLeft,
  MoreHorizontal,
  MessageSquarePlus,
  PencilLine,
  Pin,
  PinOff,
  Settings2,
  Share2
} from 'lucide-react';
import { memo, useMemo, useState, type ReactNode } from 'react';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import type { AuthUserDto } from '@/features/auth/dto/project-auth-user-dto';
import type { PlaygroundThreadDto } from '@/features/durable-chat/repo/chat-api';
import { buildThreadSidebarGroups } from '@/features/durable-chat/service/thread-sidebar-groups';

import { ChatAvatar, IconButton } from './shared';
import { ui } from './ui';

function ThreadTitle({ thread }: { thread: PlaygroundThreadDto }) {
  const title = thread.title?.trim() || 'New Thread';
  return <span className="truncate text-[length:var(--chat-sidebar-item-font-size)] leading-[1.2]" title={title}>{title}</span>;
}

type ChatSidebarProps = {
  sidebarOpen: boolean;
  currentUser: AuthUserDto | null;
  threads: PlaygroundThreadDto[];
  pinnedThreadIds?: string[];
  activeThreadId: string | null;
  openThreadMenuId?: string | null;
  onClose: () => void;
  onLogout?: () => void | Promise<void>;
  onNewChat: () => void;
  onOpenThread: (threadId: string, title?: string | null) => void;
  onOpenThreadMenu?: (threadId: string) => void;
  onCloseThreadMenu?: () => void;
  onRenameThread?: (threadId: string) => void;
  onTogglePinThread?: (threadId: string, pinned: boolean) => void;
  onShareThread?: (threadId: string) => void;
  onArchiveThread?: (threadId: string) => void;
};

export const ChatSidebar = memo(function ChatSidebar({
  sidebarOpen,
  currentUser,
  threads,
  pinnedThreadIds,
  activeThreadId,
  openThreadMenuId = null,
  onClose,
  onLogout,
  onNewChat,
  onOpenThread,
  onOpenThreadMenu = () => {},
  onCloseThreadMenu = () => {},
  onRenameThread = () => {},
  onTogglePinThread = () => {},
  onShareThread = () => {},
  onArchiveThread = () => {}
}: ChatSidebarProps) {
  const [historyExpanded, setHistoryExpanded] = useState(true);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);

  const groupedThreads = useMemo(() => buildThreadSidebarGroups(threads, { pinnedThreadIds }), [pinnedThreadIds, threads]);
  const visibleUnpinnedGroups = historyExpanded
    ? groupedThreads.groupedUnpinned
    : groupedThreads.groupedUnpinned.filter((group) => group.label !== '更早');
  const hasOlderHistoryGroup = groupedThreads.groupedUnpinned.some((group) => group.label === '更早');

  return (
    <>
      {sidebarOpen ? (
        <div className="fixed inset-0 z-20 bg-[color:var(--chat-overlay)] backdrop-blur-sm lg:hidden" onClick={onClose} />
      ) : null}

      <div
        className={clsx(
          'relative shrink-0 overflow-hidden transition-[width] duration-300 ease-out',
          sidebarOpen ? 'w-[var(--chat-sidebar-width)]' : 'w-0'
        )}
      >
        <aside
          className={clsx(
            'absolute inset-y-0 left-0 z-30 flex w-[var(--chat-sidebar-width)] flex-col overflow-hidden transition-transform duration-300 ease-out',
            sidebarOpen ? 'translate-x-0' : '-translate-x-full'
          )}
        >
          <div className={clsx('flex h-full min-h-0 min-w-0 flex-col overflow-hidden bg-[var(--chat-sidebar-bg)]', ui.sidebar)}>
            <div className="flex shrink-0 items-center justify-between px-3 pt-4">
              <ChatAvatar title="DeepSeek" />
              <IconButton
                className="text-[color:var(--chat-sidebar-icon)] hover:bg-[color:var(--chat-sidebar-item-hover-bg)] hover:text-[color:var(--chat-sidebar-text)]"
                icon={PanelLeft}
                onClick={onClose}
                title="收起侧边栏"
              />
            </div>

            <aside className="px-3 pb-3 pt-6">
              <button
                type="button"
                className="chat-sidebar-new-chat-button flex h-10 w-full items-center justify-center gap-2 rounded-full border border-[color:var(--chat-sidebar-new-chat-border)] bg-[var(--chat-sidebar-new-chat-bg)] px-3 text-[length:var(--chat-sidebar-new-chat-font-size)] font-semibold text-[color:var(--chat-sidebar-text)] transition-shadow duration-300"
                onClick={onNewChat}
              >
                <MessageSquarePlus size={16} strokeWidth={2.2} />
                <span>开启新对话</span>
              </button>
            </aside>

            <div className="chat-sidebar-scroll-fade-mask-bottom min-h-0 flex-1 overflow-y-auto px-3 pb-3">
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

              {visibleUnpinnedGroups.map((group) => (
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

              {hasOlderHistoryGroup ? (
                <button
                  type="button"
                  onClick={() => setHistoryExpanded((current) => !current)}
                  className="mt-1 flex w-full items-center justify-between px-1 py-2 text-left text-[length:var(--chat-sidebar-section-font-size)] font-semibold text-[color:var(--chat-sidebar-muted-text)]"
                >
                  <span>更多历史</span>
                  <ChevronDown className={clsx('h-4 w-4 transition-transform', !historyExpanded && '-rotate-90')} />
                </button>
              ) : null}
            </div>

            <div className="shrink-0 px-2 py-2">
              <AccountMenuCard currentUser={currentUser} menuOpen={accountMenuOpen} onLogout={onLogout} onOpenChange={setAccountMenuOpen} />
            </div>
          </div>
        </aside>
      </div>
    </>
  );
});

function deriveAccountDisplayName(email: string) {
  const localPart = email.split('@')[0]?.trim();
  return localPart || email;
}

function deriveAccountMonogram(email: string) {
  const displayName = deriveAccountDisplayName(email);
  const match = displayName.match(/[A-Za-z0-9\u4e00-\u9fff]/u);
  return (match?.[0] ?? '?').toUpperCase();
}

function AccountMenuCard({
  currentUser,
  menuOpen,
  onLogout,
  onOpenChange
}: {
  currentUser: AuthUserDto | null;
  menuOpen: boolean;
  onLogout?: () => void | Promise<void>;
  onOpenChange: (open: boolean) => void;
}) {
  const email = currentUser?.email ?? '未登录';
  const displayName = deriveAccountDisplayName(email);
  const monogram = deriveAccountMonogram(email);

  return (
    <DropdownMenu open={menuOpen} onOpenChange={onOpenChange}>
      <DropdownMenuTrigger asChild>
        <button
          aria-label="账户菜单"
          className={clsx(
            'flex h-11 w-full items-center rounded-2xl px-3 text-[color:var(--chat-sidebar-text)] transition',
            menuOpen ? 'bg-[color:var(--chat-sidebar-item-hover-bg)]' : 'hover:bg-[color:var(--chat-sidebar-item-hover-bg)]'
          )}
          type="button"
        >
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <div className="flex size-8 items-center justify-center rounded-full bg-[image:var(--chat-sidebar-avatar-bg)] text-sm font-semibold text-[color:var(--chat-sidebar-avatar-text)]">
              {monogram}
            </div>
            <div className="min-w-0 truncate text-[length:var(--chat-sidebar-user-font-size)] font-medium text-[color:var(--chat-sidebar-text)]" title={email}>
              {displayName}
            </div>
          </div>

          <span
            aria-hidden="true"
            className="ml-2 flex size-8 items-center justify-center rounded-full text-[color:var(--chat-sidebar-muted-text)] transition"
          >
            <MoreHorizontal className="size-4.5" />
          </span>
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="start" className="w-48" side="top">
        <DropdownMenuItem disabled>
          <Settings2 className="h-4 w-4" />
          <span>系统设置</span>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          data-account-menu-logout
          variant="destructive"
          onSelect={() => {
            void onLogout?.();
          }}
        >
          <LogOut className="h-4 w-4" />
          <span>退出登录</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
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
    <section className="mb-3">
      {hideTitle ? null : (
        <div className="sticky top-0 z-10 -mx-3 mb-[2px] bg-[var(--chat-sidebar-bg)] px-4 pt-1 text-[length:var(--chat-sidebar-section-font-size)] font-normal text-[color:var(--chat-sidebar-muted-text)]">
          {title}
        </div>
      )}
      <div className="flex flex-col">{children}</div>
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
  thread: PlaygroundThreadDto;
  active: boolean;
  pinned: boolean;
  menuOpen: boolean;
  onOpenThread: (threadId: string, title?: string | null) => void;
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
        'group relative flex h-10 w-full items-center justify-between rounded-[12px] px-3 transition',
        active
          ? 'bg-[var(--chat-sidebar-item-active-bg)] text-[color:var(--chat-sidebar-item-active-text)]'
          : 'text-[color:var(--chat-sidebar-text)] hover:bg-[color:var(--chat-sidebar-item-hover-bg)]'
      )}
    >
      <button type="button" onClick={() => onOpenThread(thread.id, thread.title)} data-thread-id={thread.id} className="flex h-full min-w-0 flex-1 items-center text-left">
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
