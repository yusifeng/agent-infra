import { ChatThemeProvider } from '@/components/chat-theme-provider';
import { EvalConsole } from '@/features/observability/components/eval-console';
import { requireCurrentAuthUser } from '@/lib/playground-auth-server';

export const dynamic = 'force-dynamic';

type EvalPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function buildEvalNextPath(searchParams: Record<string, string | string[] | undefined>) {
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
  return query ? `/observability/evals?${query}` : '/observability/evals';
}

export default async function EvalPage(props: EvalPageProps) {
  const searchParams = await props.searchParams;
  const currentUser = await requireCurrentAuthUser(buildEvalNextPath(searchParams));

  return (
    <ChatThemeProvider>
      <EvalConsole currentUser={currentUser} />
    </ChatThemeProvider>
  );
}
