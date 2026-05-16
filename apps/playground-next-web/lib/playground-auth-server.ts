import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

import { createPlaygroundAuthConfigFromEnv } from '@/features/auth/service/auth-config';
import type { AuthUserDto } from '@/features/auth/dto/project-auth-user-dto';
import { buildAuthService } from '@/lib/playground-auth';

function normalizeAuthNextPath(nextPath: string) {
  if (!nextPath.startsWith('/') || nextPath.startsWith('//')) {
    return '/new';
  }

  return nextPath;
}

export async function getCurrentAuthUserFromNextCookies(): Promise<AuthUserDto | null> {
  const authConfig = createPlaygroundAuthConfigFromEnv();
  const authService = await buildAuthService({ authConfig });
  const cookieStore = await cookies();
  return authService.getCurrentUser(cookieStore.get(authConfig.sessionCookieName)?.value);
}

export async function requireCurrentAuthUser(nextPath: string): Promise<AuthUserDto> {
  const user = await getCurrentAuthUserFromNextCookies();
  if (!user) {
    redirect(`/login?next=${encodeURIComponent(normalizeAuthNextPath(nextPath))}`);
  }

  return user;
}
