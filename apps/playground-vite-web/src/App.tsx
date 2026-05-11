import { useEffect, useState } from 'react';
import { LogOut } from 'lucide-react';
import { Navigate, matchPath, useLocation, useNavigate } from 'react-router-dom';

import { Button } from '@/components/ui/button';
import { ForgotPasswordForm } from '@/features/auth/components/forgot-password-form';
import { LoginForm } from '@/features/auth/components/login-form';
import { RegisterForm } from '@/features/auth/components/register-form';
import { logout } from '@/features/auth/repo/auth-api';
import { useAuthState } from '@/features/auth/runtime/use-auth-state';
import { DurableChatConsole } from '@/features/durable-chat/durable-chat-console';
import { DeepseekLogo } from '@/features/durable-chat/components/deepseek-logo';
import { ReplayConsole } from '@/features/durable-chat/replay-console';
import { SharedSnapshotConsole } from '@/features/durable-chat/shared-snapshot-console';

function resolvePathParam(pathname: string, pattern: '/chat/:threadId' | '/replay/:threadId' | '/share/:publicId', key: 'threadId' | 'publicId') {
  const match = matchPath(pattern, pathname);
  const rawValue = match?.params[key];
  if (!rawValue) {
    return null;
  }

  try {
    return decodeURIComponent(rawValue);
  } catch {
    return null;
  }
}

function resolveNextPath(search: string) {
  const params = new URLSearchParams(search);
  const nextPath = params.get('next');
  if (!nextPath || !nextPath.startsWith('/') || nextPath.startsWith('//')) {
    return '/new';
  }

  return nextPath;
}

function buildAuthRedirect(pathname: string, search: string) {
  const nextPath = `${pathname}${search}`;
  return `/login?next=${encodeURIComponent(nextPath)}`;
}

function AuthPage(props: {
  mode: 'login' | 'register' | 'forgot-password';
  onAuthenticated: (user: { id: string; email: string }) => void;
  notice?: string | null;
}) {
  return (
    <main className="min-h-screen overflow-hidden bg-[radial-gradient(circle_at_top,_rgba(66,99,235,0.12),_transparent_20%),linear-gradient(180deg,_#ffffff_0%,_#fbfdff_52%,_#f5f8ff_100%)] px-6 py-10 text-slate-950">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_18%_16%,_rgba(90,140,255,0.05),_transparent_26%),radial-gradient(circle_at_82%_18%,_rgba(90,140,255,0.04),_transparent_24%),radial-gradient(circle_at_50%_100%,_rgba(148,163,184,0.06),_transparent_32%)]" />
      <div className="relative mx-auto flex min-h-[calc(100vh-5rem)] max-w-[24rem] flex-col items-center justify-center">
        <section className="w-full">
          <div className="mb-10 flex flex-col items-center gap-3 text-center">
            <DeepseekLogo className="h-auto w-[13.5rem]" title="Playground" />
            <h1 className="sr-only">
              {props.mode === 'login'
                ? '登录到 Playground'
                : props.mode === 'register'
                  ? '注册你的 Playground 账号'
                  : '重置 Playground 密码'}
            </h1>
          </div>

          {props.mode === 'login' ? (
            <LoginForm notice={props.notice} onAuthenticated={props.onAuthenticated} />
          ) : props.mode === 'register' ? (
            <RegisterForm onAuthenticated={props.onAuthenticated} />
          ) : (
            <ForgotPasswordForm />
          )}
        </section>
      </div>
    </main>
  );
}

function LoadingScreen() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[linear-gradient(180deg,_#eff6ff_0%,_#f8fafc_50%,_#e2e8f0_100%)] px-6">
      <div className="rounded-[28px] border border-white/80 bg-white/85 px-8 py-6 text-sm text-slate-600 shadow-[0_24px_60px_rgba(15,23,42,0.12)] backdrop-blur">
        正在校验登录状态…
      </div>
    </main>
  );
}

function App() {
  const location = useLocation();
  const navigate = useNavigate();
  const { state, setAuthenticated, setUnauthenticated } = useAuthState();
  const [logoutRedirecting, setLogoutRedirecting] = useState(false);
  const chatMatch = matchPath('/chat/:threadId', location.pathname);
  const replayMatch = matchPath('/replay/:threadId', location.pathname);
  const shareMatch = matchPath('/share/:publicId', location.pathname);
  const loginRoute = location.pathname === '/login';
  const registerRoute = location.pathname === '/register';
  const forgotPasswordRoute = location.pathname === '/forgot-password';
  const protectedChatRoute = location.pathname === '/new' || Boolean(chatMatch) || Boolean(replayMatch);

  useEffect(() => {
    if (logoutRedirecting && loginRoute) {
      setLogoutRedirecting(false);
    }
  }, [loginRoute, logoutRedirecting]);

  if (location.pathname === '/') {
    return <Navigate replace to="/new" />;
  }

  if (
    location.pathname !== '/new' &&
    !chatMatch &&
    !replayMatch &&
    !shareMatch &&
    !loginRoute &&
    !registerRoute &&
    !forgotPasswordRoute
  ) {
    return <Navigate replace to="/new" />;
  }

  if (shareMatch) {
    return <SharedSnapshotConsole initialPublicId={resolvePathParam(location.pathname, '/share/:publicId', 'publicId')} />;
  }

  if (state.status === 'loading') {
    return <LoadingScreen />;
  }

  if (state.status === 'unauthenticated') {
    if (protectedChatRoute) {
      return <Navigate replace to={logoutRedirecting ? '/login' : buildAuthRedirect(location.pathname, location.search)} />;
    }

    const onAuthenticated = (user: { id: string; email: string }) => {
      setAuthenticated(user);
      navigate(resolveNextPath(location.search), {
        replace: true
      });
    };

    const locationState = location.state as { notice?: string } | null;

    return (
      <AuthPage
        mode={registerRoute ? 'register' : forgotPasswordRoute ? 'forgot-password' : 'login'}
        notice={loginRoute ? locationState?.notice ?? null : null}
        onAuthenticated={onAuthenticated}
      />
    );
  }

  if (loginRoute || registerRoute || forgotPasswordRoute) {
    return <Navigate replace to={resolveNextPath(location.search)} />;
  }

  if (replayMatch) {
    return <ReplayConsole initialThreadId={resolvePathParam(location.pathname, '/replay/:threadId', 'threadId')} />;
  }

  return (
    <DurableChatConsole
      initialThreadId={resolvePathParam(location.pathname, '/chat/:threadId', 'threadId')}
      headerTrailingContent={
        <Button
          size="sm"
          variant="ghost"
          onClick={async () => {
            try {
              await logout();
            } catch {
              // Keep local auth UI consistent even if the server-side revoke call fails.
            } finally {
              setLogoutRedirecting(true);
              setUnauthenticated();
            }
          }}
        >
          <LogOut />
          退出
        </Button>
      }
    />
  );
}

export default App;
