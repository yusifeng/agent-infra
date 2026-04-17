import clsx from 'clsx';
import { PanelLeftOpen } from 'lucide-react';

import { ChatAvatar, IconButton } from './shared';
import { ui } from './ui';

type ChatHeaderProps = {
  currentThreadTitle: string;
  sidebarOpen: boolean;
  onOpenSidebar: () => void;
};

export function ChatHeader({ currentThreadTitle, sidebarOpen, onOpenSidebar }: ChatHeaderProps) {
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
    </header>
  );
}
