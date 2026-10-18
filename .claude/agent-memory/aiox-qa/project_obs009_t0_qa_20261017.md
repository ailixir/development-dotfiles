---
name: obs009-t0-qa-20261017
description: QA T0 outputs for STUDIO-OBS-009 on 2026-10-17 (A18 class, D2 local-validation record spec, B-item designs) and the non-obvious traps found while writing them
metadata:
  type: project
---

Files: `docs/qa/evidence/STUDIO-OBS-009/prep-20261016/qa/t0-qa-20261017.{md,json}`. Specs only, nothing executed.

Non-obvious findings (verified 2026-10-17):
- A18 classed `REHEARSAL_ONLY_NON_CREDITING`: a self-started Testcontainers Vault is not "a dev Vault" (AC-4 + GO-3). Only the user can broaden. The adapter does create + metadata list, but the design says the policy "grants read", so ED-02 must be told.
- `capture-manifest.py` scope omits `helm-chart/` (21 tracked files). The D2 "one source digest" needs a helm supplement or the chart half of AC-1/2/4/5 is unbound.
- Approved-skips: 015's 25 minus the 18 AC-6 deferrals = 7 (ExternallyGated 3, ExecutionVideoExternallyGated 2, ExecutionReadiness 1, GuidedProviderEvaluation 1). It becomes 8 if the dev-Vault `VaultPolicyIT` mode is a JUnit skip.
- `guided-dataflow/server.ts` `mode` defaults to `'exact'` (a `<div>`, the RS-1 shape); the two incremental case files do not name a mode. The manifest must declare `mixedVisible` and reject an unset mode.
- Stale local `studio-runner/dist/run/guidedMain.js` exists today; after the fold it must be absent (stale-dist detector for the D2 record).
- Phase-1 arithmetic of the 2026-10-04 record: 21 expect-pass = 7 cases, so C01-C07 + C13 are class P, C08 F, C09-C12 N.

**Why:** these change what the D2 record, the corpus manifest and the skips file must contain.
**How to apply:** when issuing the D2 record or reviewing 009 T4 prep, re-check each against the tree first; reuse the spec rather than redoing it.
