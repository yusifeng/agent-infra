type ChatPageProps = {
  params: Promise<{
    threadId: string;
  }>;
};

export default async function ChatPage(props: ChatPageProps) {
  await props.params;
  return null;
}
