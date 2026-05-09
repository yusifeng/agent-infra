import { useEffect, useState } from 'react';
import { LogOut } from 'lucide-react';
import { Navigate, matchPath, useLocation, useNavigate } from 'react-router-dom';

import { Button } from '@/components/ui/button';
import { LoginForm } from '@/features/auth/components/login-form';
import { RegisterForm } from '@/features/auth/components/register-form';
import { logout } from '@/features/auth/repo/auth-api';
import { useAuthState } from '@/features/auth/runtime/use-auth-state';
import { DurableChatConsole } from '@/features/durable-chat/durable-chat-console';
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
  mode: 'login' | 'register';
  onAuthenticated: (user: { id: string; email: string }) => void;
}) {
  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(14,165,233,0.16),_transparent_32%),linear-gradient(180deg,_#eff6ff_0%,_#f8fafc_42%,_#e2e8f0_100%)] px-4 py-8 text-slate-950">
      <div className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-md items-center">
        <section className="w-full rounded-[28px] border border-slate-200/80 bg-white/92 p-6 shadow-[0_24px_60px_rgba(15,23,42,0.12)] backdrop-blur sm:p-8">
          <div className="mb-8 space-y-2">
            <div className="flex items-center justify-between text-sm text-slate-500">
              <span className="font-medium tracking-[0.24em] text-slate-700 uppercase">playground auth</span>
              <span>vite + fastify</span>
            </div>
            <p className="pt-4 text-sm font-medium tracking-[0.22em] text-slate-500 uppercase">
              {props.mode === 'login' ? 'Sign In' : 'Create Account'}
            </p>
            <h2 className="text-3xl font-semibold text-slate-950">
              {props.mode === 'login' ? '登录到 Playground' : '注册你的 Playground 账号'}
            </h2>
            <p className="text-sm leading-6 text-slate-500">
              {props.mode === 'login'
                ? '使用邮箱和密码进入 durable chat 控制台。'
                : '先发送邮箱验证码，再设置登录密码。'}
            </p>
          </div>

          {props.mode === 'login' ? (
            <LoginForm onAuthenticated={props.onAuthenticated} />
          ) : (
            <RegisterForm onAuthenticated={props.onAuthenticated} />
          )}

          <div className="mt-8 border-t border-slate-200 pt-5 text-xs leading-5 text-slate-400">
            Public share links remain readable without sign-in. Protected chat and replay routes require a session.
          </div>
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
  const protectedChatRoute = location.pathname === '/new' || Boolean(chatMatch) || Boolean(replayMatch);

  useEffect(() => {
    if (logoutRedirecting && loginRoute) {
      setLogoutRedirecting(false);
    }
  }, [loginRoute, logoutRedirecting]);

  if (location.pathname === '/') {
    return <Navigate replace to="/new" />;
  }

  if (location.pathname !== '/new' && !chatMatch && !replayMatch && !shareMatch && !loginRoute && !registerRoute) {
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

    return <AuthPage mode={registerRoute ? 'register' : 'login'} onAuthenticated={onAuthenticated} />;
  }

  if (loginRoute || registerRoute) {
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
