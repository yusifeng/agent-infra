import { emitChatRenderDiagnostic } from '@agent-infra/durable-chat-client';
import { useEffect, useRef } from 'react';

export function useRenderDiagnostic(component: string, key: string, summary: Record<string, unknown>) {
  const mountedRef = useRef(false);
  const previousSummaryRef = useRef<Record<string, unknown> | null>(null);
  const latestSummaryRef = useRef(summary);
  latestSummaryRef.current = summary;

  useEffect(() => {
    emitChatRenderDiagnostic({
      component,
      key,
      phase: 'mount',
      summary: latestSummaryRef.current
    });
    mountedRef.current = true;
    previousSummaryRef.current = latestSummaryRef.current;

    return () => {
      emitChatRenderDiagnostic({
        component,
        key,
        phase: 'unmount',
        summary: latestSummaryRef.current
      });
    };
  }, [component, key]);

  useEffect(() => {
    if (!mountedRef.current) {
      return;
    }

    const previousSummary = previousSummaryRef.current;
    if (!previousSummary) {
      previousSummaryRef.current = summary;
      return;
    }

    const keys = new Set([...Object.keys(previousSummary), ...Object.keys(summary)]);
    const changedKeys = [...keys].filter((currentKey) => previousSummary[currentKey] !== summary[currentKey]);
    if (changedKeys.length > 0) {
      emitChatRenderDiagnostic({
        component,
        key,
        phase: 'update',
        changedKeys,
        summary
      });
    }
    previousSummaryRef.current = summary;
  });
}
