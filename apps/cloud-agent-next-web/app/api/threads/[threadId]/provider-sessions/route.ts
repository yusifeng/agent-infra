import { NextResponse } from 'next/server';

import type { AgentProviderId } from '@/lib/provider-config';
import {
  listThreadProviderSessionsForOwner,
  transitionActiveProviderSessionForOwner,
  type ProviderSessionLifecycleAction
} from '@/lib/provider-session-store';
import { requireRouteUser } from '@/lib/route-auth';

export const runtime = 'nodejs';

type RouteContext = {
  params: Promise<{
    threadId: string;
  }>;
};

export async function GET(request: Request, context: RouteContext) {
  const auth = requireRouteUser(request);
  if (auth.response || !auth.user) {
    return auth.response;
  }

  const { threadId } = await context.params;
  const sessions = await listThreadProviderSessionsForOwner({
    ownerUserId: auth.user.id,
    threadId
  });
  if (!sessions) {
    return NextResponse.json({ error: 'thread not found' }, { status: 404 });
  }

  return NextResponse.json({ sessions });
}

export async function POST(request: Request, context: RouteContext) {
  const auth = requireRouteUser(request);
  if (auth.response || !auth.user) {
    return auth.response;
  }

  const { threadId } = await context.params;
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const action = readAction(body.action);
  const provider = readProvider(body.provider);
  if (!action) {
    return NextResponse.json({ error: 'action must be archive, compact, fork, or replay' }, { status: 400 });
  }
  if (!provider) {
    return NextResponse.json({ error: 'provider must be claude or codex' }, { status: 400 });
  }

  const session = await transitionActiveProviderSessionForOwner({
    action,
    actorId: auth.user.id,
    ownerUserId: auth.user.id,
    provider,
    reason: typeof body.reason === 'string' ? body.reason : null,
    threadId
  });
  if (!session) {
    return NextResponse.json({ error: 'active provider session not found' }, { status: 404 });
  }

  return NextResponse.json({ session });
}

function readAction(value: unknown): ProviderSessionLifecycleAction | null {
  return value === 'archive' || value === 'compact' || value === 'fork' || value === 'replay' ? value : null;
}

function readProvider(value: unknown): AgentProviderId | null {
  return value === 'claude' || value === 'codex' ? value : null;
}
