'use client';

import { useRouter } from 'next/navigation';

export function usePlaygroundLogout() {
  const router = useRouter();

  return async function logout() {
    try {
      await fetch('/api/auth/logout', {
        method: 'POST',
        credentials: 'same-origin'
      });
    } finally {
      router.replace('/login');
    }
  };
}
