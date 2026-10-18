# STUDIO-OBS-009 W3 carried-item placements: @po receipt

- **Agent:** Pax (@po). **Date:** 2026-10-18. **Mode:** YOLO, docs only, during the G9 hold window.
- **Scope kept.** Only story files under `docs/stories/STUDIO-OBSERVED/` were edited, plus this receipt. Nothing was written under `backend/`, `frontend/`, `studio-runner/`, `tools/`, `docs/specs/`, `.github/`, `helm-chart/`, the root package files or `AGENTS.md`. `.aiox-core/core/permissions/dispatch-governance.js` was not touched. No git commit, stash or push. No Docker, Gradle or test command was run. `README.md`, the prerequisite register and STUDIO-OBS-010 were not edited.
- **Story edits are append-only.** [V] Each edit was reversed mechanically (the inserted text removed), and the result re-hashed to the "before" value below. All three files matched.
- **Nothing was marked Done.** Status stays **Ready** in 009 and 011, and no checkbox changed.
- **Legend:** [V] verified by reading or running a read-only command; [I] inference; [R] relayed by the lead and not checked by @po.

## 1. Files edited

| File | Sections touched | sha256 before | sha256 after |
|---|---|---|---|
| `docs/stories/STUDIO-OBSERVED/STUDIO-OBS-009.story.md` (0.3.23 → 0.3.24) | AC-1 PID-1 d (dated note appended); AC-11 R1 e (dated note); AC-12 R10-rev2-2 c (dated note); Tasks T4 (dated note appended); new section "PO notes — W3 carries and pre-G9 rulings (2026-10-18)" items a–f, before "Dev Agent Record"; Change Log row 0.3.24 | `e6a15be136bde22cac354992a37b16d0e8372c5108df8eacc4a969ec8f7d127d` | `d845d6a436b1be8e1d1f9daa8ed6b95ad3d40451805fa3c0386aa0fdb528cd06` |
| `docs/stories/STUDIO-OBSERVED/STUDIO-OBS-011-cleanup-inventory.md` | new "§6 Addendum: rows added 2026-10-18 (STUDIO-OBS-009 lane EP finding F1)", rows CLN-52…CLN-56 | `ab2b4c9b3b85235bd3aa1857190829c29ffa8874f11d5ea0efad27a0ce549de2` | `3f0d3a53f113d5bb17855cb60e38d1081d2f1dbccd824e1cec0d56702e91221d` |
| `docs/stories/STUDIO-OBSERVED/STUDIO-OBS-011.story.md` (0.2.13 → 0.2.14) | "Inventory additions" (dated bullet for CLN-52…56); Change Log row 0.2.14 | `18014f338597c4ddfab0e0ec39582228b1813017775d82cafbf7f1b76917f50f` | `ef0eec7f9e28d94d37f38712acaacebcbc8f17f5877cdda018db2aca80dea262` |
| `docs/stories/STUDIO-OBSERVED/README.md` | not edited | `3810c7134dcba8afb6d04f46521cc511ee1b9e7a9686ece6badd0142f72a79a2` | unchanged |

## 2. Placements

| # | Item | Placed in | Owner | Basis | Closes when |
|---|---|---|---|---|---|
| 1 | **RUN-ORPHAN-01**: the replay child survives a runner SIGKILL until the step timeout | 009, a **carried residue** (new section item a), with a dated pointer at AC-1 PID-1 d. **Not** an 011 row [AUTO-DECISION] | @dev (runner) for the fix; @devops for the in-pod check | `w3/pre-g9-rulings.md:36-52` (ruling, conditions 1–3), `:54-67` (direction); `f/receipt.md:130` (F-A), `:115` (§9 "not claimed") | The runner change per ruling §1.4 lands with its three tests, **and** the @devops in-pod check records no survivors within 5 s. If the check is unrun, it is reported "unrun, owner @devops". If it finds survivors, it becomes a GA blocker (GA plan §4.G), not a 009 blocker. G9 credits the runner-kill leg as "zero repeats, settled STALE" only |
| 2 | **SEC-AUDIT-PREREADY-01**: a pre-Ready revocation audits `UNKNOWN_OUTCOME`, not `NOT_USED` (accepted) | 009, a **carried residue with a disclosure** (item b). Not an 011 row | @dev (runner), option A | `w3/pre-g9-rulings.md:97-111`; `b/w3/receipt.md` §8 finding 3 and deviation 4 | The runner sends `secretUse` `NOT_USED` on every `RunFailure` before `Execute3`, and `PreReadyRevocationJoinedIT` pins `NOT_USED`. At G9, @qa credits ADJ-1 on the observed `UNKNOWN_OUTCOME`. @qa's ADJ-1 security co-sign is still owed |
| 3 | Baseline `performStop-grace` SIGKILL at ReplayIT case 7 | 009 AC-12 R10-rev2-2, a dated note after c (exact record identity), plus item c | @qa (R10-rev2-2 stays open) | `s-w3/receipt.md:70`, `:80`, `:114` (finding 4) | Not an item to close. It names the baseline so that bullet c1 is not escalated. A record that differs in any field goes through c as written. @qa may override at G9 |
| 4 | **R1 e** (KL-015-R1 disclosure) | 009 AC-11 R1 e, a dated note: **closed on lane evidence**, plus item d | @qa (credit of R1 a–d) | a–c: `b/receipt.md:115` (`obs009-b-04`, 413/413; mutations `:101-103`). d: `b/w3/receipt.md:63` (`obs009-b-w3-04`, 15/15, D_F `4add1307…`). Rule: `w1.5/ruling-part2.md:88` | Closed now. **It revives** if @qa does not credit R1 a–d at G9. The OBS-010 AC-4 record cites the receipts instead of an open known limit (010 not edited) |
| 5 | EP compile-era leftovers | 011 cleanup inventory §6: CLN-52 `browser-oracle.test.mjs` (A), CLN-53 `example-manifest.json` (A), CLN-54 `oracle.mjs` + `oracle.test.mjs` (C), CLN-55 `report.mjs` + `report.d.mts` + `test/evaluation/report.test.ts` (C), CLN-56 `fixture-server.mjs` + `.d.mts` (C). Plus an 011 "Inventory additions" bullet | @dev, with @qa for the corpus | `ep/receipt.md:101` (F1); @po grep (§3) | At 011 T0/G1, after a re-grep and the C-row decisions. Nothing is deleted while 009 T4 may still use `evaluation/`, unless its owner confirms. Rows not done move to "Carried forward" |
| 6 | **MODEL-SIZING** | 009 Tasks T4, a dated note: three T4 preconditions (ED-01 U2/U18, budget R U17, MODEL-SIZING), plus item e | @architect + @pm | `ep/receipt.md:66-81` (B7: 13 proposals for a 10-step base learn; 53,248 = 166 % of the 32,000 output total; 54 of 70 sessions > 7); `ep/b7-proposals.json` | An @architect sizing ruling with @pm acknowledgement: either raise the session output total to ≥ 53,248 (plus retries and clarifications), or lower the per-call ceiling to ≤ 2,461. Until then T4 does not start |
| 7 | **G9 C4** (runner deployment tier): 575 passed, 6 failed | 009 item f, plus the pointer at PID-1 d | user (U22, R5) | `execution/obs009-g9-runner-deploy01-vitest.json` [V]: 581 total, 575 passed, 6 failed, all "image `put-checks-studio-runner:10.18a-local` does not exist locally"; `local-gate-20261018/status.txt` `C4-runner-deployment exit=1` [V]; register U22 `NOT_SATISFIED` [V] | The six named image-dependent tests are re-run against an image built from the current Dockerfile, and the D2 image smoke (U22's four steps) is run, both after U22 is authorized. Until then each is "unrun, owner user (U22)". Whether C4 counts at G9 is @qa's call |

## 3. Read-only checks @po ran

1. **G9 C4 failures.** `node` read the failures from `execution/obs009-g9-runner-deploy01-vitest.json`. The six failing tests are in `test/deployment/chart.test.ts` (5) and `test/deployment/sec2.test.ts` (1), and every message names the missing image. That "no image built from the current Dockerfile exists" is [R]. @po ran no Docker command.
2. **EP leftovers.** From `studio-runner/`: `grep -rnE "(from|import\(|require\()\s*['\"][^'\"]*(evaluation/|\./|\.\./)(oracle|report|fixture-server)(\.mjs|\.js)?['\"]|example-manifest\.json|browser-oracle" src test evaluation scripts package.json`. Hits:
   - `evaluation/cli.mjs:7-8` (oracle, report);
   - `report.mjs:1`, `oracle.test.mjs:4` and `browser-oracle.test.mjs:10` (oracle);
   - `test/evaluation/report.test.ts:9` (report);
   - `test/evaluation/corpusPages.test.ts:7` (fixture-server);
   - `README.md:45` (prose).

   F1's "dead except for being imported by tests" is therefore narrower than the code: the live CLI imports `oracle.mjs` and `report.mjs`. That is why CLN-54 and CLN-55 are class C.
3. **sha256 of the eight evaluation files** is recorded in inventory §6.

## 4. Source hashes (taken 2026-10-18)

| File (under `docs/qa/evidence/`) | sha256 |
|---|---|
| `STUDIO-OBS-009/execution-20261018/w3/pre-g9-rulings.md` | `d501f1abb865f1233026ef4811278551597ea3bd69ce3f83482ff51ad8a7c08b` |
| `STUDIO-OBS-009/execution-20261018/f/receipt.md` | `6c9d3c8306e90e717adcc879d446e1e2acbed43c5640d4735cb83cc91fecea38` |
| `STUDIO-OBS-009/execution-20261018/b/receipt.md` | `efc1d9b44d91e12abb362edd30f4a485358b294fe0a9c8321235a2d12b416c51` |
| `STUDIO-OBS-009/execution-20261018/b/w3/receipt.md` | `95526656447359aa1271c459cb9e4fcd3331657d8fbd08b7d157f76b33544525` |
| `STUDIO-OBS-009/execution-20261018/ep/receipt.md` | `d49aad3c40402620155b661a0accf599871351c39d8390458787a7680db8649e` |
| `STUDIO-OBS-009/execution-20261018/ep/b7-proposals.json` | `25130d2a3a1a300b47804de6ec8d4138b36864e78511db146a1de95c0c79c5fe` |
| `STUDIO-OBS-009/execution-20261018/ep/b7-measured-summary.json` | `2f4892d4cd85b6be1afd43eccd26717c13089ec37697dd7013fdf94038f17ce8` |
| `STUDIO-OBS-009/execution-20261018/s-w3/receipt.md` | `d0501baf7032dafd3b0e31273fb14975cd0d0d68ac21146c6b919ad8000a10e8` |
| `STUDIO-OBS-009/execution-20261018/w1.5/ruling-part2.md` | `f2529751ddc5448ce27bd58fbae389e91b906e4366b0cae5d2e3e6e54c0a623f` |
| `STUDIO-OBS-009/execution-20261018/execution/obs009-g9-runner-deploy01-vitest.json` | `b367fdb9de42f0569c0706a222808730e1dc42072e7cc2f3cb846fc4f97522a4` |
| `STUDIO-OBS-009/execution-20261018/execution/obs009-g9-runner-deploy01-results.json` | `24a62414e05ef03d20996b3a30331686ac56a4a25ec7a15128a793838d9fe144` |
| `STUDIO-OBS-009/execution-20261018/execution/obs009-g9-runner-deploy01.log` | `71dad0de1810ebf91d03ef4e3df2715e74efe6129dec44ac5ec3d0b2a3635a35` |
| `STUDIO-OBS-009/local-gate-20261018/status.txt` (G9 still running; a snapshot) | `095665cc60119d42eacecc5db85a9e16a8ba18a773a4fcd9a75b0083e07ca4b9` |
| `STUDIO-OBS-009/prep-20261016/prerequisite-register.json` (read only) | `25fe56fe52bacae6619bf8f53ba7a12960e581d6c7d09a04ecf701597e8e9125` |
| `STUDIO-OBSERVED-NEXT/execute-015-008/CLAUDE-RESUME-STATE.md` (read only) | `0ffb06c191c6777be716e0bf87c5ae79e59615646aeed225aa71ccdcf96f8912` |

## 5. Auto-decisions

- [AUTO-DECISION] Is RUN-ORPHAN-01 a 009 carry or an 011 row? → A 009 carried residue (reason: ruling condition 3 asks for "a 009 residue that points to the next runner-hardening work, or to the GA plan §4.G item if no runner story is open", and none is open. 011 is a behaviour-neutral sweep, while a parent-death exit is a runner behaviour change on the AC-11 j kill path).
- [AUTO-DECISION] SEC-AUDIT-PREREADY-01 is placed the same way, for the same reason.
- [AUTO-DECISION] Is R1 e closed or only "may close"? → Closed on lane evidence, revived if @qa does not credit R1 a–d at G9 (reason: e's condition, "until a–d are evidenced", is met by the credited B and B-W3 runs. The ruling ends the disclosure when d is evidenced. Credit itself remains @qa's).
- [AUTO-DECISION] Do the CLN-54/55/56 classes follow F1 ("dead except tests")? → No, they are class C (reason: @po's grep shows live importers in `evaluation/cli.mjs` and in EP's own C04 fidelity test).
- [AUTO-DECISION] Does MODEL-SIZING get a register id (next free U24)? → No (reason: its owners are internal (@architect + @pm), not external, and the register was out of this pass's write set).

## 6. Open items left for others

- @qa at G9: the C4 disposition of the six image tests; R1 a–d credit (e revives without it); R10-rev2-2 closure; ADJ-1 security co-sign.
- The user: U22 (Docker), U17 (headroom R).
- @architect + @pm: the MODEL-SIZING ruling.
- @devops: the in-pod RUN-ORPHAN-01 check with PID-1 d.
- STUDIO-OBS-010 is not edited. Its AC-4 record should carry the SEC-AUDIT-PREREADY-01 disclosure and RUN-ORPHAN-01, if no runner story is open by the release review, and should cite the R1 receipts.
