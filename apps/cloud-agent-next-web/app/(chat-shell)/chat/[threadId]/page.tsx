import { notFound, redirect } from 'next/navigation';

import { getCurrentUserFromCookies } from '@/lib/auth';
import { getThread } from '@/lib/thread-store';

type ChatThreadPageProps = {
  params: Promise<{
    threadId: string;
  }>;
};

export default async function ChatThreadPage(props: ChatThreadPageProps) {
  const user = await getCurrentUserFromCookies();
  if (!user) {
    redirect('/login');
  }

  const { threadId } = await props.params;
  const thread = await getThread(user.id, threadId);
  if (!thread) {
    notFound();
  }

  return null;
}
