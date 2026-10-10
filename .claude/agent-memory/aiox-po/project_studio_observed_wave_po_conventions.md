---
name: studio-observed-wave-po-conventions
description: STUDIO-OBSERVED wave (OBS-007…011, rescoped 2026-10-09) — how @po records validations, the Q2/Q4 conditional-GO ruling, and the GA-plan C-1/C-5/C-7 ownership tension
metadata:
  type: project
---

On 2026-10-09 @po validated OBS-008 (GO 8), OBS-009 (GO 8, conditional), OBS-010 (GO 8), OBS-011 (GO 9) for the rescoped secret-login wave; OBS-007 was validated by a parallel @po. Recording convention used: a `## PO Validation (YYYY-MM-DD)` section inserted before `## Dev Agent Record`; Change Log row exactly `Validated GO (n/10) — Status: Draft → Ready` with a **patch** version bump; report JSON at `.ai/STUDIO-OBS-0NN-po-validation-r2.json` for rescoped stories (r1 = pre-rescope intake) and `-po-validation.json` for new ones, following the OBS-007 report shape (verdict, tenPointChecklist, taskChecks 1–10, acceptanceCriteriaAssessment, sourceInventory with sha256).

**Why:** the wave's canonical sources are `secret-login-design.md` §10 (one story per item), the security review conditions (1–9 → 007, 10–11 → 009/010) and the OBS-011 cleanup inventory; the lead asked for conditions to be visible in the story, not only in `.ai/`.

**How to apply:** design §8 Q2 (observed schedules via `ConfiguredBackgroundAuthorization`) and Q4 (runner-terminated TLS with client certs) were ruled **non-blocking** — defaults stand, user may override before OBS-009 T2/T3, then @sm applies the pre-written AC delta and @po revalidates only those ACs. OBS-009 Done (hence 010/011 start) is gated on externals with owners outside the repo (ED-01 gateway owner TBD, ED-02 Vault, approved staging app) — treat absent prerequisites as "unrun, owner X", never a skip. Open tension to raise with @pm/user: GA plan §4.C C-1 (server `vaultSecrets` capability), C-5 UI message and C-7 picker are legacy-path P0/P1 items now carried by GA+1 story OBS-008. For OBS-011 AC-4, @po's advisory positions are recorded in the story (remove CLN-27/28 with runbook :131; keep CLN-10 until first prod deploy + 4 weeks; document CLN-12 in OpenAPI; lift protection on frontend inference files CLN-04/05/23 pending @architect). `wave-plan.json` on disk is pre-rescope and lacks OBS-011 — coordinator regenerates.
