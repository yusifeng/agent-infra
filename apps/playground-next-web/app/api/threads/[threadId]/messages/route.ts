import type { AnswerCandidate, AnswerSelection, MessagePageResult, Run, RunFeedback } from '@agent-infra/core';

import {
  buildThreadMessagesErrorResponse,
  buildThreadMessagesResponse,
  decodeThreadMessageCursor,
  getRouteErrorStatus,
  parseThreadMessagesQuery
} from '@agent-infra/durable-chat-server';

import { sanitizeMessagesForUi } from '@/lib/playground-share-sanitize';
import { loadAccessibleThread, requirePlaygroundUser } from '@/lib/playground-thread-access';

function buildSanitizedPaginatedThreadMessagesResponse(
  input: MessagePageResult & {
    activeRun?: Run | null;
    activeRuns?: Run[];
    answerCandidates?: AnswerCandidate[];
    answerSelections?: AnswerSelection[];
    runFeedback?: RunFeedback[];
  }
) {
  const response = buildThreadMessagesResponse(input);
  const sanitizedResponse = buildThreadMessagesResponse({
    ...input,
    messages: sanitizeMessagesForUi(input.messages),
  });

  return {
    ...sanitizedResponse,
    pageInfo: response.pageInfo
  };
}

export async function GET(req: Request, { params }: { params: Promise<{ threadId: string }> }) {
  const { getPlaygroundAppServices } = await import('@/lib/playground-app-services');
  const { threadId } = await params;
  const auth = await requirePlaygroundUser(req);
  if (auth.response) {
    return auth.response;
  }

  try {
    const services = await getPlaygroundAppServices();
    const { app } = services;
    await loadAccessibleThread(services, threadId, auth.user.id);
    const { searchParams } = new URL(req.url);
    const query = parseThreadMessagesQuery(searchParams);
    const projection = searchParams.get('projection') === 'canonical' ? 'canonical' : 'chat';
    const hasPaginationParams = query.limit !== undefined || query.before !== undefined || query.after !== undefined;

    const beforeSeq = query.before ? decodeThreadMessageCursor(query.before, threadId) : undefined;
    const afterSeq = query.after ? decodeThreadMessageCursor(query.after, threadId) : undefined;

    if (projection === 'canonical') {
      const activeRunsPromise = app.runs.listActiveByThread({ threadId });
      if (!hasPaginationParams) {
        const [canonicalMessages, activeRuns] = await Promise.all([app.threads.getCanonicalMessages({ threadId }), activeRunsPromise]);
        return Response.json(buildThreadMessagesResponse({
          messages: sanitizeMessagesForUi(canonicalMessages.messages),
          activeRuns
        }));
      }

      const [page, activeRuns] = await Promise.all([
        app.threads.getCanonicalMessagesPage({
          threadId,
          limit: query.limit,
          beforeSeq,
          afterSeq
        }),
        activeRunsPromise
      ]);
      return Response.json(buildSanitizedPaginatedThreadMessagesResponse({ ...page, activeRuns }));
    }

    const hydrated = await app.threads.getMessagesWithAnswerCandidates({
      threadId,
      limit: query.limit,
      beforeSeq,
      afterSeq,
      feedbackActorId: auth.user.id
    });

    if (!hasPaginationParams) {
      return Response.json(buildThreadMessagesResponse({
        ...hydrated,
        messages: sanitizeMessagesForUi(hydrated.messages)
      }));
    }

    if (!hydrated.pageInfo) {
      throw new Error('paginated thread messages response is missing page info');
    }

    return Response.json(buildSanitizedPaginatedThreadMessagesResponse({
      messages: hydrated.messages,
      pageInfo: hydrated.pageInfo,
      activeRun: hydrated.activeRun,
      activeRuns: hydrated.activeRuns,
      answerCandidates: hydrated.answerCandidates,
      answerSelections: hydrated.answerSelections,
      runFeedback: hydrated.runFeedback
    }));
  } catch (error) {
    return Response.json(buildThreadMessagesErrorResponse(error, 'failed to load thread messages'), {
      status: getRouteErrorStatus(error)
    });
  }
}
