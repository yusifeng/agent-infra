import type { AuthMode } from './auth-form-types';

export type AuthResponse = {
  user?: unknown;
  ok?: boolean;
  error?: string;
};

export function computeRemainingSeconds(cooldownEndsAt: number, nowMs = Date.now()) {
  return Math.max(0, Math.ceil((cooldownEndsAt - nowMs) / 1000));
}

export async function postAuth(path: string, body: Record<string, string>) {
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

export function presentLoginError(error: string | null) {
  switch (error) {
    case 'INVALID_CREDENTIALS':
      return '邮箱或密码不正确。';
    case 'RATE_LIMITED':
      return '请求过于频繁，请稍后再试。';
    default:
      return '登录失败，请稍后再试。';
  }
}

export function presentRegisterError(error: string | null) {
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

export function presentResetError(error: string | null) {
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

export function presentAuthError(mode: AuthMode, error: string | null) {
  if (mode === 'login') {
    return presentLoginError(error);
  }

  if (mode === 'register') {
    return presentRegisterError(error);
  }

  return presentResetError(error);
}
