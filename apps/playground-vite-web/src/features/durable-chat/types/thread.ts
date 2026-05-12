import type {
  CreateThreadResponseDto as BaseCreateThreadResponseDto,
  ThreadDto as BaseThreadDto,
  ThreadsResponseDto as BaseThreadsResponseDto,
  UpdateThreadResponseDto as BaseUpdateThreadResponseDto
} from '@agent-infra/contracts';

export type PlaygroundThreadDto = BaseThreadDto & {
  pinned: boolean;
  pinnedAt: string | null;
  runtimeProvider: string | null;
  runtimeModel: string | null;
};

export type PlaygroundThreadsResponseDto = Omit<BaseThreadsResponseDto, 'threads'> & {
  threads: PlaygroundThreadDto[];
};

export type PlaygroundCreateThreadResponseDto = Omit<BaseCreateThreadResponseDto, 'thread'> & {
  thread?: PlaygroundThreadDto;
};

export type PlaygroundUpdateThreadResponseDto = Omit<BaseUpdateThreadResponseDto, 'thread'> & {
  thread?: PlaygroundThreadDto;
};
