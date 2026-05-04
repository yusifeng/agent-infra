import { performance } from 'node:perf_hooks';

import type { FastifyBaseLogger, FastifyReply, FastifyRequest } from 'fastify';

type TimingAnnotation = boolean | number | string;

type TimingSpan = {
  durationMs: number;
  name: string;
};

export type RequestTiming = {
  annotate: (name: string, value: TimingAnnotation) => void;
  annotations: Record<string, TimingAnnotation>;
  complete: (logger: FastifyBaseLogger, request: FastifyRequest, reply: FastifyReply) => void;
  formatServerTiming: (options?: { includeTotal?: boolean }) => string;
  measureAsync: <T>(name: string, run: () => Promise<T>) => Promise<T>;
  measureSync: <T>(name: string, run: () => T) => T;
  spans: TimingSpan[];
  startedAtMs: number;
  totalDurationMs: () => number;
};

declare module 'fastify' {
  interface FastifyRequest {
    requestTiming: RequestTiming;
  }
}

function roundDuration(durationMs: number) {
  return Number(durationMs.toFixed(1));
}

function normalizeMetricName(name: string) {
  return name.replace(/[^a-zA-Z0-9_-]/g, '_');
}

export function createRequestTiming(): RequestTiming {
  const startedAtMs = performance.now();
  const spans: TimingSpan[] = [];
  const annotations: Record<string, TimingAnnotation> = {};
  let completed = false;

  const addSpan = (name: string, durationMs: number) => {
    spans.push({
      name,
      durationMs: roundDuration(durationMs)
    });
  };

  return {
    startedAtMs,
    spans,
    annotations,
    annotate(name, value) {
      annotations[name] = value;
    },
    async measureAsync(name, run) {
      const startedAt = performance.now();
      try {
        return await run();
      } finally {
        addSpan(name, performance.now() - startedAt);
      }
    },
    measureSync(name, run) {
      const startedAt = performance.now();
      try {
        return run();
      } finally {
        addSpan(name, performance.now() - startedAt);
      }
    },
    totalDurationMs() {
      return roundDuration(performance.now() - startedAtMs);
    },
    formatServerTiming(options = {}) {
      const metrics = spans.map((span) => `${normalizeMetricName(span.name)};dur=${span.durationMs}`);
      if (options.includeTotal !== false) {
        metrics.push(`total;dur=${roundDuration(performance.now() - startedAtMs)}`);
      }
      return metrics.join(', ');
    },
    complete(logger, request, reply) {
      if (completed) {
        return;
      }

      completed = true;
      logger.info(
        {
          annotations,
          durationMs: roundDuration(performance.now() - startedAtMs),
          method: request.method,
          requestId: request.id,
          spans,
          statusCode: reply.statusCode,
          url: request.url
        },
        'request timing'
      );
    }
  };
}

export function applyTimingHeaders(request: FastifyRequest, reply: FastifyReply, options?: { includeTotal?: boolean }) {
  if (!reply.hasHeader('x-request-id')) {
    reply.header('x-request-id', request.id);
  }

  if (!reply.hasHeader('server-timing')) {
    reply.header('server-timing', request.requestTiming.formatServerTiming(options));
  }
}
