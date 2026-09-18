---
name: epic10-wave9-validation
description: Epic 10 story 10.19 validation (2026-09-17) — "unowned" claims were false twice; check ADR closure tables and ci/stages.md; F-3 reverted on the epic line; PROD-1 → 10.33; FOC-08 harness coupling
metadata:
  type: project
---

10.19 was validated GO 8/10 on 2026-09-17 (`fe045ab69` on `story/10.19`). 10.32 got a pre-implementation amendment (`8100853ed`).

**A drafter's "genuinely unowned" is a claim to disprove before ruling an owner.** Both of 10.19's "unowned" items were already owned.
- **O-11** was closed by 10.14's V17 migration. The only record is ADR-002 §23.4. The later §28.5 table simply omits it.
- **O-2a** has an owner in `studio-runner/ci/stages.md:301` (Platform/SRE with @architect).

**Why:** ADR-002 open-item tables are dated snapshots. An item absent from the latest table may be closed, not forgotten.

**How to apply:** grep every ADR open-item table (§9, §18.4, §23.4, §28.5) and `ci/stages.md` before assigning an owner.

**Mutation rows must point at a guard some AC creates.** 10.19's M4/M5/M7/M8 named "completeness checks" that nothing built. Fold them into a named script or reclassify them as @qa review items. Also check any claim that something "runs in CI": this repository has no CI definition (no `.github/workflows`).

**F-3 is open on `epic/EPIC-10`.** The fix was reverted at `7357082e3` because the inference program carries an equivalent uncommitted fix. 10.19 AC-19(c) must confirm the fix on whatever version lands. If the base file is still there, it comes back to @po.

**PROD-1 → story 10.33** (S, wave 8, blocks 10.19, before the pilot). **FOC-08** records the coupling between `setup.ts` and the store bootstrap: a lazy bootstrap, a dropped fetch, or `fetched` left false makes every jsdom file fail after 10 s. The next follow-up id is 10.34.

**Definition of done for staging-heavy stories:** such a story is not Done while any Blocked criterion remains, unless a follow-up story carries it (the 10.16/AC-19 precedent).

Related: [[epic10-wave8-validation]], [[epic10-wave8-routing]]
