import { afterEach, describe, expect, it, vi } from 'vitest';

import { computeRemainingSeconds, postAuth, presentAuthError } from './auth-form-service';

describe('auth form service helpers', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('computes whole-second cooldown remaining time', () => {
    expect(computeRemainingSeconds(10_000, 9_001)).toBe(1);
    expect(computeRemainingSeconds(10_000, 8_999)).toBe(2);
    expect(computeRemainingSeconds(10_000, 10_000)).toBe(0);
    expect(computeRemainingSeconds(10_000, 11_000)).toBe(0);
  });

  it('maps auth error codes by mode', () => {
    expect(presentAuthError('login', 'INVALID_CREDENTIALS')).toBe('邮箱或密码不正确。');
    expect(presentAuthError('register', 'EMAIL_ALREADY_REGISTERED')).toBe('该邮箱已经注册，请直接登录。');
    expect(presentAuthError('forgot-password', 'CODE_EXPIRED')).toBe('验证码已过期，请重新发送。');
    expect(presentAuthError('login', 'UNKNOWN')).toBe('登录失败，请稍后再试。');
    expect(presentAuthError('register', 'UNKNOWN')).toBe('注册失败，请稍后再试。');
    expect(presentAuthError('forgot-password', 'UNKNOWN')).toBe('重置失败，请稍后再试。');
  });

  it('posts auth JSON and returns the parsed payload', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true })
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(postAuth('/api/auth/sign-in', { email: 'user@example.com' })).resolves.toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledWith('/api/auth/sign-in', {
      method: 'POST',
      headers: {
        'content-type': 'application/json'
      },
      body: JSON.stringify({ email: 'user@example.com' })
    });
  });

  it('throws the response error code for failed auth requests', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        json: async () => ({ error: 'RATE_LIMITED' })
      })
    );

    await expect(postAuth('/api/auth/sign-in', {})).rejects.toThrow('RATE_LIMITED');
  });
});
