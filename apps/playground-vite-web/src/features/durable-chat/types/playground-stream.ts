import type { RunAttachStreamEventDto, RunStreamEventDto } from '@agent-infra/contracts';

export type ThreadTitleUpdatedEventDto = {
  type: 'thread.title_updated';
  threadId: string;
  title: string;
  updatedAt: string;
};

export type PlaygroundPrivateStreamEventDto = ThreadTitleUpdatedEventDto;

export type PlaygroundStreamEventDto = RunStreamEventDto | RunAttachStreamEventDto | PlaygroundPrivateStreamEventDto;
