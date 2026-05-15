# Run Trace And Usage Contract

This document is the source of truth for the v1 run trace and usage contract.

It defines durable platform semantics shared by `packages/core`, `packages/app`,
`packages/contracts`, `packages/db`, `packages/runtime-pi`, and reusable durable
chat packages. Consumer hosts such as playground apps may render or protect these
records, but they do not redefine the shared contract.

## Scope

`Run Trace And Usage Contract v1` is an infra foundation, not a billing product.

It stabilizes:

- durable raw run trace semantics
- typed timeline projection semantics
- versioned run usage summary semantics
- attribution boundaries across shared packages and host apps

It intentionally does not add:

- shared users, accounts, organizations, tenants, sessions, or auth
- invoices, credits, quota, plans, payments, or budget enforcement
- a `run_usage_records` ledger table
- server-side cancel behavior
- deterministic replay

Those may be built later on top of this contract if real consumer needs justify
the extra surface area.

## Durable Trace Layers

One assistant run is represented through these durable layers:

- `run`
  - terminal status, provider/model, error, timing, and usage summary
- `message` and `message_part`
  - durable transcript projection
- `tool_invocation`
  - structured tool execution state
- `run_events`
  - append-only runtime fact log

`run_events` are raw process facts. They are preserved as `type + payload + seq`
and remain flexible. Consumers must not assume every event type has a stable typed
payload unless a projection or DTO explicitly defines it.

The durable read model does not replace raw events. Timeline APIs should expose
raw `runEvents` and `toolInvocations` alongside any typed projection.

## Live-Only Assistant Updates

Assistant `message_update` is live-only in v1.

`runtime-pi` may receive assistant `message_update` events and use them to drive
transient live assistant drafts over stream transports. These updates are not
persisted as durable `run_events`.

Final assistant content settles through durable `message` and `message_part`
writes at `message_end`.

This boundary keeps per-delta stream traffic out of SQL while preserving durable
lifecycle, tool, final transcript, and terminal facts. If durable assistant
checkpoints are added later, they must define:

- exact payload shape
- checkpoint cadence
- event-volume constraints
- recovery behavior after disconnect

They should not silently persist every stream delta.

## Typed Timeline Projection

The typed timeline projection is a read model built in `packages/app` over:

- durable `run`
- raw `run_events`
- durable `tool_invocations`

Projection semantics do not belong in route helper code. Shared server helpers
should serialize projection data provided by the app boundary.

The v1 projection shape is:

```ts
interface RunTimelineProjectionV1 {
  schemaVersion: 1;
  items: RunTimelineItemV1[];
}
```

Timeline item kinds are:

- `run_lifecycle`
  - phases: `started`, `completed`, `failed`, `cancelled`
  - references the source raw run event
- `assistant_message`
  - phases: `started`, `completed`, `failed`
  - references the source raw run event
- `tool_invocation`
  - phases: `started`, `completed`, `failed`
  - references the source raw run event
  - references the matched durable tool invocation when available
- `runtime_error`
  - references the source raw run event
- `unknown_event`
  - preserves the raw event type and source raw run event reference

Unknown raw event types must not break timeline reads. They should be surfaced as
`unknown_event` projection items while raw event payloads remain available in the
same response.

Projection phase rules:

- `agent_start` projects to `run_lifecycle(started)`.
- `agent_end` projects from terminal `run.status`, including `cancelled`.
- assistant `message_start` projects to `assistant_message(started)`.
- assistant `message_end` projects to `assistant_message(completed)` unless the
  stop reason indicates an error or abort.
- `tool_execution_start` projects to `tool_invocation(started)`.
- `tool_execution_end` projects to `tool_invocation(completed|failed)`.
- if a `tool_execution_end` payload does not include `isError`, the projection
  may fall back to the matched durable `tool_invocation.status`.

The projection is durable-first and independent from SSE/live stream state.

## Trace Span Projection

`Trace Span Projection v1` is the machine-readable observability read model for
one durable run.

It is distinct from the other trace layers:

- raw `run_events` are append-only durable process facts
- timeline projection is a human-readable ordered inspection model
- span projection is a machine-readable tree/read model for observability,
  feedback subjects, future eval examples, and optional external exporters

Span projection is built from persisted records. It does not persist or
reconstruct live-only assistant `message_update` deltas.

Phase 1 span projection is projection-only:

- no DB migration
- no durable `trace_spans` table
- no runtime-written span rows
- no `runs.metadata_json`
- no shared user/auth/org/tenant/account model
- no feedback, dataset/eval, prompt hub, or exporter implementation

External systems such as LangSmith or OpenTelemetry may be added later as sinks.
They must not replace internal durable truth.

### Trace Response

The v1 trace read returns the durable run and projection only:

```ts
interface RunTraceResult {
  run: Run;
  projection: TraceSpanProjectionV1;
}
```

The public DTO follows the same boundary:

```ts
interface RunTraceResponseDto {
  run: RunDto | null;
  projection?: TraceSpanProjectionDto | null;
  error?: string;
}
```

Trace responses do not include raw `runEvents` or `toolInvocations` arrays. Raw
payload inspection remains the responsibility of timeline reads. Trace spans
instead include source references that point back to durable facts.

### Trace Span Shape

The v1 span kinds are intentionally conservative:

- `agent`
- `assistant_message`
- `tool_invocation`
- `runtime_error`
- `unknown_event`

`assistant_message` is not a provider LLM-call span. It represents durable
assistant message lifecycle facts from assistant `message_start` and
`message_end` events. A future runtime contract may add separate provider
`llm_call` spans if provider-call boundaries become durable facts.

The v1 span statuses are:

- `queued`
- `running`
- `completed`
- `failed`
- `cancelled`
- `unknown`

The stable span fields are:

- `schemaVersion`
- `id`
- `traceId`
- `parentSpanId`
- `kind`
- `name`
- `status`
- `appId`
- `threadId`
- `runId`
- `order`
- `startedAt`
- `finishedAt`
- `durationMs`
- `sourceRefs`

Optional v1 fields are:

- `provider`
- `model`
- `usageRef`
- `tool`
- `error`
- `metadata`

Phase 1 `metadata` is forward-compatible only. It should be `null` unless a value
is derived from already-stable durable fields. Phase 1 does not define trace
metadata or tag semantics.

`appId` is non-null in span projection. The app boundary resolves it by loading
`run.threadId -> thread.appId`. Missing run/thread/app attribution is an
app-layer load error, not a nullable projection state.

### Source References

`TraceSpanSourceRefV1` references durable facts:

- `run`
- `run_event`
- `tool_invocation`

Message source references are deferred unless the projection can obtain stable
durable message ids without inference.

### Deterministic Span IDs

Span ids must be deterministic across repeated reads of the same durable records:

- root agent span: `span:run:${run.id}`
- tool span with durable invocation: `span:tool:${toolInvocation.id}`
- assistant message span with a start event:
  `span:assistant_message:${messageStartEvent.id}`
- event-only spans: `span:event:${event.id}`

The default `traceId` is `run.id`.

### Span Construction Rules

Root agent span:

- parent is `null`
- status maps directly from `run.status`, including `cancelled`
- timestamps prefer `run.startedAt` and `run.finishedAt`
- source refs include the durable run and related `agent_start` / `agent_end`
  events when available
- may include run-level `provider`, `model`, and `usageRef`

Assistant message span:

- kind is `assistant_message`
- parent is the root agent span
- built from assistant `message_start` and `message_end` events
- never built from live-only assistant `message_update`
- maps `message_end.stopReason` values such as `error` or `aborted` to `failed`
- records a structured diagnostic for unpaired start or end events

If an assistant span is missing its end event, its status is derived from the
root terminal state:

- `running` when root is `queued` or `running`
- `failed` when root is `failed`
- `cancelled` when root is `cancelled`
- `unknown` only when the terminal state cannot be interpreted

Tool invocation span:

- kind is `tool_invocation`
- parent is always the root agent span in Phase 1
- primary identity is durable `tool_invocation.id`
- status prefers durable `tool_invocation.status`
- matching `tool_execution_start` / `tool_execution_end` events enrich source
  refs by `toolCallId`
- full tool input/output remain on durable `tool_invocation` records, not stable
  top-level span fields

Nested tool parentage under assistant spans is deferred until message source refs
or explicit assistant segment ids become part of the contract.

Runtime error span:

- kind is `runtime_error`
- parent is the root agent span
- source ref is the `runtime_error` event

Unknown durable events:

- project to `unknown_event` spans
- increment diagnostics
- do not fail the whole projection

Event-only spans use `event.createdAt` for both `startedAt` and `finishedAt`, and
`durationMs: 0`.

`durationMs` is computed only when both timestamps are known. Negative durations
are clamped to `0` and produce a `negative_duration_clamped` diagnostic.

### Diagnostics

Diagnostics are structured so tests and consumers can assert stable codes instead
of brittle text.

The v1 diagnostic codes are:

- `unknown_event`
- `orphan_event`
- `missing_tool_invocation`
- `unpaired_message_start`
- `unpaired_message_end`
- `unpaired_tool_start`
- `unpaired_tool_end`
- `nonterminal_child_on_terminal_run`
- `negative_duration_clamped`

Each warning includes:

- `code`
- `message`
- `sourceRefs`

The projection-level diagnostics include:

- `unknownEventCount`
- `orphanEventCount`
- `warnings`

Except for missing base run/thread/app attribution, unknown or incomplete source
relationships should produce diagnostics rather than fail trace reads.

## Usage Summary

`Run.usage` stores a versioned summary in `runs.usage_json`.

The v1 shape is `RunUsageSummaryV1`:

```ts
interface RunUsageSummaryV1 {
  schemaVersion: 1;
  provider: string;
  model: string;
  normalizationStatus: 'complete' | 'partial' | 'missing' | 'malformed';
  tokens: {
    input?: number;
    output?: number;
    total?: number;
    cacheRead?: number;
    cacheWrite?: number;
    reasoning?: number;
  };
  estimatedCost?: {
    currency: string;
    amountMicros: number;
    source: string;
    version?: string | null;
  } | null;
  rawProviderUsage?: Record<string, unknown> | null;
}
```

Rules:

- `schemaVersion` is required and currently equals `1`.
- `provider` and `model` identify the runtime source of the usage summary.
- unknown token fields must remain absent, not default to zero.
- raw provider usage should be preserved when available.
- missing provider usage is represented as a versioned summary with
  `normalizationStatus: 'missing'`.
- malformed usage must not change an otherwise truthful terminal run status.
- estimated cost is best-effort only.
- normalized cost fields should only be emitted when the runtime has a clear
  pricing source and version or source identifier.

`runs.usage_json` remains the persistence location for v1. A separate usage
records table is deferred.

## Attribution Boundary

Shared infra attribution is at durable platform boundaries:

- `runId`
- `threadId`
- `appId`

`runtime-pi` does not resolve or write `appId` into usage summaries.

When a read path needs `appId`, it should resolve it at the app/service or
repository boundary from `run.threadId -> thread.appId`.

Shared packages must not introduce generic user-level usage APIs in this contract.
Host user attribution belongs to consumer hosts. For example, playground can
aggregate host-owned usage by joining:

```text
playground_thread_catalog.owner_user_id -> thread_id -> runs
```

That host-local ownership model must not be copied into `packages/core`,
`packages/contracts`, `packages/db`, `packages/app`, or `packages/runtime-pi`.

## Deferred Follow-Ups

### Queryable Usage Records

Add `run_usage_records` only after summary semantics are stable and consumers
need queryable aggregation by app/thread/run.

Prefer one row per run first. A metric-per-row ledger should wait until the system
has real multiple usage-producing events per run, post-run adjustments, or
immutable accounting history requirements.

Any future table must support the repository's SQLite and PostgreSQL/Turso paths
together.

### Server-Side Cancel

Server-side cancel should be built after terminal trace and partial usage
semantics are stable.

The typed timeline can already represent `cancelled`, but this contract does not
define runtime abort mechanics, partial provider usage capture, or route APIs for
cancel.

### Replay And Eval

Replay/eval fixtures should be built after typed timeline projection has proven
stable enough as a source for inspection and test fixtures.

Raw events remain available for replay-oriented work. The typed projection is a
read model, not a complete deterministic replay log.

### Runtime Adapter Hardening

Adapter contract hardening should happen after trace and usage semantics are no
longer `runtime-pi` specific. Candidate work includes richer failure payloads,
runtime/tool version fingerprints, and stronger handling for long-running
`tool_execution_update` events.
