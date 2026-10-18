---
name: b3abc-design01
description: OBS-015 B3a/B3b/B3c test design (2026-10-16) — offered-basis staged-attempt oracle at the stored writer, no production seam, hooks in incrementalJoined, route gaps left to B1
metadata:
  type: project
---

Design file: `docs/qa/evidence/STUDIO-OBS-015/execution-20261015/backend/b3abc-design01/{design.md,manifest.json}`.

- Attack model: an offered (mutated, resealed) basis is pushed through a rolled-back reserve → claim → validate → finish → commit at `GuidedPublicationRepository`, using the package-private constructor with a counting reader supplier. A reader delta of 0 means a pure refusal; a delta of 1 means the stored re-read refused (`PUBLICATION_CONFLICT`).
  - ReplayIT uses the real `ObservedValidationClient` for the verdict. AuthorityIT uses a controlled verdict. The grant is controlled in both.
- Full returned-row substitution was rejected as an attacker model (it is equivalent to owning the database). It is used only for 52's stored private history.
- B3a already shipped source01 (3 → 5 methods, 24 invocations). design01 adds 2 more singletons (24 → 26): exact offered pointers and foreign-session borrowing.
- Routes 9, 10, 13 and 14 (missing Authorization header, re-signed alg, natural lease expiry, assignmentSessionId) stay with B1. `wrong-assignment` has no assertion anywhere yet.
- R-P03: no backend joined case yet puts a need's producer at a retained ordinal inside the drift step. If the backend refuses it, that is a product finding, not a fixture change.

**Why:** these choices decide what B3 can lawfully claim, and they were not obvious from the plan.
**How to apply:** when reviewing a B3 source or run, check stage pins against the design. Any differing stage means that label is OPEN. Re-verify file hashes first.
