---
name: epic10-falsification-standard
description: Epic 10 QA gates reject guards that were never falsified — break the property, watch the test go red, restore byte-identical
metadata:
  type: project
---

On Epic 10 (studio-runner), a test is not accepted as a guard until it has been **falsified**:
neutralise the production property it claims to protect, confirm the test goes red, then restore
the mutated file and confirm `git diff` is empty. QA re-runs these mutations independently and
files a MED finding for any guard that stays green — this is how MED-1/2/3 on story 10.6 were
raised (vacuous redaction assertion, self-deleting isolation coverage, route-string-only contract
check).

**Why:** the reviewer's position is that a guard which cannot fail is worse than no guard, because
it advertises coverage that does not exist. Several stories code against 10.6's contract, so a
weak check there propagates.

**How to apply:** when adding or fixing a test on this package, run the mutation yourself and
report the result alongside the fix. Coverage-set assertions must be pinned by sources that are
independent of the list under test, or shrinking the list shrinks the verification.

**Security findings carry two extra obligations.** (1) Reproduce the reviewer's attack on the
unfixed tree *before* changing anything, so the fix is aimed at a demonstrated pathway rather than
at a description of one; then re-run it after the fix, and also re-run the attacks that already
failed, reporting each — a fix that closes one hole while quietly opening another is the failure
mode. (2) Fix the **class**, not the name. Story 10.12's SEC-1 was `NODE_OPTIONS` on the child
environment allowlist; the accepted fix was a prefix rule over every code-loading namespace plus a
runtime guard over the constructed environment, because a denylist of the variables someone thought
of is exactly what had failed (the variable had been reviewed *onto* the allowlist). Expect the
reviewer to ask which keys survive and why.

**A surviving mutant is sometimes the test's fault, not the code's — use a no-op control to tell.**
When a mutation stays green, do not assume defence in depth. Replace the guarded behaviour with a
**complete no-op** and re-run: if the test is *still* green, the observation does not discriminate
and the test was never a guard. Story 10.13 found its process-tree kill this way — the fixtures
tier was green with the group signal swapped for a single-pid kill, green without `detached`, and
green with the kill removed entirely, because Chromium normally exits by itself when its parent's
pipe closes. The arrangement had to be changed (suspend the browser so it cannot exit on its own)
before the guard meant anything, and only then did the mutations go red. The same technique exposed
two weak assertions in the same story: a truncation test whose cut point fell *before* the value,
and a post-release test that hit an earlier guard and never reached the branch under test.

**The eighth shape: two guards, half a property each, and the branch that needs both carries no
canary.** Story 10.13's output relay cut text in two places — a per-line bound and an overflow
bound for a stream with no newline. One guard planted the secret across the cut but ended its line
with `\n`, so it exercised the path whose order was already right; the only test reaching the other
branch ran with no values to redact and asserted line lengths. Neither guard was vacuous on its
own, the intersection was, and **line coverage read 98.68 % over the defect**. QA found a real leak
there. When a module does the same dangerous thing in more than one place, enumerate the places and
ask of each one whether the *hostile input* actually reaches it — coverage cannot answer that, and
neither can a guard that only proves the property somewhere.

Two corollaries from the same story. **Size the fixture so the hazard actually occurs**: the
replacement guards passed under the mutation on the first attempt because 385 characters of padding
against a 400-character bound left a 12-character value entirely on the near side of the cut — the
straddle never happened. And **check that the mutation lands inside the measurement window**:
raising a test timeout to stop the framework pre-empting an assertion made a timing mutation
*survive*, because the work being timed had already finished before the clock started.

**The ninth shape: the non-vacuity guard checks a different thing than the guard.** A source-scan
guard is only as good as the string it greps for, so these are usually paired with a "the needle
really exists" assertion — and that pairing is where it goes wrong. Story 10.9's two auto-confirm
scans matched the **receiver's variable name** (`compileStateService.confirm(`, `states.confirm(`)
while their non-vacuity guards pinned only the **method's** spelling (`public UUID confirm(`). Both
guards passed, both looked rigorous, and a production `@Component` calling
`stateService.confirm(…, "system")` — in the very package one of them polices — left both green.
**When you write a scan, make the control exercise the exact predicate the scan uses**, against
several inputs that should match and at least one near-miss that should not; and prefer
`hasSize(1)` over `isEmpty()` where a legitimate hit exists, because then a dead detector fails
instead of reporting a clean codebase.

Its own corollary, learned while measuring it: **when reconstructing an old guard to prove it was
vacuous, revert the whole test and not just the predicate.** Reverting only the pattern while
leaving the new control in place made the reconstructed test go red — for the control catching the
crippled detector, not for the scan catching the defect. That would have overstated the old guard.
Two runs, and say which one you are reporting.

**Report surviving mutants rather than quietly dropping them.** Two of story 10.13's redaction
mutations survived legitimately — the log sink's redactor is caught by 10.6's own test, and the
coordinator's `failureMessage` redaction is genuinely redundant with the report client's. Both were
stated as surviving in the Dev Agent Record instead of being presented as proven.

See also [[backend-check-baseline]] for the separate question of pre-existing red gates.
