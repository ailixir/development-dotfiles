# STUDIO-OBS-010 T2: finalize record for the dated Live surface list (2026-10-18, G9b)

This record shows how each step of `../live-surface-pre-g9-20261018/finalize-checklist.md` (sha256 `bcc54bcc…`) and each @pm condition P1–P6 (`../live-surface-pre-g9-20261018/rulings/pm-ack.md` §5, sha256 `cd618df7…`) is met, partly met or still open.

- **Executor:** Alex (@analyst), 2026-10-18, about 18:00–18:20 EDT. Mode YOLO.
- **Commands used:** light, read-only commands only: `ls`, `grep`, `sed`, `cat`, `shasum`, `date`, and `python3 -I` for hashing, JSON and a line-tracking YAML leaf reader (scratchpad).
- **Not run:** no test, build, docker, helm or node. A G9b backend run was in progress.
- **Writes:** this folder only. No story or runbook edit. No git write.
- **Second pass (Alex, 2026-10-18, after 18:22 EDT):** filled the @po line, marked P4 and P5 met, and moved 010 Status Ready → InProgress (§F). Writes: this file, `live-surface-list.md`, `STUDIO-OBS-010.story.md`. `live-surface-list.json` untouched (sha256 re-checked equal). No test, build or git write.
- **Legend:** **[V]** = verified today. **[I]** = inference, with its basis.

## Identity

| Item | Value |
|---|---|
| **List (machine, of record)** | `live-surface-list.json`, **sha256 `e5c58fa57f389879b2843815b5b389d0efa99921bc142155d6b18b970d7c2c57`** |
| List (readable twin) | `live-surface-list.md`. Its hash changes when the sign-off lines below are filled, so cite the JSON hash |
| Dated | **2026-10-18, at the G9b digest** |
| G9b capture-before | `docs/qa/evidence/STUDIO-OBS-009/local-gate-20261018b/capture-before.json`, sha256 `e335ea72…`. Source digest `fd793c9561bfa86d3046abd9791c6da231546f309e7e920a569792deb5afcb67` (1808 files). Dist digest `698a936537f3be1de45436c4459390fee5628b31e6790e1aa2b183cfaf814210` (238 files) |
| G9b helm-before | `local-gate-20261018b/helm-before.txt`, sha256 `4607090747e4fef31713ff90db5545eb243bdcff67c3b9acfd5fff2e8e01ada8` (22 files) |
| Tree at finalize | Re-hashed at 18:07 EDT and again at the final write (~18:16 EDT): 1808/1808 source files, 238/238 dist files and 22/22 helm files equal the G9b capture [V] |
| Counts | **729 ids; 671 protected.** Status: live 608, dark 78, removed 16 (kept), absent 1, holds 7, to-write 19. ΔG9b vs pre-G9: SAME 513, MOVED 187, CHANGED 7, STATUS 5, NEW 17 |

## Sign-off lines (filled later)

@qa D2 local-validation record trigger: **MET** (2026-10-18, under the user's C8 waiver in `execution-20261018/w0/decisions.md`), bound to source `061fc41feb02ac4cf12fd5f696257682994e11671b8def3cf31bd1f5c9ce1617`, dist `698a9365…`, helm `46070907…`. Record `docs/qa/evidence/STUDIO-OBS-009/local-gate-20261018/qa-local-validation-record.md` sha256 `bca21f5393d4c80df49842f805ddd3b3928fff559b09919720b349962f65633a` (json `27833e9b6557fdccd6bf395fb91abcb5691621d0ae3a8f7fe882ab23b7bc136f`), isVerdict:false. Filled by root. Drift from the G9b capture this list was measured at: exactly 2 backend test files (`GuidedPlanningIntegrationTest`, `ObservedPublicationFixture`). Test tooling is excluded by ruling A5, so no list entry moves. P1 MET; OI-23 closed.

@architect cross-check (Aria; the §10 note must name the JSON sha256 above): **CROSS-CHECKED-WITH-NOTES**, 2026-10-18, Aria (@architect), list sha256 `e5c58fa57f389879b2843815b5b389d0efa99921bc142155d6b18b970d7c2c57` (recomputed, equal). No required change to list content. See §E.

@pm acceptance (Morgan; "@pm acceptance per `live-surface-pre-g9-20261018/rulings/pm-ack.md` §5, list sha256 `<…>`"): **ACCEPTED-WITH-NOTES**, Morgan (@pm), 2026-10-18, per `live-surface-pre-g9-20261018/rulings/pm-ack.md` §5 (`cd618df7…`), list `live-surface-list.json` sha256 `e5c58fa57f389879b2843815b5b389d0efa99921bc142155d6b18b970d7c2c57` (recomputed with `shasum -a 256`, equal). Conditions met: **P1** (@qa record `bca21f53…`/json `27833e9b…`: `trigger: MET`, `isVerdict: false`, under the user's C8 waiver, bound to source `061fc41f…`); **P2** (G9b capture-after equals capture-before in files, source and dist digests, helm-before = helm-after; drift to the bound digest is exactly 2 backend test files, current hashes `9c68ac5b…`/`9264ae0e…` equal the bound ones; test tooling is out by ruling A5); **P3** (A1–A6 applied per @architect CROSS-CHECKED-WITH-NOTES; CFC-01 annotation still a verbatim substring of the current 010 story); **P4** (exactly 16 entries `status: removed`, = RKG-00..13, RKO-03, RKO-04, confirmed by @po `0b95414d…`; 729 ids, 671 protected); **P5** (Aria's line names this sha); **P6** (009 `e900e715…` and 011 `413fcaa4…` equal today; 010 moved `413dcac3…` → `5847ece2…` only by append-only change-log rows 0.3.15 (@po note) and 0.3.16 (Status), which state no AC text changed; RBR-19 (P-1) included). Notes: (1) the list was measured at `fd793c95…` and the trigger is bound to `061fc41f…`; this acceptance stands on @qa's reading that the waiver covers that one-step successor, and it lapses if the user says the waiver stops at `fd793c95…`. (2) This is a start-path acceptance, not a quality claim: the full backend regression and JaCoCo gate are owed at the 011 T0 fresh baseline before any 011 lane claims credit, and residues R1–R9 stay owed. (3) The JSON's `g9Record` and `storyStatusChange` fields are stale (G9 NOT_MET record, "010 stays Ready"); §0 and finalize §F supersede them; fix at the 009-Done re-date with AX-5..AX-8. (4) Not covered: the second re-date after 009 Done (separate @pm acceptance), the runbook write (OI-25), the per-environment policy owner (user-owed). (5) Not re-done by me: the full 1808-file source capture; only the two drifted files were re-hashed. No test, build or git.

@po confirmation that RKG-00..13, RKO-03, RKO-04 leave the list: **CONFIRMED, all 16, Pax (@po) 2026-10-18**, `po-removal-confirmation.md`, against list sha256 `e5c58fa57f389879b2843815b5b389d0efa99921bc142155d6b18b970d7c2c57`. (Record sha256 `0b95414dd5c8dc3c2bccee5e998fa222c8978f5682cce3c09948da4f214bb1ff`; line copied verbatim; added by Alex 2026-10-18.)

---

## A. Finalize checklist, step by step

| Step | State | How it is met, or why not |
|---|---|---|
| **0** Done pre-G9 | done (pre-G9) | Pre-G9 draft `d0d34e18…`, 712 entries |
| **1** Gate: trigger met? | **NOT MET; line left blank** | The G9 record `local-gate-20261018/qa-local-validation-record.md` (`e13bfbbf…`) says `trigger: NOT_MET (pending G9b)`, `isVerdict: false`. No G9b record exists. G9b `status.txt` (`e553ac3d…`) shows R0 and C1–C6 exit 0, **C4-runner-deployment exit 0**, and "C8-full ABORTED by root on user decision (targeted run instead)". The aborted C8 full run's collector log ends `exit 1`, 2 of 2 counted, `taskCollectionComplete: false`. C8T started at 18:05 (lock acquired, capture `c8t-before` = the same digest) and had no result at writing. Per the dispatch, the list is dated now at the G9b digest, and root fills the trigger line when G9b is ruled. The checklist's own "stop if NOT_MET" is superseded by the lead's instruction for today; this is recorded, not hidden |
| **2** Freeze held? | **done for drift since G9; G9b capture-after still owed** | G9 capture-before compared with G9b capture-before **file by file**: 25 source files changed or added and 6 helm files changed. That set equals the post-G9 receipt `files.txt`. The current tree equals G9b capture-before (see Identity). G9b `capture-after.json` does not exist yet, so freeze over the whole G9b run is unproven (OI-29). The G9 run itself had a clean freeze (G9 record §2) |
| **3** Re-measure | **done** | Every entry anchored in one of the 31 changed files was re-read: 110 CFB, 168 CHV, 32 CHE (uat), CON-25/33, CFC-02..04, CFD-03/07, CFK-06, RKO-01, CHT-01/07/08/09, CHN-01..03/05..09, P09-04/09/10/12. The YAML reader was self-tested first: it reproduced the value and line of every pre-G9 entry in the unchanged YAML files. Entries in byte-identical files were carried by hash equality. The 3 descriptive anchors (P09-11, P09-13, NEG-04) were re-checked by grep/ls. New surfaces were searched in the changed files (`studioObserved.*`, closed list, templates, Dockerfile) |
| **4** Re-date | **done** | `status: DATED_G9B_20261018`, `draft: false`, `preG9: false`. The pre-G9 `measuredAt` is kept, and `confirmedAtG9b` is added. `g9Record` records the G9 record (path, sha, trigger NOT_MET, bound digest). New folder `live-surface-20261018/`, as the dispatch named it (the checklist suggested `live-surface-g9-<date>`) |
| **5** Re-verify per class | **done, with local evidence pending** | *local:* each entry's `liveEvidence.local` names the G9b step and its exit code, plus "@qa D2 record row owed". Backend entries say C8T is in progress with no result; none says "validated". *deployed:* unchanged ("owed/unrun, owner X"); new observed entries add the policy content owner and the CI catalog. *dark:* switches re-checked in all four values files (JSON `darkSwitchCheck`). Guided and SIEM are off everywhere; observed is on in values-uat only, so RKS-01..05 move dark → live. *CHANGED/BEHAVIOUR:* each G9b change has a `changeG9b` record citing the post-G9 receipt. *AC-5 named items:* list §3 (ceilings `values.yaml:747/749` "120000"; `replayFailure`, `/guided-policies/**`, `timing-order-vectors.json`, flags, kill switch, V1–V22). *Story drift:* see P6 |
| **6** Inclusion rulings | **applied** | A1 RTX-01..18 included. A2 CFB-078 moved to the annex, CFB-079 protected. A3 CFC-01 carries the verbatim annotation. A4 prefix level plus the removal rule. A5 P09-06..08 moved to the annex. A6 CFC-02..04 superseded. OI-14 default stands. List md §4 and §6 |
| **7** Removals (@po) | **CONFIRMED 2026-10-18 by Pax (@po), all 16; no new list version (root decision).** *Original text:* NOT CONFIRMED; entries kept and flagged | `grep -rln "RKG-0\|RKO-03\|OI-21" docs .aiox` finds only my drafts, the checklist and `pm-ack.md` [V]. Nothing was found in the 010/011 stories, `po-ratification.md` or `po-carry/receipt-*.md`. All 16 stay with `protection: removed-pending-po` (list §7) |
| **8** Raise items | **status recorded** | OI-06 is closed in the tree by the B5 chart patch. Its deployed legs (CI catalog step, policy owner, U4) are still owed. OI-19 is by design (B-19). OI-22 is carried to @po |
| **9** Write into the runbook | **NOT DONE (out of scope)** | This dispatch allows writes only to this folder. The runbook "Live surface" section and rows RBR-01..19 are still owed (OI-25) |
| **10** @architect cross-check | **DONE: CROSS-CHECKED-WITH-NOTES, Aria 2026-10-18, names `e5c58fa5…` (§E).** *Original text:* OPEN (blank line) | Needs Aria's dated note naming JSON sha `e5c58fa5…`. Suggested focus: the 17 NEW entries, the 7 CHANGED, the 5 STATUS, RKO-09 (OI-28), and a sample of the 187 MOVED |
| **11** @pm acceptance | **OPEN (blank line)** | Advance acceptance under P1–P6 (pm-ack §5). P1 and P5 are not met yet (§B) |
| **12** After acceptance | not started | Root checks the 011 start condition. The second re-date after 009 Done stays owed |

## B. @pm conditions P1–P6 (pm-ack.md §5)

| # | Condition | State | Evidence |
|---|---|---|---|
| **P1** | G9 record `trigger: MET`, `isVerdict: false` | **NOT MET (pending)** | G9 record NOT_MET pending G9b; no G9b record yet; trigger line blank for root |
| **P2** | Freeze check done; drift re-measured and diffed by id; changed entries through §5 | **MET for the G9 → G9b drift; G9b capture-after owed** | Step 2/3 above. The by-id diff is in `delta-from-pre-g9.md` (CHANGED 7, STATUS 5, NEW 17, MOVED 187). If G9b capture-after differs from capture-before, P2 re-opens for the files that changed |
| **P3** | Rulings A1–A5 and A6 duplicates applied exactly; CFC-01 annotated | **MET** | List md §4, §6 and §8. The CFC-01 text is a verbatim substring of `STUDIO-OBS-010.story.md` (asserted by the generator). The only addition is a separate G9b anchor note (`_helpers.tpl:593`, was :434) outside the quoted text |
| **P4** | No entry leaves other than the 16 @po confirmed, with the confirmation recorded | **MET (2026-10-18).** Pax (@po) confirmed all 16 (`po-removal-confirmation.md`, `0b95414d…`); dated line next to the list in `live-surface-list.md` §0 and above. Root decision: no new list version; the 16 already carry `status: removed`, outside the 671 protected. *Original state:* MET in effect; @po confirmation OWED | **No entry left the list** (729 ⊇ 712). The 16 were not removed because @po has not confirmed them |
| **P5** | Aria's cross-check note names the sha256 of the same list JSON | **MET (2026-10-18).** Aria's line names `e5c58fa57f389879b2843815b5b389d0efa99921bc142155d6b18b970d7c2c57`, equal to the JSON re-hashed today. *Original state:* NOT MET (pending) | Blank line. The sha to name is `e5c58fa57f389879b2843815b5b389d0efa99921bc142155d6b18b970d7c2c57` |
| **P6** | Story drift re-read; 009/010/011 hashes refreshed; AC-5 categories unchanged; P-1 row included if applied | **MET** | 009 `e900e715…`, 010 `413dcac3…`, 011 `413fcaa4…`, inventory `3f0d3a53…` (unchanged). AC-5 lines 94–118 re-read: categories unchanged. P-1 is applied in 010 0.3.14, so RBR-19 was added |

**@pm re-dispatch triggers (pm-ack §5) found:**
- No finalize choice departs from Aria's rulings.
- New inclusion questions, all small, listed for @architect at cross-check rather than ruled here:
  - RKO-09, the catalog script as a surface (OI-28);
  - the live classification of observed entries under values-uat.
- [I] Neither changes what @pm accepted, but @pm may judge otherwise.

## C. Ruling-by-ruling check (P3 detail)

| Ruling | Required | In the list |
|---|---|---|
| A1 | include RTX-01..18 as their own category; protection unit method + path + direction + caller-auth; bodies via contracts/v3 | 18/18 `protected`, inclusion text as ruled |
| A2 | CFB-078 to the "excluded with reason" annex, id kept; CFB-079 protected | CFB-078 `annex:excluded-with-reason`; CFB-079 `protected` with the A2 note |
| A3 | CFC-01 "merge-permitted" annotation before dating, C1–C6 | `carveOut.annotation` verbatim; md §8 |
| A4 | prefix level CFK-01..18 + CFB + CFD; three-part removal rule | `protectionRule` on all 18 CFK |
| A5 | P09-06..08 to the "not a surface" annex, status excluded-not-surface | 3/3 `annex:not-a-surface` |
| A6 | keep CFB-101..103; mark CFC-02..04 superseded-by | 3/3 `annex:superseded-duplicate`, `supersededBy` set |

## D. Unresolved at writing

1. **P1:** no G9b @qa record. C8 full was aborted by user decision, and C8T is in progress. The trigger line is blank (OI-23).
2. **P2-tail:** the G9b capture-after is still owed. (~~P5~~ met 2026-10-18 by Aria's cross-check.)
3. ~~**@po has not confirmed the 16 removals.** They stay on the list (OI-21).~~ Resolved 2026-10-18: P4 met (OI-21 closed).
4. ~~**010 Status Ready → InProgress** is not applied (no story edits in this dispatch; OI-24).~~ Resolved 2026-10-18 (§F; OI-24 closed).
5. **Runbook write (checklist §9)** is not done (OI-25).
6. **Policy content owner per environment:** user to name (pm-ack §3). The CI catalog step is owed to @devops. Both block deployed observed runs, not this list.

## E. @architect cross-check notes (Aria, 2026-10-18)

The full note is in `live-surface-list.md` §0, under the @architect line. Read-only. No test, build, helm or node was run. This is not a G9b verdict.

- **Verdict: CROSS-CHECKED-WITH-NOTES.** It covers list sha256 `e5c58fa57f389879b2843815b5b389d0efa99921bc142155d6b18b970d7c2c57`, recomputed with `python3 -I` and equal. The source tree re-hashed equal to G9b capture-before (1808/1808).
- **P3:** A1–A6 and the CFC-01 C1–C6 annotation are applied as ruled. The CFC-01 annotation is a verbatim substring of the 010 story `413dcac3…`. The step 10 / P5 line is now filled.
- **OI-28 (RKO-09):** confirmed as a protected surface. It is the in-image catalog producer, called by CI across the image boundary. Protection unit: path + digest argument + one-line `{profile, build}` stdout + refusal exit 1.
- **Observed entries live under values-uat:** confirmed. This follows the list's own dark rule, and it is consistent with every runner entry already live under the UAT controller pin (B-19). Protection is unchanged either way. Deployability stays on the `deployed` evidence leg.
- **OI-27:** closed as informational. My A6 inference was wrong: CON-44 and CON-46 reference limits by `$id`, so their bytes did not move.
- **Required changes for Alex:** none for this dated list.
- **Bookkeeping for the 009-Done re-date (AX-5..AX-8):**
  - CON-25 and CON-33 `deltaVsSkeleton` should read changed.
  - CHN-12's operative anchor is `_helpers.tpl:605-611`.
  - Refresh the CHT-07 and CHT-08 `surface` line ranges.
  - Reword `statusVocabulary.dark` for the observed flags.
- **AX-3:** the A5 annex is encoded in `protection`, not `status`. Accepted. Cite 671 protected, not 608 live, as the 011 boundary.

## F. 010 Status move Ready → InProgress (OI-24; Alex, 2026-10-18)

- **Authority:** 010 Dependency notes: "The Status moves to InProgress when T2 starts (@analyst)". T2 has started (this dated list exists). The lead asked for the move.
- **Edit (append-only):** the Status cell now reads `~~**Ready**~~ **InProgress** *(2026-10-18, @analyst: …; OI-24)*`, and Change Log row **0.3.16** is appended. Nothing else changed.
- **`docs/stories/STUDIO-OBSERVED/STUDIO-OBS-010.story.md` sha256 before:** `bf674ff1707a44b70f7a07ad69d054f2ea355c120420becf1a5b89b14d5c3ed8` [V]
- **sha256 after:** `5847ece282808c5f84e974ffbd92d82e0893c68e0aadac9f02707542350438fd` [V]. Undoing the two edits in memory gives the before hash again, so nothing else changed.
- **Not changed:** the JSON `storyStatusChange` field still reads "none … OI-24", because the JSON is not edited (root decision). This section supersedes that field. PO note (b) in the story says "Alex applies the removals in a new list version". The root decision overrides that, the note is left as written, and Change Log 0.3.16 records the override.
- **Still blank:** the @qa D2 trigger line (P1, OI-23) and the @pm acceptance line.
