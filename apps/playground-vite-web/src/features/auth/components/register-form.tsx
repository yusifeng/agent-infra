import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';

import { requestSignupCode, signUp, type AuthUserDto } from '@/features/auth/repo/auth-api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

function presentAuthError(error: string | null) {
  switch (error) {
    case 'INVALID_EMAIL':
      return '请输入有效的邮箱地址。';
    case 'EMAIL_ALREADY_REGISTERED':
      return '该邮箱已经注册，请直接登录。';
    case 'INVALID_CODE':
      return '验证码不正确。';
    case 'CODE_EXPIRED':
      return '验证码已过期，请重新发送。';
    case 'PASSWORD_TOO_SHORT':
      return '密码至少需要 8 位。';
    case 'RATE_LIMITED':
      return '请求过于频繁，请稍后再试。';
    case 'AUTH_EMAIL_UNAVAILABLE':
      return '验证码邮件暂时发送失败，请稍后重试。';
    default:
      return '注册失败，请稍后再试。';
  }
}

export function RegisterForm(props: {
  onAuthenticated: (user: AuthUserDto) => void;
}) {
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [sendingCode, setSendingCode] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={async (event) => {
        event.preventDefault();
        setSubmitting(true);
        setError(null);
        setNotice(null);

        try {
          const result = await signUp({
            email,
            code,
            password
          });

          if (!result.ok || !result.data.user) {
            setError(presentAuthError(result.error));
            return;
          }

          props.onAuthenticated(result.data.user);
        } catch {
          setError('注册失败，请稍后再试。');
        } finally {
          setSubmitting(false);
        }
      }}
    >
      <div className="flex flex-col gap-2">
        <label className="text-sm font-medium text-slate-700" htmlFor="register-email">
          邮箱
        </label>
        <Input
          id="register-email"
          autoComplete="email"
          placeholder="name@example.com"
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
        <div className="flex flex-col gap-2">
          <label className="text-sm font-medium text-slate-700" htmlFor="register-code">
            邮箱验证码
          </label>
          <Input
            id="register-code"
            autoComplete="one-time-code"
            placeholder="输入 6 位验证码"
            value={code}
            onChange={(event) => setCode(event.target.value)}
          />
        </div>

        <Button
          disabled={sendingCode}
          type="button"
          variant="outline"
          onClick={async () => {
            setSendingCode(true);
            setError(null);
            setNotice(null);

            try {
              const result = await requestSignupCode(email);
              if (!result.ok) {
                setError(presentAuthError(result.error));
                return;
              }

              setNotice('验证码已发送，请检查邮箱。');
            } catch {
              setError('验证码发送失败，请稍后再试。');
            } finally {
              setSendingCode(false);
            }
          }}
        >
          {sendingCode ? '发送中…' : '发送验证码'}
        </Button>
      </div>

      <div className="flex flex-col gap-2">
        <label className="text-sm font-medium text-slate-700" htmlFor="register-password">
          密码
        </label>
        <Input
          id="register-password"
          autoComplete="new-password"
          placeholder="至少 8 位"
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
      </div>

      {notice ? <p className="text-sm text-emerald-700">{notice}</p> : null}
      {error ? <p className="text-sm text-rose-600">{error}</p> : null}

      <Button disabled={submitting} size="lg" type="submit">
        {submitting ? '注册中…' : '完成注册'}
      </Button>

      <p className="text-sm text-slate-500">
        已经有账号？
        <Link className="ml-1 font-medium text-slate-900 underline underline-offset-4" to={`/login${location.search}`}>
          去登录
        </Link>
      </p>
    </form>
  );
}
