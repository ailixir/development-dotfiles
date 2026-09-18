---
name: adr002-amendment-authority
description: ADR-002 §12 classes A/B/C govern who may edit docs/specs/studio/openapi.yaml; stories leave divergences red and escalate
metadata:
  type: project
---

`docs/architecture/ADR-002-internal-contract-surface.md` §12 rules contract-amendment
authority by **class of change**, not seniority:

- **Class A** — defects nothing could ever have satisfied (truncated description, `servers`
  base composing to a path nothing serves, `$ref` to a missing schema). Any story may fix
  directly, with a red-then-green contract test and a §13 log line.
- **Class B** — shape or meaning of a **runner-produced closed body** (add/remove/rename/
  retype a field, change a meaning, widen an enum, change `required`). Architect rules first
  in the ADR; the story proposes but never lands.
- **Class C** — routes, security schemes, tags, `servers`, **status-code semantics**, anything
  on the public surface. Architect, always.

Three rules bind all classes: **loosening is never a story's call**; a story that finds a
divergence it may not fix **leaves the contract test red and escalates**; every amendment is
recorded in §13.

**Why:** §6.2 closed the runner bodies so divergences must surface. 10.1's freeze was not
evidence of correctness — a wave gate found the document wrong about four routes. An
architect-only rule would block waves; a story-may-edit rule dissolves the mechanism.

**How to apply:** when validating any Epic 10 story that wants an `openapi.yaml` edit, classify
first. A status code added to a declared operation is **C**, even when no conforming
implementation exists (10.8's deleted-test `409`). A field on `RunnerReport` is **B** (10.12's
rejected `recordingOriginMs`). Expect drafts to *propose* — that is correct behaviour — and
rule on routing, not on the shape. See [[epic10-calibration-ruling]].
