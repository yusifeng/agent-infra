import { NextResponse } from 'next/server';

import { getCurrentAuthUser } from '@/lib/playground-auth';

export async function GET(request: Request) {
  const user = await getCurrentAuthUser(request);
  return NextResponse.json({ user });
}
