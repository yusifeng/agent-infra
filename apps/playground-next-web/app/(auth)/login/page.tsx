import { Suspense } from 'react';

import { AuthForm } from '../auth-form';
import { AuthLoading } from '../auth-loading';

export default function LoginPage() {
  return (
    <Suspense fallback={<AuthLoading />}>
      <AuthForm mode="login" />
    </Suspense>
  );
}
