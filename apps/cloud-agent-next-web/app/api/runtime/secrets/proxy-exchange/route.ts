import { NextResponse } from 'next/server';

import {
  CloudAgentSecretProxyExchangeError,
  exchangeCloudAgentSecretProxyToken
} from '@/lib/secret-broker-provider';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const token = typeof body.token === 'string' ? body.token.trim() : '';
    if (!token) {
      return noStoreJson({ error: 'token is required' }, 400);
    }

    const result = await exchangeCloudAgentSecretProxyToken({ token });
    return noStoreJson(result);
  } catch (error) {
    if (error instanceof CloudAgentSecretProxyExchangeError) {
      return noStoreJson(
        {
          error: error.message,
          reason: error.reason
        },
        error.status
      );
    }

    return noStoreJson(
      {
        error: error instanceof Error ? error.message : String(error)
      },
      500
    );
  }
}

function noStoreJson(body: unknown, status = 200) {
  return NextResponse.json(body, {
    headers: {
      'Cache-Control': 'no-store'
    },
    status
  });
}
