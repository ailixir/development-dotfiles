---
name: run-auto-accept-ruling
description: ADR-002 §35 (2026-10-07) — Run auto-accept is contract (DEC-OQ3/C0-A3) but 554277fcb code is non-conformant interim; NoAutoConfirmTest is vacuous for it
metadata:
  type: project
---

Ruling (c) in ADR-002 §35 and C0 §7 "Run auto-accept ruling". Run as the confirming act is the user's decision (STUDIO-INC-001 decisions.md DEC-OQ3), so never recommend restoring a mandatory AWAITING_CONFIRMATION stop. The as-built `publishAcceptedCandidate` lacks four things: a server-captured trigger (v1 /compile ≡ RUN), a write-once confirmation_source RUN|MANUAL, the deadline recheck, and the insertCapturedRevision linkage. A fix story was owed but not yet drafted as of 2026-10-07. Refinement: the deadline guard in lockCurrentRequest exists but is vacuous because V1 writes no request row, so the fix must add a request row per V1 compile (see [[v19-hazard-v1-writer]]).

NoAutoConfirmTest skips CompileStateService.java, so inline-SQL auto-accept there passes the scan. Do not cite it as evidence of "no auto-confirm".

**Why:** @po flagged the C0-A3 contradiction while validating 10.47. The user had already decided auto-accept, but its audit was untruthful.

**How to apply:** for confirmation and audit questions, check whether the §35.5 fix has landed (grep confirmation_source). Execute authorization is open as O-22. See [[adr002-section-renumbering]] and [[contract-change-checklist]].
