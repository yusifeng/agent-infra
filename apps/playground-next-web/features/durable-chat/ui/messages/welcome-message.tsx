'use client';

import clsx from 'clsx';
import { memo } from 'react';

import { AnimatedEmoji } from '@/components/chat-shell/shared';
import { ui } from '@/components/chat-shell/ui';

export const WelcomeMessage = memo(function WelcomeMessage({ activeThreadId }: { activeThreadId: string | null }) {
  if (!activeThreadId) {
    return null;
  }

  return (
    <div className="flex w-full items-center justify-center px-4 py-2">
      <div className="flex w-full max-w-[800px] flex-col items-center gap-3 text-center">
        <AnimatedEmoji emoji="👋" size={40} />
        <h1 className={clsx('my-1 text-[32px]', ui.welcomeTitle)}>
          继续这个 durable chat
        </h1>
        <div className={clsx('max-w-[720px] text-sm leading-7', ui.welcomeDesc)}>
          这里保留真实的 durable thread 与 run 行为，只验证 Vite consumer 在非 Next.js 环境下的主聊天链路。
        </div>
      </div>
    </div>
  );
});
