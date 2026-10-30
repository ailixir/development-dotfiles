---
name: unify001-5-validation-20261024
description: STUDIO-UNIFY-001.5 (visual-pass fixes M1, M2, m1–m11) validated GO 9/10 Ready 2026-10-24; D1–D9 rulings; nav is mode-independent so m11 stands; DashboardPage deletion is a backlog follow-up
metadata:
  type: project
---

On 2026-10-24, @po validated STUDIO-UNIFY-001.5. It got GO 9/10 and moved to Ready. Scope is the user decision "Fix all Majors and Minors": p1–p8 are out, and B1 (guided-governance provisioning) is local config, not this story.

**Rulings:**
- D1–D9 all accepted.
- D7 clarified: the flask icon sits in the Type cell, so it moves beside the name below `sm`.
- D8: evidence is in `docs/qa/evidence/STUDIO-UNIFY-001/visual-pass-20261024/`. The re-check goes to `visual-recheck-001.5/`.

**Navigation finding (why m11 stands after the m10 fix):**
- Standalone and federated render the same registered `checks` navigation: Home, Checks, Reports.
- The deployment mode only decides whether that navigation shows below 1200 px.
- So the 1440 px screenshot taken on :5181 shows the real standalone sidebar too. Fixing m10 does not dissolve m11.
- AC-14 now states the tree once for both modes.

**Why:** the coordinator suspected the screenshot showed the federated navigation. Reading the code showed there is no separate standalone nav config.

**How to apply:**
- Backlog follow-up: delete the unrouted `DashboardPage` as a separate cleanup. Do not add it to .5.
- If .5 is re-validated, check that AC-14 still matches `navigationSetup.ts`.
- See [[unify001-validation-20261023]].
