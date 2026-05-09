type JsonRecord = Record<string, unknown>;

export type AuthUserDto = {
  id: string;
  email: string;
};

type AuthResult<T> = {
  ok: boolean;
  status: number;
  error: string | null;
  data: T;
};

function asRecord(value: unknown): JsonRecord | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  return value as JsonRecord;
}

function asString(value: unknown) {
  return typeof value === 'string' ? value : null;
}

function normalizeUser(value: unknown): AuthUserDto | null {
  const record = asRecord(value);
  if (!record) {
    return null;
  }

  const id = asString(record.id);
  const email = asString(record.email);
  if (!id || !email) {
    return null;
  }

  return {
    id,
    email
  };
}

function readApiError(value: unknown) {
  return asString(asRecord(value)?.error) ?? null;
}

async function readJson(response: Response) {
  return response.json().catch(() => ({}));
}

export async function fetchAuthMe(signal?: AbortSignal): Promise<AuthResult<{ user: AuthUserDto | null }>> {
  const response = await fetch('/api/auth/me', { signal });
  const raw = await readJson(response);
  const record = asRecord(raw) ?? {};

  return {
    ok: response.ok,
    status: response.status,
    error: readApiError(record),
    data: {
      user: normalizeUser(record.user)
    }
  };
}

export async function requestSignupCode(email: string): Promise<AuthResult<{ ok: boolean }>> {
  const response = await fetch('/api/auth/email/request-signup-code', {
    method: 'POST',
    headers: {
      'content-type': 'application/json'
    },
    body: JSON.stringify({ email })
  });
  const raw = await readJson(response);

  return {
    ok: response.ok,
    status: response.status,
    error: readApiError(raw),
    data: {
      ok: response.ok
    }
  };
}

export async function signUp(input: {
  email: string;
  code: string;
  password: string;
}): Promise<AuthResult<{ user: AuthUserDto | null }>> {
  const response = await fetch('/api/auth/sign-up', {
    method: 'POST',
    headers: {
      'content-type': 'application/json'
    },
    body: JSON.stringify(input)
  });
  const raw = await readJson(response);
  const record = asRecord(raw) ?? {};

  return {
    ok: response.ok,
    status: response.status,
    error: readApiError(record),
    data: {
      user: normalizeUser(record.user)
    }
  };
}

export async function signIn(input: {
  email: string;
  password: string;
}): Promise<AuthResult<{ user: AuthUserDto | null }>> {
  const response = await fetch('/api/auth/sign-in', {
    method: 'POST',
    headers: {
      'content-type': 'application/json'
    },
    body: JSON.stringify(input)
  });
  const raw = await readJson(response);
  const record = asRecord(raw) ?? {};

  return {
    ok: response.ok,
    status: response.status,
    error: readApiError(record),
    data: {
      user: normalizeUser(record.user)
    }
  };
}

export async function logout(): Promise<AuthResult<{ ok: boolean }>> {
  const response = await fetch('/api/auth/logout', {
    method: 'POST'
  });
  const raw = await readJson(response);

  return {
    ok: response.ok,
    status: response.status,
    error: readApiError(raw),
    data: {
      ok: response.ok
    }
  };
}
