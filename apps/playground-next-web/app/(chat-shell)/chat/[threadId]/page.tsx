import { requireCurrentAuthUser } from '@/lib/playground-auth-server';

type ChatPageProps = {
  params: Promise<{
    threadId: string;
  }>;
};

export default async function ChatPage(props: ChatPageProps) {
  const { threadId } = await props.params;
  await requireCurrentAuthUser(`/chat/${encodeURIComponent(threadId)}`);
  return null;
}
