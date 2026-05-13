import { ChatShellEntry } from '@/components/chat-shell/chat-shell-entry';

type ChatPageProps = {
  params: Promise<{
    threadId: string;
  }>;
};

export default async function ChatPage(props: ChatPageProps) {
  const { threadId } = await props.params;
  return <ChatShellEntry initialThreadId={threadId} />;
}
