import './chat-shell.css';

import { ChatThemeProvider } from '@/components/chat-theme-provider';

type ChatShellLayoutProps = {
  children: React.ReactNode;
};

export default function ChatShellLayout({ children }: ChatShellLayoutProps) {
  return <ChatThemeProvider>{children}</ChatThemeProvider>;
}
