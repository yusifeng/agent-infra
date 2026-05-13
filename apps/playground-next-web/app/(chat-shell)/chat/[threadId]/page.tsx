import { ChatShellEntry } from '@/components/chat-shell/chat-shell-entry';

type ChatPageProps = {
  params: Promise<{
    threadId: string;
  }>;
};

export default async function ChatPage({ params }: ChatPageProps) {
  const { threadId } = await params;
  return <ChatShellEntry initialThreadId={threadId} />;
}
