import { useEffect, useRef } from 'react';
import type { MutableRefObject } from 'react';

type InitializeRuntimeDependencies = {
  activeThreadId: string | null;
  chatPhase: string;
  initialThreadId: string | null;
  liveAssistantDraft: object | null;
  loadingThreadId: string | null;
  optimisticUserMessage: object | null;
};

type InitializeRuntimeActions = {
  activateThread: (threadId: string) => Promise<unknown>;
  refreshMeta: () => Promise<unknown>;
  resetDraftThreadState: () => void;
  setDurableRecoveryState: (state: { phase: 'idle'; message: null }) => void;
  setError: (error: string | null) => void;
  stopViewingLiveResponse: () => void;
  initializeRuntime: (requestId: number) => Promise<unknown>;
};

type InitializeRuntimeRefs = {
  routeChangeRequestIdRef: MutableRefObject<number>;
  runtimeBootstrappedRef: MutableRefObject<boolean>;
  sendAbortControllerRef: MutableRefObject<AbortController | null>;
  messagesAbortControllerRef: MutableRefObject<AbortController | null>;
  logInspectorAbortControllerRef: MutableRefObject<AbortController | null>;
  timelineAbortControllerRef: MutableRefObject<AbortController | null>;
};

type UseChatRuntimeLifecycleOptions = {
  deps: InitializeRuntimeDependencies;
  actions: InitializeRuntimeActions;
  refs: InitializeRuntimeRefs;
};

export function useChatRuntimeLifecycle({ deps, actions, refs }: UseChatRuntimeLifecycleOptions) {
  const {
    activeThreadId,
    chatPhase,
    initialThreadId,
    liveAssistantDraft,
    loadingThreadId,
    optimisticUserMessage
  } = deps;
  const {
    routeChangeRequestIdRef,
    runtimeBootstrappedRef,
    sendAbortControllerRef,
    messagesAbortControllerRef,
    logInspectorAbortControllerRef,
    timelineAbortControllerRef
  } = refs;
  const actionsRef = useRef(actions);
  const stateRef = useRef({
    activeThreadId,
    chatPhase,
    liveAssistantDraft,
    loadingThreadId,
    optimisticUserMessage
  });

  actionsRef.current = actions;
  stateRef.current = {
    activeThreadId,
    chatPhase,
    liveAssistantDraft,
    loadingThreadId,
    optimisticUserMessage
  };

  useEffect(() => {
    void actionsRef.current.refreshMeta();
  }, []);

  useEffect(() => {
    const requestId = routeChangeRequestIdRef.current + 1;
    routeChangeRequestIdRef.current = requestId;
    const currentState = stateRef.current;

    if (!runtimeBootstrappedRef.current) {
      runtimeBootstrappedRef.current = true;
      void actionsRef.current.initializeRuntime(requestId);
      return;
    }

    if (
      initialThreadId &&
      currentState.activeThreadId === initialThreadId &&
      (currentState.loadingThreadId === initialThreadId ||
        currentState.chatPhase !== 'idle' ||
        currentState.optimisticUserMessage !== null ||
        currentState.liveAssistantDraft !== null)
    ) {
      return;
    }

    if (initialThreadId) {
      void actionsRef.current.activateThread(initialThreadId);
      return;
    }

    actionsRef.current.resetDraftThreadState();
    actionsRef.current.setDurableRecoveryState({
      phase: 'idle',
      message: null
    });
    actionsRef.current.setError(null);
  }, [initialThreadId, routeChangeRequestIdRef, runtimeBootstrappedRef]);

  useEffect(
    () => () => {
      actionsRef.current.stopViewingLiveResponse();
      sendAbortControllerRef.current?.abort();
      messagesAbortControllerRef.current?.abort();
      logInspectorAbortControllerRef.current?.abort();
      timelineAbortControllerRef.current?.abort();
    },
    [logInspectorAbortControllerRef, messagesAbortControllerRef, sendAbortControllerRef, timelineAbortControllerRef]
  );
}
