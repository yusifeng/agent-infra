import { NextResponse } from 'next/server';

import type { ResolveRunApprovalRequestDto } from '@agent-infra/contracts';

import { resolveRunApprovalRequestForOwner } from '@/lib/run-approval-store';
import { requireRouteUser } from '@/lib/route-auth';

export const runtime = 'nodejs';

type RouteContext = {
  params: Promise<{
    approvalRequestId: string;
    runId: string;
  }>;
};

export async function POST(request: Request, context: RouteContext) {
  const auth = requireRouteUser(request);
  if (auth.response || !auth.user) {
    return auth.response;
  }

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const decision = body.decision === 'approved' || body.decision === 'denied' ? body.decision : null;
  if (!decision) {
    return NextResponse.json({ error: 'decision must be approved or denied' }, { status: 400 });
  }

  const { approvalRequestId, runId } = await context.params;
  const result = await resolveRunApprovalRequestForOwner({
    approvalRequestId,
    body: {
      decision,
      reason: readOptionalString(body.reason)
    } satisfies ResolveRunApprovalRequestDto,
    ownerUserId: auth.user.id,
    runId
  });

  return NextResponse.json(result.response, { status: result.status });
}

function readOptionalString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}
