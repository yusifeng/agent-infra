import { redirect } from 'next/navigation';

import { getCurrentUserFromCookies } from '@/lib/auth';

export default async function HomePage() {
  const user = await getCurrentUserFromCookies();
  if (!user) {
    redirect('/login');
  }

  redirect('/new');
}
