import type { AgentContinuityContext, AgentRunInput } from './types.js';

export function buildAgentPrompt(input: AgentRunInput): string {
  return applyAgentContinuity(input.prompt, input.continuity);
}

export function applyAgentContinuity(prompt: string, continuity?: AgentContinuityContext | null): string {
  if (!continuity) {
    return prompt;
  }

  const entryLines = continuity.entries?.length
    ? [
        '- transcript entry summaries:',
        ...continuity.entries.map((entry) =>
          `  - #${entry.ordinal} ${entry.entryType}${entry.summary ? `: ${entry.summary}` : ''}`
        )
      ]
    : [];
  const lines = [
    'Provider session continuity context:',
    `- strategy: ${continuity.strategy}`,
    continuity.previousProviderSessionId ? `- previous provider session id: ${continuity.previousProviderSessionId}` : null,
    continuity.fromOrdinal != null || continuity.toOrdinal != null
      ? `- transcript ordinal range: ${continuity.fromOrdinal ?? 'unknown'}..${continuity.toOrdinal ?? 'unknown'}`
      : null,
    continuity.sourceRunIds?.length ? `- source run ids: ${continuity.sourceRunIds.join(', ')}` : null,
    continuity.summary ? `- summary: ${continuity.summary}` : null,
    ...entryLines,
    '',
    'Use this continuity context only as recovery background. Do not claim that provider-native session replay succeeded unless a tool or event confirms it.',
    '',
    'User message:',
    prompt
  ].filter((line): line is string => line !== null);

  return lines.join('\n');
}
