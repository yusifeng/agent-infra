import { NextResponse } from 'next/server';

import { getProviderSessionRecoveryReportForOwner } from '@/lib/provider-session-store';
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
  const report = await getProviderSessionRecoveryReportForOwner({
    ownerUserId: auth.user.id,
    threadId
  });
  if (!report) {
    return NextResponse.json({ error: 'thread not found' }, { status: 404 });
  }

  return NextResponse.json(report);
}
