import { NextResponse } from 'next/server';

import { requireRouteUser } from '@/lib/route-auth';
import { listWorkspaceChangeSetsForOwner } from '@/lib/workspace-change-store';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  const auth = requireRouteUser(request);
  if (auth.response || !auth.user) {
    return auth.response;
  }

  const url = new URL(request.url);
  const changeSets = await listWorkspaceChangeSetsForOwner({
    includeResolved: url.searchParams.get('includeResolved') === 'true',
    ownerUserId: auth.user.id
  });

  return NextResponse.json({
    changeSets
  });
}
