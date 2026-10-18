---
name: r9-r10-clock-controlwindow-ruling
description: 2026-10-13 OBS-012A R9 grant times on DB clock (DatabaseClock, trigger untouched, no tolerance); R10 control-window miss = fail-closed, producer-2 preload sync fsync fixed, R8-OBS-1 deferred to OBS-009
metadata:
  type: project
---

Ruling file: docs/qa/evidence/STUDIO-OBS-012A/root/architect-ruling-r9-r10.json.

**R9 — option B.** Replay-grant issuedAt/expiresAt are minted and judged on Postgres `clock_timestamp()`. The mechanism is a `DatabaseClock extends java.time.Clock`, constructed only inside the ObservedReplayConfiguration and ObservedReplayRuntimeConfiguration factories, which today hard-code `Clock.systemUTC()`.
- V15 `studio_observed_execution_guard` stays byte-identical. Zero tolerance is correct.
- Tolerance (option A) was rejected: the issuedAt-not-future clause is what caps the DB-measured life at 30 s, so any tolerance lengthens the window.
- Hand-minted test fixtures (GuidedSecretLoginMigrationTest, GuidedPublicationMigrationTest) must mint from the DB clock as well.

**R10.** A post-Ready control-window self-stop is correct fail-closed behaviour and is never tolerated.
- The GuidedPublicationReplayIT producer-2 preload (in the runner parent) runs synchronous readFileSync/fsyncSync inside the control-read path, before the runner's window check. Fix the instrumentation and add a precondition assertion plus loop-delay numbers.
- The lost ack (producer 3) is a symptom of a pre-Ready child end.
- R8-OBS-1 (post-Ready unrecorded self-stop should be RUN_ERROR) is deferred to OBS-009. The API result is already a NULL error_code. Changing it would lose the AUTHORIZATION_REVOKED mapping for a recorded revocation plus a lost read.

Measured: Docker VM clock ≈ host −0.3 ms with no sleep. That is enough to trip the zero tolerance when the fixture mints with the host clock.

**Rev2** (root/architect-ruling-r10-rev2.json), written after a tapped diagnostic run:
- My TIMEOUT guess for run 3 was wrong. It was INTERNAL_ERROR about 1.7 s after acceptance, the child exited itself, and 17 isolated runs did not reproduce it. It is open under observation, with a wrapper-only diagnostic and no committed module-rewrite hook. @qa holds it as a CONCERNS item.
- I1–I3 go ahead now. I1 is widened to the cut-spawner's revMode reads. I2 must be time-correlated, i.e. the stall during the missed read.
- load4-7 (1198 ms read at load 17–28 with burners) does not implicate product code.
- Credit is composite: run-4 `check` covers everything except ReplayIT, provided the digests outside that file are unchanged. ReplayIT needs two consecutive green full-class runs under hygiene.

**Why:** a single clock across 3–6 API replicas. The trigger, dispatch CAS and admission CAS already used the DB clock.

**How to apply:**
- For any new expiring authority, mint it on the DB clock when the DB enforces it.
- Watch three open follow-ups:
  - R9-OBS-1: acceptedAt/pending_deadline is still minted on the JVM clock.
  - R9-OBS-2: the runner pre-admission check uses the runner clock.
  - R10-OBS-1: launcher kill() still calls spawnSync ps.
- Related: [[r8-preready-selfstop-ruling]], [[obs012a-wave1b-rulings]].
