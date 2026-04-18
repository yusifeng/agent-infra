import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { createServer } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';

const repoRoot = path.resolve(import.meta.dirname, '../../..');
const smokeTimeoutMs = Number(process.env.PLAYGROUND_PHASE1_SMOKE_TIMEOUT_MS ?? 90000);
const outputTailLimit = 60;

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = createServer();

    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();

      if (!address || typeof address === 'string') {
        server.close(() => reject(new Error('Failed to allocate a free port')));
        return;
      }

      const { port } = address;
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve(port);
      });
    });
  });
}

function describeProcessLogs(handle) {
  const stdout = handle.stdoutLines.length ? handle.stdoutLines.join('\n') : '[no stdout]';
  const stderr = handle.stderrLines.length ? handle.stderrLines.join('\n') : '[no stderr]';

  return `stdout:\n${stdout}\n\nstderr:\n${stderr}`;
}

function spawnWorkspaceProcess(name, args, env) {
  const child = spawn('pnpm', args, {
    cwd: repoRoot,
    env,
    stdio: ['ignore', 'pipe', 'pipe']
  });

  const handle = {
    name,
    child,
    stdoutLines: [],
    stderrLines: []
  };

  const record = (bucket, chunk) => {
    const lines = chunk
      .toString()
      .split(/\r?\n/)
      .map((line) => line.trimEnd())
      .filter(Boolean);

    if (!lines.length) {
      return;
    }

    bucket.push(...lines);
    if (bucket.length > outputTailLimit) {
      bucket.splice(0, bucket.length - outputTailLimit);
    }
  };

  child.stdout.on('data', (chunk) => record(handle.stdoutLines, chunk));
  child.stderr.on('data', (chunk) => record(handle.stderrLines, chunk));

  return handle;
}

async function stopProcess(handle) {
  if (handle.child.exitCode !== null || handle.child.signalCode !== null) {
    return;
  }

  handle.child.kill('SIGTERM');

  await Promise.race([
    new Promise((resolve) => {
      handle.child.once('exit', resolve);
    }),
    sleep(5000)
  ]);

  if (handle.child.exitCode === null && handle.child.signalCode === null) {
    handle.child.kill('SIGKILL');
    await new Promise((resolve) => {
      handle.child.once('exit', resolve);
    });
  }
}

async function fetchText(url, init) {
  const response = await fetch(url, init);
  const body = await response.text();

  if (!response.ok) {
    throw new Error(`${init?.method ?? 'GET'} ${url} failed with ${response.status}: ${body.slice(0, 500)}`);
  }

  return body;
}

async function fetchJson(url, init) {
  return JSON.parse(await fetchText(url, init));
}

async function waitForJson(url, predicate, timeoutMs = 30000) {
  const startedAt = Date.now();
  let lastError = null;

  while (Date.now() - startedAt < timeoutMs) {
    try {
      const json = await fetchJson(url);
      if (predicate(json)) {
        return json;
      }

      lastError = new Error(`Predicate did not match for ${url}: ${JSON.stringify(json)}`);
    } catch (error) {
      lastError = error;
    }

    await sleep(400);
  }

  throw new Error(
    `Timed out waiting for ${url}: ${lastError instanceof Error ? lastError.message : 'unknown error'}`
  );
}

async function waitForHtml(url, timeoutMs = 30000) {
  const startedAt = Date.now();
  let lastError = null;

  while (Date.now() - startedAt < timeoutMs) {
    try {
      const html = await fetchText(url);
      if (html.includes('<div id="root"></div>')) {
        return html;
      }

      lastError = new Error(`Unexpected HTML payload from ${url}`);
    } catch (error) {
      lastError = error;
    }

    await sleep(400);
  }

  throw new Error(
    `Timed out waiting for ${url}: ${lastError instanceof Error ? lastError.message : 'unknown error'}`
  );
}

function parseSsePayload(block) {
  const lines = block
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (!lines.length) {
    return null;
  }

  const dataLines = [];

  for (const line of lines) {
    if (line.startsWith('data:')) {
      dataLines.push(line.slice('data:'.length).trim());
    }
  }

  if (!dataLines.length) {
    return null;
  }

  return JSON.parse(dataLines.join('\n'));
}

async function collectSseEvents(url, init) {
  const response = await fetch(url, init);

  if (!response.ok) {
    throw new Error(`${init?.method ?? 'GET'} ${url} failed with ${response.status}: ${await response.text()}`);
  }

  if (!response.body) {
    throw new Error(`Missing response body for ${url}`);
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

    while (true) {
      const boundaryIndex = buffer.indexOf('\n\n');
      if (boundaryIndex === -1) {
        break;
      }

      const block = buffer.slice(0, boundaryIndex);
      buffer = buffer.slice(boundaryIndex + 2);
      const payload = parseSsePayload(block);

      if (!payload) {
        continue;
      }

      events.push(payload);
      if (payload.type === 'run.completed' || payload.type === 'run.failed') {
        return events;
      }
    }
  }

  const trailingPayload = parseSsePayload(buffer);
  if (trailingPayload) {
    events.push(trailingPayload);
  }

  return events;
}

function extractMessageText(message) {
  return (message.parts ?? [])
    .filter((part) => part.type === 'text' && typeof part.textValue === 'string')
    .map((part) => part.textValue)
    .join('\n')
    .trim();
}

async function runSmoke() {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'playground-phase1-smoke-'));
  const fastifyPort = await getFreePort();
  const vitePort = await getFreePort();
  const fastifyBaseUrl = `http://127.0.0.1:${fastifyPort}`;
  const viteBaseUrl = `http://127.0.0.1:${vitePort}`;
  const sqlitePath = path.join(tempDir, 'phase1-smoke.db');
  const processes = [];
  let timeoutHandle = null;

  console.log(`[phase1-smoke] Fastify ${fastifyBaseUrl}`);
  console.log(`[phase1-smoke] Vite ${viteBaseUrl}`);
  console.log(`[phase1-smoke] SQLite ${sqlitePath}`);

  const runSmokeBody = async () => {
    const fastifyProcess = spawnWorkspaceProcess(
      'playground-fastify-server',
      ['--filter', 'playground-fastify-server', 'exec', 'tsx', 'src/server.ts'],
      {
        ...process.env,
        HOST: '127.0.0.1',
        PORT: String(fastifyPort),
        SQLITE_PATH: sqlitePath,
        DATABASE_URL: '',
        TURSO_DATABASE_URL: '',
        TURSO_AUTH_TOKEN: ''
      }
    );
    processes.push(fastifyProcess);

    await waitForJson(`${fastifyBaseUrl}/health`, (payload) => payload?.status === 'ok');

    const viteProcess = spawnWorkspaceProcess(
      'playground-vite-web',
      [
        '--filter',
        'playground-vite-web',
        'exec',
        'vite',
        '--host',
        '127.0.0.1',
        '--port',
        String(vitePort),
        '--strictPort'
      ],
      {
        ...process.env,
        VITE_API_PROXY_TARGET: fastifyBaseUrl
      }
    );
    processes.push(viteProcess);

    await waitForHtml(`${viteBaseUrl}/new`);

    const meta = await waitForJson(`${viteBaseUrl}/api/meta`, (payload) => payload?.runtimeConfigured !== undefined);

    if (!meta.runtimeConfigured) {
      throw new Error(`Runtime is not configured: ${meta.runtimeConfigError ?? 'unknown error'}`);
    }

    if (meta.dbMode !== 'sqlite') {
      throw new Error(`Expected sqlite db mode during smoke, received ${meta.dbMode}`);
    }

    const initialThreads = await fetchJson(`${viteBaseUrl}/api/threads`);
    if (!Array.isArray(initialThreads.threads)) {
      throw new Error('Expected /api/threads to return a threads array');
    }

    const created = await fetchJson(`${viteBaseUrl}/api/threads`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        title: 'Phase 1 smoke'
      })
    });

    const threadId = created.thread?.id;
    if (!threadId) {
      throw new Error(`Expected thread id in create response: ${JSON.stringify(created)}`);
    }

    await fetchText(`${viteBaseUrl}/chat/${encodeURIComponent(threadId)}`);

    const listedThreads = await fetchJson(`${viteBaseUrl}/api/threads`);
    if (!listedThreads.threads?.some((thread) => thread.id === threadId)) {
      throw new Error(`Created thread ${threadId} was not returned by /api/threads`);
    }

    const events = await collectSseEvents(`${viteBaseUrl}/api/threads/${threadId}/runs/stream`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        text: 'Reply with exactly ok.'
      })
    });

    const eventTypes = events.map((event) => event.type);
    if (!eventTypes.includes('run.ready')) {
      throw new Error(`Expected run.ready in SSE stream, received ${eventTypes.join(', ')}`);
    }

    if (!eventTypes.includes('run.assistant')) {
      throw new Error(`Expected run.assistant in SSE stream, received ${eventTypes.join(', ')}`);
    }

    if (eventTypes.includes('run.failed')) {
      const failure = events.find((event) => event.type === 'run.failed');
      throw new Error(`Run failed during SSE stream: ${failure?.error ?? 'unknown error'}`);
    }

    if (!eventTypes.includes('run.completed')) {
      throw new Error(`Expected run.completed in SSE stream, received ${eventTypes.join(', ')}`);
    }

    const messagesResponse = await fetchJson(`${viteBaseUrl}/api/threads/${threadId}/messages`);
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
          ok: true,
          fastifyBaseUrl,
          viteBaseUrl,
          threadId,
          initialThreadCount: initialThreads.threads.length,
          finalThreadCount: listedThreads.threads.length,
          eventTypes,
          assistantPreview: assistantText.slice(0, 80)
        },
        null,
        2
      )
    );
  };

  try {
    await Promise.race([
      runSmokeBody(),
      new Promise((_, reject) => {
        timeoutHandle = setTimeout(() => {
          reject(new Error(`phase1 smoke timed out after ${smokeTimeoutMs}ms`));
        }, smokeTimeoutMs);
      })
    ]);
  } catch (error) {
    const processSummaries = processes
      .map((handle) => `--- ${handle.name} ---\n${describeProcessLogs(handle)}`)
      .join('\n\n');
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new Error(`${errorMessage}\n\n${processSummaries}`);
  } finally {
    if (timeoutHandle) {
      clearTimeout(timeoutHandle);
    }
    await Promise.allSettled(processes.map((handle) => stopProcess(handle)));
    await rm(tempDir, { force: true, recursive: true });
  }
}

await runSmoke();
