---
name: obs009-t0-rulings
description: 2026-10-17 OBS-009 T0 rulings + W0 refold — A2.6 single-replica guided (one worker id/origin), capacity/policy-hash keys withdrawn, A13 closed by D4, FM-01 not privacy, LR no tolerance
metadata:
  type: project
---

Issued 2026-10-17 at docs/qa/evidence/STUDIO-OBS-009/prep-20261016/t0-rulings/ruling.md; refold in lanes.json `w0Refold20261017` + implementation-plan "W0 refold 2026-10-17" (35 lanes, 0 overlaps per group).

- **A2.6 (new finding):** backend sends every guided bridge call to ONE `studio.guided-authoring.runner-origin` and assigns every session to ONE workerId (`worker-1` default); sessions live in one runner's memory; runner chart has 2 static replicas (D3). Rule: guided-enabled ⇒ exactly 1 replica (chart guard); owner-addressed scale-out → GA §4.G G-4. Root decision R1 open.
- Withdrawn from 10-16: guided capacity key (code fixes 1, transport.ts:70) and policy-hash key (context-bound, AR-2).
- A13 closed by 015 D4 (12 s budget, argv-marker teardown); remaining k = D5 + IT teardown + vitest comment.
- A7: observed keys already in runtime-versions.json; P2 only removes 5 artifact-1 keys; projectRuntime re-points.
- A8 option (ii) must mirror lockForAuthoringWrite incl. flush+refresh+re-check.
- A5: coordinator is a @Bean in GuidedTranslationConfiguration — @Profile goes on the @Bean method.
- FM-01 = effect-safety guard (no S&C ack). AE-01 rule text AE-1..7 needs U13 before code.
- LR: no expiry tolerance. REL-001 innermost CANCELLED counts unless a stop reached the runner first.
- Collector copies need two root edits: run-runner-build uses `npm run build`; run-runner only detects vitest in command[0].

**Why:** these change lane write sets and what root must decide before 009 W0.
**How to apply:** at 009 W0/W1.5 check root's R1 answer and U13 status first; D5 and C1 rulings are due at W1.5 after probes. Related [[obs009-011-prep-plan]], [[rel001-d4-launch-deadline-ruling]], [[w11-stop-reason-ruling]], [[ar-mounted-rules-ruling]].
