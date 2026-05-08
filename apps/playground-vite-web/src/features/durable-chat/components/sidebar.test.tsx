import type { ThreadDto } from '@agent-infra/contracts';
import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { ChatSidebar } from './sidebar';
import { buildOrderedThreads } from '@/features/durable-chat/service/thread-list-presentation';

function createThread(overrides: Partial<ThreadDto> = {}): ThreadDto {
  return {
    id: 'thread-1',
    appId: 'playground-vite-web',
    title: 'Thread title',
    status: 'active',
    metadata: null,
    createdAt: '2026-05-09T00:00:00.000Z',
    updatedAt: '2026-05-09T00:00:00.000Z',
    archivedAt: null,
    ...overrides
  };
}

describe('ChatSidebar', () => {
  it('shows the thread actions menu and routes commands through callbacks', () => {
    const renameSpy = vi.fn();
    const shareSpy = vi.fn();
    const archiveSpy = vi.fn();

    function Harness() {
      const [openThreadMenuId, setOpenThreadMenuId] = useState<string | null>(null);

      return (
        <ChatSidebar
          sidebarOpen
          threads={[createThread({ id: 'thread-1', title: '速度与激情' })]}
          pinnedThreadIds={[]}
          activeThreadId="thread-1"
          openThreadMenuId={openThreadMenuId}
          onClose={vi.fn()}
          onNewChat={vi.fn()}
          onOpenThread={vi.fn()}
          onOpenThreadMenu={setOpenThreadMenuId}
          onCloseThreadMenu={() => setOpenThreadMenuId(null)}
          onRenameThread={(threadId) => {
            setOpenThreadMenuId(null);
            renameSpy(threadId);
          }}
          onTogglePinThread={vi.fn()}
          onShareThread={(threadId) => {
            setOpenThreadMenuId(null);
            shareSpy(threadId);
          }}
          onArchiveThread={(threadId) => {
            setOpenThreadMenuId(null);
            archiveSpy(threadId);
          }}
        />
      );
    }

    render(<Harness />);

    fireEvent.click(screen.getByLabelText('会话操作'));
    expect(screen.getByRole('button', { name: '重命名' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '分享' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '删除' })).toBeTruthy();

    fireEvent.click(screen.getByText('重命名'));
    expect(renameSpy).toHaveBeenCalledWith('thread-1');

    fireEvent.click(screen.getByLabelText('会话操作'));
    fireEvent.click(screen.getByText('分享'));
    expect(shareSpy).toHaveBeenCalledWith('thread-1');

    fireEvent.click(screen.getByLabelText('会话操作'));
    fireEvent.click(screen.getByText('删除'));
    expect(archiveSpy).toHaveBeenCalledWith('thread-1');
  });

  it('reorders the rendered list after pin and unpin actions', () => {
    function Harness() {
      const [openThreadMenuId, setOpenThreadMenuId] = useState<string | null>(null);
      const [pinnedThreadIds, setPinnedThreadIds] = useState<string[]>([]);
      const threads = buildOrderedThreads({
        threads: [
          createThread({ id: 'thread-1', title: '第一条', updatedAt: '2026-05-09T00:00:01.000Z' }),
          createThread({ id: 'thread-2', title: '第二条', updatedAt: '2026-05-09T00:00:03.000Z' })
        ],
        pinnedThreadIds
      });

      return (
        <ChatSidebar
          sidebarOpen
          threads={threads}
          pinnedThreadIds={pinnedThreadIds}
          activeThreadId={null}
          openThreadMenuId={openThreadMenuId}
          onClose={vi.fn()}
          onNewChat={vi.fn()}
          onOpenThread={vi.fn()}
          onOpenThreadMenu={setOpenThreadMenuId}
          onCloseThreadMenu={() => setOpenThreadMenuId(null)}
          onRenameThread={vi.fn()}
          onTogglePinThread={(threadId, pinned) => {
            setOpenThreadMenuId(null);
            setPinnedThreadIds((current) =>
              pinned ? current.filter((candidate) => candidate !== threadId) : [threadId, ...current.filter((candidate) => candidate !== threadId)]
            );
          }}
          onShareThread={vi.fn()}
          onArchiveThread={vi.fn()}
        />
      );
    }

    const { container } = render(<Harness />);

    const getTitles = () =>
      Array.from(container.querySelectorAll<HTMLButtonElement>('[data-thread-id]'))
        .map((button) => button.textContent?.trim())
        .filter((value): value is string => Boolean(value) && ['第一条', '第二条'].includes(value));

    expect(getTitles()).toEqual(['第二条', '第一条']);

    fireEvent.click(container.querySelector('[data-thread-menu-button="thread-1"]') as HTMLElement);
    fireEvent.click(screen.getByRole('button', { name: '置顶' }));
    expect(getTitles()).toEqual(['第一条', '第二条']);

    fireEvent.click(container.querySelector('[data-thread-menu-button="thread-1"]') as HTMLElement);
    fireEvent.click(screen.getByRole('button', { name: '取消置顶' }));
    expect(getTitles()).toEqual(['第二条', '第一条']);
  });
});
