import { requireCurrentAuthUser } from '@/lib/playground-auth-server';

type ReplayPageProps = {
  params: Promise<{
    threadId: string;
  }>;
};

export default async function ReplayPage(props: ReplayPageProps) {
  const { threadId } = await props.params;
  await requireCurrentAuthUser(`/replay/${encodeURIComponent(threadId)}`);
  return null;
}
