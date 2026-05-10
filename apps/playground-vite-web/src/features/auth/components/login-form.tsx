import { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';

import { signIn, type AuthUserDto } from '@/features/auth/repo/auth-api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

function presentAuthError(error: string | null) {
  switch (error) {
    case 'INVALID_CREDENTIALS':
      return '邮箱或密码不正确。';
    case 'RATE_LIMITED':
      return '请求过于频繁，请稍后再试。';
    default:
      return '登录失败，请稍后再试。';
  }
}

export function LoginForm(props: {
  onAuthenticated: (user: AuthUserDto) => void;
}) {
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <form
      className="flex flex-col gap-3.5"
      onSubmit={async (event) => {
        event.preventDefault();
        setSubmitting(true);
        setError(null);

        try {
          const result = await signIn({
            email,
            password
          });

          if (!result.ok || !result.data.user) {
            setError(presentAuthError(result.error));
            return;
          }

          props.onAuthenticated(result.data.user);
        } catch {
          setError('登录失败，请稍后再试。');
        } finally {
          setSubmitting(false);
        }
      }}
    >
      <div className="flex flex-col gap-3">
        <label className="sr-only" htmlFor="login-email">
          邮箱
        </label>
        <Input
          id="login-email"
          autoComplete="email"
          className="h-[42px] rounded-full border-slate-200/80 bg-white/90 px-5 text-sm shadow-[0_8px_24px_rgba(148,163,184,0.08)] placeholder:text-slate-400 focus-visible:border-[#4263eb]/40 focus-visible:ring-[#4263eb]/20"
          placeholder="请输入邮箱"
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
      </div>

      <div className="flex flex-col gap-3">
        <label className="sr-only" htmlFor="login-password">
          密码
        </label>
        <div className="relative">
          <Input
            id="login-password"
            autoComplete="current-password"
            className="h-[42px] rounded-full border-slate-200/80 bg-white/90 px-5 pr-12 text-sm shadow-[0_8px_24px_rgba(148,163,184,0.08)] placeholder:text-slate-400 focus-visible:border-[#4263eb]/40 focus-visible:ring-[#4263eb]/20"
            placeholder="请输入密码"
            type={passwordVisible ? 'text' : 'password'}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
          <Button
            aria-label={passwordVisible ? '隐藏密码' : '显示密码'}
            className="absolute inset-y-0 right-2 my-auto rounded-full text-slate-400 hover:bg-transparent hover:text-[#4263eb]"
            size="icon-sm"
            type="button"
            variant="ghost"
            onClick={() => setPasswordVisible((value) => !value)}
          >
            {passwordVisible ? <EyeOff className="size-4.5" /> : <Eye className="size-4.5" />}
          </Button>
        </div>
      </div>

      {error ? <p className="text-center text-sm text-rose-600">{error}</p> : null}

      <Button
        className="mt-2 h-[42px] rounded-full bg-[linear-gradient(135deg,#4c6fff_0%,#3458f4_100%)] text-sm font-semibold text-white shadow-[0_16px_32px_rgba(76,111,255,0.24)] hover:brightness-105"
        disabled={submitting}
        size="lg"
        type="submit"
      >
        {submitting ? '登录中…' : '登录'}
      </Button>

      <div className="flex items-center gap-4 pt-3 text-[13px] text-slate-400">
        <div className="h-px flex-1 bg-slate-200/80" />
        <p className="shrink-0 text-slate-500">
          还没有账号？
          <Link className="ml-1 font-medium text-[#4263eb] hover:text-[#3458f4]" to={`/register${location.search}`}>
            去注册
          </Link>
        </p>
        <div className="h-px flex-1 bg-slate-200/80" />
      </div>
    </form>
  );
}
