'use client';

import { ReplayConsole } from '@/components/replay-console';
import type { AuthUserDto } from '@/features/auth/dto/project-auth-user-dto';

import { usePlaygroundLogout } from './use-playground-logout';

type ReplayShellEntryProps = {
  currentUser: AuthUserDto;
  initialThreadId: string;
};

export function ReplayShellEntry({ currentUser, initialThreadId }: ReplayShellEntryProps) {
  const logout = usePlaygroundLogout();

  return (
    <ReplayConsole
      currentUser={currentUser}
      initialThreadId={initialThreadId}
      onLogout={() => {
        void logout();
      }}
    />
  );
}
