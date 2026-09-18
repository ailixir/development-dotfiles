---
name: runbook-prose-is-pinned-by-a-runner-test
description: studio-runner/test/disclosure.test.ts pins literal phrases in docs/runbooks/studio-runner.md — a line re-wrap reddens the runner suite; the ED-02 owner pin was re-scoped 2026-09-17
metadata:
  type: project
---

`studio-runner/test/disclosure.test.ts` (story 10.18b AC-20) runs in the **default** tier and
asserts fourteen literal strings/regexes are present in `docs/runbooks/studio-runner.md` — three
bypass paths, the header path's ordering, the vault stub, `ED-02`'s owner, the pilot prohibition,
`put_session`, `setAllowCredentials(true)`, `SPK-02`, and more.

**Two consequences, both measured 2026-09-17:**

1. **A Markdown line re-wrap is enough to redden it.** Editing the header blockquote split
   `closing that flag alone would have closed` across a `>` continuation line and the runner suite
   went 983/1/29. The needle is a flat regex over the file; it does not normalise whitespace. After
   any runbook edit, run `npx vitest run test/disclosure.test.ts` from `studio-runner/` before
   anything else — it is ~2 s and it is the cheapest check in the repo.
2. **The `ED-02` owner pin was stale, and was re-scoped on 2026-09-17** (commit `b919cb211`,
   branch `fix/p1-quality`). It used to match `/TBD — not assigned in sources/u`, but `ED-02` has
   had an owner (PUT Core platform / Core BFF) since 2026-09-16, so after story 10.19's AC-8 audit
   the pin survived only on the corrections' own quotations of the retracted wording. It now pins
   `ED-02` + `/Core BFF/u` + `/no ticket ID exists yet/u` + `/owner is not a delivery/iu` — all
   live sentences. Correcting the runbook can no longer redden it; deleting the owner or the
   no-ticket half still does. **The runbook itself was never edited** (it is fold-blocked).

**Why:** a documentation guard keyed on literal prose cannot distinguish "the claim is gone" from
"the claim was corrected". It is the [[vacuous-guard-shapes]] family, one level out from code.

**Still open:** the same literal is a *live falsehood* in the two values files — see
[[disclosure-pin-values-files-stale]].

**How to apply:** treat the runbook as a tested artefact. Before claiming a runbook edit is
docs-only, run the runner default tier. Related: [[comment-claims-are-audited]].
