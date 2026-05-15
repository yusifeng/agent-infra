import type { TraceSpanDto, TraceSpanProjectionDto } from '@agent-infra/contracts';
import { describe, expect, it } from 'vitest';

import { buildTraceSpanViewModel, resolveSelectedTraceSpan } from '../src/index';

function createSpan(overrides: Partial<TraceSpanDto> & Pick<TraceSpanDto, 'id' | 'order'>): TraceSpanDto {
  return {
    schemaVersion: 1,
    id: overrides.id,
    traceId: 'run-1',
    parentSpanId: null,
    kind: 'agent',
    name: overrides.id,
    status: 'completed',
    appId: 'app-1',
    threadId: 'thread-1',
    runId: 'run-1',
    order: overrides.order,
    startedAt: null,
    finishedAt: null,
    durationMs: null,
    sourceRefs: [],
    ...overrides
  };
}

function createProjection(spans: TraceSpanDto[], rootSpanId = 'root'): TraceSpanProjectionDto {
  return {
    schemaVersion: 1,
    traceId: 'run-1',
    rootSpanId,
    appId: 'app-1',
    threadId: 'thread-1',
    runId: 'run-1',
    status: 'completed',
    startedAt: null,
    finishedAt: null,
    durationMs: null,
    spans,
    diagnostics: {
      unknownEventCount: 0,
      orphanEventCount: 0,
      warnings: []
    }
  };
}

describe('trace view model helpers', () => {
  it('flattens trace spans root-first with child depths and stable ordering', () => {
    const projection = createProjection([
      createSpan({ id: 'tool-b', order: 3, kind: 'tool_invocation', parentSpanId: 'root' }),
      createSpan({ id: 'root', order: 0, kind: 'agent' }),
      createSpan({ id: 'assistant', order: 1, kind: 'assistant_message', parentSpanId: 'root' }),
      createSpan({ id: 'tool-a', order: 2, kind: 'tool_invocation', parentSpanId: 'root' })
    ]);

    const viewModel = buildTraceSpanViewModel(projection);

    expect(viewModel.rows.map((row) => [row.span.id, row.depth, row.hasChildren, row.parentMissing])).toEqual([
      ['root', 0, true, false],
      ['assistant', 1, false, false],
      ['tool-a', 1, false, false],
      ['tool-b', 1, false, false]
    ]);
    expect(viewModel.spansById.get('tool-a')?.kind).toBe('tool_invocation');
  });

  it('keeps orphaned spans renderable and marks missing parents', () => {
    const projection = createProjection([
      createSpan({ id: 'root', order: 0 }),
      createSpan({ id: 'orphan', order: 1, parentSpanId: 'missing-parent', kind: 'runtime_error' })
    ]);

    const viewModel = buildTraceSpanViewModel(projection);

    expect(viewModel.rows.map((row) => [row.span.id, row.depth, row.parentMissing])).toEqual([
      ['root', 0, false],
      ['orphan', 0, true]
    ]);
  });

  it('falls back to the first row when selected span is missing', () => {
    const projection = createProjection([createSpan({ id: 'root', order: 0 }), createSpan({ id: 'child', order: 1, parentSpanId: 'root' })]);
    const viewModel = buildTraceSpanViewModel(projection);

    expect(resolveSelectedTraceSpan(viewModel, 'child')?.id).toBe('child');
    expect(resolveSelectedTraceSpan(viewModel, 'missing')?.id).toBe('root');
    expect(resolveSelectedTraceSpan(buildTraceSpanViewModel(null), 'missing')).toBeNull();
  });
});
