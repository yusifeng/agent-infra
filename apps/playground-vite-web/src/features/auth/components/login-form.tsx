import { useState } from 'react';
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
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <form
      className="flex flex-col gap-4"
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
      <div className="flex flex-col gap-2">
        <label className="text-sm font-medium text-slate-700" htmlFor="login-email">
          邮箱
        </label>
        <Input
          id="login-email"
          autoComplete="email"
          placeholder="name@example.com"
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
      </div>

      <div className="flex flex-col gap-2">
        <label className="text-sm font-medium text-slate-700" htmlFor="login-password">
          密码
        </label>
        <Input
          id="login-password"
          autoComplete="current-password"
          placeholder="请输入密码"
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
      </div>

      {error ? <p className="text-sm text-rose-600">{error}</p> : null}

      <Button disabled={submitting} size="lg" type="submit">
        {submitting ? '登录中…' : '登录'}
      </Button>

      <p className="text-sm text-slate-500">
        还没有账号？
        <Link className="ml-1 font-medium text-slate-900 underline underline-offset-4" to={`/register${location.search}`}>
          去注册
        </Link>
      </p>
    </form>
  );
}
