'use client';

import clsx from 'clsx';

type ChatThemeProviderProps = {
  children: React.ReactNode;
};

export function ChatThemeProvider({ children }: ChatThemeProviderProps) {
  return <div className={clsx('chat-shell-theme chat-shell-scrollbars')}>{children}</div>;
}
