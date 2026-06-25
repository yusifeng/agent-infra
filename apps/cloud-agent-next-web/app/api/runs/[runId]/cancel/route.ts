import { NextResponse } from 'next/server';

import type { CancelRunResponseDto } from '@agent-infra/contracts';

import { closeCloudRunEventStream, publishCloudRunEvent } from '@/lib/run-event-hub';
import { cancelCloudAgentRunForOwner } from '@/lib/run-store';
import { requireRouteUser } from '@/lib/route-auth';

export const runtime = 'nodejs';

type RouteContext = {
  params: Promise<{
    runId: string;
  }>;
};

export async function POST(request: Request, context: RouteContext) {
  const auth = requireRouteUser(request);
  if (auth.response || !auth.user) {
    return auth.response;
  }

  const { runId } = await context.params;
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const result = await cancelCloudAgentRunForOwner({
    actorId: auth.user.id,
    ownerUserId: auth.user.id,
    reason: readOptionalString(body.reason),
    runId
  });
  if (!result) {
    return NextResponse.json({ error: 'run not found' } satisfies CancelRunResponseDto, { status: 404 });
  }

  if (result.status === 'already_terminal') {
    return NextResponse.json(
      {
        run: {
          id: result.run.id,
          threadId: result.run.threadId,
          triggerMessageId: result.run.triggerMessageId,
          provider: result.run.provider,
          model: result.run.model,
          status: result.run.status,
          usage: result.run.usage,
          error: result.run.error,
          startedAt: result.run.startedAt?.toISOString() ?? null,
          finishedAt: result.run.finishedAt?.toISOString() ?? null,
          createdAt: result.run.createdAt.toISOString()
        },
        error: 'run is already terminal'
      } satisfies CancelRunResponseDto,
      { status: 409 }
    );
  }

  for (const event of result.events) {
    publishCloudRunEvent(event);
  }
  closeCloudRunEventStream(result.run.id);
  return NextResponse.json({
    run: {
      id: result.run.id,
      threadId: result.run.threadId,
      triggerMessageId: result.run.triggerMessageId,
      provider: result.run.provider,
      model: result.run.model,
      status: result.run.status,
      usage: result.run.usage,
      error: result.run.error,
      startedAt: result.run.startedAt?.toISOString() ?? null,
      finishedAt: result.run.finishedAt?.toISOString() ?? null,
      createdAt: result.run.createdAt.toISOString()
    }
  } satisfies CancelRunResponseDto);
}

function readOptionalString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}
