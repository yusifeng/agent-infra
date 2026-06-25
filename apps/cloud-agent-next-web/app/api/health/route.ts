import { NextResponse } from 'next/server';

import { getRuntimeServiceStatus } from '@/lib/runtime-services';

export function GET() {
  return NextResponse.json(getRuntimeServiceStatus());
}
