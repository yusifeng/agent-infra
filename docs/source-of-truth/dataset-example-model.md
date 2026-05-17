# Dataset Example Model

This document is the source of truth for `Dataset` and `DatasetExample` v1.

Dataset Capture v1 turns a durable run into a durable example candidate.
Dataset Review and Expected Output Foundation v1 turns that candidate into a
curated future-eval candidate by adding typed expected-output and review
metadata. These tracks are a foundation for future quality loops, evaluation,
and regression testing, but they are not themselves an evaluation runner, replay
runtime, experiment system, prompt hub, or annotation product.

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
- evaluation execution, eval result persistence, or eval reports

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

## Expected Output

`expectedOutputJson` v1 is a nullable human/evaluator target envelope:

```ts
interface DatasetExpectedOutputV1 {
  schemaVersion: 1;
  kind: 'assistant_text';
  text: string;
  notes?: string | null;
}
```

Rules:

- `text` is required and must be a trimmed non-empty string.
- `notes` is optional reviewer context only. It is not evaluator input.
- Hosts must define conservative maximum lengths for `text` and `notes` at the
  app/server boundary before accepting writes.
- Clearing expected output writes `expectedOutputJson: null`.
- New writes reject invalid envelope shapes.
- Read-model normalizers must tolerate legacy arbitrary stored
  `expectedOutputJson` values so old examples do not crash list or detail
  responses.
- `expectedOutputJson` must not store actor ids, timestamps, or edit history in
  v1.

Expected output v1 intentionally supports only one assistant-text target. It
does not add multi-message expected output, structured JSON assertions,
tool-call assertions, rubric schemas, or LLM-as-judge scoring.

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
  review?: DatasetExampleReviewMetadataV1;
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

### Review Metadata

`metadataJson.review` is post-capture curation metadata. It may be added or
updated after capture. It does not rewrite `metadataJson.capture`,
`metadataJson.feedback`, `metadataJson.host`, or source lineage facts.

```ts
interface DatasetExampleReviewMetadataV1 {
  status: 'unreviewed' | 'needs_expected_output' | 'approved' | 'excluded';
  evalEligibility: 'default' | 'include' | 'exclude';
  exclusionReason?:
    | 'failure_case'
    | 'debug_case'
    | 'missing_expected_output'
    | 'not_representative'
    | 'sensitive_or_unsafe'
    | 'other'
    | null;
  reviewerNote?: string | null;
  reviewedByActorId?: string | null;
  reviewedAt?: string | null;
}
```

Missing review metadata normalizes to:

```ts
{
  status: 'unreviewed',
  evalEligibility: 'default',
  exclusionReason: null,
  reviewerNote: null,
  reviewedByActorId: null,
  reviewedAt: null
}
```

Review writes are strict app-layer operations:

- callers may update only whitelisted review fields
- request bodies must not include unknown review keys
- request bodies must not include protected metadata namespaces such as
  `capture`, `feedback`, `host`, `evaluation`, or full `metadataJson`
- `reviewedByActorId` and `reviewedAt` are assigned by app use cases, not by
  request bodies
- review metadata updates must preserve `metadataJson.schemaVersion`,
  `metadataJson.evaluation.defaultEligible`, unknown metadata namespaces, and
  all capture-time facts

Invalid combinations are rejected at app write boundaries:

- `status = 'excluded'` with `evalEligibility = 'include'`
- `status = 'approved'` without valid expected output
- `evalEligibility = 'include'` without valid expected output

### Effective Eligibility

Effective eligibility is a computed future-eval readiness signal. It is not an
evaluation execution contract and must not be stored as a second truth.

The computation reads `expectedOutputJson`, normalized `metadataJson.review`,
and `metadataJson.evaluation.defaultEligible`.

Rules:

- `review.evalEligibility = 'exclude'` is always ineligible.
- `review.evalEligibility = 'include'` is eligible only when the example has a
  valid expected output and the review state is compatible with inclusion.
- `review.evalEligibility = 'default'` is eligible only when
  `evaluation.defaultEligible === true`, `review.status = 'approved'`, and the
  example has a valid expected output.
- `review.status = 'unreviewed'` is not eligible.
- `review.status = 'needs_expected_output'` is not eligible.
- contradictory stored states normalize to an ineligible read model instead of
  crashing reads, but new writes must reject them.

Reason codes returned by read models:

- `eligible_default`
- `eligible_included_by_review`
- `ineligible_unreviewed`
- `ineligible_needs_expected_output`
- `ineligible_missing_expected_output`
- `ineligible_invalid_expected_output`
- `ineligible_excluded_by_review`
- `ineligible_capture_default`
- `ineligible_contradictory_review_state`

### Source Access During Review

Dataset access controls whether an example can be reviewed. Source run/thread
access controls only lineage navigation. A user with access to a dataset example
must be able to inspect captured snapshots and edit review metadata even if the
source run is unavailable or no longer accessible.

Routes and UI may attempt to build a lineage link back to
`/observability?threadId=...&runId=...`, but failure to load the source must
render an unavailable state without leaking source-run existence outside the
actor boundary.

### Tool Snapshot Safety

Tool invocation snapshots may contain captured tool input and output from run
time. V1 has no redaction guarantee. UI must distinguish captured payloads from
`omitted_by_policy` snapshots truthfully and must not add copy, export, or
download actions for full tool payloads in this track.

## Public V1 Surface

The public app/contract surface is intentionally narrow:

- create dataset
- list datasets
- get dataset
- list dataset examples
- get dataset example
- update example expected output
- update example review metadata
- capture example from run

There is no generic public `createExample` API in v1. Manual/import examples may
be added later after their source, validation, privacy, and snapshot semantics
are explicitly designed.

The playground may expose `/observability/datasets` as an independent validation
surface for dataset review. It must not depend on `/chat`, `threadId`, `runId`,
or the selected-run state from `/observability`. The page may use query params
such as `datasetId` and `exampleId` as navigable review selection state, but the
review semantics still belong to the package/app/contract surface rather than
the page implementation.

The review surface should show datasets, examples, and a selected example detail
from captured snapshots. It should display source run/thread lineage when
available, but a missing source link must not block input, baseline output,
context, tool, expected-output, or review inspection.

Filtering/search, analytics, bulk operations, assignments, multi-reviewer
workflow, eval reports, and dataset dashboards remain deferred.

## Relationship To Trace, Content, And Replay

Trace and timeline projections can supply source refs, diagnostics, and context
for dataset capture. They are not complete deterministic replay logs.

`ContentNode` and replay concepts remain frontend projection concepts. Dataset
snapshots may include message and part content, but they do not redefine normal
chat projection, `AnswerContainer`, `ContentNode`, or replay runtime behavior.

Future eval/replay work may consume `DatasetExample` records, but it must define
its own execution contract instead of assuming captured snapshots are sufficient
to deterministically reproduce a run.
