'use client';

import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';

import { ChatShellEntry } from './chat-shell-entry';

type ChatShellRouterProps = {
  children: ReactNode;
};

function decodeThreadId(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function resolveChatThreadId(pathname: string) {
  if (pathname === '/new') {
    return null;
  }

  const match = pathname.match(/^\/chat\/([^/]+)$/);
  return match ? decodeThreadId(match[1]) : null;
}

export function ChatShellRouter({ children }: ChatShellRouterProps) {
  const pathname = usePathname();

  if (pathname.startsWith('/replay/')) {
    return children;
  }

  return <ChatShellEntry initialThreadId={resolveChatThreadId(pathname)} />;
}
