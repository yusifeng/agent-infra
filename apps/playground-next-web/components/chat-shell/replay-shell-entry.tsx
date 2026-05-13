'use client';

import { AuthShellGate } from './auth-shell-gate';
import { ReplayConsole } from '@/components/replay-console';

type ReplayShellEntryProps = {
  initialThreadId: string;
};

export function ReplayShellEntry({ initialThreadId }: ReplayShellEntryProps) {
  return (
    <AuthShellGate>
      {({ currentUser, onLogout }) => (
        <ReplayConsole
          currentUser={currentUser}
          initialThreadId={initialThreadId}
          onLogout={() => {
            void onLogout();
          }}
        />
      )}
    </AuthShellGate>
  );
}
