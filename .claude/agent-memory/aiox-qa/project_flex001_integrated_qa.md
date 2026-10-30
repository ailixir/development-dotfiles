---
name: flex001-integrated-qa
description: STUDIO-FLEX-001 (domain whitelist, raised limits, multi-session learning) integrated QA 2026-10-25; verdict, proofs of not-ours reds, post-dispatch ORIGIN_NOT_ALLOWED gap, how to prove "pre-existing" with the g4 pre-flex copy
metadata:
  type: project
---

STUDIO-FLEX-001 integrated QA 2026-10-25 (branch brunobuger/ui-studio, all uncommitted, no story files).

- Java/TS whitelist parity is real: a 60k-case differential (random env lists x URLs, `tools` style: compile `AllowedDomains.java` alone with javac after cutting the `Properties` record, feed `cases.tsv` to Node `dist/allowedDomains.js`) disagrees only on (a) IDNA2003 vs UTS46 (`straße`) and (b) invalid punycode labels (`xn--a`: Java passes them, Node refuses). Both fail closed on the runner side, vectors avoid them.
- Gap found, not fixed (needs a contract change): in learning the post-ACTION observation (`runtime.ts` dispatch -> `collectObservation()`) failing with `OriginNotAllowed` hits the `completed` catch, stops `CONTEXT_LOST` and the backend sees a generic lifecycle FAILED (no `ORIGIN_NOT_ALLOWED`; lifecycle reason enum has no origin value). Only the passive refresh path (`refreshObservation` -> POLICY_DENIED -> `observeRefusal` -> `failTranslation`) yields errorCode ORIGIN_NOT_ALLOWED. Keeping the runtime alive instead is unsafe (stale evidence could be acted on).
- Fixed: stale egress/approved-origin docs in `guided-data-flow.md`, StudioActionAudit Javadoc, and a FE terminal copy gap (`originLeft` in guidedNarratives + NAMED_FAILURES): terminal FAILED ORIGIN_NOT_ALLOWED used to fall to "failedUnnamed"; `originNotAllowed` copy is start-refusal only ("nothing was started").
- Runner fixtures tier 327/339 pass; the 3 reds (guided-dataflow former exact-rule, observed-authoring-snapshot Customer, observed-replay-privacy unresolved-name) are NOT flex and NOT pre-existing at GOV-final: they passed in `scratchpad/g4/work` (pre-flex GOV tree, `fixtures-final.log`). They come from the practice-site collector changes (plain visible-text nodes `containerText`, image-alt naming, ariaVisible-shared `unresolvedRole`). Proof: copy studio-runner to scratch, neutralise those three hunks, 90/90 green.
- Frontend: under Node 24.20 two CreateCheckPage.uiTest tests fail (AbortSignal jsdom/undici); default Node 23.10 passes. Use the default Node for `frontend/`, Node 24.20 only for studio-runner. `realStudioStartup.test.ts` red is at HEAD (dev.sh never had `STUDIO_RUNNER_OBJECT_STORE_PROVIDER=local`). Full vitest under load times out 3 tests that pass alone.
- Gradle: `GuidedBridgePlannedIT.currentSourceLock...`, `GuidedServiceTransportFaultIT [8]`, `GuidedStalledSendRetryIT.aStallShares...` fail under load (host load 10) and pass 71/71 alone. GuidedPublicationReplayIT test lane 40/40 and incremental lane 49/49 green on this tree (lane A's "32 of 132 red" did not reproduce).
- Not asked but true: UAT chart renders `STUDIO_RUNNER_GUIDED_CAPACITY=3` and `studio.guided-authoring.max-concurrent-sessions: 3`, grace 395, runtime 300000 (independent `helm template` with fake token overlay). With per-CSI cap 3 == capacity 3 a single-CSI user sees CSI_CONCURRENT_SESSIONS_EXHAUSTED before LEARNING_CAPACITY_EXHAUSTED.

See [[gotcha_isolated_builddir_cohort]] and [[verification_run_budgets]].
