import { ChatShellEntry } from '@/components/chat-shell/chat-shell-entry';
import { requireCurrentAuthUser } from '@/lib/playground-auth-server';

export default async function NewChatPage() {
  const currentUser = await requireCurrentAuthUser('/new');
  return <ChatShellEntry currentUser={currentUser} />;
}
