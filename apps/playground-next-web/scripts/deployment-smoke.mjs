const DEFAULT_BASE_URL = 'https://deepseek.zhangdawei.org';
const DEFAULT_PROMPT = 'Reply with exactly ok.';
const DEFAULT_THREAD_TITLE = 'Next deployment smoke';

function normalizeBaseUrl(value) {
  return value.replace(/\/+$/, '');
}

function mergeHeaders(...headersList) {
  const headers = new Headers();

  for (const headersLike of headersList) {
    if (!headersLike) {
      continue;
    }

    new Headers(headersLike).forEach((value, key) => {
      headers.set(key, value);
    });
  }

  return headers;
}

function splitSseFrames(buffer) {
  return buffer.replace(/\r\n/g, '\n').split('\n\n');
}

function toRequestError(method, url, error) {
  const cause = error?.cause;
  if (cause?.code === 'ECONNRESET') {
    return new Error(
      `${method} ${url} failed before application handling. ` +
        'The current shell could not complete the TLS connection. ' +
        'Retry from a different network, or point the smoke command at a reachable deployment URL via PLAYGROUND_NEXT_WEB_BASE_URL.'
    );
  }

  return error instanceof Error ? error : new Error(String(error));
}

async function fetchJson(url, init) {
  const method = init?.method ?? 'GET';
  let response;
  try {
    response = await fetch(url, init);
  } catch (error) {
    throw toRequestError(method, url, error);
  }
  const text = await response.text();

  if (!response.ok) {
    throw new Error(`${method} ${url} failed with ${response.status}: ${text}`);
  }

  return JSON.parse(text);
}

function getSetCookieHeaders(response) {
  if (typeof response.headers.getSetCookie === 'function') {
    return response.headers.getSetCookie();
  }

  const header = response.headers.get('set-cookie');
  return header ? [header] : [];
}

function toCookieHeader(setCookieHeaders) {
  return setCookieHeaders
    .map((value) => value.split(';')[0]?.trim())
    .filter(Boolean)
    .join('; ');
}

async function signInForSmoke(baseUrl) {
  const email = process.env.PLAYGROUND_NEXT_WEB_SMOKE_EMAIL;
  const password = process.env.PLAYGROUND_NEXT_WEB_SMOKE_PASSWORD;

  if (!email || !password) {
    throw new Error(
      'Authenticated deployment smoke requires PLAYGROUND_NEXT_WEB_SMOKE_EMAIL and PLAYGROUND_NEXT_WEB_SMOKE_PASSWORD. ' +
        'Create a deployed smoke user, set both variables, and rerun the smoke command.'
    );
  }

  const url = `${baseUrl}/api/auth/sign-in`;
  let response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin: baseUrl
      },
      body: JSON.stringify({ email, password })
    });
  } catch (error) {
    throw toRequestError('POST', url, error);
  }

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`POST ${url} failed with ${response.status}: ${text}`);
  }

  const cookieHeader = toCookieHeader(getSetCookieHeaders(response));
  if (!cookieHeader) {
    throw new Error('Smoke sign-in succeeded without a session cookie');
  }

  return cookieHeader;
}

async function fetchText(url, init) {
  const method = init?.method ?? 'GET';
  let response;
  try {
    response = await fetch(url, init);
  } catch (error) {
    throw toRequestError(method, url, error);
  }
  const text = await response.text();

  if (!response.ok) {
    throw new Error(`${method} ${url} failed with ${response.status}: ${text}`);
  }

  return text;
}

function extractMessageText(message) {
  return (message.parts ?? [])
    .filter((part) => part.type === 'text')
    .map((part) => part.textValue ?? part.text ?? '')
    .join('\n')
    .trim();
}

async function collectSseEvents(url, init) {
  const method = init?.method ?? 'GET';
  let response;
  try {
    response = await fetch(url, init);
  } catch (error) {
    throw toRequestError(method, url, error);
  }

  if (!response.ok || !response.body) {
    throw new Error(`${method} ${url} failed with ${response.status}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const events = [];
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }

    buffer += decoder.decode(value, { stream: true });
    const frames = splitSseFrames(buffer);
    buffer = frames.pop() ?? '';

    for (const frame of frames) {
      const lines = frame
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean);

      const dataLine = lines.find((line) => line.startsWith('data:'));
      if (!dataLine) {
        continue;
      }

      const payload = JSON.parse(dataLine.slice(5).trim());
      events.push(payload);
    }
  }

  if (buffer.trim()) {
    const dataLine = buffer
      .split('\n')
      .map((line) => line.trim())
      .find((line) => line.startsWith('data:'));

    if (dataLine) {
      events.push(JSON.parse(dataLine.slice(5).trim()));
    }
  }

  return events;
}

async function main() {
  const baseUrl = normalizeBaseUrl(process.env.PLAYGROUND_NEXT_WEB_BASE_URL ?? process.argv[2] ?? DEFAULT_BASE_URL);
  const prompt = process.env.PLAYGROUND_NEXT_WEB_SMOKE_PROMPT ?? DEFAULT_PROMPT;
  const threadTitle = process.env.PLAYGROUND_NEXT_WEB_SMOKE_THREAD_TITLE ?? DEFAULT_THREAD_TITLE;
  const expectedDbMode = process.env.PLAYGROUND_NEXT_WEB_EXPECT_DB_MODE;

  console.log(`[deployment-smoke] baseUrl=${baseUrl}`);

  const meta = await fetchJson(`${baseUrl}/api/meta`);
  if (!meta.runtimeConfigured) {
    throw new Error(`Runtime is not configured: ${meta.runtimeConfigError ?? 'unknown error'}`);
  }

  if (expectedDbMode && meta.dbMode !== expectedDbMode) {
    throw new Error(`Expected db mode ${expectedDbMode}, received ${meta.dbMode}`);
  }

  const cookieHeader = await signInForSmoke(baseUrl);
  const authHeaders = cookieHeader ? { cookie: cookieHeader } : undefined;

  const initialThreads = await fetchJson(`${baseUrl}/api/threads`, {
    headers: authHeaders
  });
  if (!Array.isArray(initialThreads.threads)) {
    throw new Error('Expected /api/threads to return a threads array');
  }

  const created = await fetchJson(`${baseUrl}/api/threads`, {
    method: 'POST',
    headers: mergeHeaders(authHeaders, {
      'content-type': 'application/json'
    }),
    body: JSON.stringify({
      title: `${threadTitle} ${new Date().toISOString()}`
    })
  });

  const threadId = created.thread?.id;
  if (!threadId) {
    throw new Error(`Expected thread id in create response: ${JSON.stringify(created)}`);
  }

  await fetchText(`${baseUrl}/chat/${encodeURIComponent(threadId)}`, {
    headers: authHeaders
  });

  await fetchText(`${baseUrl}/replay/${encodeURIComponent(threadId)}`, {
    headers: authHeaders
  });

  const events = await collectSseEvents(`${baseUrl}/api/threads/${threadId}/runs/stream`, {
    method: 'POST',
    headers: mergeHeaders(authHeaders, {
      'content-type': 'application/json'
    }),
    body: JSON.stringify({
      text: prompt
    })
  });

  const eventTypes = events.map((event) => event.type);

  if (!eventTypes.includes('run.ready')) {
    throw new Error(`Expected run.ready in SSE stream, received ${eventTypes.join(', ')}`);
  }

  if (eventTypes.includes('run.failed')) {
    const failure = events.find((event) => event.type === 'run.failed');
    throw new Error(`Run failed during SSE stream: ${failure?.error ?? 'unknown error'}`);
  }

  if (!eventTypes.includes('run.completed')) {
    throw new Error(`Expected run.completed in SSE stream, received ${eventTypes.join(', ')}`);
  }

  const messagesResponse = await fetchJson(`${baseUrl}/api/threads/${threadId}/messages`, {
    headers: authHeaders
  });
  const userMessage = messagesResponse.messages?.find((message) => message.role === 'user');
  const assistantMessage = messagesResponse.messages?.find((message) => message.role === 'assistant');
  const assistantText = assistantMessage ? extractMessageText(assistantMessage) : '';

  if (!userMessage) {
    throw new Error('Expected persisted user message after stream');
  }

  if (!assistantMessage || !assistantText) {
    throw new Error(`Expected persisted assistant text after stream: ${JSON.stringify(messagesResponse)}`);
  }

  console.log(
    JSON.stringify(
      {
        assistantPreview: assistantText.slice(0, 120),
        authenticated: true,
        dbMode: meta.dbMode,
        eventTypes,
        threadId
      },
      null,
      2
    )
  );
}

await main();
