import { NextResponse } from 'next/server';

import { getDefaultAgentProvider } from '@/lib/provider-config';
import { requireRouteUser } from '@/lib/route-auth';
import { createThread, listThreads } from '@/lib/thread-store';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  const auth = requireRouteUser(request);
  if (auth.response || !auth.user) {
    return auth.response;
  }

  return NextResponse.json({
    threads: await listThreads(auth.user.id)
  });
}

export async function POST(request: Request) {
  const auth = requireRouteUser(request);
  if (auth.response || !auth.user) {
    return auth.response;
  }

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const provider = body.provider === 'codex' ? 'codex' : getDefaultAgentProvider();
  const thread = await createThread({
    ownerUserId: auth.user.id,
    title: typeof body.title === 'string' ? body.title : null,
    provider
  });

  return NextResponse.json({ thread });
}
