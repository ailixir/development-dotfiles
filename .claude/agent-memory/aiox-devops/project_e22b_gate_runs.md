---
name: e22b-gate-runs
description: SC008 E22b real-site gate runs on 2026-10-31 - how to run it, gate-setup traps, and results (run 1 RED 6/14, r2 RED 7/12 reachable)
metadata:
  type: project
---

SC008 E22b gate (frontend/e2e/realsite-gate): run 1 RED (smoke 2/5, dry 6/14), r2 RED (smoke 5/5, counted rg-20261031-3 evaluate exit 1, 7/14 clean positives = 7 of 12 reachable). Results in `~/.aiox-lean/put-checks-ui-studio/SC008/work/SC008-E22/gate-results.md` and `gate-results-r2.md`; artifacts in `.../SC008/gate-e22b` and `gate-e22b-r2`.

r3 (dist sha 5da11f7f, FIX-23 fixed N1): smoke 3/5, dry 8/12, counted rg-20261031-4 evaluate exit 1 with 6/12 clean; losses were Vertex TRANSPORT_STALL (20 s send cap) and debian.org/datatracker Cloudflare flakes. pythondocs proof now passes. 268 of 400 calls. Notes in `gate-results-r3.md`.

r4 (same dist/contract, r3 dry scan accepted for a 2nd rg run): smoke 3/5, rg-20261031-5 evaluate exit 1 with 6/12 clean; 140 of 150 calls. Failures varied run to run (gateway TRANSPORT_STALL, repair exhaustion). `gate-results-r4.md`.

**Why:** Vertex project epicagentai, location `global` (from studio-runner/evaluation/grounding/lib/vertex.mjs), ADC creds, ports 18400-18492 set, Node 24.20.0, JDK 21.

**How to apply (traps that cost time):**
- An `rg-` run's environment test needs one wire request already in that run's recorder dir ("model id is only declared"); send a 1-call probe to `.../models/gemini-3.8-flash:generateContent` via the recorder before the run. Failed environment tests burn the run id (create-once files), so use a fresh id each time.
- Recorder cap is `CHECKS_GATE_MAX_CALLS` per run dir; restart the recorder (same port) per run id.
- `driver.ts:377` failedStepIndex always null (psqlJson needs row_to_json) so N1 can never be "met" until fixed (FIX-23 proposed).
- debian.org resets connections intermittently (verify, replay, N3): site flake, repeat once.
- Commands over ~2 min get auto-backgrounded; poll with short sleeps. `pgrep -f` on a command line matches the polling shell itself.
