import { Suspense } from 'react';

import { AuthForm } from '../auth-form';
import { AuthLoading } from '../auth-loading';

export default function ForgotPasswordPage() {
  return (
    <Suspense fallback={<AuthLoading />}>
      <AuthForm mode="forgot-password" />
    </Suspense>
  );
}
