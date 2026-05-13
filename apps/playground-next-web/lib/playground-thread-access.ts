import { ChatShareNotFoundError, RunNotFoundError } from '@agent-infra/app';
import { getRouteErrorMessage } from '@agent-infra/durable-chat-server';
import { NextResponse } from 'next/server';

import type { AuthUserDto } from '@/features/auth/dto/project-auth-user-dto';
import { projectPlaygroundThreadDto } from '@/features/thread-catalog/service/project-playground-thread-dto';
import { PlaygroundThreadCatalogService } from '@/features/thread-catalog/service/thread-catalog-service';
import type { PlaygroundThreadCatalogRow } from '@/features/thread-catalog/repo/thread-catalog-repo';
import type { PlaygroundAppThread } from '@/features/thread-catalog/types/playground-app-thread';
import { getCurrentAuthUser } from '@/lib/playground-auth';
import type { PlaygroundAppServices } from '@/lib/playground-base-services';

export function buildUnauthorizedResponse() {
  return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });
}

export async function requirePlaygroundUser(request: Request): Promise<
  | {
      user: AuthUserDto;
      response?: never;
    }
  | {
      user?: never;
      response: Response;
    }
> {
  const user = await getCurrentAuthUser(request);
  if (!user) {
    return {
      response: buildUnauthorizedResponse()
    };
  }

  return { user };
}

export function createThreadCatalogService(services: PlaygroundAppServices) {
  return new PlaygroundThreadCatalogService(services.dbConfig);
}

export async function loadAccessibleThread(
  services: PlaygroundAppServices,
  threadId: string,
  ownerUserId: string
): Promise<{ thread: PlaygroundAppThread; catalogRow: PlaygroundThreadCatalogRow }> {
  const catalogService = createThreadCatalogService(services);
  return catalogService.loadAccessibleThread(threadId, ownerUserId, () => services.repos.threadRepo.findById(threadId));
}

export async function loadAccessibleRun(services: PlaygroundAppServices, runId: string, ownerUserId: string) {
  const run = await services.repos.runRepo.findById(runId);
  if (!run) {
    throw new RunNotFoundError(runId);
  }

  const threadAccess = await loadAccessibleThread(services, run.threadId, ownerUserId);
  return {
    run,
    ...threadAccess
  };
}

export async function loadAccessibleShare(services: PlaygroundAppServices, publicId: string, ownerUserId: string) {
  const share = await services.repos.chatShareRepo.findByPublicId(publicId);
  if (!share) {
    throw new ChatShareNotFoundError(publicId);
  }

  const threadAccess = await loadAccessibleThread(services, share.sourceThreadId, ownerUserId);
  return {
    share,
    ...threadAccess
  };
}

export async function resolveThreadRuntimeBinding(
  services: PlaygroundAppServices,
  threadId: string,
  catalogRow: PlaygroundThreadCatalogRow
) {
  if (catalogRow.runtimeProvider && catalogRow.runtimeModel) {
    return {
      provider: catalogRow.runtimeProvider,
      model: catalogRow.runtimeModel
    };
  }

  const latestRuns = await services.repos.runRepo.listByThread(threadId, { limit: 1 });
  const latestRun = latestRuns[0] ?? null;
  if (latestRun?.provider && latestRun.model) {
    return {
      provider: latestRun.provider,
      model: latestRun.model
    };
  }

  return null;
}

export async function bindRuntimeIfUnset(
  services: PlaygroundAppServices,
  threadId: string,
  runtimeSelection: { provider?: string | null; model?: string | null }
) {
  if (!runtimeSelection.provider || !runtimeSelection.model) {
    return null;
  }

  const catalogService = createThreadCatalogService(services);
  return catalogService.bindRuntimeIfUnset(threadId, runtimeSelection.provider, runtimeSelection.model, new Date());
}

export function buildThreadErrorResponse(error: unknown, fallbackMessage: string) {
  return {
    error: getRouteErrorMessage(error, fallbackMessage)
  };
}

export function projectAccessibleThread(input: { thread: PlaygroundAppThread; catalogRow: PlaygroundThreadCatalogRow }) {
  return projectPlaygroundThreadDto(input.thread, input.catalogRow);
}
