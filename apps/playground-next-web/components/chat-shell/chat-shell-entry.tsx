'use client';

import { DurableChatConsole } from '@/components/durable-chat-console';
import type { AuthUserDto } from '@/features/auth/dto/project-auth-user-dto';

import { usePlaygroundLogout } from './use-playground-logout';

type ChatShellEntryProps = {
  currentUser: AuthUserDto;
  initialThreadId?: string | null;
};

export function ChatShellEntry({ currentUser, initialThreadId = null }: ChatShellEntryProps) {
  const logout = usePlaygroundLogout();

  return (
    <DurableChatConsole
      currentUser={currentUser}
      initialThreadId={initialThreadId}
      onLogout={() => {
        void logout();
      }}
    />
  );
}
