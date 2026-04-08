import { runtimeInfo } from '@/lib/repo';

export async function GET() {
  return Response.json({
    aiMode: runtimeInfo.ai.mode,
    aiProvider: runtimeInfo.ai.provider,
    aiModel: runtimeInfo.ai.model,
    dbMode: runtimeInfo.dbMode
  });
}
