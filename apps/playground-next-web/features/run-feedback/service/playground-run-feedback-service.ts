import crypto from 'node:crypto';

import {
  createAgentInfraApp,
  RuntimeUnavailableError,
  type AgentInfraRuntimePort
} from '@agent-infra/app';
import type { RunFeedbackValue } from '@agent-infra/core';
import {
  createAgentInfraRepositories,
  type DbConfig,
  withDbTransaction
} from '@agent-infra/db';

import { PlaygroundRunFeedbackDetailsRepo } from '../repo/playground-run-feedback-details-repo';
import {
  InvalidPlaygroundRunFeedbackDetailsError,
  normalizePlaygroundRunFeedbackDetails,
  type PlaygroundRunFeedbackDetails
} from '../types/playground-run-feedback-details';

const unavailableRuntimePort: AgentInfraRuntimePort = {
  async prepare() {
    throw new RuntimeUnavailableError('runtime execution is not configured for feedback mutations');
  },
  async runTextTurn() {
    throw new RuntimeUnavailableError('runtime execution is not configured for feedback mutations');
  },
  async generateText() {
    throw new RuntimeUnavailableError('runtime execution is not configured for feedback mutations');
  }
};

export type PlaygroundRunFeedbackDetailsRepoLike = Pick<PlaygroundRunFeedbackDetailsRepo, 'upsert' | 'deleteByRunAndActor'>;

export type PlaygroundRunFeedbackServiceOptions = {
  idGenerator?: () => string;
  now?: () => Date;
  createDetailsRepo?: (dbConfig: Pick<DbConfig, 'mode' | 'db'>) => PlaygroundRunFeedbackDetailsRepoLike;
};

export class PlaygroundRunFeedbackService {
  constructor(
    private readonly dbConfig: DbConfig,
    private readonly options: PlaygroundRunFeedbackServiceOptions = {}
  ) {}

  async setRunFeedback(input: {
    threadId: string;
    runId: string;
    feedbackActorId: string;
    value: RunFeedbackValue;
    details?: unknown;
  }) {
    if (input.value === 'thumbs_up' && typeof input.details !== 'undefined') {
      throw new InvalidPlaygroundRunFeedbackDetailsError('details are only allowed for thumbs_down feedback');
    }

    const normalizedDetails = input.value === 'thumbs_down'
      ? normalizePlaygroundRunFeedbackDetails(input.details)
      : null;

    return withDbTransaction(this.dbConfig, async (tx) => {
      const repositories = createAgentInfraRepositories(this.dbConfig.mode, tx);
      const app = createAgentInfraApp({
        repositories,
        runtime: unavailableRuntimePort,
        transaction: async (operation) => operation(repositories),
        idGenerator: this.options.idGenerator ?? (() => crypto.randomUUID()),
        now: this.options.now ?? (() => new Date())
      });
      const detailsRepo = this.options.createDetailsRepo?.({ mode: this.dbConfig.mode, db: tx }) ??
        new PlaygroundRunFeedbackDetailsRepo({ mode: this.dbConfig.mode, db: tx });

      const feedback = await app.turns.setRunFeedback({
        threadId: input.threadId,
        runId: input.runId,
        feedbackActorId: input.feedbackActorId,
        value: input.value
      });

      if (input.value === 'thumbs_down') {
        await detailsRepo.upsert({
          threadId: feedback.threadId,
          runId: feedback.runId,
          feedbackActorId: feedback.feedbackActorId,
          details: normalizedDetails as PlaygroundRunFeedbackDetails,
          now: this.options.now?.() ?? new Date()
        });
      } else {
        await detailsRepo.deleteByRunAndActor(input.runId, input.feedbackActorId);
      }

      return feedback;
    });
  }

  async clearRunFeedback(input: {
    threadId: string;
    runId: string;
    feedbackActorId: string;
  }) {
    return withDbTransaction(this.dbConfig, async (tx) => {
      const repositories = createAgentInfraRepositories(this.dbConfig.mode, tx);
      const app = createAgentInfraApp({
        repositories,
        runtime: unavailableRuntimePort,
        transaction: async (operation) => operation(repositories),
        idGenerator: this.options.idGenerator ?? (() => crypto.randomUUID()),
        now: this.options.now ?? (() => new Date())
      });
      const detailsRepo = this.options.createDetailsRepo?.({ mode: this.dbConfig.mode, db: tx }) ??
        new PlaygroundRunFeedbackDetailsRepo({ mode: this.dbConfig.mode, db: tx });

      await app.turns.clearRunFeedback(input);
      await detailsRepo.deleteByRunAndActor(input.runId, input.feedbackActorId);
    });
  }
}
