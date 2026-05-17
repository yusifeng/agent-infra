// @vitest-environment jsdom

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { RunFeedbackDialog } from './run-feedback-dialog';

describe('RunFeedbackDialog', () => {
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

  it('submits selected reason codes and normalized comment text', () => {
    const onSubmit = vi.fn();

    act(() => {
      root.render(
        <RunFeedbackDialog
          open
          loading={false}
          onClose={vi.fn()}
          onSubmit={onSubmit}
        />
      );
    });

    const notHelpfulButton = [...document.body.querySelectorAll('button')]
      .find((button) => button.textContent === '没有帮助');
    const textarea = document.body.querySelector('textarea');
    const submitButton = [...document.body.querySelectorAll('button')]
      .find((button) => button.textContent === '提交');

    expect(notHelpfulButton).toBeTruthy();
    expect(textarea).toBeTruthy();
    expect(submitButton).toBeTruthy();

    act(() => {
      notHelpfulButton?.click();
    });
    act(() => {
      const valueSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set;
      valueSetter?.call(textarea, '  better answer please  ');
      textarea!.dispatchEvent(new Event('input', { bubbles: true }));
      textarea!.dispatchEvent(new Event('change', { bubbles: true }));
    });
    act(() => {
      submitButton?.click();
    });

    expect(onSubmit).toHaveBeenCalledWith({
      reasonTags: ['not_helpful'],
      commentText: 'better answer please'
    });
  });

  it('closes without submitting when canceled', () => {
    const onClose = vi.fn();
    const onSubmit = vi.fn();

    act(() => {
      root.render(
        <RunFeedbackDialog
          open
          loading={false}
          onClose={onClose}
          onSubmit={onSubmit}
        />
      );
    });

    const cancelButton = [...document.body.querySelectorAll('button')]
      .find((button) => button.textContent === '取消');

    act(() => {
      cancelButton?.click();
    });

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
