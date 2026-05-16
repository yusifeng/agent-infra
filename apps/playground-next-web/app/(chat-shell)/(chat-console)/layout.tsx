import { ChatRouteShell } from '@/components/chat-shell/chat-route-shell';
import { getCurrentAuthUserFromNextCookies } from '@/lib/playground-auth-server';

type ChatConsoleLayoutProps = {
  children: React.ReactNode;
};

export default async function ChatConsoleLayout({ children }: ChatConsoleLayoutProps) {
  const currentUser = await getCurrentAuthUserFromNextCookies();

  return (
    <>
      <ChatRouteShell currentUser={currentUser} />
      {children}
    </>
  );
}
