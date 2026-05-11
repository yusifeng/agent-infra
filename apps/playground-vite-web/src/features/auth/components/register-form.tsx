import { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';

import { requestSignupCode, signUp, type AuthUserDto } from '@/features/auth/repo/auth-api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useEmailCodeCooldown } from '@/features/auth/runtime/use-email-code-cooldown';

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

const EMAIL_CODE_COOLDOWN_SECONDS = 60;

export function RegisterForm(props: {
  onAuthenticated: (user: AuthUserDto) => void;
}) {
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [sendingCode, setSendingCode] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { remainingSeconds, isCooldownActive, startCooldown } = useEmailCodeCooldown(EMAIL_CODE_COOLDOWN_SECONDS);

  return (
    <form
      className="flex flex-col gap-3.5"
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
      <div className="flex flex-col gap-3">
        <label className="sr-only" htmlFor="register-email">
          邮箱
        </label>
        <Input
          id="register-email"
          autoComplete="email"
          className="h-[42px] rounded-full border-slate-200/80 bg-white/90 px-5 text-sm shadow-[0_8px_24px_rgba(148,163,184,0.08)] placeholder:text-slate-400 focus-visible:border-[#4263eb]/40 focus-visible:ring-[#4263eb]/20"
          placeholder="请输入邮箱"
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
      </div>

      <div className="flex flex-col gap-3">
        <label className="sr-only" htmlFor="register-code">
          邮箱验证码
        </label>
        <div className="flex h-[42px] items-center rounded-full border border-slate-200/80 bg-white/90 pr-1.5 shadow-[0_8px_24px_rgba(148,163,184,0.08)] focus-within:border-[#4263eb]/40 focus-within:ring-3 focus-within:ring-[#4263eb]/20">
          <Input
            id="register-code"
            autoComplete="one-time-code"
            className="h-full rounded-full border-0 bg-transparent px-5 text-sm shadow-none focus-visible:ring-0"
            placeholder="请输入验证码"
            value={code}
            onChange={(event) => setCode(event.target.value)}
          />
          <div className="h-6 w-px bg-slate-200" />
          <Button
            className="h-[36px] shrink-0 rounded-full px-3.5 text-[13px] font-semibold text-[#4263eb] hover:bg-transparent hover:text-[#3458f4]"
            disabled={sendingCode || isCooldownActive}
            size="sm"
            type="button"
            variant="ghost"
            onClick={async () => {
              setSendingCode(true);
              setError(null);
              setNotice(null);

              try {
                const result = await requestSignupCode(email);
                if (!result.ok) {
                  if (result.error === 'RATE_LIMITED') {
                    startCooldown();
                  }
                  setError(presentAuthError(result.error));
                  return;
                }

                startCooldown();
                setNotice('验证码已发送，请检查邮箱。');
              } catch {
                setError('验证码发送失败，请稍后再试。');
              } finally {
                setSendingCode(false);
              }
            }}
          >
            {sendingCode ? '发送中…' : isCooldownActive ? `${remainingSeconds}s` : '发送验证码'}
          </Button>
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <label className="sr-only" htmlFor="register-password">
          密码
        </label>
        <div className="relative">
          <Input
            id="register-password"
            autoComplete="new-password"
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

      <p className="pt-1 text-center text-[12px] leading-5 text-slate-400">
        注册登录即代表已阅读并同意我们的
        <span className="mx-1 font-medium text-slate-500">用户协议</span>
        与
        <span className="ml-1 font-medium text-slate-500">隐私政策</span>
      </p>

      {notice ? <p className="text-center text-[13px] text-emerald-700">{notice}</p> : null}
      {error ? <p className="text-center text-[13px] text-rose-600">{error}</p> : null}

      <Button
        className="mt-2 h-[42px] rounded-full bg-[linear-gradient(135deg,#4c6fff_0%,#3458f4_100%)] text-sm font-semibold text-white shadow-[0_16px_32px_rgba(76,111,255,0.24)] hover:brightness-105"
        disabled={submitting}
        size="lg"
        type="submit"
      >
        {submitting ? '注册中…' : '完成注册'}
      </Button>

      <div className="flex items-center gap-4 pt-3 text-[13px] text-slate-400">
        <div className="h-px flex-1 bg-slate-200/80" />
        <p className="shrink-0 text-slate-500">
          已有账号？
          <Link className="ml-1 font-medium text-[#4263eb] hover:text-[#3458f4]" to={`/login${location.search}`}>
            去登录
          </Link>
        </p>
        <div className="h-px flex-1 bg-slate-200/80" />
      </div>
    </form>
  );
}
