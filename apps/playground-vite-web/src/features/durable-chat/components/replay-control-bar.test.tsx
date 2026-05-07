import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { ReplayControlBar } from '@/features/durable-chat/components/replay-control-bar';

describe('ReplayControlBar', () => {
  it('renders progress and wires playback controls', () => {
    const handlers = {
      onPlay: vi.fn(),
      onPause: vi.fn(),
      onResume: vi.fn(),
      onRestart: vi.fn()
    };

    render(
      <ReplayControlBar
        controlState={{ canPlay: true, canPause: false, canResume: false, canRestart: true }}
        viewState={{ status: 'idle', currentStepIndex: 0, totalSteps: 4, progressLabel: '0 / 4' }}
        {...handlers}
      />
    );

    expect(screen.getByText('对话重放')).toBeTruthy();
    expect(screen.getByText('0 / 4 · idle')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: '播放' }));
    fireEvent.click(screen.getByRole('button', { name: '重播' }));

    expect(handlers.onPlay).toHaveBeenCalledTimes(1);
    expect(handlers.onRestart).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: '暂停' }).hasAttribute('disabled')).toBe(true);
  });
});
