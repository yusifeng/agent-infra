import { ReplayRouteShell } from '@/components/chat-shell/replay-route-shell';
import { getCurrentAuthUserFromNextCookies } from '@/lib/playground-auth-server';

type ReplayRouteLayoutProps = {
  children: React.ReactNode;
};

export default async function ReplayRouteLayout({ children }: ReplayRouteLayoutProps) {
  const currentUser = await getCurrentAuthUserFromNextCookies();

  return (
    <>
      <ReplayRouteShell currentUser={currentUser} />
      {children}
    </>
  );
}
