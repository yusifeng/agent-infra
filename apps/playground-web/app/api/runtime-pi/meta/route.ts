import type { RuntimePiMetaDto } from '@agent-infra/contracts';

import { toRuntimePiMetaDto } from '@/lib/runtime-pi-dto';

export async function GET() {
  const { getRuntimePiMeta, getRuntimePiServices } = await import('@/lib/runtime-pi-repo');

  try {
    const services = await getRuntimePiServices();
    const runtime = getRuntimePiMeta({}, services.dbInfo);

    const response: RuntimePiMetaDto = toRuntimePiMetaDto({
      dbMode: runtime.dbInfo.mode,
      dbConnection: runtime.dbInfo.connectionString,
      runtimeConfigured: runtime.configured,
      runtimeProvider: runtime.provider,
      runtimeModel: runtime.model,
      defaultModelKey: runtime.defaultModelKey,
      modelOptions: runtime.modelOptions,
      runtimeConfigError: runtime.configError
    });

    return Response.json(response);
  } catch (error) {
    const runtime = getRuntimePiMeta({}, {
      mode: 'unavailable',
      connectionString: 'unavailable'
    });

    const response: RuntimePiMetaDto = toRuntimePiMetaDto({
      dbMode: runtime.dbInfo.mode,
      dbConnection: runtime.dbInfo.connectionString,
      runtimeConfigured: false,
      runtimeProvider: runtime.provider,
      runtimeModel: runtime.model,
      defaultModelKey: runtime.defaultModelKey,
      modelOptions: runtime.modelOptions,
      runtimeConfigError: error instanceof Error ? error.message : runtime.configError ?? 'Failed to initialize runtime-pi services'
    });

    return Response.json(response, { status: 503 });
  }
}
