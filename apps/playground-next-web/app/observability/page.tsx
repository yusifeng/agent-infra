import { ChatThemeProvider } from '@/components/chat-theme-provider';
import { ObservabilityConsole } from '@/features/observability/components/observability-console';
import { requireCurrentAuthUser } from '@/lib/playground-auth-server';

type ObservabilityPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function buildObservabilityNextPath(searchParams: Record<string, string | string[] | undefined>) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(searchParams)) {
    if (Array.isArray(value)) {
      for (const item of value) {
        params.append(key, item);
      }
      continue;
    }

    if (typeof value === 'string') {
      params.set(key, value);
    }
  }

  const query = params.toString();
  return query ? `/observability?${query}` : '/observability';
}

export default async function ObservabilityPage(props: ObservabilityPageProps) {
  const searchParams = await props.searchParams;
  const currentUser = await requireCurrentAuthUser(buildObservabilityNextPath(searchParams));

  return (
    <ChatThemeProvider>
      <ObservabilityConsole currentUser={currentUser} />
    </ChatThemeProvider>
  );
}
