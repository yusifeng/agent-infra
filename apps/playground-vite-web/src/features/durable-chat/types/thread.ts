import type {
  CreateThreadResponseDto as BaseCreateThreadResponseDto,
  ThreadDto as BaseThreadDto,
  ThreadsResponseDto as BaseThreadsResponseDto,
  UpdateThreadResponseDto as BaseUpdateThreadResponseDto
} from '@agent-infra/contracts';

export type DurableThreadDto = BaseThreadDto & {
  pinned: boolean;
};

export type DurableThreadsResponseDto = Omit<BaseThreadsResponseDto, 'threads'> & {
  threads: DurableThreadDto[];
};

export type DurableCreateThreadResponseDto = Omit<BaseCreateThreadResponseDto, 'thread'> & {
  thread?: DurableThreadDto;
};

export type DurableUpdateThreadResponseDto = Omit<BaseUpdateThreadResponseDto, 'thread'> & {
  thread?: DurableThreadDto;
};
