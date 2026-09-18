---
name: epic10-wave5-rulings
description: Epic 10 wave-5 PO rulings — DEF-01 ownership by capability not chronology, BUILD-1's unsatisfiable-clause principle, SIZE-1's sequencing diagnosis, and the fixtures-tier gate gap
metadata:
  type: project
---

Four rulings from Epic 10 wave-5 validation (2026-09-11) that set reusable precedent.

**A closed body cannot be conformed halfway — scope follows capability, not chronology.** DEF-01
(the API's dispatch body sends 8 keys against a 14-required `additionalProperties: false` schema)
was arguably 10.7's unfinished business; it stayed with 10.17. The deciding argument: with
`additionalProperties: false` the runner accepts the body or refuses it, so splitting the fields
across two stories yields two PRs of which neither can assert conformance — and the assertion *is*
the criterion. Secondary: a story that shipped a seam deliberately without its values (10.7's
AC-10b) did not leave "unfinished business"; it left a documented handoff.

**A clause no correct implementation can satisfy is a broken instrument, not a high bar.** BUILD-1:
"green from clean" became undischargeable once ED-02 opened, so it produced either a false tick or
a permanently unticked box — both destroy the checkbox's signal. Replaced epic-wide by
zero-outside-the-enumerated-set / zero-new / zero-in-the-story's-File-List, with the baseline
**measured, never transcribed** (a transcribed number stops being a measurement the moment the
branch moves). "The story's own packages" is bound to the File List because that is the artefact
@dev already maintains.

**Why:** @dev declined to tick rather than assert something false and @qa seconded it. The defect
was in the criterion, not the tick.

**How to apply:** when a gate clause stops discriminating, fix the criterion and tick on the
already-recorded evidence — do not weaken the measurement, and say in the Change Log that no
measurement changed.

**Repeated re-sizing is usually a sequencing defect, not an estimating one.** Six consecutive
M→L re-sizes all cited "a ruling landed after the estimate". Diagnosis: the manifest's sizes all
predate ADR-002 §§14–18, which has since assigned open items (O-n) to already-sized stories. The
fix proposed to @pm is a rule — an ADR amendment assigning an O-n must carry a manifest size
re-check in the same PR — not six re-estimates. Undrafted stories with no assigned open item were
flagged "size unverified" rather than re-estimated, because assigning a number to a story nobody
has drafted is inventing one.

**Check which test tier a load-bearing assertion actually runs in.** Two wave-5 stories placed
their strongest criteria in `studio-runner/test/fixtures-tier/`, which `npm test` does not run
(`npm run test:fixtures` does, with its own vitest config). A strong assertion that is never
executed is worse than a weak one, because nothing about a green run says so. Now a gate clause in
both stories.

Related: [[epic10-concurrency-proof]], [[adr002-amendment-authority]], [[epic10-wave4-rulings]]
