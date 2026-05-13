'use client';

import clsx from 'clsx';
import { Archive, History, Menu, PanelLeftOpen, Pencil, Pin, PinOff, Share2 } from 'lucide-react';

import { ChatAvatar, IconButton } from './shared';
import { ui } from './ui';

type ChatHeaderProps = {
  currentThreadTitle: string;
  currentThreadPinned: boolean;
  threadActionsDisabled: boolean;
  sidebarOpen: boolean;
  onOpenSidebar: () => void;
  onRenameThread: () => void;
  onToggleThreadPin: () => void;
  onArchiveThread: () => void;
  onOpenReplay: () => void;
  onOpenShareDialog: () => void;
  onToggleLog: () => void;
};

export function ChatHeader({
  currentThreadTitle,
  currentThreadPinned,
  threadActionsDisabled,
  sidebarOpen,
  onOpenSidebar,
  onRenameThread,
  onToggleThreadPin,
  onArchiveThread,
  onOpenReplay,
  onOpenShareDialog,
  onToggleLog
}: ChatHeaderProps) {
  return (
    <header className="z-[11] flex h-10 min-h-10 max-h-10 items-center justify-between border-b border-slate-200 px-2">
      <div className="flex min-w-0 items-center gap-3">
        {!sidebarOpen ? (
          <IconButton icon={PanelLeftOpen} onClick={onOpenSidebar} size="small" title="打开侧边栏" />
        ) : null}
        <ChatAvatar size={28} title={currentThreadTitle} />
        <div className="relative flex max-w-full flex-1 items-center gap-2 overflow-hidden">
          <div className={clsx(ui.chatHeaderTitle)}>{currentThreadTitle}</div>
        </div>
      </div>

      <div className="flex gap-1">
        <IconButton icon={Pencil} onClick={onRenameThread} size="small" title="重命名" disabled={threadActionsDisabled} />
        <IconButton
          icon={currentThreadPinned ? PinOff : Pin}
          onClick={onToggleThreadPin}
          size="small"
          title={currentThreadPinned ? '取消置顶' : '置顶'}
          disabled={threadActionsDisabled}
        />
        <IconButton icon={Share2} onClick={onOpenShareDialog} size="small" title="分享" disabled={threadActionsDisabled} />
        <IconButton icon={History} onClick={onOpenReplay} size="small" title="回放" disabled={threadActionsDisabled} />
        <IconButton icon={Archive} onClick={onArchiveThread} size="small" title="归档" disabled={threadActionsDisabled} />
        <IconButton icon={Menu} onClick={onToggleLog} size="small" title="切换日志面板" />
      </div>
    </header>
  );
}
