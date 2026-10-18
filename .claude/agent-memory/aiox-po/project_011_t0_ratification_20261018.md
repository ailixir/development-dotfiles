---
name: 011-t0-ratification-20261018
description: 2026-10-18 STUDIO-OBS-011 T0 ratification (P-1..P-12, root RD-1..4), CLN-57..60 numbering, 009 DEPLOY-OBSERVED-01 residue, U22 authorized, 010 CFC-01 text pending @pm
metadata:
  type: project
---

011 0.2.15 "T0 ratification (PO) — 2026-10-18"; record `docs/qa/evidence/STUDIO-OBS-011/t0-prep-20261018/po-ratification.md`.
- Root decisions: RD-1 claim/checkCommand split closed (AC-4 c resolved by drift; 11-GT dropped); RD-2 hand reformat + AST-equality check, no Prettier; RD-3 RUN-ORPHAN-01/SEC-AUDIT-PREREADY-01 stay 009 (11-RO not opened); RD-4 `execute-011` collector copy.
- My 2026-10-10 drift note 1 (CLN-20 absent) was WRONG; `StudioService.updateAuthoring` exists. Lesson: re-grep with `-w` before calling a row resolved.
- New IDs CLN-57 (guided/account empty dir; its file is a tracked `D`), CLN-58 (frontend/src/.claude), CLN-59 (isBlank, record only), CLN-60 (C5 sampler pins). Aria's CLN-N3 = existing CLN-52..56.
- 009 0.3.26: DEPLOY-OBSERVED-01 (@po label for Aria ruling B: chart can't enable observed → 503/409; blocks AC-7/AC-12 deployed, G-1, 009 Done, pilot). @pm policy-content owner OPEN. U22 authorized 2026-10-18, run pending after G9 C8.
- 010 0.3.13: CFC-01 carve-out text written, PENDING @pm; 011 plan does not use it.

**Why:** these are the binding T0 positions for 011 lanes and the 009 deployed-stack path.
**How to apply:** when @pm acks A3 or names the policy owner, update 010/009 with dated notes; next 009 pass owes an AE-01 f pointer (R-08-3: remove `authoredLiteralTargetNotFound` from runtime table AND test registry). Related: [[009-w3-carries-20261018]], [[011-inbound-carried-items]].

**Update later 2026-10-18 (010 0.3.14, 009 0.3.27, receipt `po-carry/receipt-4.md`):** @pm `pm-ack.md` §2 accepted CFC-01 carve-out (C2 named test = blocking proof); P-1 ratified by @pm and @po, applied as 010 "AC-5 addition — first-learn limit row (P-1)" (p95 "pending T4", filled with AC-4 e1 in same pass); policy-content owner = **user to name** (rec: pilot app owner / S&C approves / @devops applies), AC-4 pilot prerequisite, register NOT edited (root's); 009 AE-01 f P-11 pointer added. `ruling-draft.md` now `03cbfd62…` (was `3867ba92…`; e1 text unchanged).
