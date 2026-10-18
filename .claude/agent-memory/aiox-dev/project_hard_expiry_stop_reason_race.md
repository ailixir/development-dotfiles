---
name: project-hard-expiry-stop-reason-race
description: W11 diagnosis of guided-secret-ownership hard-expiry LEASE_LOST flake (pre-existing tie race, not W9/W10); scratch-copy recipe to run the runner tiers without touching the repo
metadata:
  type: project
---

`guided-secret-ownership` mode `hard-expiry` fails ~2% with `LEASE_LOST` instead of `EXPIRED` (verified 2026-10-17, 9/380 runs; patch in `docs/qa/evidence/STUDIO-OBS-015/execution-20261015/w11-hard-expiry01/`).

**Why:** the lease is capped at `expiresAt`, so at session end lease == expiry. `runtime.ts` schedule() (line ~122) and `ownership.ts` schedule() (line ~54) pick the reason by re-reading `Date.now() >= expiresAt` when the timer fires; Node timers can fire <1 ms before that. Also `requestClaim` throws LEASE_LOST when a renewal starts in the last 100 ms (non-secret sessions always hit it). Same bytes at HEAD, fg04, fg05, fg06: not a W9/W10 regression. Gage's "renewal in last 100 ms" guess was not the cause of the gates06 failure (last renewal was 976 ms before E).

**How to apply:** any new timer that labels a stop must fix the reason when arming (from instants), never from the clock at fire. A fixtures-tier assertion of `Date.now() >= deadline` after a 25 ms `untilMs` poll is itself racy by a few ms.

Scratch recipe (no repo side effects): the fixtures tier needs a sibling layout `docs/`, `tools/`, `helm-chart/`, root `node_modules/`, `package.json` next to `studio-runner/`. `cp -Rc` (APFS clone) of the 5 GB `docs` takes ~12 s; oracles then write into the clone. Variants at older W-states: `final-gates0N/capture-before.json` has per-file sha256; find the bytes by sha under other scratchpad dirs (`iso/` = fg04, `w9/mut2/*.orig` = fg05). Instrument by wrapping `GuidedRuntime.prototype.stop` / `GuidedOwnership.prototype.renew` in a copy of the test; `performance.timeOrigin+performance.now()` gives fractional wall time.

Update 2026-10-17 (W11 applied): fix.patch applied plus Aria's C-1 (a lease==expiry renewal claim whose budget was set by the 100 ms margin, not the 1 s / 10 s cap, no longer stops the session on local abort: `ClaimMarginExhausted` in ownership.ts `requestClaim`/`renew`; backend refusals and cap-bound timeouts keep their reason). I folded the separate `cannotExtend()` skip into the same predicate. Under fake timers a claim stub with latency must answer the FIRST claim at once, or `await manager.assign` hangs (fake clock does not advance). Unit mutation recipe: single `str.replace` with count assert, restore with sha assert, `vitest run <file> --coverage.enabled=false --reporter=json`.
