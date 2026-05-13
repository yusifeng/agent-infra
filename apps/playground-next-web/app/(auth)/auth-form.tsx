'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Eye, EyeOff } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';

import { DeepseekLogo } from '@/components/chat-shell/deepseek-logo';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { buildAuthHref, resolveSafeNextPath } from './auth-url';

type AuthMode = 'login' | 'register' | 'forgot-password';

type AuthFormProps = {
  mode: AuthMode;
};

type AuthResponse = {
  user?: unknown;
  ok?: boolean;
  error?: string;
};

const EMAIL_CODE_COOLDOWN_SECONDS = 60;

function computeRemainingSeconds(cooldownEndsAt: number) {
  return Math.max(0, Math.ceil((cooldownEndsAt - Date.now()) / 1000));
}

function useEmailCodeCooldown(durationSeconds: number) {
  const [cooldownEndsAt, setCooldownEndsAt] = useState<number | null>(null);
  const [remainingSeconds, setRemainingSeconds] = useState(0);

  useEffect(() => {
    if (!cooldownEndsAt) {
      setRemainingSeconds(0);
      return;
    }

    const updateRemainingSeconds = () => {
      const nextRemainingSeconds = computeRemainingSeconds(cooldownEndsAt);
      setRemainingSeconds(nextRemainingSeconds);

      if (nextRemainingSeconds === 0) {
        setCooldownEndsAt(null);
      }
    };

    updateRemainingSeconds();
    const intervalId = window.setInterval(updateRemainingSeconds, 1000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [cooldownEndsAt]);

  return {
    remainingSeconds,
    isCooldownActive: remainingSeconds > 0,
    startCooldown() {
      const nextCooldownEndsAt = Date.now() + durationSeconds * 1000;
      setCooldownEndsAt(nextCooldownEndsAt);
      setRemainingSeconds(durationSeconds);
    }
  };
}

async function postAuth(path: string, body: Record<string, string>) {
  const response = await fetch(path, {
    method: 'POST',
    headers: {
      'content-type': 'application/json'
    },
    body: JSON.stringify(body)
  });
  const payload = (await response.json().catch(() => ({}))) as AuthResponse;

  if (!response.ok) {
    throw new Error(payload.error || 'AUTH_REQUEST_FAILED');
  }

  return payload;
}

function presentLoginError(error: string | null) {
  switch (error) {
    case 'INVALID_CREDENTIALS':
      return '邮箱或密码不正确。';
    case 'RATE_LIMITED':
      return '请求过于频繁，请稍后再试。';
    default:
      return '登录失败，请稍后再试。';
  }
}

function presentRegisterError(error: string | null) {
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

function presentResetError(error: string | null) {
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

export function AuthForm({ mode }: AuthFormProps) {
  const searchParams = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [code, setCode] = useState('');
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [sendingCode, setSendingCode] = useState(false);
  const [notice, setNotice] = useState<string | null>(mode === 'login' && searchParams.get('reset') === '1' ? '密码已重置，请使用新密码登录。' : null);
  const [error, setError] = useState<string | null>(null);
  const { remainingSeconds, isCooldownActive, startCooldown } = useEmailCodeCooldown(EMAIL_CODE_COOLDOWN_SECONDS);

  const isLogin = mode === 'login';
  const isRegister = mode === 'register';
  const isForgotPassword = mode === 'forgot-password';

  async function requestCode() {
    const emailInput = document.getElementById(`${mode}-email`) as HTMLInputElement | null;
    if (emailInput && !emailInput.reportValidity()) {
      return;
    }

    setSendingCode(true);
    setError(null);
    setNotice(null);

    try {
      const path = isForgotPassword
        ? '/api/auth/email/request-password-reset-code'
        : '/api/auth/email/request-signup-code';
      await postAuth(path, { email });
      startCooldown();
      setNotice(isForgotPassword ? '如果该邮箱已注册，我们已发送重置验证码。' : '验证码已发送，请检查邮箱。');
    } catch (requestError) {
      const errorCode = requestError instanceof Error ? requestError.message : 'AUTH_REQUEST_FAILED';
      if (errorCode === 'RATE_LIMITED') {
        startCooldown();
      }
      setError(isForgotPassword ? presentResetError(errorCode) : presentRegisterError(errorCode));
    } finally {
      setSendingCode(false);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setNotice(null);
    setSubmitting(true);

    try {
      if (isLogin) {
        await postAuth('/api/auth/sign-in', { email, password });
        window.location.assign(resolveSafeNextPath(searchParams));
        return;
      }

      if (isRegister) {
        await postAuth('/api/auth/sign-up', { email, code, password });
        window.location.assign(resolveSafeNextPath(searchParams));
        return;
      }

      await postAuth('/api/auth/reset-password', { email, code, newPassword });
      window.location.assign(buildAuthHref('/login', searchParams, { reset: '1' }));
    } catch (submitError) {
      const errorCode = submitError instanceof Error ? submitError.message : 'AUTH_REQUEST_FAILED';
      setError(isLogin ? presentLoginError(errorCode) : isRegister ? presentRegisterError(errorCode) : presentResetError(errorCode));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen overflow-hidden bg-[radial-gradient(circle_at_top,_rgba(66,99,235,0.12),_transparent_20%),linear-gradient(180deg,_#ffffff_0%,_#fbfdff_52%,_#f5f8ff_100%)] px-6 py-10 text-slate-950">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_18%_16%,_rgba(90,140,255,0.05),_transparent_26%),radial-gradient(circle_at_82%_18%,_rgba(90,140,255,0.04),_transparent_24%),radial-gradient(circle_at_50%_100%,_rgba(148,163,184,0.06),_transparent_32%)]" />
      <div className="relative mx-auto flex min-h-[calc(100vh-5rem)] max-w-[24rem] flex-col items-center justify-center">
        <section className="w-full">
          <div className="mb-10 flex flex-col items-center gap-3 text-center">
            <DeepseekLogo className="h-auto w-[13.5rem]" title="Playground" />
            <h1 className="sr-only">
              {isLogin ? '登录到 Playground' : isRegister ? '注册你的 Playground 账号' : '重置 Playground 密码'}
            </h1>
          </div>

          <form className="flex flex-col gap-3.5" onSubmit={handleSubmit}>
            <div className="flex flex-col gap-3">
              <label className="sr-only" htmlFor={`${mode}-email`}>
                邮箱
              </label>
              <Input
                id={`${mode}-email`}
                autoComplete="email"
                className="h-[42px] rounded-full border-slate-200/80 bg-white/90 px-5 text-sm shadow-[0_8px_24px_rgba(148,163,184,0.08)] placeholder:text-slate-400 focus-visible:border-[#4263eb]/40 focus-visible:ring-[#4263eb]/20"
                placeholder="请输入邮箱"
                required
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            </div>

            {!isLogin ? (
              <div className="flex flex-col gap-3">
                <label className="sr-only" htmlFor={`${mode}-code`}>
                  邮箱验证码
                </label>
                <div className="flex h-[42px] items-center rounded-full border border-slate-200/80 bg-white/90 pr-1.5 shadow-[0_8px_24px_rgba(148,163,184,0.08)] focus-within:border-[#4263eb]/40 focus-within:ring-3 focus-within:ring-[#4263eb]/20">
                  <Input
                    id={`${mode}-code`}
                    autoComplete="one-time-code"
                    className="h-full rounded-full border-0 bg-transparent px-5 text-sm shadow-none focus-visible:ring-0"
                    placeholder="请输入验证码"
                    required
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
                    onClick={requestCode}
                  >
                    {sendingCode ? '发送中…' : isCooldownActive ? `${remainingSeconds}s` : '发送验证码'}
                  </Button>
                </div>
              </div>
            ) : null}

            <div className="flex flex-col gap-3">
              <label className="sr-only" htmlFor={isForgotPassword ? 'forgot-password-new-password' : `${mode}-password`}>
                {isForgotPassword ? '新密码' : '密码'}
              </label>
              <div className="relative">
                <Input
                  id={isForgotPassword ? 'forgot-password-new-password' : `${mode}-password`}
                  autoComplete={isLogin ? 'current-password' : 'new-password'}
                  className="h-[42px] rounded-full border-slate-200/80 bg-white/90 px-5 pr-12 text-sm shadow-[0_8px_24px_rgba(148,163,184,0.08)] placeholder:text-slate-400 focus-visible:border-[#4263eb]/40 focus-visible:ring-[#4263eb]/20"
                  placeholder={isForgotPassword ? '请输入新密码' : '请输入密码'}
                  required
                  type={passwordVisible ? 'text' : 'password'}
                  value={isForgotPassword ? newPassword : password}
                  onChange={(event) => {
                    if (isForgotPassword) {
                      setNewPassword(event.target.value);
                      return;
                    }
                    setPassword(event.target.value);
                  }}
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

            {isRegister ? (
              <p className="pt-1 text-center text-[12px] leading-5 text-slate-400">
                注册登录即代表已阅读并同意我们的
                <span className="mx-1 font-medium text-slate-500">用户协议</span>
                与
                <span className="ml-1 font-medium text-slate-500">隐私政策</span>
              </p>
            ) : null}

            {notice ? <p className="text-center text-[13px] text-emerald-700">{notice}</p> : null}
            {error ? <p className="text-center text-[13px] text-rose-600">{error}</p> : null}

            <Button
              className="mt-2 h-[42px] rounded-full bg-[linear-gradient(135deg,#4c6fff_0%,#3458f4_100%)] text-sm font-semibold text-white shadow-[0_16px_32px_rgba(76,111,255,0.24)] hover:brightness-105"
              disabled={submitting}
              size="lg"
              type="submit"
            >
              {submitting ? (isLogin ? '登录中…' : isRegister ? '注册中…' : '重置中…') : isLogin ? '登录' : isRegister ? '完成注册' : '重置密码'}
            </Button>

            {isLogin ? (
              <div className="-mt-1 flex justify-end">
                <Link className="text-[13px] font-medium text-slate-500 hover:text-[#4263eb]" href={buildAuthHref('/forgot-password', searchParams)}>
                  忘记密码？
                </Link>
              </div>
            ) : null}

            <div className="flex items-center gap-4 pt-3 text-[13px] text-slate-400">
              <div className="h-px flex-1 bg-slate-200/80" />
              <p className="shrink-0 text-slate-500">
                {isLogin ? '还没有账号？' : isRegister ? '已有账号？' : '想起密码了？'}
                <Link
                  className="ml-1 font-medium text-[#4263eb] hover:text-[#3458f4]"
                  href={buildAuthHref(isLogin ? '/register' : '/login', searchParams)}
                >
                  {isLogin ? '去注册' : '去登录'}
                </Link>
              </p>
              <div className="h-px flex-1 bg-slate-200/80" />
            </div>
          </form>
        </section>
      </div>
    </main>
  );
}
