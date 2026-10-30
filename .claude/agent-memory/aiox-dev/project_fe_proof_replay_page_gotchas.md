---
name: fe-proof-replay-page-gotchas
description: ChecksStudioPage proof=replay lane - published learn hands the screen to the AFTER_LEARN replay; test ids, transport rules, autorun gating traps
metadata:
  type: project
---

After a learn that published, the page calls `beginRun(proof.executionId, true)` once (ref guard) and `guidedVisible` goes false; `guided-completion` only shows for one render. Assert the stable end state with `guided-proof-receipt` (learned lines from `learnedReceiptLines`), not `guided-completion` (older tests that did were racy).

**Why:** user-approved "proof = replay of the published revision" plan, FE lane 2026-10-25. Failed/cancelled/unpublished learns still show the recording under `guided-attempt` ("Learning attempt").

**How to apply:**
- Scripted transport snapshots that end terminal must carry `videoPath = /api/v1/studio/executions/{ownId}/video`, else the shared transport layer drops them silently (page looks stuck RUNNING).
- Redux-driven renders are synchronous (useSyncExternalStore) while `setSnapshot` is batched: a terminal snapshot is seen one render before `isExecuting` clears. Gate "proof is over" on `terminal && !isRunning`.
- The guided pointer is in sessionStorage and hydrates into redux a render after mount; the autorun arming effect must read `readGuidedPointer` itself.
- Playwright msw project: the mock serves no `/executions/{id}/events`; `unhandledStudioPaths` in studio-guided.spec.ts filters it. `pnpm exec playwright test --project=msw e2e/studio-guided.spec.ts` runs in ~70 s.
- Full vitest needs `--maxWorkers=3 --minWorkers=1` (maxWorkers alone ran 0 tests); related [[tooling-fe-full-suite-under-load]].
