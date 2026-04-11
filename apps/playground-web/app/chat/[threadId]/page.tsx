import { RuntimePiPlaygroundPage } from '@/components/runtime-pi-playground-page';

type ChatPageProps = {
  params: Promise<{
    threadId: string;
  }>;
};

export default async function ChatPage(props: ChatPageProps) {
  const params = await props.params;
  return <RuntimePiPlaygroundPage initialThreadId={params.threadId} />;
}
