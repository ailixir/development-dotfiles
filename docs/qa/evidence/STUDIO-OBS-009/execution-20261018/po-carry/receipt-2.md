# STUDIO-OBS-009 MODEL-SIZING acknowledgement placements: @po receipt 2

- **Agent:** Pax (@po). **Date:** 2026-10-18. **Mode:** YOLO, docs only, while G9 was running.
- **Follows** `receipt.md` in this folder (sha256 `41fee8e0de259ecb53edba350551ecbbd999ddd49deca89309017a627572f4a7`, not edited by this pass).
- **Scope kept.** Edited only `docs/stories/STUDIO-OBSERVED/STUDIO-OBS-009.story.md` and `STUDIO-OBS-010.story.md`, and wrote this receipt. Nothing was written under `backend/`, `frontend/`, `studio-runner/`, `tools/`, `docs/specs/`, `.github/`, `helm-chart/`, root package files or `AGENTS.md`. The ruling draft, the register, README and STUDIO-OBS-011 were not edited. No git commit, stash or push. No test, build, Docker or Gradle command was run.
- **Append-only check [V].** A script removed exactly the inserted text from each story and re-hashed the result. Both matched the "before" values below.
- **Nothing marked Done.** Status stays **Ready** in both stories. No checkbox, AC text or task text changed.
- **Legend:** [V] verified by reading or running a read-only command; [I] inference.

## 1. Files edited

| File | Sections touched | sha256 before | sha256 after |
|---|---|---|---|
| `docs/stories/STUDIO-OBSERVED/STUDIO-OBS-009.story.md` (0.3.24 → 0.3.25) | Tasks T4 (dated note appended to the T4 line); "Carried note — per-session model budget calibration" (dated pointer paragraph); "Carried review follow-ups — 2026-10-14" MODEL-SIZING bullet (dated tail); "Strict local-proof reconciliation" MODEL-SIZING bullet (dated tail); new section "PO notes — MODEL-SIZING ruling acknowledged (2026-10-18)" before "Dev Agent Record"; Change Log row 0.3.25 | `d845d6a436b1be8e1d1f9daa8ed6b95ad3d40451805fa3c0386aa0fdb528cd06` | `29bfbcf4c204c86f0fb1d616b73238042a0b860e04939c0c359974820e93544b` |
| `docs/stories/STUDIO-OBSERVED/STUDIO-OBS-010.story.md` (0.3.11 → 0.3.12) | AC-4 new "clarification e" (rows e1–e4 plus proposal P-1), after clarification d row h; T3 inbound-rows sub-item (dated tail); Change Log row 0.3.12 | `f2b1dd0c754120d9eca6cae341b24587fd92338c24f52937eb98461de373bb76` | `aeac3cc66bc537882e463b1a3110ea74808cd71eb307a6718d319ca90af8bbfc` |

## 2. What was recorded

| # | Item | Where | State recorded |
|---|---|---|---|
| 1 | T4 precondition (3) MODEL-SIZING | 009 T4 note; new 009 section | "ruled + @pm-acknowledged (pending @architect adoption of the §9.1 trigger amendments)". Met for the T4 start only after @dev applies ruling §7 after G9, bundled with the AE-01 / FM-01 rebuild |
| 2 | What T4 still needs | 009 T4 note; new 009 section | ED-01 gateway owner (TBD, user to name; U2) with U18; U17; U7; AE-01 / FM-01 runner fixes; the deployed stack |
| 3 | Pointers Morgan handed to @po (§9.1 hand-offs) | 009 carried note F-1; MODEL-SIZING bullets of 2026-10-14 | Pointer only. The "20–21 full-budget sessions" figure is annotated with the A-ii arithmetic (about 6.5 full-envelope sessions or 12 ten-step learns per CSI/day). The follow-up stays open until T4 measures |
| 4 | OBS-010 learn-limit row | 010 AC-4 clarification e1 | Morgan's §9.1.4 text verbatim; "___ steps at p95" left blank for T4; plus the §9.1.1 sizing basis and the §9.1.2 capacity statement |
| 5 | SEC-AUDIT-PREREADY-01 | 010 e2 | Disclosure line from 009 item b; closes on the runner `NOT_USED` fix and the pinned IT |
| 6 | RUN-ORPHAN-01 | 010 e3 | Conditional on no runner-hardening story being open at release review. Survivors in the in-pod check ⇒ GA blocker (GA §4.G); otherwise @pm / @architect classify it |
| 7 | R1 receipts | 010 e4 | Row d a cites `b/receipt.md:115`, `b/w3/receipt.md:63` and `w1.5/ruling-part2.md:88`. It reads closed only on @qa's G9 credit |

## 3. Auto-decisions and proposals

- [AUTO-DECISION] Should the learn limit also go into the AC-5 runbook (ruling §9.1.4 says "and in the pilot runbook text")? → Recorded as **proposal P-1**, not applied (reason: the lead scoped this pass to AC-4, and an AC-5 row would add runbook content that needs @pm / @po ratification).
- [AUTO-DECISION] Should the pointers go at F-1 and at the two MODEL-SIZING follow-ups? → Yes, as dated pointers only (reason: §9.1 hand-offs name them for @po, and the "20–21 sessions" figure would otherwise read as current).
- [AUTO-DECISION] Is the scheduling amendment (§9.1.3, ≥ 6 CSI-days) "pending @architect"? → No. Per ruling §6, @pm owns scheduling, so it is recorded as in force. Only the §9.1.5 trigger amendments are recorded as pending @architect adoption.
- [AUTO-DECISION] How should the RUN-ORPHAN-01 row read? → @po drafted the row text from 009 item a's facts and labelled it as drafted by @po. Whether it blocks release is left to @pm / @architect, except for the survivor case, which the 009 ruling already makes a GA blocker.

## 4. Source hashes (taken 2026-10-18)

| File (under `docs/qa/evidence/STUDIO-OBS-009/`) | sha256 |
|---|---|
| `execution-20261018/model-sizing/ruling-draft.md` | `3867ba928d67e2f799bc8a9eb479f4653ab386955a57a610f12b4a1209f3c78f` |
| `execution-20261018/po-carry/receipt.md` | `41fee8e0de259ecb53edba350551ecbbd999ddd49deca89309017a627572f4a7` |
| `execution-20261018/w3/pre-g9-rulings.md` | `d501f1abb865f1233026ef4811278551597ea3bd69ce3f83482ff51ad8a7c08b` |
| `execution-20261018/b/receipt.md` | `efc1d9b44d91e12abb362edd30f4a485358b294fe0a9c8321235a2d12b416c51` |
| `execution-20261018/b/w3/receipt.md` | `95526656447359aa1271c459cb9e4fcd3331657d8fbd08b7d157f76b33544525` |
| `execution-20261018/w1.5/ruling-part2.md` | `f2529751ddc5448ce27bd58fbae389e91b906e4366b0cae5d2e3e6e54c0a623f` |
| `prep-20261016/prerequisite-register.json` (read only) | `25fe56fe52bacae6619bf8f53ba7a12960e581d6c7d09a04ecf701597e8e9125` |

## 5. Open items left for others

- @architect: adopt (or not) the §9.1.5 a–d trigger amendments into the ruling body; write the consensus-plan §8.3 amendment text.
- @dev: apply ruling §7 after G9, bundled with AE-01 / FM-01, and run the named §7 item 12 checks.
- @qa: classify per-CSI daily refusals (§9.1.3); credit R1 a–d at G9.
- User: name or engage the ED-01 gateway owner (U2/U18); U17; U7.
- @pm / @po: ratify or decline proposal P-1 (AC-5 runbook row).
