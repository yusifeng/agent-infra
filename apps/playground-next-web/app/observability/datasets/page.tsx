import { ChatThemeProvider } from '@/components/chat-theme-provider';
import { DatasetReviewConsole } from '@/features/observability/components/dataset-review-console';
import { requireCurrentAuthUser } from '@/lib/playground-auth-server';

type DatasetReviewPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function buildDatasetReviewNextPath(searchParams: Record<string, string | string[] | undefined>) {
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
  return query ? `/observability/datasets?${query}` : '/observability/datasets';
}

export default async function DatasetReviewPage(props: DatasetReviewPageProps) {
  const searchParams = await props.searchParams;
  const currentUser = await requireCurrentAuthUser(buildDatasetReviewNextPath(searchParams));

  return (
    <ChatThemeProvider>
      <DatasetReviewConsole currentUser={currentUser} />
    </ChatThemeProvider>
  );
}
