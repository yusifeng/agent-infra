export const PLAYGROUND_RUN_FEEDBACK_REASON_TAGS = [
  'harmful_or_unsafe',
  'false_or_misleading',
  'not_helpful',
  'other'
] as const;

export type PlaygroundRunFeedbackReasonTag = (typeof PLAYGROUND_RUN_FEEDBACK_REASON_TAGS)[number];

export type PlaygroundRunFeedbackDetails = {
  reasonTags: PlaygroundRunFeedbackReasonTag[];
  commentText: string | null;
};

export class InvalidPlaygroundRunFeedbackDetailsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidPlaygroundRunFeedbackDetailsError';
  }
}

const REASON_TAG_SET = new Set<string>(PLAYGROUND_RUN_FEEDBACK_REASON_TAGS);
const MAX_COMMENT_TEXT_LENGTH = 1000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeReasonTags(value: unknown): PlaygroundRunFeedbackReasonTag[] {
  if (typeof value === 'undefined') {
    return [];
  }

  if (!Array.isArray(value)) {
    throw new InvalidPlaygroundRunFeedbackDetailsError('reasonTags must be an array');
  }

  const selected = new Set<PlaygroundRunFeedbackReasonTag>();
  for (const tag of value) {
    if (typeof tag !== 'string' || !REASON_TAG_SET.has(tag)) {
      throw new InvalidPlaygroundRunFeedbackDetailsError('reasonTags contains an unknown tag');
    }

    selected.add(tag as PlaygroundRunFeedbackReasonTag);
  }

  return PLAYGROUND_RUN_FEEDBACK_REASON_TAGS.filter((tag) => selected.has(tag));
}

function normalizeCommentText(value: unknown): string | null {
  if (typeof value === 'undefined' || value === null) {
    return null;
  }

  if (typeof value !== 'string') {
    throw new InvalidPlaygroundRunFeedbackDetailsError('commentText must be a string or null');
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  if (trimmed.length > MAX_COMMENT_TEXT_LENGTH) {
    throw new InvalidPlaygroundRunFeedbackDetailsError('commentText must be at most 1000 characters');
  }

  return trimmed;
}

export function normalizePlaygroundRunFeedbackDetails(input: unknown): PlaygroundRunFeedbackDetails {
  if (typeof input === 'undefined' || input === null) {
    return {
      reasonTags: [],
      commentText: null
    };
  }

  if (!isRecord(input)) {
    throw new InvalidPlaygroundRunFeedbackDetailsError('details must be an object');
  }

  return {
    reasonTags: normalizeReasonTags(input.reasonTags),
    commentText: normalizeCommentText(input.commentText)
  };
}
