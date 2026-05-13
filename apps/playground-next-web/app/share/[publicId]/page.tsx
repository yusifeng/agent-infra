import { notFound } from 'next/navigation';

import { ChatShareNotFoundError, ChatShareRevokedError, type PublicChatShareResult } from '@agent-infra/app';
import type { SharedThreadSnapshotDto } from '@agent-infra/contracts';

import { getPlaygroundAppServices } from '@/lib/playground-app-services';
import { sanitizePublicShareForUi } from '@/lib/playground-share-sanitize';

import { SharedSnapshotConsole } from './shared-snapshot-console';

export const runtime = 'nodejs';

type SharePageProps = {
  params: Promise<{ publicId: string }>;
};

async function loadPublicShare(publicId: string): Promise<PublicChatShareResult | null> {
  try {
    const services = await getPlaygroundAppServices();
    return sanitizePublicShareForUi(await services.app.shares.getPublic({ publicId }));
  } catch (error) {
    if (error instanceof ChatShareNotFoundError || error instanceof ChatShareRevokedError) {
      return null;
    }

    throw error;
  }
}

function requirePublicShare(share: PublicChatShareResult | null): PublicChatShareResult {
  if (!share) {
    notFound();
  }

  return share;
}

export default async function PublicSharePage({ params }: SharePageProps) {
  const { publicId } = await params;
  const share = requirePublicShare(await loadPublicShare(publicId));

  return <SharedSnapshotConsole publicId={publicId} snapshot={share.snapshot as SharedThreadSnapshotDto} />;
}
