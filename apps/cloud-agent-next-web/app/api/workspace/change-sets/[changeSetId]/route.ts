import { NextResponse } from 'next/server';

import { requireRouteUser } from '@/lib/route-auth';
import { resolveWorkspaceChangeSetForOwner } from '@/lib/workspace-change-store';

export const runtime = 'nodejs';

type RouteContext = {
  params: Promise<{
    changeSetId: string;
  }>;
};

export async function POST(request: Request, context: RouteContext) {
  const auth = requireRouteUser(request);
  if (auth.response || !auth.user) {
    return auth.response;
  }

  const { changeSetId } = await context.params;
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const action = readAction(body.action);
  if (!action) {
    return NextResponse.json({ error: 'action must be merge, discard, or rollback' }, { status: 400 });
  }

  let changeSet;
  try {
    changeSet = await resolveWorkspaceChangeSetForOwner({
      action,
      actorId: auth.user.id,
      changeSetId,
      ownerUserId: auth.user.id,
      reason: readOptionalString(body.reason)
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : String(error)
      },
      { status: 409 }
    );
  }
  if (!changeSet) {
    return NextResponse.json({ error: 'change set not found' }, { status: 404 });
  }

  return NextResponse.json({
    changeSet
  });
}

function readAction(value: unknown): 'discard' | 'merge' | 'rollback' | null {
  return value === 'discard' || value === 'merge' || value === 'rollback' ? value : null;
}

function readOptionalString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}
