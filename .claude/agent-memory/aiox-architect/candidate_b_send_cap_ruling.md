---
name: candidate-b-send-cap-ruling
description: Round 067 (2026-10-23) Candidate B per-send stall cap ruling — TRANSPORT_STALL definite-transient, cap 50 not 30, lease = deadline + 2 s, live case back to call-seconds 60
metadata:
  type: project
---

Round 067 ruling (G/round-067/architect-candidate-b/RULING.md), user decision 2026-10-23 "Fix UX + Candidate B".

- SDK 1.71.0 maps per-request HttpOptions.timeout to OkHttp callTimeout ONLY (javap verified) → cap is total-send; non-streaming generateContent makes first-byte == done, so stall vs slow is policy-by-duration.
- TRANSPORT_STALL retried only if cap was binding at send time (capBound) AND no response headers (network-interceptor flag); mid-body/deadline timeouts stay TIMEOUT (053(b) unchanged).
- Default cap 50 (APPLIED tail 24-43 s in case436, 43 censored by 44 s lease); 30 rejected (cuts 15%).
- Deadline == lease fixed: lease_until = deadline + 2 s fixed margin → overrun = REJECTED/TIMEOUT (terminal), not SUPERSEDED/409 redo.
- No migration (V23 CHECK regex-only); harness collector PROVIDER_REJECTION_REASONS tuple needs TRANSPORT_STALL.
- Next live case call-seconds 60; 45 would make the cap inert → every stall terminal.

**Why:** B's gain is boundedness/diagnosability, not speed (50 s/stall vs 45 workaround).
**How to apply:** if a lower cap is proposed, demand GA APPLIED-duration telemetry first. Related: [[obs009_w15_part2_rulings]].
