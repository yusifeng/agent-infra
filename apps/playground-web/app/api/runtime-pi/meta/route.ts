import type { RuntimePiMetaDto } from '@agent-infra/contracts';

import { toRuntimePiMetaDto } from '@/lib/runtime-pi-dto';

export async function GET() {
  const { getRuntimePiMeta, runtimePiDbInfo } = await import('@/lib/runtime-pi-repo');
  const runtime = getRuntimePiMeta();

  const response: RuntimePiMetaDto = toRuntimePiMetaDto({
    dbMode: runtimePiDbInfo.mode,
    dbConnection: runtimePiDbInfo.connectionString,
    runtimeConfigured: runtime.configured,
    runtimeProvider: runtime.provider,
    runtimeModel: runtime.model,
    defaultModelKey: runtime.defaultModelKey,
    modelOptions: runtime.modelOptions,
    runtimeConfigError: runtime.configError
  });

  return Response.json(response);
}
