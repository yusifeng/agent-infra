import type { RunAttachStreamEventDto, RunStreamEventDto } from '@agent-infra/contracts';

export type ThreadTitleUpdatedEventDto = {
  type: 'thread.title_updated';
  threadId: string;
  title: string;
  updatedAt: string;
};

export type PlaygroundPrivateStreamEventDto = ThreadTitleUpdatedEventDto;

export type PlaygroundStreamEventDto = RunStreamEventDto | RunAttachStreamEventDto | PlaygroundPrivateStreamEventDto;

export function buildThreadTitleUpdatedEvent(input: {
  threadId: string;
  title: string;
  updatedAt: string;
}): ThreadTitleUpdatedEventDto {
  return {
    type: 'thread.title_updated',
    threadId: input.threadId,
    title: input.title,
    updatedAt: input.updatedAt
  };
}

export function encodePlaygroundSseEvent(payload: PlaygroundStreamEventDto) {
  return `event: ${payload.type}\ndata: ${JSON.stringify(payload)}\n\n`;
}
