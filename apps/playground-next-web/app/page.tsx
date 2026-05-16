import { ChatShellEntry } from '@/components/chat-shell/chat-shell-entry';
import { ChatThemeProvider } from '@/components/chat-theme-provider';
import { requireCurrentAuthUser } from '@/lib/playground-auth-server';

export default async function HomePage() {
  const currentUser = await requireCurrentAuthUser('/');

  return (
    <ChatThemeProvider>
      <ChatShellEntry currentUser={currentUser} />
    </ChatThemeProvider>
  );
}
