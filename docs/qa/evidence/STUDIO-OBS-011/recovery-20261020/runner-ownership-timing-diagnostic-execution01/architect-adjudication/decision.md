# Timing diagnostic adjudication

2026-10-20 · Astra/high · source/closed-metadata review only.

**Decision: diagnostic complete; no second probe and no fixture-only acceptance correction. Prepare a separately owned 009 correction for renewal scheduling lateness, with a deterministic controlled counterexample first. Keep the existing native `<=2000` assertion and its measurement point. This is a source-backed design direction, not an attribution of the original failure or a claim that this correction will make every timing run pass.**

Reviewed `native-outcome.json`, `closed-timing-intervals.json`, `closed-witness.json`, `terminal-assessment.json`, `cleanup-assessment.json`, the sealed `receipt.md` and manifest, the executed observation-only candidate, actual `ownership.ts:58–104,130–170`, `runtime.ts:619–625`, and the original fixture/unit controls cited in the preceding architectural review. No runtime, patch, private payload inspection or lifecycle operation occurred.

## What is established

The one instrumented case passed its original assertion and completed its later original refusal, cleanup, privacy and outcome path. Three other modes were filtered, not executed. Forty closed records contain all requested observable event kinds; there was no overflow/instrumentation failure. The exact diagnostic fixture was restored only in its disposable derivative; actual source, original private RT trees and dist remain bound and unchanged. These are valid observations of **this execution**.

The first ownership invalidation occurred within the observed bracket **1996.120583–1996.208250 ms** after the original `t0`. Runtime stop entered at **1996.254750**, and the original post-stop observation was **1996.353458**. Both the earlier ownership boundary and the existing conservative observation satisfy two seconds here. The incoming abort observation was **1994.590042**, after a claim start at **994.915500** with a 1,000 ms budget. About 1.76 ms separates the abort observation from the post-stop observation; this is a measured combined interval, not an exclusive subsystem attribution.

Exact timer registration/firing, internal flag assignment and total observer overhead remain unknown. The 0.168830 ms captured sink-body total cannot be subtracted from this or the historical result. The original failed run has no comparable internal bracket. Its **2000.639750 ms** observation and **297 PASS / 1 FAIL / 9 SKIP** full-tier result remain failed. The diagnostic supplies no historical-cause proof and no complete-fixture gate credit.

## Why not move the fixture oracle

The original observer is later than ownership invalidation, but that fact alone does not make it an invalid contract oracle. It follows the real runtime stop's synchronous authority invalidation **and value/preparation clearing**, before asynchronous browser close. The first ownership entry invalidation only blocks ownership lookup; at the diagnostic's subsequent `runtime-stop-enter`, the runtime's own stopped flag was still false. Crediting the first entry mutation instead would omit that distinction.

A future oracle specifically witnessing runtime invalidation could be legitimate after an explicit endpoint ruling and defining controls. It is **not justified as the repair for this failed gate**: this diagnostic passes at both endpoints, and cannot show that the original runtime authority was revoked on time. Do not use stop-entry, abort notification, an earlier bracket edge, rounded time or nominal due time as “authority stopped.” Retain both the strict assertion and `t0`; do not add an epsilon or subtract estimated overhead.

## Concrete correction to design and prove

There is an independently demonstrable scheduling-budget gap: secret renewals use fixed one-second cadence epochs (`nextRenewal`), but `requestClaim` grants a fresh full 1,000 ms when the scheduled callback starts late. The only other bound is the lease minus 100 ms; that margin does not protect the secret control epoch. A late callback can therefore extend the intended one-second request phase past its original endpoint. The successful diagnostic neither creates nor removes this source fact.

Adopt the following narrow semantic ruling for a 009 candidate:

1. For an existing secret renewal with scheduled start epoch **D**, its claim phase ends no later than **D + 1000 ms**. At actual claim start **N**, use the remaining portion of that phase, bounded by the existing maximum 1,000 ms and the existing lease-minus-margin limit. A timely claim still receives 1,000 ms; a late callback does not acquire a fresh second. Keep the existing one-second cadence progression and all nonsecret/initial-claim behavior.
2. If that cadence phase has already ended, fail closed without issuing a new request. Partial body, repeated context/assignment and late successful response never reset it. Check the same endpoint after the complete response/grant validation and before installing authority, so a delayed timer cannot let an already-expired reply win and revive the session.
3. Keep lease/session deadlines as additional limits. Preserve EXPIRED on the existing session-expiry tie and the genuine lease-margin-exhausted exception. Cadence exhaustion is not automatically `ClaimMarginExhausted`: do not accidentally suppress LEASE_LOST just because the lease happens to equal session expiry. Name limiting-cause/tie behavior in the candidate review.
4. Introduce no arbitrary reserve, faster cadence, longer cap, clock tolerance or new timer service. Derive remaining time from the existing scheduled epoch; the candidate must avoid re-extending it during conversion/rechecks. A 1,000 ms **maximum** is not a promise of a fresh 1,000 ms after a late start. Existing timely exact-cap tests remain unchanged.

This corrects a concrete deadline-reset behavior without claiming a universal callback deadline under process suspension or event-loop starvation. It may not eliminate the original 0.64 ms observed overrun; only the required affected validation can assess the candidate. If the strict native assertion still fails, stop and retain it—do not add another reserve or weaken the endpoint. No evidence now supports a different constant or a larger architectural redesign.

## Smallest meaningful proof and execution sequence

**Next action:** assign one developer to a separate, off-tree 009 candidate with independent architecture/security QA, using the ruling above. Product/QA should record its scope as enforcing the existing one-second cadence/request maximum and two-second control bound, not changing the AC. This requires no external acknowledgement or new user permission; it does not touch AE.

Before native execution, use the existing fake-clock ownership test infrastructure for one deterministic red/green scenario: delay the renewal callback relative to its original due epoch, and deliver an otherwise valid complete grant after that original claim-phase endpoint but within a fresh one-second-from-late-start budget. On the old source, demonstrate the late authority survival/installation; on the candidate, demonstrate stop/no installation/no later dispatch and no revival. The same timing and grant inputs must drive both. Failures must be the intended authority assertion, not setup/expiry/fence rejection. Keep a timely positive and the existing exact 1,000 ms cap/absolute cadence/slow-response/expiry/fence/no-revival controls. Include the already-expired callback and session-expiry limiting-cause boundary using existing unit scaffolding, without a new timing matrix or native sleep calibration.

After defining proof and independent source review, run the **four original native ownership modes once**, unchanged and without diagnostic observers. Only a complete pass permits the single current-composition full fixture successor. It is a changed-source validation, not an unchanged retry. Preserve original failure and diagnostic artifacts. A failing defining control, altered original assertion, setup failure or native bound failure stops dependent work; no automatic retry or threshold adjustment follows.

`ownership.ts` is protected outside RT7. Bind the 009 candidate separately and refresh the composed before/after input and emitted-output identities; the old RT AST-neutrality result remains historical proof of its own seven-file delta, not of changed ownership behavior. Current full-unit/fixture evidence must cover the accepted composition before RT copyback/build/image. QA must reconcile any added case identities rather than preserve now-stale count forecasts. Do not reopen unrelated clean controls or rerun the historical mutation matrix.

Keep Replay slots 4/5/6 held until this actual affected gate is accepted. No additional full Replay attempt or timebox reset is granted. Continue independent documentation/DevOps preparation in parallel; retain the separate local 011 exit and every external 009/010 gate.
