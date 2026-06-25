# Local Worker Runtime Todo

## 0. Context And Boundary

### 0.1 Confirmed Facts

- [x] Current practical sandbox baseline is Docker.
- [x] Docker runtime is now configurable through `CLOUD_AGENT_DOCKER_RUNTIME`; unset/default keeps Docker's normal runtime, usually `runc`, and `runsc` is reserved for Linux hosts with gVisor installed and smoke tested.
- [x] Personal-use deployment can run the control plane on a hosted Next app while a local/home machine runs the sandbox worker.
- [x] A public Vercel app cannot share a local SQLite file with a home worker; remote control plane plus local worker requires a shared durable DB/queue such as managed Postgres or Redis/BullMQ.
- [x] `apps/cloud-agent-next-web` already has DB-backed queue, BullMQ queue, worker loop, worker heartbeat, queue diagnostics, and worker drain controls.

### 0.2 Goals

- [x] Make the local-worker execution mode easy to start and hard to confuse with request-owned in-process execution.
- [x] Keep Docker sandbox semantics stable across local worker, cheap VPS worker, and future Kubernetes workers.
- [x] Preserve the browser stream/follow model when execution is handled by a separate worker process.
- [x] Make queue/worker/sandbox diagnostics explicit enough that failures can be explained without guessing.
- [x] Keep this phase focused on infrastructure, not chat UI polish or new provider SDKs.

### 0.3 Non-Goals

- [x] Do not add a third SDK.
- [x] Do not implement KubernetesPodSandboxProvider in this immediate phase.
- [x] Do not implement raw Firecracker or microVM orchestration now.
- [x] Do not treat Docker+runc or Docker+runsc as a final public untrusted-code security guarantee.
- [x] Do not make local SQLite the recommended remote-control-plane database.

## 1. Definitions First

### 1.1 Source Of Truth

- [x] Update `docs/cloud-agent-runtime-alignment.md` with the local-worker runtime path.
- [x] Keep long-lived sandbox/runtime limits in `docs/source-of-truth/cloud-agent-runtime-model.md`.
- [x] Avoid creating a second architecture truth outside these docs and this temporary todo.

### 1.2 Execution Modes

- [x] Define `in-process` as request-owned development execution.
- [x] Define `db-queue` as local worker / simple VPS worker execution.
- [x] Define `bullmq` as Redis-backed worker execution for more production-like deployments.
- [x] Document that hosted Next + local worker needs shared DB/queue, not local SQLite.

### 1.3 Sandbox Runtime Modes

- [x] Keep Docker default runtime unset for macOS/Docker Desktop and normal local development.
- [x] Document `CLOUD_AGENT_DOCKER_RUNTIME=runsc` as Linux/gVisor-only until smoke tested.
- [x] Keep `/workspace`, `/agent-home`, and `/agent-credentials` semantics unchanged.

## 2. Backend / Platform Work

- [x] Add a clear local worker script entrypoint that defaults to DB-backed queue execution.
- [x] Add a runtime diagnostics script or command that prints queue provider, worker options, and sandbox runtime configuration.
- [x] Ensure worker loop logs enough startup metadata to distinguish `in-process`, `db-queue`, and `bullmq`.
- [x] Ensure queue diagnostics make the hosted-control-plane plus local-worker database requirement visible.

## 3. Tests And Verification

- [x] Run `@agent-infra/cloud-agent-runtime` tests after sandbox-related changes.
- [x] Run `cloud-agent-next-web` typecheck after app worker changes.
- [x] Run `git diff --check`.
- [x] Run `codex review` after the todo implementation is complete.

## 4. Recommended Execution Order

### Loop 1: Local Worker Preset

- [x] Add `dev:local-worker` as a clear local control-plane entrypoint.
- [x] Add `worker:local` as a clear local worker entrypoint.
- [x] Update `.env.example` with local-worker deployment notes.
- [x] Update alignment docs with the local-worker path.
- [x] Run targeted typecheck and diff checks.
- [x] Run `codex review` after Loop 1-4 implementation is complete.

### Loop 2: Runtime Diagnostics

- [x] Add a small diagnostics script that prints queue provider, worker options, Docker runtime, execution modes, and known production issues.
- [x] Reuse existing queue diagnostics instead of inventing a new model.
- [x] Keep diagnostics as a thin script; no extra model-level test needed beyond typecheck and script execution.
- [x] Run targeted typecheck and diff checks.
- [x] Run `codex review` after Loop 1-4 implementation is complete.

### Loop 3: External Stream / Worker Acceptance Smoke

- [x] Add a smoke path that creates a run using `db-queue`, starts/uses a worker, and follows the run events.
- [x] Verify stream/follow semantics rely on persisted run events rather than request-local memory.
- [x] Record provider-auth-dependent portions as optional by using fallback completion for this smoke.
- [x] Run targeted verification.
- [x] Run `codex review` after Loop 1-4 implementation is complete.

### Loop 4: Sandbox Capability Planning

- [x] Decide not to add a new provider-neutral capability shape in this slice; existing runtime diagnostics and source-of-truth docs are enough.
- [x] Keep K8s as a planned provider, not an immediate implementation.
- [x] Promote stable facts into `docs/source-of-truth/cloud-agent-runtime-model.md`.
- [x] Run package tests/typecheck.
- [x] Run `codex review` after Loop 1-4 implementation is complete.
