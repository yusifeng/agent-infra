export type ObservabilitySelectionStatus = 'empty' | 'selected' | 'fallback' | 'stale';

export type ObservabilitySelectionResult = {
  selectedId: string | null;
  status: ObservabilitySelectionStatus;
  requestedId: string | null;
};

type Identifiable = {
  id: string;
};

export function normalizeObservabilityQueryValue(value: string | null | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export function resolveObservabilitySelection<TItem extends Identifiable>(
  items: TItem[],
  requestedId: string | null | undefined
): ObservabilitySelectionResult {
  const normalizedRequestedId = normalizeObservabilityQueryValue(requestedId);

  if (items.length === 0) {
    return {
      selectedId: null,
      status: 'empty',
      requestedId: normalizedRequestedId
    };
  }

  if (normalizedRequestedId && items.some((item) => item.id === normalizedRequestedId)) {
    return {
      selectedId: normalizedRequestedId,
      status: 'selected',
      requestedId: normalizedRequestedId
    };
  }

  return {
    selectedId: items[0]?.id ?? null,
    status: normalizedRequestedId ? 'stale' : 'fallback',
    requestedId: normalizedRequestedId
  };
}

export function buildObservabilityQuery(input: { threadId: string | null | undefined; runId: string | null | undefined }) {
  const params = new URLSearchParams();
  const threadId = normalizeObservabilityQueryValue(input.threadId);
  const runId = normalizeObservabilityQueryValue(input.runId);

  if (threadId) {
    params.set('threadId', threadId);
  }
  if (runId) {
    params.set('runId', runId);
  }

  const query = params.toString();
  return query ? `?${query}` : '';
}
