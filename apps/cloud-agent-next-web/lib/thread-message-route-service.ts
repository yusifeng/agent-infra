import { NextResponse } from 'next/server';
import type { CloudRunEventRecord } from '@agent-infra/cloud-agent-runtime';
import type { CloudRunEventPayloadV1 } from '@agent-infra/core';

import type { CloudAgentRunJob } from './agent-run-worker';
import type { CloudAgentUser } from './auth';
import { getDefaultAgentProvider } from './provider-config';
import { getCloudRunEventHub } from './run-event-hub';
import { ndjsonHeaders, streamRunEventFollow } from './run-event-follow-stream';
import { getCloudAgentRunQueueProvider } from './run-queue-provider';
import { createCloudAgentRun, getCloudRunForOwner } from './run-store';
import { appendUserMessage, getThread, listMessages, type CloudMessage, type CloudThread } from './thread-store';

export async function postThreadMessage(input: {
  request: Request;
  threadId: string;
  user: CloudAgentUser;
}): Promise<Response> {
  const body = (await input.request.json().catch(() => ({}))) as Record<string, unknown>;
  const content = typeof body.content === 'string' ? body.content.trim() : '';
  if (!content) {
    return NextResponse.json({ error: 'message content is required' }, { status: 400 });
  }

  const provider = body.provider === 'codex' ? 'codex' : getDefaultAgentProvider();
  const userResult = await appendUserMessage({
    ownerUserId: input.user.id,
    threadId: input.threadId === 'new' ? null : input.threadId,
    provider,
    content
  });
  const run = await createCloudAgentRun({
    threadId: userResult.thread.id,
    triggerMessageId: userResult.message.id,
    provider
  });
  const job: CloudAgentRunJob = {
    runId: run.id
  };

  const queueProvider = getCloudAgentRunQueueProvider();
  if (body.stream === true) {
    if (queueProvider.kind !== 'in-process') {
      await queueProvider.dispatch(job);
      return streamExternalRunResponse({
        job,
        ownerUserId: input.user.id,
        request: input.request,
        userResult
      });
    }

    return streamInProcessRunResponse({
      job,
      queueProvider,
      request: input.request,
      userResult
    });
  }

  const dispatch = await queueProvider.dispatch(job);
  if (dispatch.kind !== 'in-process') {
    return NextResponse.json(
      {
        queued: true,
        run,
        thread: userResult.thread,
        message: userResult.message,
        messages: userResult.messages
      },
      { status: 202 }
    );
  }

  const result = await dispatch.handle.done;
  return NextResponse.json(result);
}

function streamInProcessRunResponse(input: {
  job: CloudAgentRunJob;
  queueProvider: ReturnType<typeof getCloudAgentRunQueueProvider>;
  request: Request;
  userResult: Awaited<ReturnType<typeof appendUserMessage>>;
}) {
  const encoder = new TextEncoder();
  const hub = getCloudRunEventHub();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;
      const send = (event: Record<string, unknown>) => {
        if (!closed) {
          controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
        }
      };
      const subscription = hub.subscribe(input.job.runId, {
        send(event) {
          sendCloudRunEvent(event, send);
        }
      });
      const close = () => {
        if (closed) {
          return;
        }

        closed = true;
        subscription.unsubscribe();
        controller.close();
      };

      input.request.signal.addEventListener('abort', close, { once: true });
      send({
        type: 'user_message',
        runId: input.job.runId,
        thread: input.userResult.thread,
        message: input.userResult.message
      });

      try {
        const dispatch = await input.queueProvider.dispatch(input.job);
        if (dispatch.kind !== 'in-process') {
          throw new Error(`Unexpected run queue provider for in-process stream: ${dispatch.kind}`);
        }

        const result = await dispatch.handle.done;
        send({
          type: 'completed',
          thread: result.thread,
          message: result.message,
          messages: result.messages,
          failed: result.failed,
          error: result.error
        });
      } catch (error) {
        send({
          type: 'completed',
          thread: input.userResult.thread,
          message: null,
          messages: input.userResult.messages,
          failed: true,
          error: error instanceof Error ? error.message : String(error)
        });
      } finally {
        close();
      }
    }
  });

  return new Response(stream, {
    headers: ndjsonHeaders()
  });
}

function streamExternalRunResponse(input: {
  job: CloudAgentRunJob;
  ownerUserId: string;
  request: Request;
  userResult: Awaited<ReturnType<typeof appendUserMessage>>;
}) {
  let completionSent = false;
  const sendCompletionOnce = async (send: (event: Record<string, unknown>) => void) => {
    if (completionSent) {
      return;
    }

    completionSent = true;
    const completion = await buildRunCompletion({
      fallbackThread: input.userResult.thread,
      ownerUserId: input.ownerUserId,
      runId: input.job.runId
    });
    send({
      type: 'completed',
      thread: completion.thread,
      message: completion.message,
      messages: completion.messages,
      failed: completion.failed,
      error: completion.error
    });
  };

  return streamRunEventFollow({
    ownerUserId: input.ownerUserId,
    request: input.request,
    runId: input.job.runId,
    onOpen(controller) {
      controller.send({
        type: 'user_message',
        runId: input.job.runId,
        thread: input.userResult.thread,
        message: input.userResult.message
      });
    },
    onCloudRunEvent({ controller, event }) {
      sendCloudRunEvent(event, controller.send);
    },
    async onInactiveRun({ controller }) {
      await sendCompletionOnce(controller.send);
    },
    onMissingRun({ controller }) {
      controller.send({
        type: 'completed',
        thread: input.userResult.thread,
        message: null,
        messages: input.userResult.messages,
        failed: true,
        error: 'run not found'
      });
    },
    onError({ controller, error }) {
      controller.send({
        type: 'completed',
        thread: input.userResult.thread,
        message: null,
        messages: input.userResult.messages,
        failed: true,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });
}

function sendCloudRunEvent(event: CloudRunEventRecord, send: (event: Record<string, unknown>) => void): void {
  const payload = event.payload;
  if (payload.type === 'agent_message_delta' && payload.delta) {
    send({ type: 'assistant_delta', content: payload.delta });
    return;
  }

  if (
    payload.type === 'tool_call_started' ||
    payload.type === 'tool_call_completed' ||
    payload.type === 'tool_call_failed'
  ) {
    send({
      type: 'tool_call',
      status:
        payload.type === 'tool_call_started'
          ? 'started'
          : payload.type === 'tool_call_completed'
            ? 'completed'
            : 'failed',
      toolCallId: payload.toolCallId,
      toolName: payload.type === 'tool_call_started' ? payload.toolName : undefined,
      inputSummary: payload.type === 'tool_call_started' ? summarizeRecord(payload.input) : undefined,
      resultSummary: payload.type === 'tool_call_completed' ? summarizeRecord(payload.output) : undefined,
      error: payload.type === 'tool_call_failed' ? payload.error : undefined,
      filePath: readEventPath(payload),
      command: readEventCommand(payload)
    });
    return;
  }

  if (payload.type === 'file_change_detected') {
    send({
      type: 'file_change',
      path: payload.path,
      changeType: payload.changeType,
      toolCallId: payload.toolCallId ?? null
    });
    return;
  }

  if (payload.type === 'permission_requested') {
    send({
      type: 'approval_request',
      runId: event.runId,
      permissionRequestId: payload.permissionRequestId,
      action: payload.action,
      details: payload.details ?? null
    });
    return;
  }

  if (payload.type === 'approval_resolved') {
    send({
      type: 'approval_resolved',
      runId: event.runId,
      permissionRequestId: payload.permissionRequestId,
      decision: payload.decision,
      status: payload.status ?? payload.decision,
      reason: payload.reason ?? null,
      resolvedByActorId: payload.resolvedByActorId ?? null
    });
    return;
  }

  if (payload.type === 'run_cancelled') {
    send({
      type: 'run_cancelled',
      runId: event.runId,
      reason: payload.reason ?? null
    });
  }
}

function summarizeRecord(value: Record<string, unknown> | null | undefined): string | null {
  if (!value || Object.keys(value).length === 0) {
    return null;
  }

  return JSON.stringify(value);
}

function readEventPath(payload: CloudRunEventPayloadV1): string | null {
  if (payload.type === 'file_change_detected') {
    return payload.path;
  }

  const value =
    payload.type === 'tool_call_started'
      ? payload.input?.filePath
      : payload.type === 'tool_call_completed'
        ? payload.output?.filePath
        : null;
  return typeof value === 'string' ? value : null;
}

function readEventCommand(payload: CloudRunEventPayloadV1): string | null {
  const value = payload.type === 'tool_call_started' ? payload.input?.command : null;
  return typeof value === 'string' ? value : null;
}

async function buildRunCompletion(input: {
  fallbackThread: CloudThread;
  ownerUserId: string;
  runId: string;
}): Promise<{
  error: string | null;
  failed: boolean;
  message: CloudMessage | null;
  messages: CloudMessage[];
  thread: CloudThread;
}> {
  const run = await getCloudRunForOwner({
    ownerUserId: input.ownerUserId,
    runId: input.runId
  });
  if (!run) {
    return {
      error: 'run not found',
      failed: true,
      message: null,
      messages: [],
      thread: input.fallbackThread
    };
  }

  const thread = (await getThread(input.ownerUserId, run.threadId)) ?? input.fallbackThread;
  const messages = await listMessages(input.ownerUserId, thread.id);
  const message =
    [...messages].reverse().find((candidate) => candidate.role === 'assistant' && candidate.runId === run.id) ?? null;

  return {
    error: run.status === 'completed' ? null : run.error ?? `Run ${run.status}.`,
    failed: run.status !== 'completed',
    message,
    messages,
    thread
  };
}
