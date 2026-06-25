import { NextResponse } from 'next/server';

import { requireRouteUser } from '@/lib/route-auth';
import { listActiveCloudRunsForThreadOwner } from '@/lib/run-store';

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
  const runs = await listActiveCloudRunsForThreadOwner({
    ownerUserId: auth.user.id,
    threadId
  });
  if (!runs) {
    return NextResponse.json({ error: 'thread not found' }, { status: 404 });
  }

  return NextResponse.json({ runs });
}
