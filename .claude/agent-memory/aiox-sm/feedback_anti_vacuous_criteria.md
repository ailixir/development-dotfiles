---
name: anti-vacuous-criteria
description: Epic 10 stories must write acceptance criteria that require mutation-falsification evidence per guard, and must forbid source-text scans as sole proof of runtime behaviour.
metadata:
  type: feedback
---

When drafting an Epic 10 story, write the anti-vacuous requirement as **criteria**, not as advice in
Implementation Notes: name the minimum set of falsifying mutations (one per guard), require the
observed red plus a byte-identical restore recorded in the Dev Agent Record, and require that a
guard found *not* falsifiable be recorded as not-a-guard rather than counted.

**Why:** this epic has found at least six guards that could not fail. The three worth citing because
they are on the branch and a reviewer can check them: story 10.6 gate MED-3 — a contract assertion
that checked *route strings appeared in the YAML*, not response bodies; story 10.8 gate QUAL-1 — a
log assertion that was a **source-text scan of `LOGGER.` lines**, where "a log site that built the
same string through a local variable named something else would pass the scan"; story 10.5 — canary
`doesNotContain` assertions over a canary **never placed into the request**, vacuously true. Each
needed a QA round to find, and each was green the whole time.

**How to apply:** for any criterion about what is *written* — bytes on a wire, a persisted row, a
published snapshot, a pod log — require the assertion on **captured bytes or the persisted row**. A
source scan may supplement, never replace. Also name, in the story, which of its own criteria are
the weakest; redaction canaries and cross-tree un-skips are the two that slide first. See
[[epic10-split-conventions]].

**The shape catalogue's own ordinal numbers do not agree with each other across stories — verify
before citing a number, quote the source instead of asserting ground truth.** Found drafting 10.32
(2026-09-16): `studio-runner/test/deployment/helm.ts`'s own docstring calls a `values-*.yaml` grep
"the first of the sixteen vacuous-guard shapes this epic has catalogued," but `10.11.story.md`'s own
sixteen-shape table lists a *different* shape as #1 ("a buffered response proving nothing about
streaming"). Two directly-quotable, mutually-consistent anchors DO exist and are safe to cite by
number: `EPIC-10-RUN-LOG.md:1038` ("VAC-11 — the eleventh shape: an assertion whose expected value is
imported from the module under test") and `:1059` ("PIN-1 — the twelfth shape: a pinned copy whose
provenance nothing checks"); `docs/qa/gates/10.16b-seek-measurement-frame-finder.yml:54` and
`EPIC-10-RUN-LOG.md:1644` agree independently on shape #21 ("a documented invariant only prose
protects"). **How to apply:** when citing a shape by number, quote the exact source line rather than
trusting a second source's ordinal for the same shape; when the numbers conflict, describe the shape
and cite where you found the description, and say plainly that the ordinals do not reconcile rather
than picking one.
