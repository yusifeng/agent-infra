import type { MessageDto, MessagePartDto } from '@agent-infra/contracts';

export type SearchSummaryEntry = {
  toolCallId: string;
  query: string;
  resultCount: number;
  sourceNames: string[];
  sources: Array<{
    sourceName: string;
    hostname: string;
  }>;
};

export type SearchSummaryBlock = {
  runId: string | null;
  entries: SearchSummaryEntry[];
};

export type SearchStatusBlock = {
  runId: string | null;
  entries: Array<{
    toolCallId: string;
    query: string;
  }>;
};

export type AssistantTurnItem =
  | {
      type: 'text';
      id: string;
      part: MessagePartDto;
      cacheKey: string;
    }
  | {
      type: 'reasoning';
      id: string;
      part: MessagePartDto;
    }
  | {
      type: 'tool-part';
      id: string;
      part: MessagePartDto;
    }
  | {
      type: 'search-status';
      id: string;
      status: SearchStatusBlock;
    }
  | {
      type: 'search-summary';
      id: string;
      summary: SearchSummaryBlock;
    };

export type TranscriptBlock =
  | {
      type: 'user-message';
      id: string;
      message: MessageDto;
    }
  | {
      type: 'assistant-turn';
      id: string;
      runId: string | null;
      sourceMessages: MessageDto[];
      items: AssistantTurnItem[];
    };
