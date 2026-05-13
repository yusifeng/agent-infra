import { Suspense } from 'react';

import { AuthForm } from '../auth-form';

export default function ForgotPasswordPage() {
  return (
    <Suspense fallback={null}>
      <AuthForm mode="forgot-password" />
    </Suspense>
  );
}
