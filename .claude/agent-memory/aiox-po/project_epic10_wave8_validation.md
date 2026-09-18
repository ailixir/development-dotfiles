---
name: epic10-wave8-validation
description: Epic 10 wave-8 PO validation rulings (10.30–10.32, 2026-09-16) — red-first ACs must split refusals from controls, partition contract ops by tag not path, check the chart's own env allowlist, shape citations by name
metadata:
  type: project
---

Validated 10.30 (GO 8), 10.31 (GO 8) and 10.32 (GO 7) on 2026-09-16. Each needed substantive fixes that looked fine on first reading.

**A "failing tests first" criterion must name two states.** Refusals must be red against today's code. Controls must be green: non-vacuity, positive halves, and order checks that already hold. "Any green test is a finding" cannot be satisfied, which is the BUILD-1 shape. A red control means a broken fixture, not a security finding.

**Mutations: check which guard each assertion actually rests on.** In 10.30, the "unknown/withheld → 403" cases rest on the visible read, not on `canWrite`. Once step 4 maps an empty locked read to 403, the forbidden `findCsiIdIncludingWithheld` read gives the same HTTP answer, so no HTTP test can catch it. The fix was a Mockito `verify(never())` unit test, with @qa told to read the code path as well.

**Partition OpenAPI operations by the document's own tags, never by path prefix.** `openapi.yaml` has runner operations (`/v1/*`, `/health`, `/ready`) tagged `internal` that do not start with `/internal/studio/`. A path-prefix rule would have been red against the correct document.

**The runner chart has its own closed key list.** `_helpers.tpl` `put-checks.studioRunner.acceptedEnvKeys` fails the render for any unlisted key. A new `STUDIO_RUNNER_*` key needs a `KEY_SPECS` row and that list. The inference tree rewrites that same single line.

**Dated snapshot tables in ADR-002 (§23.4, §28.5 "Status at <sha>") are never edited by stories.** Stories rewrite their own §13 row in place as LANDED and keep one row per amendment (10.18a precedent).

**Shape ordinals are unreliable.** 10.11's `#` column is a per-story row index, and the run log's own count is inconsistent. Rule: cite a shape by name and run-log section.

**Why:** a drafter's grep and line citations were mostly accurate, but three claims were false or stale: "one call site", "F-7 not landed" (it landed 3 minutes later), and a manifest quote that does not exist. Re-check branch heads at validation time.

**How to apply:** for any later Epic 10 validation, re-grep constructor call sites when a field becomes required. Open the helm helper when a runner env key is added. Diff sibling branches (`fix/carry-forward`) at validation time.

**ESC-3 is open with @architect.** A non-zero seek calibration makes early readings negative against `minimum: 0` and drifts the `browserStartedAt` pairing. It blocks applying any value, not 10.32's implementation.

Related: [[epic10-wave8-routing]], [[epic10-wave4-rulings]], [[epic10-wave5-rulings]], [[adr002-amendment-authority]]
