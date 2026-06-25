import { NextResponse } from 'next/server';

import { requireRouteUser } from '@/lib/route-auth';
import { getCloudAgentSecretBrokerDiagnostics } from '@/lib/secret-broker-provider';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  const auth = requireRouteUser(request);
  if (auth.response || !auth.user) {
    return auth.response;
  }

  try {
    const diagnostics = getCloudAgentSecretBrokerDiagnostics();
    return NextResponse.json(diagnostics, {
      status: diagnostics.ready ? 200 : 501
    });
  } catch (error) {
    return NextResponse.json(
      {
        configuredKind: null,
        error: error instanceof Error ? error.message : String(error),
        providers: [],
        ready: false
      },
      { status: 400 }
    );
  }
}
