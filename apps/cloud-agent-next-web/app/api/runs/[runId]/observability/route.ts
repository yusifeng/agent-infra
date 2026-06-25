import { NextResponse } from 'next/server';

import { getRunObservabilityForOwner } from '@/lib/run-observability';
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
  const observability = await getRunObservabilityForOwner({
    ownerUserId: auth.user.id,
    runId
  });
  if (!observability) {
    return NextResponse.json({ error: 'run not found' }, { status: 404 });
  }

  return NextResponse.json(observability);
}
