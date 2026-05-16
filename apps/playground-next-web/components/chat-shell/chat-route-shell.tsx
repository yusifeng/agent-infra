'use client';

import { useParams } from 'next/navigation';

import { DurableChatConsole } from '@/components/durable-chat-console';
import type { AuthUserDto } from '@/features/auth/dto/project-auth-user-dto';

import { usePlaygroundLogout } from './use-playground-logout';

type ChatRouteShellProps = {
  currentUser: AuthUserDto | null;
};

export function ChatRouteShell({ currentUser }: ChatRouteShellProps) {
  const params = useParams<{ threadId?: string | string[] }>();
  const routeThreadId = Array.isArray(params.threadId) ? params.threadId[0] : params.threadId;
  const logout = usePlaygroundLogout();

  return (
    <DurableChatConsole
      currentUser={currentUser}
      initialThreadId={routeThreadId ?? null}
      onLogout={() => {
        void logout();
      }}
    />
  );
}
