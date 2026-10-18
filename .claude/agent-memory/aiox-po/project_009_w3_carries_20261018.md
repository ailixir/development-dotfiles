---
name: 009-w3-carries-20261018
description: 2026-10-18 STUDIO-OBS-009 W3/pre-G9 placements — RUN-ORPHAN-01 + SEC-AUDIT-PREREADY-01 as 009 carried residues (not 011), R1 e closed, MODEL-SIZING T4 precondition, G9 C4 owed on U22, CLN-52..56
metadata:
  type: project
---

2026-10-18 (009 0.3.24, 011 0.2.14, inventory §6). Receipt: `docs/qa/evidence/STUDIO-OBS-009/execution-20261018/po-carry/receipt.md`.

- RUN-ORPHAN-01 and SEC-AUDIT-PREREADY-01 are recorded as **009 carried residues** in the section "PO notes — W3 carries and pre-G9 rulings". They are not Done conditions. They are not 011 rows, because they are runner behaviour changes and no runner-hardening story exists; the pointer is GA §4.G. If the @devops in-pod check finds survivors, RUN-ORPHAN-01 becomes a GA blocker.
- R1 e is closed on lane evidence (B `b/receipt.md:115`, B-W3 `b/w3/receipt.md:63`). It revives if @qa does not credit R1 a–d at G9.
- T4 has three preconditions: ED-01 (U2/U18), headroom R (U17), and MODEL-SIZING (@architect + @pm; B7 shows 13 proposals, 166 %).
- G9 C4 ran 575/581. All 6 failures are a missing runner image. Those tests and the D2 image smoke are owed on U22.
- CLN-54/55/56 (oracle/report/fixture-server) are **class C, not A**: `evaluation/cli.mjs:7-8` and EP's C04 test import them. A receipt's "dead except tests" claim must be re-grepped before it is copied.

**Why:** the lead asked for placements while G9 was in its hold window. Aria's ruling let @po choose between a 009 residue and GA §4.G.
**How to apply:** treat runner-behaviour carries as 009 residues by default (see [[studio-observed-wave-po-conventions]]). Verify append-only edits by reversing them mechanically and re-hashing. Related: [[009-w2-placements-20261018]].

**Update later on 2026-10-18 (009 0.3.25, 010 0.3.12, receipt `po-carry/receipt-2.md`):** MODEL-SIZING is "ruled + @pm-acknowledged (pending @architect adoption of the §9.1.5 trigger amendments)". The ruling is `execution-20261018/model-sizing/ruling-draft.md`, option A-ii, with 98,304 / 786,432 per session. It counts for the T4 start only after @dev lands §7 after G9. §9.1.3 scheduling (≥ 6 CSI-days) is @pm-owned and already in force. OBS-010 AC-4 now has **clarification e**: e1 the learn limit (p95 blank for T4), e2 SEC-AUDIT-PREREADY-01, e3 RUN-ORPHAN-01 (conditional), e4 R1 receipts (closed only on @qa's G9 credit). Proposal P-1 (an AC-5 runbook row for the learn limit) is unratified.
