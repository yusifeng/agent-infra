import clsx from 'clsx';
import type { ReactNode } from 'react';
import { PanelLeftOpen } from 'lucide-react';

import { IconButton } from './shared';
import { ui } from './ui';

type ChatHeaderProps = {
  currentThreadTitle: string;
  sidebarOpen: boolean;
  onOpenSidebar: () => void;
  trailingContent?: ReactNode;
};

export function ChatHeader({ currentThreadTitle, sidebarOpen, onOpenSidebar, trailingContent }: ChatHeaderProps) {
  return (
    <header className="z-[11] flex h-10 min-h-10 max-h-10 items-center justify-between border-b border-[color:var(--chat-reasoning-divider)] px-2">
      <div className="flex min-w-0 items-center gap-3">
        {!sidebarOpen ? (
          <IconButton icon={PanelLeftOpen} onClick={onOpenSidebar} size="small" title="打开侧边栏" />
        ) : null}
        <div className="relative flex max-w-full flex-1 items-center gap-2 overflow-hidden">
          <div className={clsx(ui.chatHeaderTitle)}>{currentThreadTitle}</div>
        </div>
      </div>
      {trailingContent ? <div className="flex shrink-0 items-center gap-1">{trailingContent}</div> : null}
    </header>
  );
}
