# Web Consumer Backlog

This file records future-facing web and console ideas for `apps/playground-web`.

It exists to prevent two common mistakes:

- losing useful UI validation ideas just because they are not core work right now
- letting web-demo polish override the main platform roadmap

`playground-web` is the first consumer and validation surface, not the product boundary. Items in this file are optional unless they help expose, validate, or pressure-test a real platform capability in `packages/*`.

## How To Use This File

- Treat this as a parking lot for consumer-side ideas.
- Do not pull items from here into the mainline by default.
- Promote an item only when it clearly validates or strengthens core/runtime/contracts/db behavior.
- If an item would have little value without `playground-web`, keep it lower priority.

## Candidate Items

## 1. Transcript In-Flight Coherence

Goal: make the center transcript feel consistent while a run is still executing.

Examples:

- show an in-flight assistant placeholder while the run is `queued` or `running`
- reflect tool activity in a lightweight transcript status area
- replace the temporary UI state with the final durable assistant message after completion
- preserve a visible failed state instead of silently removing temporary UI

Notes:

- this is mainly a consumer/UI capability
- it is acceptable only if it stays thin and does not redefine durable truth

## 2. Assistant Text Streaming In The Transcript

Goal: show assistant text growing in the transcript during SSE execution.

Examples:

- append assistant text deltas into a temporary UI draft
- reconcile the draft with the final durable assistant message after completion
- surface interrupted or partial text clearly when a run fails

Notes:

- this should not be done as a page-only trick
- only promote this when it forces a better stream contract that future consumers can also use
- temporary streamed text should remain view state, not domain state

## 3. Recent Runs Console Refinements

Goal: make the run-oriented console easier to inspect and compare.

Examples:

- richer labels for run source, provider, model, and status
- grouping or filtering recent runs for the selected thread
- better visibility for failed runs and terminal errors
- easier switching between active and historical runs

Notes:

- valuable when it improves inspection of durable runs
- lower priority if it becomes cosmetic-only polishing

## 4. Log Panel Refinements

Goal: improve readability of the right-side log without changing the underlying platform model.

Examples:

- clearer separation of status summary vs. scrolling event log
- compact event grouping for noisy runs
- better formatting for tool input/output payloads
- jump links between tool rows and related run events

Notes:

- keep this secondary to the actual run/timeline/tool contracts

## 5. Reload / Reconnect UX

Goal: make the console recover cleanly after refresh, reconnect, or stream interruption.

Examples:

- restore the last selected thread and run on reload
- rebuild the right-side timeline from durable records after reconnect
- show explicit recovery states instead of blank panels
- reopen a completed run without depending on any transient client memory

Notes:

- although visible in the UI, this has real platform value
- this should usually be treated as a higher-priority capability than visual polish

## 6. Run-Centric Navigation

Goal: make it easier to move between thread view and run view when debugging.

Examples:

- direct links from transcript messages to the run that produced them
- run search or quick jump by run id
- "open latest failed run" shortcuts

Notes:

- useful when it strengthens the platform's observability story

## 7. Optional Nice-To-Have Polish

These are acceptable only when the core roadmap is already in a good place:

- smoother loading states
- nicer badges and spacing
- more compact mobile layout behavior
- keyboard shortcuts for common console actions

These should remain explicitly lower priority than core runtime, contract, DB, and app-layer work.
