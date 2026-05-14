import { ChatShellEntry } from '@/components/chat-shell/chat-shell-entry';
import { ChatThemeProvider } from '@/components/chat-theme-provider';

export default function HomePage() {
  return (
    <ChatThemeProvider>
      <ChatShellEntry />
    </ChatThemeProvider>
  );
}
