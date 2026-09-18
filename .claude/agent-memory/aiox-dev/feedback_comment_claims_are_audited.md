---
name: comment-claims-are-audited
description: On Epic 10, a JSDoc that overstates a fail-open/tolerance property is treated as a defect and must be corrected before merge — the comment is audited exactly like a guard
metadata:
  type: feedback
---

A comment that claims a safety property the code does not have is a gate finding, not a nit. @qa's
phrasing on the 10.32 gate: "a comment that overstates a fail-open property is the documentation twin
of a vacuous test." @po's standard remedy is to split it — **correct the comment before merge**
(comment-only, cheap, no tier re-run) and **route the behaviour change as a follow-up** with its own
red-first proof, because changing a parser's default-deny posture is a protocol decision.

**Why:** the epic's whole posture is that a claim is worthless until falsified (see
[[epic10-falsification-standard]] and [[vacuous-guard-shapes]]). A doc comment asserting "optional so
a parent never refuses a start over it" is an unfalsified claim sitting next to code that does the
opposite; leaving it costs a future reader the same way a green-but-vacuous test does.

**How to apply:** when you write or touch a comment asserting tolerance ("optional", "ignored",
"never fails the caller", "best effort"), check the code path for the *malformed* case, not just the
*absent* case — default-deny parsers commonly reject the whole message over one bad optional field.
When asked to fix such a comment, verify the claim against the code first and STOP if the reviewers'
description is itself wrong; then say what the code does and point at the follow-up rather than
implying today's behaviour is intended-safe.
