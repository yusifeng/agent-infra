import { createInterface } from 'node:readline';

import { Codex } from '@openai/codex-sdk';

const lineReader = createInterface({
  input: process.stdin,
  crlfDelay: Infinity
});
const lineIterator = lineReader[Symbol.asyncIterator]();
const requestLine = await readInitialRequestLine(lineIterator);
const request = JSON.parse(requestLine);
const abortController = request.timeoutMs ? new AbortController() : undefined;
const timeout = request.timeoutMs
  ? setTimeout(() => {
      abortController?.abort(`Codex agent timed out after ${request.timeoutMs}ms`);
    }, request.timeoutMs)
  : undefined;

try {
  const codex = new Codex({
    apiKey: request.apiKey,
    baseUrl: request.baseUrl,
    config: request.config,
    env: process.env
  });
  const threadOptions = {
    approvalPolicy: request.approvalPolicy,
    model: request.model,
    modelReasoningEffort: request.modelReasoningEffort,
    networkAccessEnabled: request.networkAccessEnabled,
    sandboxMode: request.sandboxMode,
    skipGitRepoCheck: request.skipGitRepoCheck,
    workingDirectory: request.workingDirectory ?? '/workspace'
  };
  const thread = request.resume
    ? codex.resumeThread(request.resume, threadOptions)
    : codex.startThread(threadOptions);
  const streamed = await thread.runStreamed(request.prompt, {
    signal: abortController?.signal
  });

  for await (const event of streamed.events) {
    console.log(JSON.stringify({ type: 'thread_event', event }));
  }
} catch (error) {
  console.log(
    JSON.stringify({
      type: 'runner_error',
      error: error instanceof Error ? error.message : String(error)
    })
  );
} finally {
  if (timeout) {
    clearTimeout(timeout);
  }
  lineReader.close();
}

async function readInitialRequestLine(iterator) {
  const next = await iterator.next();
  if (next.done || !next.value) {
    throw new Error('Docker Codex runner did not receive an initial request.');
  }

  return next.value;
}
