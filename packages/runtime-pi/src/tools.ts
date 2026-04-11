import type { AgentTool } from '@mariozechner/pi-agent-core';
import { Type } from '@sinclair/typebox';

type DemoToolContext = {
  threadId: string;
  runId: string;
  provider: string;
  model: string;
};

function formatCurrentTime(timezone?: string) {
  const now = new Date();
  const normalizedTimezone = timezone?.trim() || 'UTC';

  try {
    const formatted = new Intl.DateTimeFormat('en-US', {
      dateStyle: 'full',
      timeStyle: 'long',
      timeZone: normalizedTimezone
    }).format(now);

    return {
      iso: now.toISOString(),
      timezone: normalizedTimezone,
      formatted
    };
  } catch {
    return {
      iso: now.toISOString(),
      timezone: 'UTC',
      formatted: new Intl.DateTimeFormat('en-US', {
        dateStyle: 'full',
        timeStyle: 'long',
        timeZone: 'UTC'
      }).format(now)
    };
  }
}

export function createDemoTools(context: DemoToolContext): AgentTool[] {
  return [
    {
      name: 'getCurrentTime',
      label: 'Get Current Time',
      description: 'Get the current date and time for a timezone.',
      parameters: Type.Object({
        timezone: Type.Optional(Type.String({ description: 'IANA timezone, for example Asia/Shanghai or UTC.' }))
      }),
      async execute(_toolCallId, params) {
        const input = params as { timezone?: string };
        const result = formatCurrentTime(input.timezone);
        return {
          content: [{ type: 'text', text: `${result.formatted} (${result.timezone})` }],
          details: result
        };
      }
    },
    {
      name: 'echoText',
      label: 'Echo Text',
      description: 'Echo text back to the model for runtime persistence testing.',
      parameters: Type.Object({
        text: Type.String({ description: 'The text to echo back.' })
      }),
      async execute(_toolCallId, params) {
        const input = params as { text: string };
        return {
          content: [{ type: 'text', text: input.text }],
          details: { echoedText: input.text }
        };
      }
    },
    {
      name: 'getRuntimeInfo',
      label: 'Get Runtime Info',
      description: 'Return basic information about the current runtime invocation.',
      parameters: Type.Object({}),
      async execute() {
        const details = {
          runtime: 'pi',
          threadId: context.threadId,
          runId: context.runId,
          provider: context.provider,
          model: context.model
        };

        return {
          content: [{ type: 'text', text: JSON.stringify(details, null, 2) }],
          details
        };
      }
    }
  ];
}
