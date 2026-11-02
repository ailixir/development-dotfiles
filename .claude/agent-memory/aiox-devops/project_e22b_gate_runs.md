---
name: e22b-gate-runs
description: SC008 E22b real-site gate runs 2026-10-31/11-01 (run 1 through r7, all RED) - how to run it, gate-setup traps, and results
metadata:
  type: project
---

SC008 E22b gate (frontend/e2e/realsite-gate): run 1 RED (smoke 2/5, dry 6/14), r2 RED (smoke 5/5, counted rg-20261031-3 evaluate exit 1, 7/14 clean positives = 7 of 12 reachable). Results in `~/.aiox-lean/put-checks-ui-studio/SC008/work/SC008-E22/gate-results.md` and `gate-results-r2.md`; artifacts in `.../SC008/gate-e22b` and `gate-e22b-r2`.

r3 (dist sha 5da11f7f, FIX-23 fixed N1): smoke 3/5, dry 8/12, counted rg-20261031-4 evaluate exit 1 with 6/12 clean; losses were Vertex TRANSPORT_STALL (20 s send cap) and debian.org/datatracker Cloudflare flakes. pythondocs proof now passes. 268 of 400 calls. Notes in `gate-results-r3.md`.

r4 (same dist/contract, r3 dry scan accepted for a 2nd rg run): smoke 3/5, rg-20261031-5 evaluate exit 1 with 6/12 clean; 140 of 150 calls. Failures varied run to run (gateway TRANSPORT_STALL, repair exhaustion). `gate-results-r4.md`.

r5 (2026-11-01, HEAD 4cc0f4a59 E15 + FIX-28/29/30 uncommitted, dist 04cff617 byte-identical rebuild, jar 3bb22983): smoke 4/5 (iana smoke ASSERTION_FAILED 3rd time), rg-20261101-1 evaluate exit 1 with 11/14 clean (9/12 excl iana); losses hackernews + N2 (3 consecutive stalls exhaust FIX-28 allowance), pythondocs step-3 "Quick search" clarification, datatracker-reuse Cloudflare. 170 of 298 calls. `gate-results-r5.md`. Trap: run `gate-cli verify --run <id>` before every rg- env test or the id is burned.

r6 (2026-11-01, HEAD 251229701 + FIX-31/32/33 uncommitted, dist 04cff617 byte-identical again, jar 30008134): smoke 5/5 (FIX-32 fixed iana), rg-20261101-61 evaluate exit 1 with 10/14 clean (9/12 excl iana); losses govuk + iana-registry (5 consecutive stalls exhaust FIX-31 allowance of 4, ~114 s of the 120 s budget), debian-form replay 2 / debian-reuse / N3 (debian.org resets). One repeat rg-62 (debian x3) came out clean. 214 of 228 calls; stall rate 45% vs 31% in r5. `gate-results-r6.md`. Traps: r3 dry scan expires 2026-11-01T16:31:47Z (24 h); `gate-cli verify` can fail on debian.org resets, rerun it (no burn); recorder count includes stalls, so recorded rows + TRANSPORT_STALL rows = calls; hackernews rule-1 identity UNKNOWN is structural (r3/r4/r6).

r7 (2026-11-01, HEAD 251229701 + FIX-31..34 uncommitted, dist 04cff617 byte-identical, jar 56471553): smoke 4/5 (navigation-wording, 5 SOURCE_PLAN stalls), rg-20261101-71 evaluate exit 1 with 8/14 clean (7/12 excl iana); losses hackernews/pythondocs/mdn/github/iana-registry (5 consecutive stalls, each 79 s with 15 s cap) + govuk "Benefits" clarification. N1-N3 met, no site flakes. 205 of 214 calls, no repeat. Stall rate 44.6% (same as r6; prepaid credits and 15 s cap changed nothing). `gate-results-r7.md`. Traps: `pnpm exec/run` refuse in studio-runner (use node_modules/.bin/tsc, node scripts/check-pins.mjs); PG port is random per `up` (update q.sh); a smoke-run scan.json passes `validateDryRunScan` (saved a 104-call full dry run); `request_id` in studio_guided_model_attempts groups a request with its `-transient-N` retries and created/updated_at give stall durations; INFRA retry after a mid-flow stall death is cut by the watchdog at once (one flow clock across retries); rule 7 "4096 truncation" reason appears iff the recorder has non-200 rows (429/502).

**Why:** Vertex project epicagentai, location `global` (from studio-runner/evaluation/grounding/lib/vertex.mjs), ADC creds, ports 18400-18492 set, Node 24.20.0, JDK 21.

**How to apply (traps that cost time):**
- An `rg-` run's environment test needs one wire request already in that run's recorder dir ("model id is only declared"); send a 1-call probe to `.../models/gemini-3.8-flash:generateContent` via the recorder before the run. Failed environment tests burn the run id (create-once files), so use a fresh id each time.
- Recorder cap is `CHECKS_GATE_MAX_CALLS` per run dir; restart the recorder (same port) per run id.
- `driver.ts:377` failedStepIndex always null (psqlJson needs row_to_json) so N1 can never be "met" until fixed (FIX-23 proposed).
- debian.org resets connections intermittently (verify, replay, N3): site flake, repeat once.
- Commands over ~2 min get auto-backgrounded; poll with short sleeps. `pgrep -f` on a command line matches the polling shell itself.
