import { and, eq } from 'drizzle-orm';
import type { DbConfig } from '@agent-infra/db';

import type { PlaygroundRunFeedbackDetails, PlaygroundRunFeedbackReasonTag } from '../types/playground-run-feedback-details';
import { playgroundRunFeedbackDetailsPg, playgroundRunFeedbackDetailsSqlite } from './schema';

export type PlaygroundRunFeedbackDetailsRow = {
  threadId: string;
  runId: string;
  feedbackActorId: string;
  details: PlaygroundRunFeedbackDetails;
  createdAt: Date;
  updatedAt: Date;
};

type RawPlaygroundRunFeedbackDetailsRow = {
  threadId: string;
  runId: string;
  feedbackActorId: string;
  reasonTagsJson: PlaygroundRunFeedbackReasonTag[] | string;
  commentText: string | null;
  createdAt: Date;
  updatedAt: Date;
};

function parseReasonTags(value: PlaygroundRunFeedbackReasonTag[] | string): PlaygroundRunFeedbackReasonTag[] {
  if (Array.isArray(value)) {
    return value;
  }

  const parsed = JSON.parse(value);
  return Array.isArray(parsed) ? parsed as PlaygroundRunFeedbackReasonTag[] : [];
}

function toDetailsRow(row: RawPlaygroundRunFeedbackDetailsRow): PlaygroundRunFeedbackDetailsRow {
  return {
    threadId: row.threadId,
    runId: row.runId,
    feedbackActorId: row.feedbackActorId,
    details: {
      reasonTags: parseReasonTags(row.reasonTagsJson),
      commentText: row.commentText
    },
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  };
}

export class PlaygroundRunFeedbackDetailsRepo {
  constructor(private readonly dbConfig: Pick<DbConfig, 'mode' | 'db'>) {}

  async findByRunAndActor(runId: string, feedbackActorId: string): Promise<PlaygroundRunFeedbackDetailsRow | null> {
    if (this.dbConfig.mode === 'postgres') {
      const rows = await this.dbConfig.db
        .select()
        .from(playgroundRunFeedbackDetailsPg)
        .where(and(
          eq(playgroundRunFeedbackDetailsPg.runId, runId),
          eq(playgroundRunFeedbackDetailsPg.feedbackActorId, feedbackActorId)
        ))
        .limit(1);
      return rows[0] ? toDetailsRow(rows[0]) : null;
    }

    const rows = await this.dbConfig.db
      .select()
      .from(playgroundRunFeedbackDetailsSqlite)
      .where(and(
        eq(playgroundRunFeedbackDetailsSqlite.runId, runId),
        eq(playgroundRunFeedbackDetailsSqlite.feedbackActorId, feedbackActorId)
      ))
      .limit(1);
    return rows[0] ? toDetailsRow(rows[0]) : null;
  }

  async upsert(input: {
    threadId: string;
    runId: string;
    feedbackActorId: string;
    details: PlaygroundRunFeedbackDetails;
    now: Date;
  }): Promise<PlaygroundRunFeedbackDetailsRow> {
    const existing = await this.findByRunAndActor(input.runId, input.feedbackActorId);
    const values = {
      threadId: input.threadId,
      runId: input.runId,
      feedbackActorId: input.feedbackActorId,
      reasonTagsJson: input.details.reasonTags,
      commentText: input.details.commentText,
      updatedAt: input.now
    };

    if (existing) {
      if (this.dbConfig.mode === 'postgres') {
        const rows = await this.dbConfig.db
          .update(playgroundRunFeedbackDetailsPg)
          .set(values)
          .where(and(
            eq(playgroundRunFeedbackDetailsPg.runId, input.runId),
            eq(playgroundRunFeedbackDetailsPg.feedbackActorId, input.feedbackActorId)
          ))
          .returning();
        return toDetailsRow(rows[0]);
      }

      const rows = await this.dbConfig.db
        .update(playgroundRunFeedbackDetailsSqlite)
        .set(values)
        .where(and(
          eq(playgroundRunFeedbackDetailsSqlite.runId, input.runId),
          eq(playgroundRunFeedbackDetailsSqlite.feedbackActorId, input.feedbackActorId)
        ))
        .returning();
      return toDetailsRow(rows[0]);
    }

    const created = {
      ...values,
      createdAt: input.now
    };

    if (this.dbConfig.mode === 'postgres') {
      const rows = await this.dbConfig.db.insert(playgroundRunFeedbackDetailsPg).values(created).returning();
      return toDetailsRow(rows[0]);
    }

    const rows = await this.dbConfig.db.insert(playgroundRunFeedbackDetailsSqlite).values(created).returning();
    return toDetailsRow(rows[0]);
  }

  async deleteByRunAndActor(runId: string, feedbackActorId: string): Promise<void> {
    if (this.dbConfig.mode === 'postgres') {
      await this.dbConfig.db
        .delete(playgroundRunFeedbackDetailsPg)
        .where(and(
          eq(playgroundRunFeedbackDetailsPg.runId, runId),
          eq(playgroundRunFeedbackDetailsPg.feedbackActorId, feedbackActorId)
        ));
      return;
    }

    await this.dbConfig.db
      .delete(playgroundRunFeedbackDetailsSqlite)
      .where(and(
        eq(playgroundRunFeedbackDetailsSqlite.runId, runId),
        eq(playgroundRunFeedbackDetailsSqlite.feedbackActorId, feedbackActorId)
      ));
  }
}
