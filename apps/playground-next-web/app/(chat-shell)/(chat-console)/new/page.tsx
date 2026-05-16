import { requireCurrentAuthUser } from '@/lib/playground-auth-server';

export default async function NewChatPage() {
  await requireCurrentAuthUser('/new');
  return null;
}
