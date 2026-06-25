'use client';

import { useRouter } from 'next/navigation';
import { FormEvent, useState } from 'react';

export function LoginForm() {
  const router = useRouter();
  const [username, setUsername] = useState('Admin');
  const [password, setPassword] = useState('123456');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    const response = await fetch('/api/auth/sign-in', {
      method: 'POST',
      headers: {
        'content-type': 'application/json'
      },
      body: JSON.stringify({ username, password })
    });

    setSubmitting(false);
    if (!response.ok) {
      setError('用户名或密码不正确');
      return;
    }

    router.replace('/new');
    router.refresh();
  }

  return (
    <main className="grid min-h-screen place-items-center bg-slate-50 p-6 text-slate-900">
      <form
        className="flex w-full max-w-[420px] flex-col gap-5 rounded-lg border border-slate-200 bg-white p-7 shadow-[0_12px_32px_rgba(15,23,42,0.06)]"
        onSubmit={onSubmit}
      >
        <div>
          <p className="mb-1 text-xs font-bold uppercase text-blue-600">Cloud Agent Runtime</p>
          <h1 className="text-2xl font-semibold tracking-normal">登录控制台</h1>
          <p className="mt-2 text-sm leading-6 text-slate-500">
            先用本地 Admin 账号进入 runtime shell，后续再替换成正式多租户登录。
          </p>
        </div>

        <label className="flex flex-col gap-2 text-[13px] font-semibold text-slate-600">
          <span>用户名</span>
          <input
            className="min-h-[42px] rounded-lg border border-slate-200 px-3 text-slate-900 outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            autoComplete="username"
          />
        </label>

        <label className="flex flex-col gap-2 text-[13px] font-semibold text-slate-600">
          <span>密码</span>
          <input
            className="min-h-[42px] rounded-lg border border-slate-200 px-3 text-slate-900 outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            type="password"
            autoComplete="current-password"
          />
        </label>

        {error ? <p className="m-0 text-[13px] text-rose-700">{error}</p> : null}

        <button
          className="min-h-10 rounded-lg bg-blue-600 px-4 font-bold text-white disabled:cursor-not-allowed disabled:bg-slate-300"
          type="submit"
          disabled={submitting}
        >
          {submitting ? '登录中...' : '登录'}
        </button>
      </form>
    </main>
  );
}
