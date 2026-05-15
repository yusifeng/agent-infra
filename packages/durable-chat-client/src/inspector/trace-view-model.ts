import type { TraceSpanDto, TraceSpanProjectionDto } from '@agent-infra/contracts';

export type TraceSpanTreeRow = {
  span: TraceSpanDto;
  depth: number;
  hasChildren: boolean;
  parentMissing: boolean;
};

export type TraceSpanViewModel = {
  rows: TraceSpanTreeRow[];
  spansById: Map<string, TraceSpanDto>;
};

function compareTraceSpans(left: TraceSpanDto, right: TraceSpanDto) {
  if (left.order !== right.order) {
    return left.order - right.order;
  }

  return left.id.localeCompare(right.id);
}

export function buildTraceSpanViewModel(projection: TraceSpanProjectionDto | null | undefined): TraceSpanViewModel {
  if (!projection) {
    return {
      rows: [],
      spansById: new Map()
    };
  }

  const spansById = new Map<string, TraceSpanDto>();
  for (const span of projection.spans) {
    spansById.set(span.id, span);
  }

  const childrenByParentId = new Map<string, TraceSpanDto[]>();
  const rootCandidates: TraceSpanDto[] = [];

  for (const span of projection.spans) {
    if (span.parentSpanId && spansById.has(span.parentSpanId)) {
      const siblings = childrenByParentId.get(span.parentSpanId) ?? [];
      siblings.push(span);
      childrenByParentId.set(span.parentSpanId, siblings);
      continue;
    }

    rootCandidates.push(span);
  }

  for (const siblings of childrenByParentId.values()) {
    siblings.sort(compareTraceSpans);
  }

  rootCandidates.sort((left, right) => {
    if (left.id === projection.rootSpanId) {
      return -1;
    }
    if (right.id === projection.rootSpanId) {
      return 1;
    }

    return compareTraceSpans(left, right);
  });

  const rows: TraceSpanTreeRow[] = [];
  const visited = new Set<string>();

  function appendSpan(span: TraceSpanDto, depth: number) {
    if (visited.has(span.id)) {
      return;
    }

    visited.add(span.id);
    const children = childrenByParentId.get(span.id) ?? [];
    rows.push({
      span,
      depth,
      hasChildren: children.length > 0,
      parentMissing: Boolean(span.parentSpanId && !spansById.has(span.parentSpanId))
    });

    for (const child of children) {
      appendSpan(child, depth + 1);
    }
  }

  for (const span of rootCandidates) {
    appendSpan(span, 0);
  }

  for (const span of projection.spans.slice().sort(compareTraceSpans)) {
    appendSpan(span, 0);
  }

  return {
    rows,
    spansById
  };
}

export function resolveSelectedTraceSpan(
  viewModel: TraceSpanViewModel,
  selectedSpanId: string | null | undefined
): TraceSpanDto | null {
  if (selectedSpanId) {
    return viewModel.spansById.get(selectedSpanId) ?? viewModel.rows[0]?.span ?? null;
  }

  return viewModel.rows[0]?.span ?? null;
}
