import type { RuntimePiMetaDto } from '@agent-infra/contracts';

import { buildRuntimeMetaResponse, buildUnavailableRuntimeMetaResponse } from '@agent-infra/durable-chat-server';
import { getPlaygroundDbInfo, getPlaygroundMeta } from '@/lib/playground-meta';

export async function GET() {
  try {
    const runtime = getPlaygroundMeta({}, getPlaygroundDbInfo());

    const response: RuntimePiMetaDto = buildRuntimeMetaResponse({
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
    const runtime = getPlaygroundMeta({}, { mode: 'unavailable', connectionString: 'unavailable' });

    const response: RuntimePiMetaDto = buildUnavailableRuntimeMetaResponse(
      {
        dbMode: runtime.dbInfo.mode,
        dbConnection: runtime.dbInfo.connectionString,
        runtimeProvider: runtime.provider,
        runtimeModel: runtime.model,
        defaultModelKey: runtime.defaultModelKey,
        modelOptions: runtime.modelOptions
      },
      error,
      runtime.configError ?? 'Failed to initialize playground services'
    );

    return Response.json(response, { status: 503 });
  }
}
