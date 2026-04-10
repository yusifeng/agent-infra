import { NextResponse } from 'next/server';

type EnvKeysResponse = {
  enabled: boolean;
  deepseekKey?: string;
};

export async function GET() {
  const allow = process.env.PI_NARROW_ALLOW_ENV_KEYS === '1';
  const isProd = process.env.NODE_ENV === 'production';

  if (!allow || isProd) {
    return NextResponse.json<EnvKeysResponse>({ enabled: false }, { status: 200 });
  }

  const deepseekKey = process.env.DEEPSEEK_API_KEY?.trim();

  return NextResponse.json<EnvKeysResponse>(
    {
      enabled: true,
      ...(deepseekKey ? { deepseekKey } : {})
    },
    { status: 200 }
  );
}

