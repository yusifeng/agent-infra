# Roadmap

## v0.1 Durable Core

- durable thread/run/message/message_part/tool_invocation/run_events
- `packages/app` use-case boundary for thread and turn orchestration
- `playground-web` as the first consumer of the platform contracts
- run-oriented timeline and recent-run inspection
- assistant text streaming built on top of durable runtime events without replacing durable message truth

## v0.2 Runtime Adapters & Streaming

- `runtime-pi` hardening and provider expansion
- read-side timeline APIs
- resumable runs
- improved run state machine and partial failure handling

## v0.3 Artifact & Files

- complete artifact repositories
- file attachments and artifact linking to messages/runs

## v0.4 Memory Layer

- memory abstraction on top of thread history
- summarization and retrieval strategies
