'use client';

import { useParams } from 'next/navigation';

import { ReplayConsole } from '@/components/replay-console';
import type { AuthUserDto } from '@/features/auth/dto/project-auth-user-dto';

import { usePlaygroundLogout } from './use-playground-logout';

type ReplayRouteShellProps = {
  currentUser: AuthUserDto | null;
};

export function ReplayRouteShell({ currentUser }: ReplayRouteShellProps) {
  const params = useParams<{ threadId?: string | string[] }>();
  const routeThreadId = Array.isArray(params.threadId) ? params.threadId[0] : params.threadId;
  const logout = usePlaygroundLogout();

  return (
    <ReplayConsole
      currentUser={currentUser}
      initialThreadId={routeThreadId ?? null}
      onLogout={() => {
        void logout();
      }}
    />
  );
}
