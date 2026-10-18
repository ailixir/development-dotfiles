# PO carry receipt 3 — 011 T0 ratification, DEPLOY-OBSERVED-01, U22, CFC-01 text (2026-10-18)

- **Agent:** Pax (@po). **Date:** 2026-10-18, about 15:20–15:45 EDT, while G9 C8 was still running (`local-gate-20261018/status.txt`: C1–C3, C5, C6 exit 0; C4 exit 1; C8 not yet recorded).
- **Mode:** YOLO, docs only. No test, build, Gradle, docker or install was run. No write under `backend/`, `frontend/`, `studio-runner/`, `tools/`, `docs/specs/`, `.github/`, `helm-chart/`, root package files or `AGENTS.md`. No git commit, stash or push. Story edits are append-only (new sections, dated italic notes, Change Log rows). No Status changed; nothing marked Done, passed or waived.
- **Read-only commands run** (results in the 011 ratification record): `grep -rnw updateAuthoring backend/src frontend/src`; `find backend/src -name 'IncrementalRelearnIT*' -o -name 'SecretLoginFixtureIT*'`; `ls -la` + `git ls-files -s` + `git status --short` on `guided/account/`; `find frontend/src/.claude` + `git ls-files frontend/src/.claude`; `git ls-files .ai | wc -l` + `git status --porcelain --untracked-files=all .ai`; `grep -rn OBSERVED_SCHEDULE_AUTH_REQUIRED backend/src`; `grep -n retireLegacy frontend/src/index.tsx frontend/src/main.tsx`; `sed -n` spot reads of `GuidedSessionService.java:944,1039-1042`, `GuidedTranslationService.java:1408,1428-1430`, `StudioService.java:389-399`, `b/receipt.md:10-14`.

## Files written

| File | sha256 before | sha256 after | Change |
|---|---|---|---|
| `docs/stories/STUDIO-OBSERVED/STUDIO-OBS-011.story.md` | `ef0eec7f9e28d94d37f38712acaacebcbc8f17f5877cdda018db2aca80dea262` | `413fcaa4d825f51906965baa841966c0fa0c79dbac55778eef5b1a5c47753931` | 0.2.15: new section "T0 ratification (PO) — 2026-10-18"; "Inventory additions" bullet CLN-57…60; dated notes at AC-3 and AC-4; Change Log row |
| `docs/qa/evidence/STUDIO-OBS-011/t0-prep-20261018/po-ratification.md` | (new) | `a729e4359c928f5e9402cf45670bcf5883e1987d8ebc0b651cc6056b7976623a` | PO ratification record |
| `docs/stories/STUDIO-OBSERVED/STUDIO-OBS-009.story.md` | `29bfbcf4c204c86f0fb1d616b73238042a0b860e04939c0c359974820e93544b` | `50212d97bd8d7a721f15f7213ceaa0aefc290cd421f5d6d956527cf21c59cac3` | 0.3.26: new section "PO notes — deployed-stack blocker and U22 authorization (2026-10-18)" (a DEPLOY-OBSERVED-01, b U22); pointer paragraph "AC-1 residue — DEPLOY-OBSERVED-01" after AC-1 note A2.6; dated notes at the AC-1 PID-1 d pointer and at 0.3.24 item f (heading + closing bullet): "authorized; run pending after G9 C8"; Change Log row |
| `docs/stories/STUDIO-OBSERVED/STUDIO-OBS-010.story.md` | `aeac3cc66bc537882e463b1a3110ea74808cd71eb307a6718d319ca90af8bbfc` | `5bd9bcb63c9f76153fa0d7516dec0f2e5156cdbff31407481e620b13c3b4c51e` | 0.3.13: new section "PO list text — CFC-01 `runner-origin` carve-out (2026-10-18) — PENDING @pm"; Change Log row |
| `docs/qa/evidence/STUDIO-OBS-009/execution-20261018/po-carry/receipt-3.md` | (new) | (this file; not self-hashed) | receipt |

## Files read, unchanged (sha256 at read and at the end)

| File | sha256 |
|---|---|
| `docs/qa/evidence/STUDIO-OBS-011/t0-prep-20261018/t0-proposal.md` | `dc9c1376e7908a5a338f281e7bddc76c8e3b3a2a7f9f1c7942e922eaf3495f94` |
| `docs/qa/evidence/STUDIO-OBS-011/t0-prep-20261018/lanes.json` | `a800e2e9033c64098f3452addf098a727fa0404f799e9900413f0beb95fba144` |
| `docs/qa/evidence/STUDIO-OBS-011/t0-prep-20261018/w-brief.md` | `57fe80a7617f5fb4b1bace4e05fddc05cf932b5dcf2268ae1db707f30f08c888` |
| `docs/stories/STUDIO-OBSERVED/STUDIO-OBS-011-cleanup-inventory.md` | `3f0d3a53f113d5bb17855cb60e38d1081d2f1dbccd824e1cec0d56702e91221d` |
| `docs/qa/evidence/STUDIO-OBS-010/live-surface-pre-g9-20261018/rulings/ruling.md` | `71832a0a42f2663673a77f7915d0ea917328f162d337902f17b6d2713f6635ce` |
| `docs/qa/evidence/STUDIO-OBS-010/live-surface-pre-g9-20261018/live-surface-list.pre-g9.md` | `ae4794b20bf0a4891c2869b080daab5118add6a90a0e2cc7bff0b3a6a1e4fc11` |
| `docs/qa/evidence/STUDIO-OBS-009/execution-20261018/w0/decisions.md` | `0f11e989ec04b43a881fe11dab414826a0c58338dac6910f3f2602e77ee12f48` |

## Decisions and auto-decisions

- 011: root decisions RD-1…RD-4 recorded; @po verdicts P-1…P-12 (see the ratification record). [AUTO-DECISION] New candidates numbered CLN-57…60 in the story, inventory not edited. [AUTO-DECISION] 008 MNT-003 gets no README backlog row now. [AUTO-DECISION] 009 AE-01 f pointer for R-08-3 owed in the next 009 pass, not added here.
- 009: [AUTO-DECISION] the ruling-B residue gets the @po label DEPLOY-OBSERVED-01 for tracking. [AUTO-DECISION] the prerequisite register's U22 entry is left to root, who records the build and runs.
- 010: CFC-01 text written and marked **pending @pm**, because no @pm acceptance of ruling A3 was found (finalize checklist OI-05 a unticked).

## Open for others

- @pm: accept or decline the A3 carve-out (010 CFC-01 text); name the `studioObserved.policies` content owner (DEPLOY-OBSERVED-01).
- @devops: §B5 chart change after G9; R-10 co-sign (011 CLN-10).
- @dev: catalog-entry producer (§B5 item 10).
- root: U22 build, C4 re-run and D2 image smoke after G9 C8, recorded with evidence; the `execute-011` collector copy and path (RD-4); 011 start-condition check.
- @qa: crediting of the C4 re-run; the 011 rulings that name @qa.
