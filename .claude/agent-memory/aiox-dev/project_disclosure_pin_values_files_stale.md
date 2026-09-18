---
name: disclosure-pin-values-files-stale
description: values-uat.yaml and values-prod.yaml still assert ED-02 is unowned and that story 10.19 may not be drafted — both false since 2026-09-16, and nothing pins the correction
metadata:
  type: project
---

`helm-chart/put-checks/values-uat.yaml:44-47` and `values-prod.yaml:50-53` carry an operator-facing
comment block asserting, as **current fact**:

> `ED-02`'s owner reads "TBD — not assigned in sources". @po could not name one and said so; the
> escalation path is @pm → Checks-squad engineering management (BRD §8 launch-exit row) …
> Story 10.19 may not be drafted while that owner reads TBD.

Both halves are false. The user assigned `ED-02` to the **PUT Core platform (the Core BFF)** on
2026-09-16; story 10.19 was drafted and validated GO 8/10. The runbook was corrected by 10.19's
AC-8 audit; **these two files were not**. `EPIC-10-EXECUTION.yaml:1101` records the drafting gate
as `[LIFTED 2026-09-16]`.

**Why:** this is the second surface of `DISCLOSURE-PIN-1`. On the runbook the pinned phrase sat
inside a *retraction*, so the pin merely penalised accuracy; in the values files it is a live
assertion, so the pin was actively **holding a false sentence in place** — correcting the files
would have reddened `studio-runner/test/disclosure.test.ts`. That needle was scoped out on
2026-09-17 (commit `b919cb211`) rather than re-pointed, because the accurate statement does not yet
exist in either file. What still guards them: each must contain the string
`docs/runbooks/studio-runner.md`, i.e. route the reader to where ownership is stated and kept
current.

**How to apply:** when anyone touches the staging/prod values files, correct those two comment
blocks and then re-arm an owner claim in `disclosure.test.ts`'s values block. Until then, do not
quote those files as a source for `ED-02`'s ownership — they are stale.
Related: [[runbook-prose-is-pinned-by-a-runner-test]], [[med2-two-surfaces]].
