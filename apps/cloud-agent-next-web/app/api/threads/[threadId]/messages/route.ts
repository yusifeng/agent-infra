import { NextResponse } from 'next/server';

import { requireRouteUser } from '@/lib/route-auth';
import { postThreadMessage } from '@/lib/thread-message-route-service';
import { listMessages } from '@/lib/thread-store';

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
  return NextResponse.json({
    messages: await listMessages(auth.user.id, threadId)
  });
}

export async function POST(request: Request, context: RouteContext) {
  const auth = requireRouteUser(request);
  if (auth.response || !auth.user) {
    return auth.response;
  }

  const { threadId } = await context.params;
  return postThreadMessage({
    request,
    threadId,
    user: auth.user
  });
}
