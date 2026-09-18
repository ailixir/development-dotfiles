---
name: fixture-schema-widening
description: When a story validates against a transcribed fixture copy of a contract, swapping in the real contract can silently widen a defensive boundary — diff the two, do not just trust the tests
metadata:
  type: project
---

When an Epic 10 story is developed in parallel against a hand-transcribed *fixture copy* of a
contract it does not own, replacing the fixture with the real frozen file can silently **loosen**
a security/defensive boundary, not just break assertions.

Concrete case (Wave 1, story 10.5 vs 10.1, 2026-09-11): the 10.5 fixture pinned the artifact
`version` with `"const": 1`; the frozen `docs/specs/studio/artifact.schema.json` uses
`{"type":"integer","minimum":1}` for forward compatibility. After the swap, `version: 2` became
schema-valid and was accepted by `GatewayResponseParser`, even though nothing downstream can
execute a V2 artifact. Only one test caught it.

**Why:** contract schemas are written to be forward-compatible for *all* consumers; a fixture
transcribed by a single consumer encodes that consumer's narrower expectation. The two diverge in
the permissive direction, which tests rarely notice.

**How to apply:** whenever a fixture copy of a schema is replaced by the canonical file, `git show`
the old fixture and diff it against the new one *keyword by keyword* (`const` vs `minimum`, `enum`
vs `type`, absent vs present `additionalProperties`). Every place the real schema is *more*
permissive is a candidate safety regression. Fix it in the consumer (pin what you can actually
execute), never by editing the frozen contract. Related: [[epic10-falsification-standard]],
[[backend-check-baseline]].
