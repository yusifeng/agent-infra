import { ChatShellEntry } from '@/components/chat-shell/chat-shell-entry';
import { requireCurrentAuthUser } from '@/lib/playground-auth-server';

type ChatPageProps = {
  params: Promise<{
    threadId: string;
  }>;
};

export default async function ChatPage(props: ChatPageProps) {
  const { threadId } = await props.params;
  const currentUser = await requireCurrentAuthUser(`/chat/${encodeURIComponent(threadId)}`);
  return <ChatShellEntry currentUser={currentUser} initialThreadId={threadId} />;
}
