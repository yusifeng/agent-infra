import { useEffect, useRef, useState } from 'react';

import { fetchAuthMe, type AuthUserDto } from '@/features/auth/repo/auth-api';

export type AuthState =
  | { status: 'loading'; user: null }
  | { status: 'authenticated'; user: AuthUserDto }
  | { status: 'unauthenticated'; user: null };

export function useAuthState() {
  const [state, setState] = useState<AuthState>({
    status: 'loading',
    user: null
  });
  const requestIdRef = useRef(0);

  useEffect(() => {
    const controller = new AbortController();
    const requestId = ++requestIdRef.current;

    void fetchAuthMe(controller.signal)
      .then((result) => {
        if (controller.signal.aborted || requestId !== requestIdRef.current) {
          return;
        }

        if (result.ok && result.data.user) {
          setState({
            status: 'authenticated',
            user: result.data.user
          });
          return;
        }

        setState({
          status: 'unauthenticated',
          user: null
        });
      })
      .catch(() => {
        if (controller.signal.aborted || requestId !== requestIdRef.current) {
          return;
        }

        setState({
          status: 'unauthenticated',
          user: null
        });
      });

    return () => {
      controller.abort();
    };
  }, []);

  return {
    state,
    setAuthenticated(user: AuthUserDto) {
      setState({
        status: 'authenticated',
        user
      });
    },
    setUnauthenticated() {
      setState({
        status: 'unauthenticated',
        user: null
      });
    }
  };
}
