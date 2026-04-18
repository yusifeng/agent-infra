import { collectSseEvents, extractMessageText, fetchJson, fetchText, runWithPhase1Harness, waitForJson } from './phase1-harness.mjs';

await runWithPhase1Harness(async ({ viteBaseUrl }) => {
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
});
