import { describe, expect, it } from 'vitest';

import { applyAgentContinuity } from '../src/agent-continuity.js';

describe('applyAgentContinuity', () => {
  it('injects bounded transcript entry summaries into the recovery prompt', () => {
    const prompt = applyAgentContinuity('continue the work', {
      entries: [
        {
          entryType: 'assistant_message',
          ordinal: 7,
          providerEntryId: 'entry-7',
          runId: 'run-1',
          summary: 'Created snake/index.html and wired the game loop.'
        },
        {
          entryType: 'tool_result',
          ordinal: 8,
          providerEntryId: 'entry-8',
          runId: 'run-1',
          summary: 'Write completed successfully.'
        }
      ],
      fromOrdinal: 7,
      previousProviderSessionId: 'provider-session-old',
      sourceRunIds: ['run-1'],
      strategy: 'replay_transcript',
      summary: '2 provider transcript entries are available for continuity.',
      toOrdinal: 8
    });

    expect(prompt).toContain('- transcript entry summaries:');
    expect(prompt).toContain('  - #7 assistant_message: Created snake/index.html and wired the game loop.');
    expect(prompt).toContain('  - #8 tool_result: Write completed successfully.');
    expect(prompt).toContain('User message:\ncontinue the work');
  });
});
