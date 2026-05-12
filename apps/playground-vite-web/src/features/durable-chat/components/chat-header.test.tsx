import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { ChatHeader } from './chat-header';

describe('ChatHeader', () => {
  it('does not render thread title or mode in the /new state', () => {
    render(
      <ChatHeader
        currentThreadTitle={null}
        sidebarOpen={false}
        onOpenSidebar={vi.fn()}
        onNewChat={vi.fn()}
        mode="expert"
      />
    );

    expect(screen.queryByText('专家模式')).toBeNull();
    expect(screen.queryByText('快速模式')).toBeNull();
  });

  it('renders the mode badge when a thread title is present', () => {
    render(
      <ChatHeader
        currentThreadTitle="线程会话区别解析"
        sidebarOpen={false}
        onOpenSidebar={vi.fn()}
        onNewChat={vi.fn()}
        mode="expert"
      />
    );

    expect(screen.getByText('线程会话区别解析')).toBeTruthy();
    expect(screen.getByText('专家模式')).toBeTruthy();
  });
});
