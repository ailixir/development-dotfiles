# PO carry receipt 4: @pm acknowledgement applied (CFC-01 accepted, P-1 ratified, policy owner, P-11 pointer), 2026-10-18

- **Agent:** Pax (@po). **Date:** 2026-10-18, while G9 was still running.
- **Mode:** YOLO, docs only. No test, build, Gradle, docker, node or install was run. No write under `backend/`, `frontend/`, `studio-runner/`, `tools/`, `docs/specs/`, `.github/`, `helm-chart/`, root package files or `AGENTS.md`. No git write. Story edits are append-only (dated notes, one struck phrase with its replacement, new section, new AC-5 addition, new task sub-item, Change Log rows). No Status changed; nothing marked Done, passed or waived.
- **Trigger:** @pm signed `docs/qa/evidence/STUDIO-OBS-010/live-surface-pre-g9-20261018/rulings/pm-ack.md` (sha256 `cd618df756e12adbbcbc93d8fe3a4446e2f6360fb35457f41e6a273ecccf5854`).
- **Commands run (read-only, plus the edits):** `shasum -a 256` on the files below; `grep`/`sed -n` reads of 009, 010, `ruling.md`, `finalize-checklist.md`, `ruling-draft.md`, `po-ratification.md`, `t0-proposal.md`; a Python check that the 010 AC-4 e1 text is a verbatim substring of the current `ruling-draft.md` (result: `True`).

## Files written

| File | sha256 before | sha256 after | Change |
|---|---|---|---|
| `docs/stories/STUDIO-OBSERVED/STUDIO-OBS-010.story.md` | `5bd9bcb63c9f76153fa0d7516dec0f2e5156cdbff31407481e620b13c3b4c51e` | `413dcac36eb4994143dd10cff1176da29d2018d4cce266441f3d85ccaf9d75f5` | 0.3.14, see below |
| `docs/stories/STUDIO-OBSERVED/STUDIO-OBS-009.story.md` | `50212d97bd8d7a721f15f7213ceaa0aefc290cd421f5d6d956527cf21c59cac3` | `e900e7155b8033a8de91fcba95408000cce9e691f963e9b468367dbe7170c955` | 0.3.27, see below |
| `docs/qa/evidence/STUDIO-OBS-009/execution-20261018/po-carry/receipt-4.md` | (new) | (this file; not self-hashed) | receipt |

**Append-only check.** 010: the edits were reversed mechanically (each insertion removed, the strike restored to "pending @pm;") and the result hashed to the before value `5bd9bcb6…`. 009: `diff` against a pre-edit copy shows 2 changed lines, both suffix appends (the AE-01 f line and the DEPLOY-OBSERVED-01 owner item 3), and 1 added Change Log row.

### STUDIO-OBS-010 0.3.14

1. **CFC-01 `runner-origin` carve-out: accepted** (`pm-ack.md` §2). In "PO list text — CFC-01 `runner-origin` carve-out (2026-10-18) — PENDING @pm" (heading left as written): a dated italic note after "pending @pm"; in the annotation, "~~pending @pm~~ *accepted by @pm 2026-10-18, `pm-ack.md` §2*"; a dated update at the end of the section: C1–C6 unchanged, **C2 is the blocking proof and needs a named test** (`base-url` set, guided off, no guided client bean and no guided dispatch; without it the merge counts as a D-1 removal plus behaviour change, 011 G8); C3–C6 recorded by name in 011 evidence; the finalizer copies the annotation with the accepted wording. [I] `pm-ack.md` lists 010 at `aeac3cc6…` (0.3.12), before the 0.3.13 text existed; @pm accepted ruling A3's C1–C6 "unchanged", which that text restates, so @po reads the acceptance as covering it. The ruling's C1–C6 govern if wording differs.
2. **P-1: RATIFIED by @po** (after @pm, `pm-ack.md` §4). Applied as "AC-5 addition — first-learn limit row (P-1)" after the clock-sync addition, with the AC-4 e1 text verbatim and the p95 blank read "pending T4" until filled from the STUDIO-OBS-009 T4 report, labelled "derived from T4". @pm conditions 1–4 copied. T2 sub-item added. Dated note on the P-1 proposal line.
3. **Policy-content owner** (`pm-ack.md` §3): user to name; recommended split recorded (pilot application owner writes, Security & Compliance approves, @devops applies, @pm records); an AC-4 pilot prerequisite. New section "PO notes — @pm acknowledgement of the pre-G9 rulings (2026-10-18)" items a–c; dated note on the T3 inbound-rows sub-item.

### STUDIO-OBS-009 0.3.27

1. **AE-01 f pointer for P-11** (owed since receipt 3 / 011 0.2.15): dated note at the end of AC-7 AUTHORED-ECHO-01 f. When f lands it removes `authoredLiteralTargetNotFound` from both the runtime table and the 011 C-OBS008-3 test-only registry.
2. **DEPLOY-OBSERVED-01 owner item 3:** dated note recording @pm's "user to name", the recommended split, and that it is an AC-4 prerequisite for the 010 pilot. Still open, owner the user.

## Files read, unchanged (sha256 at read)

| File | sha256 |
|---|---|
| `docs/qa/evidence/STUDIO-OBS-010/live-surface-pre-g9-20261018/rulings/pm-ack.md` | `cd618df756e12adbbcbc93d8fe3a4446e2f6360fb35457f41e6a273ecccf5854` |
| `docs/qa/evidence/STUDIO-OBS-010/live-surface-pre-g9-20261018/rulings/ruling.md` | `71832a0a42f2663673a77f7915d0ea917328f162d337902f17b6d2713f6635ce` |
| `docs/qa/evidence/STUDIO-OBS-010/live-surface-pre-g9-20261018/finalize-checklist.md` | `bcc54bccd989dc8f264f59bc8a3ac2c7b74915da32c9e9f998906ce1764285f4` |
| `docs/qa/evidence/STUDIO-OBS-009/execution-20261018/model-sizing/ruling-draft.md` | `03cbfd6261663d51d4c2e7611d4749933e641ee68b63fda5a121f61c809eeaf9` |
| `docs/qa/evidence/STUDIO-OBS-011/t0-prep-20261018/po-ratification.md` | `a729e4359c928f5e9402cf45670bcf5883e1987d8ebc0b651cc6056b7976623a` |
| `docs/qa/evidence/STUDIO-OBS-011/t0-prep-20261018/t0-proposal.md` | `dc9c1376e7908a5a338f281e7bddc76c8e3b3a2a7f9f1c7942e922eaf3495f94` |
| `docs/stories/STUDIO-OBSERVED/STUDIO-OBS-011.story.md` | `413fcaa4d825f51906965baa841966c0fa0c79dbac55778eef5b1a5c47753931` |

**Observation.** `ruling-draft.md` now hashes `03cbfd62…`; 010 0.3.12 and 009 0.3.25 cite `3867ba92…`. The file changed after those citations (cause not checked; possibly @architect's §9.1.5 adoption). The e1 disclosure text is unchanged in it (checked).

## Decisions and auto-decisions

- P-1 ratified (reason: §9.1.4 asks for the runbook text too; one disclosure row, AC-5 meaning unchanged, same form as the 2026-10-13 clock-sync row).
- [AUTO-DECISION] Rename the CFC-01 section heading? → No; strike the phrase in the annotation and add a dated update (reason: append-only).
- [AUTO-DECISION] Add the policy-content owner to `prep-20261016/prerequisite-register.json` next to U13/U14 as @pm suggests? → No (reason: the register is root's to update with evidence, as for U22; not in the lead's list). Flagged for root.
- [AUTO-DECISION] Run the attached synapse-diagnostics and checklist-runner skill texts? → No (reason: unrelated to the four items; the dispatch forbids runs).

## Open for others

- **User:** name the per-environment `studioObserved.policies` content owner (UAT first).
- **root:** register entry for the policy owner; tick finalize checklist OI-05 a when finalizing the dated list, copying the accepted CFC-01 annotation.
- **@dev / @qa (011):** the C2 named test if the carve-out is ever used.
- **T4 report:** fill the p95 value in AC-4 e1 and the AC-5 P-1 row in the same pass.
