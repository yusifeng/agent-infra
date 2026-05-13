'use client';

import Link from 'next/link';
import { useState } from 'react';
import type { FormEvent } from 'react';

type AuthMode = 'login' | 'register' | 'forgot-password';

type AuthFormProps = {
  mode: AuthMode;
};

type AuthResponse = {
  user?: unknown;
  ok?: boolean;
  error?: string;
};

function getSafeNextPath() {
  const value = new URL(window.location.href).searchParams.get('next') ?? '/new';
  if (!value.startsWith('/') || value.startsWith('//')) {
    return '/new';
  }

  return value;
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

function titleForMode(mode: AuthMode) {
  if (mode === 'register') {
    return 'Create account';
  }

  if (mode === 'forgot-password') {
    return 'Reset password';
  }

  return 'Sign in';
}

function primaryActionForMode(mode: AuthMode) {
  if (mode === 'register') {
    return 'Create account';
  }

  if (mode === 'forgot-password') {
    return 'Reset password';
  }

  return 'Sign in';
}

export function AuthForm({ mode }: AuthFormProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [code, setCode] = useState('');
  const [pending, setPending] = useState(false);
  const [codePending, setCodePending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function requestCode() {
    setError(null);
    setMessage(null);
    setCodePending(true);

    try {
      const path =
        mode === 'forgot-password'
          ? '/api/auth/email/request-password-reset-code'
          : '/api/auth/email/request-signup-code';
      await postAuth(path, { email });
      setMessage('Code sent.');
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'AUTH_REQUEST_FAILED');
    } finally {
      setCodePending(false);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setMessage(null);
    setPending(true);

    try {
      if (mode === 'login') {
        await postAuth('/api/auth/sign-in', { email, password });
        window.location.assign(getSafeNextPath());
        return;
      }

      if (mode === 'register') {
        await postAuth('/api/auth/sign-up', { email, code, password });
        window.location.assign(getSafeNextPath());
        return;
      }

      await postAuth('/api/auth/reset-password', { email, code, newPassword });
      setMessage('Password reset. You can sign in now.');
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'AUTH_REQUEST_FAILED');
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="min-h-screen overflow-y-auto bg-[var(--chat-bg)] px-4 py-10 text-[var(--chat-text)]">
      <section className="mx-auto flex min-h-[calc(100dvh-5rem)] w-full max-w-sm flex-col justify-center">
        <div className="mb-8">
          <p className="text-sm text-[var(--chat-muted)]">Agent Infra Playground</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-normal">{titleForMode(mode)}</h1>
        </div>

        <form className="space-y-4" onSubmit={handleSubmit}>
          <label className="block space-y-2">
            <span className="text-sm text-[var(--chat-muted)]">Email</span>
            <input
              className="w-full rounded-md border border-[var(--chat-border)] bg-[var(--chat-surface)] px-3 py-2 text-sm outline-none focus:border-[var(--chat-accent)]"
              autoComplete="email"
              inputMode="email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
          </label>

          {mode !== 'login' ? (
            <div className="flex items-end gap-2">
              <label className="block flex-1 space-y-2">
                <span className="text-sm text-[var(--chat-muted)]">Code</span>
                <input
                  className="w-full rounded-md border border-[var(--chat-border)] bg-[var(--chat-surface)] px-3 py-2 text-sm outline-none focus:border-[var(--chat-accent)]"
                  autoComplete="one-time-code"
                  value={code}
                  onChange={(event) => setCode(event.target.value)}
                  required
                />
              </label>
              <button
                className="h-10 rounded-md border border-[var(--chat-border)] px-3 text-sm text-[var(--chat-text)] disabled:cursor-not-allowed disabled:opacity-60"
                disabled={codePending || !email}
                type="button"
                onClick={requestCode}
              >
                {codePending ? 'Sending' : 'Send code'}
              </button>
            </div>
          ) : null}

          {mode === 'forgot-password' ? (
            <label className="block space-y-2">
              <span className="text-sm text-[var(--chat-muted)]">New password</span>
              <input
                className="w-full rounded-md border border-[var(--chat-border)] bg-[var(--chat-surface)] px-3 py-2 text-sm outline-none focus:border-[var(--chat-accent)]"
                autoComplete="new-password"
                type="password"
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                required
              />
            </label>
          ) : (
            <label className="block space-y-2">
              <span className="text-sm text-[var(--chat-muted)]">Password</span>
              <input
                className="w-full rounded-md border border-[var(--chat-border)] bg-[var(--chat-surface)] px-3 py-2 text-sm outline-none focus:border-[var(--chat-accent)]"
                autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
              />
            </label>
          )}

          {error ? <p className="text-sm text-red-400">{error}</p> : null}
          {message ? <p className="text-sm text-[var(--chat-muted)]">{message}</p> : null}

          <button
            className="h-10 w-full rounded-md bg-[var(--chat-accent)] px-4 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-60"
            disabled={pending}
            type="submit"
          >
            {pending ? 'Working' : primaryActionForMode(mode)}
          </button>
        </form>

        <nav className="mt-6 flex flex-wrap gap-x-4 gap-y-2 text-sm text-[var(--chat-muted)]">
          {mode !== 'login' ? <Link href="/login">Sign in</Link> : null}
          {mode !== 'register' ? <Link href="/register">Create account</Link> : null}
          {mode !== 'forgot-password' ? <Link href="/forgot-password">Forgot password</Link> : null}
        </nav>
      </section>
    </main>
  );
}
