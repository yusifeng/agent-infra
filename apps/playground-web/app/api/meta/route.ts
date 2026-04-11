import type { RuntimePiMetaDto } from '@agent-infra/contracts';

import { toRuntimeMetaDto } from '@/lib/api-dto';

export async function GET() {
  const { getPlaygroundMeta, getPlaygroundServices } = await import('@/lib/playground-services');

  try {
    const services = await getPlaygroundServices();
    const runtime = getPlaygroundMeta({}, services.dbInfo);

    const response: RuntimePiMetaDto = toRuntimeMetaDto({
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
    const runtime = getPlaygroundMeta({}, {
      mode: 'unavailable',
      connectionString: 'unavailable'
    });

    const response: RuntimePiMetaDto = toRuntimeMetaDto({
      dbMode: runtime.dbInfo.mode,
      dbConnection: runtime.dbInfo.connectionString,
      runtimeConfigured: false,
      runtimeProvider: runtime.provider,
      runtimeModel: runtime.model,
      defaultModelKey: runtime.defaultModelKey,
      modelOptions: runtime.modelOptions,
      runtimeConfigError: error instanceof Error ? error.message : runtime.configError ?? 'Failed to initialize playground services'
    });

    return Response.json(response, { status: 503 });
  }
}
