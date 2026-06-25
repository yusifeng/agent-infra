import { createInterface } from 'node:readline';

import { query } from '@anthropic-ai/claude-agent-sdk';

const lineReader = createInterface({
  input: process.stdin,
  crlfDelay: Infinity
});
const lineIterator = lineReader[Symbol.asyncIterator]();
const requestLine = await readInitialRequestLine(lineIterator);
const request = JSON.parse(requestLine);
const pendingDecisions = new Map();
void consumeDecisionLines(lineIterator, pendingDecisions).catch((error) => {
  console.log(
    JSON.stringify({
      type: 'runner_error',
      error: error instanceof Error ? error.message : String(error)
    })
  );
});
const abortController = request.timeoutMs ? new AbortController() : undefined;
const timeout = request.timeoutMs
  ? setTimeout(() => {
      abortController?.abort(`Claude agent timed out after ${request.timeoutMs}ms`);
    }, request.timeoutMs)
  : undefined;

try {
  const messages = query({
    prompt: request.prompt,
    options: {
      abortController,
      allowedTools: request.allowedTools,
      canUseTool: request.permissionBridge ? createCanUseTool(pendingDecisions) : undefined,
      cwd: request.cwd ?? '/workspace',
      env: process.env,
      includePartialMessages: request.includePartialMessages,
      maxTurns: request.maxTurns,
      mcpServers: request.mcpServers,
      model: request.model,
      permissionMode: request.permissionMode,
      resume: request.resume,
      settingSources: [],
      sessionId: request.sessionId,
      skills: request.skills,
      strictMcpConfig: request.strictMcpConfig,
      thinking: request.thinking,
      tools: request.tools
    }
  });

  for await (const message of messages) {
    console.log(JSON.stringify({ type: 'sdk_message', message }));
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
    throw new Error('Docker Claude runner did not receive an initial request.');
  }

  return next.value;
}

async function consumeDecisionLines(iterator, pending) {
  for await (const line of iterator) {
    if (!line.trim()) {
      continue;
    }

    const message = JSON.parse(line);
    if (message.type !== 'approval_decision' || typeof message.permissionRequestId !== 'string') {
      continue;
    }

    const pendingDecision = pending.get(message.permissionRequestId);
    if (!pendingDecision) {
      continue;
    }

    pending.delete(message.permissionRequestId);
    pendingDecision.resolve(message);
  }
}

function createCanUseTool(pending) {
  return async (toolName, toolInput, options) => {
    const permissionRequestId = options.toolUseID;
    console.log(
      JSON.stringify({
        type: 'permission_requested',
        permissionRequestId,
        toolName,
        input: toJsonObject(toolInput),
        details: {
          agentId: options.agentID ?? null,
          blockedPath: options.blockedPath ?? null,
          decisionReason: options.decisionReason ?? null,
          description: options.description ?? null,
          displayName: options.displayName ?? null,
          input: toJsonObject(toolInput),
          suggestions: toJsonValue(options.suggestions ?? null),
          title: options.title ?? null,
          toolName
        }
      })
    );

    const decision = await waitForDecision(permissionRequestId, pending, options.signal);
    return toClaudePermissionResult(permissionRequestId, decision);
  };
}

function waitForDecision(permissionRequestId, pending, signal) {
  if (signal?.aborted) {
    throw new Error(`Permission request ${permissionRequestId} was aborted.`);
  }

  return new Promise((resolve, reject) => {
    const onAbort = () => {
      pending.delete(permissionRequestId);
      reject(new Error(`Permission request ${permissionRequestId} was aborted.`));
    };
    pending.set(permissionRequestId, {
      resolve(value) {
        signal?.removeEventListener?.('abort', onAbort);
        resolve(value);
      },
      reject(error) {
        signal?.removeEventListener?.('abort', onAbort);
        reject(error);
      }
    });
    signal?.addEventListener?.('abort', onAbort, { once: true });
  });
}

function toClaudePermissionResult(permissionRequestId, decision) {
  if (decision.decision === 'denied') {
    return {
      behavior: 'deny',
      message: decision.reason ?? 'Permission denied.',
      interrupt: decision.interrupt ?? false,
      toolUseID: permissionRequestId,
      decisionClassification: toClaudeDecisionClassification(decision.classification)
    };
  }

  return {
    behavior: 'allow',
    updatedInput: decision.updatedInput ?? undefined,
    updatedPermissions: decision.updatedPermissions ?? undefined,
    toolUseID: permissionRequestId,
    decisionClassification: toClaudeDecisionClassification(decision.classification)
  };
}

function toClaudeDecisionClassification(classification) {
  if (
    classification === 'user_temporary' ||
    classification === 'user_permanent' ||
    classification === 'user_reject'
  ) {
    return classification;
  }

  return undefined;
}

function toJsonObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }

  return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, toJsonValue(entry)]));
}

function toJsonValue(value) {
  if (value === undefined || value === null) return null;
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value;
  if (Array.isArray(value)) return value.map(toJsonValue);
  if (typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, toJsonValue(entry)]));
  }

  return String(value);
}
