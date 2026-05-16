import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const user = { id: 'user-1', email: 'user@example.com' };

function now() {
  return new Date('2026-01-01T00:00:00.000Z');
}

function mockThreadAccess() {
  const loadAccessibleThread = vi.fn().mockResolvedValue({ catalogRow: null });
  const requirePlaygroundUser = vi.fn().mockResolvedValue({ user, response: null });

  vi.doMock('@/lib/playground-thread-access', () => ({
    loadAccessibleThread,
    requirePlaygroundUser
  }));

  return {
    loadAccessibleThread,
    requirePlaygroundUser
  };
}

function mockAppServices() {
  const selectAnswerCandidate = vi.fn().mockResolvedValue({
    threadId: 'thread-1',
    triggerMessageId: 'message-1',
    selectedRunId: 'run-2',
    source: 'user',
    selectedByUserId: 'user-1',
    createdAt: now(),
    updatedAt: now()
  });
  const setRunFeedback = vi.fn().mockResolvedValue({
    id: 'feedback-1',
    threadId: 'thread-1',
    triggerMessageId: 'message-1',
    runId: 'run-2',
    feedbackActorId: 'user-1',
    value: 'thumbs_up',
    createdAt: now(),
    updatedAt: now()
  });
  const clearRunFeedback = vi.fn().mockResolvedValue(undefined);
  const services = {
    app: {
      turns: {
        selectAnswerCandidate,
        setRunFeedback,
        clearRunFeedback
      }
    }
  };
  const getPlaygroundAppServices = vi.fn().mockResolvedValue(services);

  vi.doMock('@/lib/playground-app-services', () => ({
    getPlaygroundAppServices
  }));

  return {
    clearRunFeedback,
    getPlaygroundAppServices,
    selectAnswerCandidate,
    setRunFeedback
  };
}

describe('playground answer candidate mutation routes', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.doUnmock('@/lib/playground-app-services');
    vi.doUnmock('@/lib/playground-thread-access');
    vi.resetModules();
  });

  it('selects an answer candidate through the app boundary', async () => {
    const { loadAccessibleThread } = mockThreadAccess();
    const { selectAnswerCandidate } = mockAppServices();
    const { POST } = await import('../app/api/threads/[threadId]/answer-candidates/[runId]/selection/route');

    const response = await POST(new Request('http://localhost/api/threads/thread-1/answer-candidates/run-2/selection', {
      method: 'POST',
      body: JSON.stringify({ triggerMessageId: 'message-1' })
    }), {
      params: Promise.resolve({ threadId: 'thread-1', runId: 'run-2' })
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      answerSelection: {
        triggerMessageId: 'message-1',
        selectedRunId: 'run-2',
        selectedByUserId: 'user-1'
      }
    });
    expect(loadAccessibleThread).toHaveBeenCalledWith(expect.anything(), 'thread-1', 'user-1');
    expect(selectAnswerCandidate).toHaveBeenCalledWith({
      threadId: 'thread-1',
      triggerMessageId: 'message-1',
      runId: 'run-2',
      selectedByUserId: 'user-1'
    });
  });

  it('sets and clears run feedback through the app boundary', async () => {
    mockThreadAccess();
    const { clearRunFeedback, setRunFeedback } = mockAppServices();
    const feedbackRoute = await import('../app/api/threads/[threadId]/runs/[runId]/feedback/route');

    const setResponse = await feedbackRoute.POST(new Request('http://localhost/api/threads/thread-1/runs/run-2/feedback', {
      method: 'POST',
      body: JSON.stringify({ triggerMessageId: 'message-1', value: 'thumbs_up' })
    }), {
      params: Promise.resolve({ threadId: 'thread-1', runId: 'run-2' })
    });

    expect(setResponse.status).toBe(200);
    await expect(setResponse.json()).resolves.toMatchObject({
      runFeedback: {
        runId: 'run-2',
        feedbackActorId: 'user-1',
        value: 'thumbs_up'
      }
    });
    expect(setRunFeedback).toHaveBeenCalledWith({
      threadId: 'thread-1',
      triggerMessageId: 'message-1',
      runId: 'run-2',
      feedbackActorId: 'user-1',
      value: 'thumbs_up'
    });

    const clearResponse = await feedbackRoute.DELETE(new Request('http://localhost/api/threads/thread-1/runs/run-2/feedback', {
      method: 'DELETE'
    }), {
      params: Promise.resolve({ threadId: 'thread-1', runId: 'run-2' })
    });

    expect(clearResponse.status).toBe(200);
    await expect(clearResponse.json()).resolves.toEqual({ runFeedback: null });
    expect(clearRunFeedback).toHaveBeenCalledWith({
      threadId: 'thread-1',
      runId: 'run-2',
      feedbackActorId: 'user-1'
    });
  });
});
