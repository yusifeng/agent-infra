import type { RuntimePiMetaDto } from '@agent-infra/contracts';

import type { PlaygroundThreadDto } from '@/features/durable-chat/types/thread';

type ModelOption = RuntimePiMetaDto['modelOptions'][number];

export function resolveThreadRuntimeSelection(input: {
  activeThread: PlaygroundThreadDto | null;
  meta: RuntimePiMetaDto | null;
  selectedModelKey: string;
}): {
  effectiveSelectedModelKey: string;
  selectedModelOption: ModelOption | null;
} {
  const { activeThread, meta, selectedModelKey } = input;
  const threadBoundModelOption =
    activeThread?.runtimeProvider && activeThread.runtimeModel
      ? (meta?.modelOptions.find(
          (option) => option.provider === activeThread.runtimeProvider && option.model === activeThread.runtimeModel
        ) ?? null)
      : null;

  if (threadBoundModelOption) {
    return {
      effectiveSelectedModelKey: threadBoundModelOption.key,
      selectedModelOption: threadBoundModelOption
    };
  }

  const selectedModelOption = meta?.modelOptions.find((option) => option.key === selectedModelKey) ?? meta?.modelOptions[0] ?? null;

  return {
    effectiveSelectedModelKey: selectedModelOption?.key ?? '',
    selectedModelOption
  };
}
