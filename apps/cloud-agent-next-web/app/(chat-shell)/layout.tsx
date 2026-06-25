import { redirect } from 'next/navigation';

import { ChatShell } from '@/components/chat-shell';
import { getCurrentUserFromCookies } from '@/lib/auth';
import { getAgentProviderOptions, getDefaultAgentProvider } from '@/lib/provider-config';
import { listThreads } from '@/lib/thread-store';

type ChatShellLayoutProps = {
  children: React.ReactNode;
};

export default async function ChatShellLayout({ children }: ChatShellLayoutProps) {
  const user = await getCurrentUserFromCookies();
  if (!user) {
    redirect('/login');
  }

  const [threads, providers] = await Promise.all([
    listThreads(user.id),
    Promise.resolve(getAgentProviderOptions())
  ]);

  return (
    <>
      <ChatShell
        currentUser={user}
        defaultProvider={getDefaultAgentProvider()}
        initialThreads={threads}
        providerOptions={providers}
      />
      {children}
    </>
  );
}
