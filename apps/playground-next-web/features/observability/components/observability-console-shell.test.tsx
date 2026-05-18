// @vitest-environment jsdom

import React, { act } from 'react';
import { BarChart3 } from 'lucide-react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const logout = vi.hoisted(() => vi.fn());

vi.mock('@/components/chat-shell/use-playground-logout', () => ({
  usePlaygroundLogout: () => logout
}));

import { ObservabilityConsoleShell } from './observability-console-shell';

describe('ObservabilityConsoleShell', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
    logout.mockReset();
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    document.body.innerHTML = '';
  });

  it('renders shared nav with the active observability section', () => {
    const refresh = vi.fn();

    act(() => {
      root.render(
        <ObservabilityConsoleShell
          activeSection="datasets"
          currentUser={{ id: 'user-1', email: 'user@example.com' }}
          title="Datasets"
          subtitle="Captured examples"
          icon={<BarChart3 className="size-5" />}
          onRefresh={refresh}
          sectionHrefs={{ evals: '/observability/evals?datasetId=dataset-1' }}
        >
          <div>section content</div>
        </ObservabilityConsoleShell>
      );
    });

    expect(document.body.textContent).toContain('Datasets');
    expect(document.body.textContent).toContain('Runs');
    expect(document.body.textContent).toContain('Evals');
    expect(document.body.textContent).toContain('user@example.com');
    expect(document.body.textContent).toContain('section content');
    expect(document.body.querySelector('a[href="/observability/datasets"]')?.getAttribute('aria-current')).toBe('page');
    expect(document.body.querySelector('a[href="/observability"]')?.getAttribute('aria-current')).toBeNull();
    expect(document.body.querySelector('a[href="/observability/evals?datasetId=dataset-1"]')).toBeTruthy();

    const refreshButton = [...document.body.querySelectorAll('button')].find((button) => button.textContent === 'Refresh');
    act(() => {
      refreshButton?.click();
    });
    expect(refresh).toHaveBeenCalledOnce();

    const logoutButton = document.body.querySelector('button[aria-label="Log out"]');
    act(() => {
      logoutButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(logout).toHaveBeenCalledOnce();
  });
});
