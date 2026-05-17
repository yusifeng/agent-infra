import type {
  AnswerCandidateDto,
  AnswerSelectionDto,
  RunDto,
  RunFeedbackDto
} from '@agent-infra/contracts';

import type { AnswerContainer } from './answer-containers';
import type { LiveAssistantDraft } from './live-assistant-draft';

export type AnswerCandidateStatus = 'queued' | 'running' | 'completed' | 'failed' | 'empty';

export type AnswerCandidatePresentation = {
  id: string;
  candidate: AnswerCandidateDto;
  answerContainer: AnswerContainer | null;
  liveAssistantDraft: LiveAssistantDraft | null;
  run: RunDto | null;
  status: AnswerCandidateStatus;
  selected: boolean;
  isDefault: boolean;
  feedback: RunFeedbackDto | null;
};

export type AnswerCandidateGroup = {
  id: string;
  threadId: string;
  triggerMessageId: string;
  selection: AnswerSelectionDto | null;
  candidates: AnswerCandidatePresentation[];
};
