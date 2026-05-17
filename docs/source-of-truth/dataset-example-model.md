# Dataset Example Model

This document is the source of truth for `Dataset` and `DatasetExample` v1.

Dataset Capture v1 turns a durable run into a durable example candidate. It is a
foundation for future quality loops, evaluation, and regression testing, but it
is not itself an evaluation runner, replay runtime, experiment system, prompt
hub, or annotation product.

## Scope

Dataset Capture v1 stabilizes:

- shared `Dataset` and `DatasetExample` domain records
- SQLite/Postgres persistence for datasets and examples
- app-layer dataset use cases, including `captureExampleFromRun`
- minimal contracts, server helpers, client helpers, and playground routes
- capture-time snapshots for input context, baseline output, run context, tool
  invocations, and metadata
- an `/observability` capture action that validates the shared capability

It intentionally does not add:

- an evaluation runner
- live replay or frozen replay runtime
- experiment comparison
- LLM-as-judge scoring
- a prompt hub or prompt version manager
- OpenTelemetry, LangSmith, or other exporter sinks
- a cost analytics dashboard or usage ledger
- automatic batch import of historical runs
- a full dataset management UI

## Product Boundary

The durable product surface is the package layer:

- `packages/core` defines shared records and repositories.
- `packages/db` persists those records for supported database backends.
- `packages/app` owns capture semantics and app-boundary validation.
- `packages/contracts`, `packages/durable-chat-server`, and
  `packages/durable-chat-client` expose the minimal serialized adoption surface.

`apps/playground-next-web` is a validation consumer. It may expose routes and a
compact observability capture path, but it must not become the owner of dataset
semantics.

## Dataset

`Dataset` is an app-scoped collection of examples.

Stable fields:

- `id`
- `appId`
- `name`
- `description`
- `visibility`
- `metadata`
- `createdByActorId`
- `createdAt`
- `updatedAt`

`visibility` is:

- `private`: visible to the creating actor inside the app boundary
- `app`: visible within the app boundary

Playground-created datasets default to `private` in v1.

Shared packages do not define a generic user model. `createdByActorId` is an
actor attribution string supplied by the host boundary, not a shared `user_id`
system.

## Dataset Example

`DatasetExample` is a durable captured example owned by one dataset.

Stable fields:

- `id`
- `datasetId`
- `sourceRunId`
- `sourceThreadId`
- `triggerMessageId`
- `inputJson`
- `baselineOutputJson`
- `expectedOutputJson`
- `metadataJson`
- `contextSnapshotJson`
- `toolInvocationsSnapshotJson`
- `createdByActorId`
- `createdAt`
- `updatedAt`

`datasetId` is the required owning relationship.

`sourceRunId`, `sourceThreadId`, and `triggerMessageId` are nullable indexed soft
lineage references. They are not long-lived truth sources and do not have
foreign-key constraints in v1. Capture-from-run validates source run, thread,
message availability, and app boundary at capture time.

The durable example content is the captured snapshot fields. Source refs help
humans and tools trace where the example came from, but a valid captured example
must remain meaningful even if the source run, thread, or message later changes
or becomes unavailable.

## Capture Eligibility

`captureExampleFromRun` accepts completed, failed, and cancelled source runs.

It rejects:

- a missing dataset
- a missing source run
- source runs outside the dataset app boundary
- source runs that are still queued or running
- private datasets not visible to the current actor

Capture reads durable records only. It must not call runtime ports or re-execute
the agent.

## Input Snapshot

`inputJson` v1 is a capture-time envelope:

```ts
interface DatasetInputSnapshotV1 {
  schemaVersion: 1;
  kind: 'chat_turn';
  contextSource: 'current_canonical_at_capture';
  triggerMessageId?: string | null;
  triggerMessage?: DatasetMessageSnapshotV1 | null;
  messages: DatasetMessageSnapshotV1[];
  canonicalRunIds?: string[];
  diagnostics?: CanonicalTranscriptDiagnostic[];
}
```

`messages` contains canonical messages up to and including the trigger message.
For dual-answer or candidate-answer flows, unselected prior candidates are not
included in the canonical capture context.

`inputJson` is not the exact runtime prompt and is not a deterministic replay
input. It is the durable canonical chat context at capture time.

## Baseline Output Snapshot

`baselineOutputJson` v1 is a run-output envelope:

```ts
interface DatasetBaselineOutputSnapshotV1 {
  schemaVersion: 1;
  kind: 'run_output';
  runId: string;
  status: Run['status'];
  error?: string | null;
  assistantMessages: DatasetMessageSnapshotV1[];
}
```

Completed runs with assistant output normally write a non-null baseline output.
Failed, cancelled, or outputless runs may write `baselineOutputJson: null`.

`baselineOutputJson` captures what the source run produced. It is not the human
expected answer. Human or evaluator-provided target output belongs in
`expectedOutputJson`, which remains nullable in v1.

## Context Snapshot

`contextSnapshotJson` v1 records run/thread attribution and diagnostics:

```ts
interface DatasetContextSnapshotV1 {
  schemaVersion: 1;
  kind: 'run_context';
  appId: string;
  threadId: string;
  runId: string;
  triggerMessageId?: string | null;
  provider?: string | null;
  model?: string | null;
  status: Run['status'];
  usage?: Run['usage'] | null;
  error?: string | null;
  runCreatedAt: string;
  startedAt?: string | null;
  finishedAt?: string | null;
  traceDiagnostics?: TraceProjectionDiagnosticV1[];
}
```

This snapshot is the bridge between observability and future dataset workflows.
It preserves useful run diagnostics without making trace projection a replay log.

## Tool Invocation Snapshot

`toolInvocationsSnapshotJson` v1 records durable tool invocations for the source
run:

```ts
interface DatasetToolInvocationsSnapshotV1 {
  schemaVersion: 1;
  kind: 'tool_invocations';
  sourceRunId: string;
  state: 'captured' | 'omitted_by_policy';
  omissionReason?: string | null;
  toolInvocations: DatasetToolInvocationSnapshotV1[];
}
```

Capture-from-run writes a non-null envelope. If the source run had no tools, the
envelope is still written with `state: 'captured'` and an empty
`toolInvocations` array.

`toolInvocationsSnapshotJson: null` is reserved for manual/import examples or a
host capture path that intentionally omits the entire tool snapshot field.

Tool invocation snapshots must not be silently truncated in v1. Hosts may
explicitly omit tool payloads by policy and record that omission in the snapshot
envelope. Redaction and transformation hooks are deferred; v1 either captures
the snapshot or explicitly omits it.

## Metadata Snapshot

`metadataJson` v1 is a generic envelope with stable namespaces:

```ts
interface DatasetExampleMetadataSnapshotV1 {
  schemaVersion: 1;
  capture: {
    kind: 'normal_example' | 'failure_case' | 'debug_case';
    capturedAt: string;
    capturedByActorId?: string | null;
    sourceRunId?: string | null;
    sourceThreadId?: string | null;
    triggerMessageId?: string | null;
  };
  feedback?: {
    sharedRunFeedback?: Record<string, unknown> | null;
  };
  host?: {
    playground?: {
      runFeedbackDetails?: Record<string, unknown> | null;
    };
  };
  evaluation?: {
    defaultEligible: boolean;
  };
}
```

Classification rules:

- completed run with assistant output: `normal_example`,
  `evaluation.defaultEligible = true`
- failed run: `failure_case`, `evaluation.defaultEligible = false`
- cancelled or outputless run: `debug_case`,
  `evaluation.defaultEligible = false`

Shared run feedback may be copied into
`metadataJson.feedback.sharedRunFeedback` as a capture-time snapshot.

Playground thumbs-down reason tags and comment text may be copied into
`metadataJson.host.playground.runFeedbackDetails` as host-local metadata. These
details must not be promoted into shared runtime state or parsed by shared
core/app code.

## Public V1 Surface

The public app/contract surface is intentionally narrow:

- create dataset
- list datasets
- get dataset
- list dataset examples
- update example expected output
- capture example from run

There is no generic public `createExample` API in v1. Manual/import examples may
be added later after their source, validation, privacy, and snapshot semantics
are explicitly designed.

API responses are enough for v1 example verification. A `/datasets` management
page, filtering/search, analytics, and dataset dashboards are deferred.

## Relationship To Trace, Content, And Replay

Trace and timeline projections can supply source refs, diagnostics, and context
for dataset capture. They are not complete deterministic replay logs.

`ContentNode` and replay concepts remain frontend projection concepts. Dataset
snapshots may include message and part content, but they do not redefine normal
chat projection, `AnswerContainer`, `ContentNode`, or replay runtime behavior.

Future eval/replay work may consume `DatasetExample` records, but it must define
its own execution contract instead of assuming captured snapshots are sufficient
to deterministically reproduce a run.
