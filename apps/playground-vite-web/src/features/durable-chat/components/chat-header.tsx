import type { ReactNode } from 'react';
import { CirclePlus, PanelLeft } from 'lucide-react';

import { IconButton } from './shared';
import { ExpertModeIcon, QuickModeIcon } from './mode-icons';
import { PureDeepseek } from './pure-deepseek';

type ChatHeaderProps = {
  currentThreadTitle?: string | null;
  sidebarOpen: boolean;
  onOpenSidebar: () => void;
  onNewChat?: (() => void) | undefined;
  mode?: 'quick' | 'expert' | null;
  trailingContent?: ReactNode;
};

export function ChatHeader({ currentThreadTitle = null, sidebarOpen, onOpenSidebar, onNewChat, mode = null, trailingContent }: ChatHeaderProps) {
  const modeLabel = mode === 'expert' ? '专家模式' : mode === 'quick' ? '快速模式' : null;
  const showThreadMeta = Boolean(currentThreadTitle);

  return (
    <header className="z-[11] flex h-[60px] min-h-[60px] max-h-[60px] items-center gap-4 px-6">
      <div className="flex min-w-0 items-center gap-3">
        {!sidebarOpen ? (
          <>
            <PureDeepseek className="shrink-0" title="DeepSeek" width={27} height={20} />
            <div className="flex h-10 w-[76px] shrink-0 items-center rounded-full border border-[rgba(217,223,232,0.95)] bg-white px-1.5 shadow-[0_1px_2px_rgba(72,104,178,0.04),0_8px_18px_rgba(106,111,117,0.08)]">
              <IconButton
                icon={PanelLeft}
                onClick={onOpenSidebar}
                size="default"
                title="打开侧边栏"
                className="h-8 w-8 rounded-full hover:bg-[rgba(57,100,254,0.08)]"
              />
              {onNewChat ? (
                <>
                  <div className="mx-2 h-5 w-px bg-[rgba(217,223,232,0.95)]" />
                  <IconButton
                    icon={CirclePlus}
                    onClick={onNewChat}
                    size="default"
                    title="开启新对话"
                    className="h-8 w-8 rounded-full hover:bg-[rgba(57,100,254,0.08)]"
                  />
                </>
              ) : null}
            </div>
          </>
        ) : null}
        {showThreadMeta ? (
          <div className="min-w-0">
            <div className="overflow-hidden text-ellipsis whitespace-nowrap text-[14px] font-semibold leading-[1.2] text-[color:var(--chat-text)]">{currentThreadTitle}</div>
            {modeLabel ? (
              <div className="mt-1 flex items-center gap-1.5 text-[12px] font-medium leading-none text-[color:var(--chat-text-secondary)]">
                {mode === 'quick' ? (
                  <QuickModeIcon className="h-[13px] w-[13px] shrink-0 text-[#3964fe]" selected />
                ) : (
                  <ExpertModeIcon className="h-[13px] w-[13px] shrink-0 text-[#3964fe]" selected />
                )}
                <span>{modeLabel}</span>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
      <div className="flex-1" />
      {trailingContent ? <div className="flex shrink-0 items-center gap-1">{trailingContent}</div> : null}
    </header>
  );
}
