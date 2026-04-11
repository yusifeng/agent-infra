import { DurableChatConsole } from '@/components/durable-chat-console';

type ChatPageProps = {
  params: Promise<{
    threadId: string;
  }>;
};

export default async function ChatPage(props: ChatPageProps) {
  const params = await props.params;
  return <DurableChatConsole initialThreadId={params.threadId} />;
}
