import type { ToolInvocationDto } from '@agent-infra/contracts';

import { asRecord, parseSearchPanelSection } from '@/features/durable-chat/schema/search-panel';
import type { ActiveSearchPanelData } from '@/features/durable-chat/types/search';

export function buildSearchPanelData(invocations: ToolInvocationDto[]): ActiveSearchPanelData | null {
  const sectionsWithInvocation = invocations
    .filter((invocation) => invocation.toolName === 'searchWeb')
    .map((invocation) => {
      const section = parseSearchPanelSection(invocation);
      return section ? { invocation, section } : null;
    })
    .filter((entry): entry is { invocation: ToolInvocationDto; section: NonNullable<ReturnType<typeof parseSearchPanelSection>> } => entry !== null);

  if (sectionsWithInvocation.length === 0) {
    return null;
  }

  const sections = sectionsWithInvocation.map((entry) => entry.section);
  const firstInvocation = sectionsWithInvocation[0]!.invocation;
  const firstArtifact = asRecord(asRecord(firstInvocation.output)?.artifact);
  const sourceNames = [...new Set(sections.flatMap((section) => section.results.map((result) => result.sourceName).filter(Boolean)))].slice(0, 6);

  return {
    runId: firstInvocation.runId,
    toolCallIds: sections.map((section) => section.toolCallId),
    provider: typeof firstArtifact?.provider === 'string' ? firstArtifact.provider : 'unknown',
    resultCount: sections.reduce((total, section) => total + section.resultCount, 0),
    sourceNames,
    sections
  };
}
