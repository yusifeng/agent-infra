'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import { DurableChatConsole } from '@/components/durable-chat-console';
import type { AuthUserDto } from '@/features/auth/dto/project-auth-user-dto';

type ChatShellEntryProps = {
  initialThreadId?: string | null;
};

type AuthMeResponse = {
  user?: AuthUserDto | null;
};

function readCurrentPathForAuthRedirect() {
  if (typeof window === 'undefined') {
    return '/new';
  }

  const value = `${window.location.pathname}${window.location.search}`;
  if (!value.startsWith('/') || value.startsWith('//')) {
    return '/new';
  }

  return value;
}

export function ChatShellEntry({ initialThreadId = null }: ChatShellEntryProps) {
  const router = useRouter();
  const [currentUser, setCurrentUser] = useState<AuthUserDto | null>(null);
  const [authChecked, setAuthChecked] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function checkAuth() {
      try {
        const response = await fetch('/api/auth/me', {
          credentials: 'same-origin'
        });
        const payload = (await response.json().catch(() => ({}))) as AuthMeResponse;
        if (cancelled) {
          return;
        }

        if (!response.ok || !payload.user) {
          const next = readCurrentPathForAuthRedirect();
          router.replace(`/login?next=${encodeURIComponent(next)}`);
          return;
        }

        setCurrentUser(payload.user);
        setAuthChecked(true);
      } catch {
        if (cancelled) {
          return;
        }
        const next = readCurrentPathForAuthRedirect();
        router.replace(`/login?next=${encodeURIComponent(next)}`);
      }
    }

    void checkAuth();

    return () => {
      cancelled = true;
    };
  }, [router]);

  async function logout() {
    try {
      await fetch('/api/auth/logout', {
        method: 'POST',
        credentials: 'same-origin'
      });
    } finally {
      setCurrentUser(null);
      setAuthChecked(false);
      router.replace('/login');
    }
  }

  if (!authChecked || !currentUser) {
    return (
      <main className="flex h-full min-h-0 items-center justify-center bg-[var(--chat-bg)] text-sm text-[var(--chat-muted)]">
        Loading
      </main>
    );
  }

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
