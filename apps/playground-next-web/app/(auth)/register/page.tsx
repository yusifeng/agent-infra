import { Suspense } from 'react';

import { AuthForm } from '../auth-form';
import { AuthLoading } from '../auth-loading';

export default function RegisterPage() {
  return (
    <Suspense fallback={<AuthLoading />}>
      <AuthForm mode="register" />
    </Suspense>
  );
}
