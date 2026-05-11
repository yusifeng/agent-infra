import { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { Link, useLocation, useNavigate } from 'react-router-dom';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { requestPasswordResetCode, resetPassword } from '@/features/auth/repo/auth-api';

function presentAuthError(error: string | null) {
  switch (error) {
    case 'INVALID_EMAIL':
      return '请输入有效的邮箱地址。';
    case 'INVALID_CODE':
      return '验证码不正确。';
    case 'CODE_EXPIRED':
      return '验证码已过期，请重新发送。';
    case 'PASSWORD_TOO_SHORT':
      return '密码至少需要 8 位。';
    case 'RATE_LIMITED':
      return '请求过于频繁，请稍后再试。';
    default:
      return '重置失败，请稍后再试。';
  }
}

export function ForgotPasswordForm() {
  const location = useLocation();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [sendingCode, setSendingCode] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  return (
    <form
      className="flex flex-col gap-3.5"
      onSubmit={async (event) => {
        event.preventDefault();
        setSubmitting(true);
        setError(null);
        setNotice(null);

        try {
          const result = await resetPassword({
            email,
            code,
            newPassword
          });

          if (!result.ok) {
            setError(presentAuthError(result.error));
            return;
          }

          navigate(`/login${location.search}`, {
            replace: true,
            state: {
              notice: '密码已重置，请使用新密码登录。'
            }
          });
        } catch {
          setError('重置失败，请稍后再试。');
        } finally {
          setSubmitting(false);
        }
      }}
    >
      <div className="flex flex-col gap-3">
        <label className="sr-only" htmlFor="forgot-password-email">
          邮箱
        </label>
        <Input
          id="forgot-password-email"
          autoComplete="email"
          className="h-[42px] rounded-full border-slate-200/80 bg-white/90 px-5 text-sm shadow-[0_8px_24px_rgba(148,163,184,0.08)] placeholder:text-slate-400 focus-visible:border-[#4263eb]/40 focus-visible:ring-[#4263eb]/20"
          placeholder="请输入邮箱"
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
      </div>

      <div className="flex flex-col gap-3">
        <label className="sr-only" htmlFor="forgot-password-code">
          邮箱验证码
        </label>
        <div className="flex h-[42px] items-center rounded-full border border-slate-200/80 bg-white/90 pr-1.5 shadow-[0_8px_24px_rgba(148,163,184,0.08)] focus-within:border-[#4263eb]/40 focus-within:ring-3 focus-within:ring-[#4263eb]/20">
          <Input
            id="forgot-password-code"
            autoComplete="one-time-code"
            className="h-full rounded-full border-0 bg-transparent px-5 text-sm shadow-none focus-visible:ring-0"
            placeholder="请输入验证码"
            value={code}
            onChange={(event) => setCode(event.target.value)}
          />
          <div className="h-6 w-px bg-slate-200" />
          <Button
            className="h-[36px] shrink-0 rounded-full px-3.5 text-[13px] font-semibold text-[#4263eb] hover:bg-transparent hover:text-[#3458f4]"
            disabled={sendingCode}
            size="sm"
            type="button"
            variant="ghost"
            onClick={async () => {
              setSendingCode(true);
              setError(null);
              setNotice(null);

              try {
                const result = await requestPasswordResetCode(email);
                if (!result.ok) {
                  setError(presentAuthError(result.error));
                  return;
                }

                setNotice('如果该邮箱已注册，我们已发送重置验证码。');
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
      </div>

      <div className="flex flex-col gap-3">
        <label className="sr-only" htmlFor="forgot-password-new-password">
          新密码
        </label>
        <div className="relative">
          <Input
            id="forgot-password-new-password"
            autoComplete="new-password"
            className="h-[42px] rounded-full border-slate-200/80 bg-white/90 px-5 pr-12 text-sm shadow-[0_8px_24px_rgba(148,163,184,0.08)] placeholder:text-slate-400 focus-visible:border-[#4263eb]/40 focus-visible:ring-[#4263eb]/20"
            placeholder="请输入新密码"
            type={passwordVisible ? 'text' : 'password'}
            value={newPassword}
            onChange={(event) => setNewPassword(event.target.value)}
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

      {notice ? <p className="pt-1 text-center text-[13px] text-emerald-700">{notice}</p> : null}
      {error ? <p className="pt-1 text-center text-[13px] text-rose-600">{error}</p> : null}

      <Button
        className="mt-2 h-[42px] rounded-full bg-[linear-gradient(135deg,#4c6fff_0%,#3458f4_100%)] text-sm font-semibold text-white shadow-[0_16px_32px_rgba(76,111,255,0.24)] hover:brightness-105"
        disabled={submitting}
        size="lg"
        type="submit"
      >
        {submitting ? '重置中…' : '重置密码'}
      </Button>

      <div className="flex items-center gap-4 pt-3 text-[13px] text-slate-400">
        <div className="h-px flex-1 bg-slate-200/80" />
        <p className="shrink-0 text-slate-500">
          想起密码了？
          <Link className="ml-1 font-medium text-[#4263eb] hover:text-[#3458f4]" to={`/login${location.search}`}>
            去登录
          </Link>
        </p>
        <div className="h-px flex-1 bg-slate-200/80" />
      </div>
    </form>
  );
}
