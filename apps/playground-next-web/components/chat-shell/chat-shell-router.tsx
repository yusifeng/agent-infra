'use client';

import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';

import { resolveChatRouteThreadId } from '@/features/durable-chat/service/chat-route-selection';

import { ChatShellEntry } from './chat-shell-entry';

type ChatShellRouterProps = {
  children: ReactNode;
};

export function ChatShellRouter({ children }: ChatShellRouterProps) {
  const pathname = usePathname();

  if (pathname.startsWith('/replay/')) {
    return children;
  }

  return <ChatShellEntry initialThreadId={resolveChatRouteThreadId(pathname)} />;
}
