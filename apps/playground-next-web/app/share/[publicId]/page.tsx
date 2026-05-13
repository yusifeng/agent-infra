import { notFound } from 'next/navigation';

import { ChatShareNotFoundError, ChatShareRevokedError, type PublicChatShareResult } from '@agent-infra/app';

import { getPlaygroundAppServices } from '@/lib/playground-app-services';
import { sanitizePublicShareForUi } from '@/lib/playground-share-sanitize';

import { ShareTranscript } from './share-transcript';

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
  const title = share.snapshot.title?.trim() || 'Shared conversation';
  const messages = [...share.snapshot.messages].sort((left, right) => left.seq - right.seq);

  return (
    <main className="min-h-dvh overflow-y-auto bg-[var(--chat-bg)] text-[color:var(--chat-text)]">
      <div className="mx-auto flex w-full max-w-[960px] flex-col gap-4 px-5 py-10">
        <header className="border-b border-[var(--chat-border)] pb-5">
          <p className="text-xs font-medium uppercase tracking-[0.08em] text-[color:var(--chat-text-secondary)]">Shared thread</p>
          <h1 className="mt-2 text-3xl font-semibold">{title}</h1>
        </header>

        <section aria-label="Shared messages">
          {messages.length === 0 ? (
            <p className="rounded-md border border-[var(--chat-border)] bg-[var(--chat-surface)] p-4 text-sm text-[color:var(--chat-text-secondary)]">
              This shared snapshot does not contain messages.
            </p>
          ) : (
            <ShareTranscript messages={messages} publicId={publicId} />
          )}
        </section>
      </div>
    </main>
  );
}
