import { ReplayShellEntry } from '@/components/chat-shell/replay-shell-entry';
import { requireCurrentAuthUser } from '@/lib/playground-auth-server';

type ReplayPageProps = {
  params: Promise<{
    threadId: string;
  }>;
};

export default async function ReplayPage(props: ReplayPageProps) {
  const { threadId } = await props.params;
  const currentUser = await requireCurrentAuthUser(`/replay/${encodeURIComponent(threadId)}`);
  return <ReplayShellEntry currentUser={currentUser} initialThreadId={threadId} />;
}
