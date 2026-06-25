import { NextResponse } from 'next/server';

import { requireRouteUser } from '@/lib/route-auth';

export function GET(request: Request) {
  const auth = requireRouteUser(request);
  if (auth.response) {
    return auth.response;
  }

  return NextResponse.json({ user: auth.user });
}
