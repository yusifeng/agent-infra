export interface AgentInfraAppErrorOptions {
  statusCode: number;
  code: string;
  cause?: unknown;
  context?: Record<string, unknown>;
}

export class AgentInfraAppError extends Error {
  readonly statusCode: number;
  readonly code: string;
  readonly context?: Record<string, unknown>;

  constructor(message: string, options: AgentInfraAppErrorOptions) {
    super(message, options.cause ? { cause: options.cause } : undefined);
    this.name = new.target.name;
    this.statusCode = options.statusCode;
    this.code = options.code;
    this.context = options.context;
  }
}

export class ThreadNotFoundError extends AgentInfraAppError {
  constructor(threadId: string) {
    super(`thread ${threadId} not found`, {
      statusCode: 404,
      code: 'thread_not_found',
      context: { threadId }
    });
  }
}

export class RunNotFoundError extends AgentInfraAppError {
  constructor(runId: string) {
    super(`run ${runId} not found`, {
      statusCode: 404,
      code: 'run_not_found',
      context: { runId }
    });
  }
}

export class ChatShareNotFoundError extends AgentInfraAppError {
  constructor(publicId: string) {
    super(`chat share ${publicId} not found`, {
      statusCode: 404,
      code: 'chat_share_not_found',
      context: { publicId }
    });
  }
}

export class ThreadNotActiveError extends AgentInfraAppError {
  constructor(threadId: string, status: string) {
    super(`thread ${threadId} is not active`, {
      statusCode: 409,
      code: 'thread_not_active',
      context: { threadId, status }
    });
  }
}

export class ThreadHasActiveRunError extends AgentInfraAppError {
  constructor(threadId: string, runId: string) {
    super(`thread ${threadId} has an active run`, {
      statusCode: 409,
      code: 'thread_has_active_run',
      context: { threadId, runId }
    });
  }
}

export class ActiveChatShareExistsError extends AgentInfraAppError {
  constructor(threadId: string, publicId: string) {
    super(`thread ${threadId} already has an active share`, {
      statusCode: 409,
      code: 'active_chat_share_exists',
      context: { threadId, publicId }
    });
  }
}

export class ChatShareRevokedError extends AgentInfraAppError {
  constructor(publicId: string) {
    super(`chat share ${publicId} has been revoked`, {
      statusCode: 410,
      code: 'chat_share_revoked',
      context: { publicId }
    });
  }
}

export class InvalidTurnTextError extends AgentInfraAppError {
  constructor() {
    super('text is required', {
      statusCode: 400,
      code: 'invalid_turn_text'
    });
  }
}

export class RuntimeSelectionError extends AgentInfraAppError {
  constructor(message: string, cause?: unknown) {
    super(message, {
      statusCode: 400,
      code: 'runtime_selection_error',
      cause
    });
  }
}

export class RuntimeUnavailableError extends AgentInfraAppError {
  constructor(message: string, cause?: unknown) {
    super(message, {
      statusCode: 503,
      code: 'runtime_unavailable',
      cause
    });
  }
}

export class TurnPersistenceError extends AgentInfraAppError {
  constructor(message: string, context: Record<string, unknown>, cause?: unknown) {
    super(message, {
      statusCode: 500,
      code: 'turn_persistence_error',
      cause,
      context
    });
  }
}

export class TurnProjectionError extends AgentInfraAppError {
  constructor(message: string, context: Record<string, unknown>, cause?: unknown) {
    super(message, {
      statusCode: 500,
      code: 'turn_projection_error',
      cause,
      context
    });
  }
}

export class SharePersistenceError extends AgentInfraAppError {
  constructor(message: string, context: Record<string, unknown>, cause?: unknown) {
    super(message, {
      statusCode: 500,
      code: 'share_persistence_error',
      cause,
      context
    });
  }
}

export class ShareSnapshotBuildError extends AgentInfraAppError {
  constructor(message: string, context: Record<string, unknown>, cause?: unknown) {
    super(message, {
      statusCode: 500,
      code: 'share_snapshot_build_error',
      cause,
      context
    });
  }
}
