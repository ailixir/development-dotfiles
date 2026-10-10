---
name: single-path-decision
description: 2026-10-09 user decision — observed/guided is the ONLY UI Studio path; compile-to-READY removed; migrations re-baselined V12–V18; incremental re-learn from first changed step is GA; ADR-SC-005 is canonical
metadata:
  type: project
---

On 2026-10-09 the user ruled that UI Studio ships one authoring path: observed/guided (OBS-001..006 stack). Compile-to-READY, artifact 1, `/v1/*` runner routes, guided v1/v2 contract generations and the compile UI are removed (STUDIO-OBS-012A/B). Canonical record: `docs/architecture/ADR-SC-005-single-path-observed-authoring.md`; `secret-login-design.md` is R3 (single path). Story order: 007 → 012A → {012B ∥ 013 ∥ 014} → 015 → 008 → 009 → 010 (011 parallel to 010).

Key sub-decisions: D-B Studio migrations V12–V33 + cutover re-authored as V12–V18 (pre-release exception to forward-only; core V1–V11 byte-identical; dev DBs recreated). D-C pilot gate = real-model guided benchmark ≥20 workflows × 3 reps, ≥90% no-clarification completion, zero false-pass/leak. D-D (corrected same day) = incremental re-learn in GA: change step k → replay 1..k-1 model-free, learn k..n, publish merged revision (INC-001 requirement carried over). Defaults: one runner process/image; guided routes under `/api/v1/studio`; one contract version v3 + build identity; readiness `UNLEARNED|LEARNING|READY|NEEDS_RELEARN`; password-only secret rule with no opt-out; multi-password pages unsupported at GA.

**Why:** compile benchmark NEEDS_WORK with structurally unsolved ambiguous locators; observed grounds targets in observed nodes and has model-free replay and runtime dataflow; shipping both doubled the surface. No shared env was ever deployed, which is what makes D-B and the no-compat stance safe.

**How to apply:** treat [[v1-plus-scope-decision]] and the "legacy path" halves of [[guided-login-secret-ref-decision]] as superseded; never propose a compile/legacy fallback or backward-compat layer; cite ADR-SC-005 for scope. Owed confirmations: user/Platform-SRE that nothing was deployed from an internal remote; @qa security delta check of secret-login R3; compliance approval of page-metadata export/retention (OBS-014/010).
