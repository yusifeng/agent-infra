// @vitest-environment jsdom

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./dataset-capture-dialog', () => ({
  DatasetCaptureDialog: () => null
}));

import { RunContentPanel } from './run-content-panel';

function selectedRun() {
  return {
    id: 'run-1',
    threadId: 'thread-1',
    triggerMessageId: 'message-1',
    provider: 'openai',
    model: 'gpt-test',
    status: 'completed' as const,
    usage: null,
    error: null,
    startedAt: '2026-01-01T00:00:00.000Z',
    finishedAt: '2026-01-01T00:00:01.000Z',
    createdAt: '2026-01-01T00:00:00.000Z'
  };
}

function selectedThread() {
  return {
    id: 'thread-1',
    appId: 'playground-runtime-pi',
    userId: null,
    title: 'Demo thread',
    status: 'active' as const,
    metadata: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    archivedAt: null
  };
}

describe('RunContentPanel', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    document.body.innerHTML = '';
  });

  it('shows thread to run context and keeps capture scoped to the selected run', () => {
    act(() => {
      root.render(
        <RunContentPanel
          selectedRun={selectedRun()}
          selectedRunItem={{
            run: selectedRun(),
            triggerMessage: {
              id: 'message-1',
              seq: 1,
              preview: 'Explain run details'
            }
          }}
          selectedThread={selectedThread()}
          timeline={null}
          timelineLoading={false}
          timelineError={null}
          trace={null}
          traceLoading={false}
          traceError={null}
        />
      );
    });

    expect(document.body.textContent).toContain('Demo thread');
    expect(document.body.textContent).toContain('Explain run details');
    expect(document.body.textContent).toContain('UUID');
    expect(document.body.textContent).toContain('Model');
    expect(document.body.textContent).toContain('Time');
    expect(document.body.textContent).toContain('Usage');
    expect(document.body.textContent).toContain('run-1');
    expect([...document.body.querySelectorAll('button')].some((button) => button.textContent === 'Capture example')).toBe(true);
  });
});
