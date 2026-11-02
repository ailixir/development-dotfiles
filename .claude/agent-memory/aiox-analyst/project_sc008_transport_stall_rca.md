---
name: sc008-transport-stall-rca
description: 2026-11-01 read-only RCA of SC008 TRANSPORT_STALL (20 s send cap, Gemini global endpoint); what was ruled out and the A/B that would settle it
metadata:
  type: project
---

Stalls are not caused by the backend client, concurrency, request size/stage, or (as primary cause) the gate recorder. Leading hypothesis (INFERRED, ~60%): provider/serving-path capacity or routing latency on the `global` endpoint, as a distinct hang mode with time-varying rate (5% to 42% by hour).

**Why:** the gate fails on stall cascades (5 stalls x 20 s exhausts the 120 s step budget); the user wanted the root cause before spending more gate budget.

**How to apply:** do not retune caps/backoff or blame the recorder again without the A/B below.
- Verified: ledger requests never overlap (0 in flight at any start); the backend and recorder durations agree within 10-400 ms; the gate's 100-byte curl probe (fresh recorder, fresh connection) took 1.4, 2.0, 12.9, 14.9, 16.9, 39.1, 44.6, 79.6 s; 429s arrive after 4-20 s; cap-50 dry run still stalled 12/95 at 50 s; a local simulation shows the recorder DOES record late upstream replies, so "never recorded" means no upstream completion occurred while it was alive.
- Open: whether the stalled request ever reached Google (the recorder logs nothing on forward or client abort).
- A/B: ~80 tiny model calls, alternating direct vs through the recorder, with curl -w phase timings (DNS, connect, TLS, TTFB).
- The send cap went 50 to 20 in commit 9bbd8ecc9 (2026-10-31).
