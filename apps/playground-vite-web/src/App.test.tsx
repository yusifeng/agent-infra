import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import App from './App';

const authApiMocks = vi.hoisted(() => ({
  fetchAuthMe: vi.fn(),
  requestSignupCode: vi.fn(),
  requestPasswordResetCode: vi.fn(),
  resetPassword: vi.fn(),
  signUp: vi.fn(),
  signIn: vi.fn(),
  logout: vi.fn()
}));

vi.mock('@/features/auth/repo/auth-api', () => ({
  fetchAuthMe: (...args: unknown[]) => authApiMocks.fetchAuthMe(...args),
  requestSignupCode: (...args: unknown[]) => authApiMocks.requestSignupCode(...args),
  requestPasswordResetCode: (...args: unknown[]) => authApiMocks.requestPasswordResetCode(...args),
  resetPassword: (...args: unknown[]) => authApiMocks.resetPassword(...args),
  signUp: (...args: unknown[]) => authApiMocks.signUp(...args),
  signIn: (...args: unknown[]) => authApiMocks.signIn(...args),
  logout: (...args: unknown[]) => authApiMocks.logout(...args)
}));

vi.mock('@/features/durable-chat/durable-chat-console', () => ({
  DurableChatConsole: ({
    initialThreadId,
    headerTrailingContent
  }: {
    initialThreadId: string | null;
    headerTrailingContent?: React.ReactNode;
  }) => (
    <div>
      <div data-testid="durable-chat-console">{initialThreadId ?? 'new-thread'}</div>
      {headerTrailingContent}
    </div>
  )
}));

vi.mock('@/features/durable-chat/replay-console', () => ({
  ReplayConsole: ({ initialThreadId }: { initialThreadId: string | null }) => (
    <div data-testid="replay-console">{initialThreadId ?? 'no-thread'}</div>
  )
}));

vi.mock('@/features/durable-chat/shared-snapshot-console', () => ({
  SharedSnapshotConsole: ({ initialPublicId }: { initialPublicId: string | null }) => (
    <div data-testid="shared-snapshot-console">{initialPublicId ?? 'no-share'}</div>
  )
}));

function renderApp(initialEntries: string[]) {
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <App />
    </MemoryRouter>
  );
}

describe('App auth gate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authApiMocks.fetchAuthMe.mockResolvedValue({
      ok: true,
      status: 200,
      error: null,
      data: {
        user: null
      }
    });
    authApiMocks.requestSignupCode.mockResolvedValue({
      ok: true,
      status: 200,
      error: null,
      data: {
        ok: true
      }
    });
    authApiMocks.requestPasswordResetCode.mockResolvedValue({
      ok: true,
      status: 200,
      error: null,
      data: {
        ok: true
      }
    });
    authApiMocks.resetPassword.mockResolvedValue({
      ok: true,
      status: 200,
      error: null,
      data: {
        ok: true
      }
    });
    authApiMocks.signUp.mockResolvedValue({
      ok: true,
      status: 200,
      error: null,
      data: {
        user: {
          id: 'user-1',
          email: 'user@example.com'
        }
      }
    });
    authApiMocks.signIn.mockResolvedValue({
      ok: true,
      status: 200,
      error: null,
      data: {
        user: {
          id: 'user-1',
          email: 'user@example.com'
        }
      }
    });
    authApiMocks.logout.mockResolvedValue({
      ok: true,
      status: 200,
      error: null,
      data: {
        ok: true
      }
    });
  });

  afterEach(() => {
    cleanup();
  });

  it('redirects unauthenticated protected routes to the login page', async () => {
    renderApp(['/chat/thread-1']);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: '登录' })).toBeTruthy();
    });
  });

  it('keeps public share routes readable without authentication', async () => {
    renderApp(['/share/public-1']);

    await waitFor(() => {
      expect(screen.getByTestId('shared-snapshot-console').textContent).toBe('public-1');
    });
  });

  it('renders the chat console for authenticated users', async () => {
    authApiMocks.fetchAuthMe.mockResolvedValue({
      ok: true,
      status: 200,
      error: null,
      data: {
        user: {
          id: 'user-1',
          email: 'user@example.com'
        }
      }
    });

    renderApp(['/chat/thread-42']);

    await waitFor(() => {
      expect(screen.getByTestId('durable-chat-console').textContent).toBe('thread-42');
    });
  });

  it('submits login credentials and navigates to the requested route', async () => {
    renderApp(['/login?next=%2Fchat%2Fthread-9']);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: '登录' })).toBeTruthy();
    });

    fireEvent.change(screen.getByLabelText('邮箱'), {
      target: {
        value: 'user@example.com'
      }
    });
    fireEvent.change(screen.getByLabelText('密码'), {
      target: {
        value: 'correct horse battery staple'
      }
    });
    fireEvent.click(screen.getByRole('button', { name: '登录' }));

    await waitFor(() => {
      expect(screen.getByTestId('durable-chat-console').textContent).toBe('thread-9');
    });
  });

  it('falls back to /new when login next is protocol-relative', async () => {
    renderApp(['/login?next=%2F%2Fevil.example']);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: '登录' })).toBeTruthy();
    });

    fireEvent.change(screen.getByLabelText('邮箱'), {
      target: {
        value: 'user@example.com'
      }
    });
    fireEvent.change(screen.getByLabelText('密码'), {
      target: {
        value: 'correct horse battery staple'
      }
    });
    fireEvent.click(screen.getByRole('button', { name: '登录' }));

    await waitFor(() => {
      expect(screen.getByTestId('durable-chat-console').textContent).toBe('new-thread');
    });
  });

  it('preserves next when switching from login to register before authenticating', async () => {
    renderApp(['/login?next=%2Fchat%2Fthread-15']);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: '登录' })).toBeTruthy();
    });

    fireEvent.click(screen.getByRole('link', { name: '去注册' }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: '完成注册' })).toBeTruthy();
    });

    fireEvent.change(screen.getByLabelText('邮箱'), {
      target: {
        value: 'user@example.com'
      }
    });
    fireEvent.click(screen.getByRole('button', { name: '发送验证码' }));

    await waitFor(() => {
      expect(authApiMocks.requestSignupCode).toHaveBeenCalledWith('user@example.com');
    });

    fireEvent.change(screen.getByLabelText('邮箱验证码'), {
      target: {
        value: '123456'
      }
    });
    fireEvent.change(screen.getByLabelText('密码'), {
      target: {
        value: 'correct horse battery staple'
      }
    });
    fireEvent.click(screen.getByRole('button', { name: '完成注册' }));

    await waitFor(() => {
      expect(screen.getByTestId('durable-chat-console').textContent).toBe('thread-15');
    });
  });

  it('sends a signup code and completes registration', async () => {
    renderApp(['/register']);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: '完成注册' })).toBeTruthy();
    });

    fireEvent.change(screen.getByLabelText('邮箱'), {
      target: {
        value: 'user@example.com'
      }
    });
    fireEvent.click(screen.getByRole('button', { name: '发送验证码' }));

    await waitFor(() => {
      expect(authApiMocks.requestSignupCode).toHaveBeenCalledWith('user@example.com');
      expect(screen.getByText('验证码已发送，请检查邮箱。')).toBeTruthy();
    });

    fireEvent.change(screen.getByLabelText('邮箱验证码'), {
      target: {
        value: '123456'
      }
    });
    fireEvent.change(screen.getByLabelText('密码'), {
      target: {
        value: 'correct horse battery staple'
      }
    });
    fireEvent.click(screen.getByRole('button', { name: '完成注册' }));

    await waitFor(() => {
      expect(screen.getByTestId('durable-chat-console').textContent).toBe('new-thread');
    });
  });

  it('logs out an authenticated user back to the login page', async () => {
    authApiMocks.fetchAuthMe.mockResolvedValue({
      ok: true,
      status: 200,
      error: null,
      data: {
        user: {
          id: 'user-1',
          email: 'user@example.com'
        }
      }
    });

    renderApp(['/chat/thread-7']);

    await waitFor(() => {
      expect(screen.getByTestId('durable-chat-console').textContent).toBe('thread-7');
    });

    fireEvent.click(screen.getByRole('button', { name: '退出' }));

    await waitFor(() => {
      expect(authApiMocks.logout).toHaveBeenCalledTimes(1);
      expect(screen.getByRole('button', { name: '登录' })).toBeTruthy();
    });

    expect(screen.getByRole('link', { name: '去注册' }).getAttribute('href')).toBe('/register');
  });

  it('requests a password reset code and returns to login after a successful reset', async () => {
    renderApp(['/login?next=%2Fchat%2Fthread-19']);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: '登录' })).toBeTruthy();
    });

    fireEvent.click(screen.getByRole('link', { name: '忘记密码？' }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: '重置密码' })).toBeTruthy();
    });

    fireEvent.change(screen.getByLabelText('邮箱'), {
      target: {
        value: 'user@example.com'
      }
    });
    fireEvent.click(screen.getByRole('button', { name: '发送验证码' }));

    await waitFor(() => {
      expect(authApiMocks.requestPasswordResetCode).toHaveBeenCalledWith('user@example.com');
      expect(screen.getByText('如果该邮箱已注册，我们已发送重置验证码。')).toBeTruthy();
    });

    fireEvent.change(screen.getByLabelText('邮箱验证码'), {
      target: {
        value: '654321'
      }
    });
    fireEvent.change(screen.getByLabelText('新密码'), {
      target: {
        value: 'updated-password'
      }
    });
    fireEvent.click(screen.getByRole('button', { name: '重置密码' }));

    await waitFor(() => {
      expect(authApiMocks.resetPassword).toHaveBeenCalledWith({
        email: 'user@example.com',
        code: '654321',
        newPassword: 'updated-password'
      });
      expect(screen.getByRole('button', { name: '登录' })).toBeTruthy();
      expect(screen.getByText('密码已重置，请使用新密码登录。')).toBeTruthy();
    });

    expect(screen.getByRole('link', { name: '去注册' }).getAttribute('href')).toBe('/register?next=%2Fchat%2Fthread-19');
  });

  it('returns to the login page even when logout fails', async () => {
    authApiMocks.fetchAuthMe.mockResolvedValue({
      ok: true,
      status: 200,
      error: null,
      data: {
        user: {
          id: 'user-1',
          email: 'user@example.com'
        }
      }
    });
    authApiMocks.logout.mockRejectedValue(new Error('network down'));

    renderApp(['/chat/thread-8']);

    await waitFor(() => {
      expect(screen.getByTestId('durable-chat-console').textContent).toBe('thread-8');
    });

    fireEvent.click(screen.getByRole('button', { name: '退出' }));

    await waitFor(() => {
      expect(authApiMocks.logout).toHaveBeenCalledTimes(1);
      expect(screen.getByRole('button', { name: '登录' })).toBeTruthy();
    });

    expect(screen.getByRole('link', { name: '去注册' }).getAttribute('href')).toBe('/register');
  });
});
