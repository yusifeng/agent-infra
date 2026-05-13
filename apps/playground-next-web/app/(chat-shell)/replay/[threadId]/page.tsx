import { ReplayShellEntry } from '@/components/chat-shell/replay-shell-entry';

type ReplayPageProps = {
  params: Promise<{
    threadId: string;
  }>;
};

export default async function ReplayPage(props: ReplayPageProps) {
  const { threadId } = await props.params;
  return <ReplayShellEntry initialThreadId={threadId} />;
}
