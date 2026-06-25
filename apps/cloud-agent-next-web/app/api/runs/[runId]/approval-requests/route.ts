import { NextResponse } from 'next/server';

import { listRunApprovalRequestsForOwner } from '@/lib/run-approval-store';
import { requireRouteUser } from '@/lib/route-auth';

export const runtime = 'nodejs';

type RouteContext = {
  params: Promise<{
    runId: string;
  }>;
};

export async function GET(request: Request, context: RouteContext) {
  const auth = requireRouteUser(request);
  if (auth.response || !auth.user) {
    return auth.response;
  }

  const { runId } = await context.params;
  const result = await listRunApprovalRequestsForOwner({
    ownerUserId: auth.user.id,
    runId
  });
  if (!result) {
    return NextResponse.json({ error: 'run not found' }, { status: 404 });
  }

  return NextResponse.json(result);
}
