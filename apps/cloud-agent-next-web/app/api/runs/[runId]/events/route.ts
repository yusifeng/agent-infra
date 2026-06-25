import { NextResponse } from 'next/server';

import { requireRouteUser } from '@/lib/route-auth';
import { listCloudRunEventsForOwner } from '@/lib/run-store';
import { streamRunEventFollow } from '@/lib/run-event-follow-stream';

export const runtime = 'nodejs';

type RouteContext = {
  params: Promise<{
    runId: string;
  }>;
};

export async function GET(request: Request, context: RouteContext) {
  const auth = requireRouteUser(request);
  if (auth.response || !auth.user) {
    return auth.response;
  }

  const { runId } = await context.params;
  const url = new URL(request.url);
  if (url.searchParams.get('stream') === 'true' || url.searchParams.get('follow') === 'true') {
    return streamRunEvents({
      ownerUserId: auth.user.id,
      request,
      runId
    });
  }

  const result = await listCloudRunEventsForOwner({
    ownerUserId: auth.user.id,
    runId
  });
  if (!result) {
    return NextResponse.json({ error: 'run not found' }, { status: 404 });
  }

  return NextResponse.json(result);
}

async function streamRunEvents(input: {
  ownerUserId: string;
  request: Request;
  runId: string;
}) {
  return streamRunEventFollow({
    ownerUserId: input.ownerUserId,
    request: input.request,
    runId: input.runId,
    onReplayStart({ controller, run }) {
      controller.send({
        type: 'run_event_replay_start',
        run
      });
    },
    onCloudRunEvent({ controller, event }) {
      controller.send({
        type: 'cloud_run_event',
        event
      });
    },
    onReplayEnd({ controller, lastSeq, run }) {
      controller.send({
        type: 'run_event_replay_end',
        run,
        lastSeq
      });
    }
  });
}
