import './chat-shell.css';

import { DurableChatConsole } from '@/components/durable-chat-console';
import { ChatThemeProvider } from '@/components/chat-theme-provider';

type ChatShellLayoutProps = {
  children: React.ReactNode;
};

export default function ChatShellLayout({ children }: ChatShellLayoutProps) {
  return (
    <ChatThemeProvider>
      <DurableChatConsole />
      {children}
    </ChatThemeProvider>
  );
}
