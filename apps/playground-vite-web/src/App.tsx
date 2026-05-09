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
      <div className="mx-auto grid min-h-[calc(100vh-4rem)] max-w-6xl gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <section className="relative overflow-hidden rounded-[32px] border border-white/70 bg-white/80 p-8 shadow-[0_30px_80px_rgba(15,23,42,0.12)] backdrop-blur xl:p-12">
          <div className="absolute inset-x-10 top-0 h-40 rounded-full bg-sky-200/40 blur-3xl" />
          <div className="relative flex h-full flex-col justify-between gap-10">
            <div className="flex items-center justify-between text-sm text-slate-500">
              <span className="font-medium tracking-[0.24em] text-slate-700 uppercase">playground auth</span>
              <span>vite + fastify</span>
            </div>

            <div className="max-w-2xl space-y-6">
              <p className="text-sm font-medium tracking-[0.22em] text-sky-700 uppercase">Host-Local Access</p>
              <h1 className="max-w-xl text-4xl leading-tight font-semibold text-slate-950 sm:text-5xl">
                用宿主侧账号把 playground 会话 ownership 收回到真实用户。
              </h1>
              <p className="max-w-xl text-base leading-7 text-slate-600 sm:text-lg">
                注册阶段使用邮箱验证码确认邮箱所有权，登录阶段使用邮箱和密码。thread ownership
                继续留在 Fastify host 的 catalog 侧，不把 user domain 推进 shared packages。
              </p>
            </div>

            <div className="grid gap-4 text-sm text-slate-600 sm:grid-cols-3">
              <div className="rounded-2xl border border-slate-200/80 bg-slate-50/80 p-4">
                <p className="font-medium text-slate-900">Cookie Session</p>
                <p className="mt-2 leading-6">浏览器只持有 HttpOnly session token，服务端保存 token hash。</p>
              </div>
              <div className="rounded-2xl border border-slate-200/80 bg-slate-50/80 p-4">
                <p className="font-medium text-slate-900">Email Verify</p>
                <p className="mt-2 leading-6">注册必须走邮箱验证码，避免把旧的 `local-dev-user` 继续当成真实用户。</p>
              </div>
              <div className="rounded-2xl border border-slate-200/80 bg-slate-50/80 p-4">
                <p className="font-medium text-slate-900">Catalog Ownership</p>
                <p className="mt-2 leading-6">新建 thread 直接写入 `playground_thread_catalog.owner_user_id`。</p>
              </div>
            </div>
          </div>
        </section>

        <section className="flex items-center">
          <div className="w-full rounded-[28px] border border-slate-200/80 bg-white/92 p-6 shadow-[0_24px_60px_rgba(15,23,42,0.12)] backdrop-blur sm:p-8">
            <div className="mb-8 space-y-2">
              <p className="text-sm font-medium tracking-[0.22em] text-slate-500 uppercase">
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
  const chatMatch = matchPath('/chat/:threadId', location.pathname);
  const replayMatch = matchPath('/replay/:threadId', location.pathname);
  const shareMatch = matchPath('/share/:publicId', location.pathname);
  const loginRoute = location.pathname === '/login';
  const registerRoute = location.pathname === '/register';
  const protectedChatRoute = location.pathname === '/new' || Boolean(chatMatch) || Boolean(replayMatch);

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
      return <Navigate replace to={buildAuthRedirect(location.pathname, location.search)} />;
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
              setUnauthenticated();
              navigate('/login', { replace: true });
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
