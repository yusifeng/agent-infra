import { redirect } from 'next/navigation';

import { LoginForm } from '@/components/login-form';
import { getCurrentUserFromCookies } from '@/lib/auth';

export default async function LoginPage() {
  const user = await getCurrentUserFromCookies();
  if (user) {
    redirect('/');
  }

  return <LoginForm />;
}
