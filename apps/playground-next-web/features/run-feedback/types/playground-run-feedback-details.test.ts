import { describe, expect, it } from 'vitest';

import {
  InvalidPlaygroundRunFeedbackDetailsError,
  normalizePlaygroundRunFeedbackDetails
} from './playground-run-feedback-details';

describe('normalizePlaygroundRunFeedbackDetails', () => {
  it('accepts missing details as an empty thumbs-down detail payload', () => {
    expect(normalizePlaygroundRunFeedbackDetails(undefined)).toEqual({
      reasonTags: [],
      commentText: null
    });
  });

  it('deduplicates reason tags and stores them in canonical order', () => {
    expect(normalizePlaygroundRunFeedbackDetails({
      reasonTags: ['other', 'not_helpful', 'other', 'harmful_or_unsafe'],
      commentText: '  not good  '
    })).toEqual({
      reasonTags: ['harmful_or_unsafe', 'not_helpful', 'other'],
      commentText: 'not good'
    });
  });

  it('normalizes empty comment text to null', () => {
    expect(normalizePlaygroundRunFeedbackDetails({
      reasonTags: [],
      commentText: '   '
    })).toEqual({
      reasonTags: [],
      commentText: null
    });
  });

  it('accepts 1000 character comments and rejects 1001 character comments', () => {
    expect(normalizePlaygroundRunFeedbackDetails({
      reasonTags: [],
      commentText: 'a'.repeat(1000)
    }).commentText).toHaveLength(1000);

    expect(() => normalizePlaygroundRunFeedbackDetails({
      reasonTags: [],
      commentText: 'a'.repeat(1001)
    })).toThrow(InvalidPlaygroundRunFeedbackDetailsError);
  });

  it('rejects unknown reason tags', () => {
    expect(() => normalizePlaygroundRunFeedbackDetails({
      reasonTags: ['not_a_real_tag']
    })).toThrow(InvalidPlaygroundRunFeedbackDetailsError);
  });
});
