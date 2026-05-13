import type { ThreadDto } from '@agent-infra/contracts';

export type PlaygroundThreadDto = ThreadDto & {
  pinned: boolean;
  pinnedAt: string | null;
  runtimeProvider: string | null;
  runtimeModel: string | null;
};
