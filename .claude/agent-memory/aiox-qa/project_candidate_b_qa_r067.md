---
name: candidate-b-qa-r067
description: Round 067 QA gate for Candidate B provider-stall send cap, PASS 2026-10-23; evidence location, class delta, run-time facts
metadata:
  type: project
---

PASS, no required fixes. Output at `.aiox/sdc/STUDIO-OBSERVED-ORCH/recovery-20261020/real-stack71/parallel-execution-20261022/round-067/qa-candidate-b/` (QA.md, verdict.json). Patch shas 61fc496c / 6ef92711 / a4291a0f.

**Facts worth reusing:** class delta base vs patched = 21 .class (8 semantic, 13 line-number-table only) plus application.yml; compare with `javap -c -p` to separate them. Real `studio-runner/dist` is stale by mtime only: rebuilding in a scratch copy gives byte-identical .js, so `-x verifyRunnerDist` is safe, but a rebuilt scratch dist lets the check run. GuidedPlanningIntegrationTest takes about 6.6 min per run on this host and was green 3/3 patched and 3/3 base (the dev's RUNNER_CONTEXT_CLOSED_REFUSAL did not reproduce). Class names: GuidedTransientRetryIT and GuidedPlanningIntegrationTest live under guided/translation but declare package guided.session, so use FQCN `...guided.session.X` in --tests. Lint is red on base for 6 unrelated files; compare patched vs base sets.

**Why:** next case needs collector tuple `TRANSPORT_STALL` (devops) and call-seconds 60. Surviving mutants: cap <= otherLimit boundary, draft `!deadlineHit`.
