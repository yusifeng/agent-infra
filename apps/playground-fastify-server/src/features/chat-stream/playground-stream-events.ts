export type ThreadTitleUpdatedEventDto = {
  type: 'thread.title_updated';
  threadId: string;
  title: string;
  updatedAt: string;
};

export type PlaygroundPrivateStreamEventDto = ThreadTitleUpdatedEventDto;
