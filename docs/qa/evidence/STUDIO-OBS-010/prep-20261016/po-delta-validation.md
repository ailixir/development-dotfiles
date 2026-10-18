# STUDIO-OBS-010: PO delta re-validation after STUDIO-OBS-007…015 and the 008 T0 close-out

- **Author:** Pax (@po). **Date:** 2026-10-16. **Mode:** YOLO, read-only prep.
- **Tree:** uncommitted working tree on `brunobuger/ui-studio`, HEAD `734ad704f`. The 015 final gate is a draft pending attempt04.
- **Story bound:** `STUDIO-OBS-010.story.md` sha256 `bf8b1bf6961a5280…` (Status **Ready**, Change Log 0.3.7).
- **What I ran:** read-only only: `grep`, `sed -n`, `ls`, `shasum -a 256`. No tests, builds, installs or git writes. No story or source edits.
- **Writes:** this directory only (`po-delta-validation.md`, `po-delta-validation.json`). The 011 start-condition check is recorded in `../../STUDIO-OBS-009/prep-20261016/po-delta-validation.md` because its trigger is 009's local ACs. The part that falls on 010 is D-1 below.
- [V] = verified in this pass. [I] = inference.

## Verdict

**GO with corrections, 8/10. Status stays Ready.** No lifecycle change.

- The FOCUS-MUTATION-01 placement is fully carried [V]: AC-1 obligation a–d (`:26-55`), T0 sub-item (`:86`), File List (`:133`), and the AC-4 row named in d.
- **The main finding is D-1.** The 2026-10-15 user decision makes 011's start depend on this story's Live surface list. But this story has no text that lets T2 start before 009 Done, and "Depends on STUDIO-OBS-009" plus README `:47` forbid it. Without D-1, the 011 start condition cannot be met.
- **D-4:** several 009 obligations write rows into "the OBS-010 AC-4 release-readiness record" (KL-015-R1, AUTHORED-ECHO-01 count, RS-1 count, TF-5 role model). The 015 QA draft also hands ED-05 closure to OBS-010. None of these is stated in 010, so the analyst could miss them.

## Anchors re-verified [V]

| Story claim | Now | Result |
|---|---|---|
| Runbook `studio-guided-authoring.md:7` (V33) and `:41` "Staged V19 compatibility and rollback" | both present (51 lines; `:7`, `:41`, `:43-47`) | holds; still the sections AC-5 replaces |
| 10.34 Groups A–N (`:66` Group A) | `:66` Group A, `:91` B, `:98` C | holds |
| AC-5 a: runner pre-admission `observedReplay.ts:427` `issuedAt <= now` | `:443` `demand(Date.parse(g.issuedAt) <= now && … <= 30000, 'AUTHORIZATION_EXPIRED')` | holds; line drift (D-5) |
| AC-1 a: D5 `probe/probe.mjs` | `STUDIO-OBS-015/execution-20261015/backend/w3-d5-diagnosis01/probe/probe.mjs` exists | holds |
| AC-1 a: collector `dist` digest via OBS-009 AC-12 i | 009 `:312` | holds |
| AC-4 file `docs/qa/evidence/studio-observed-authoring/release-readiness.md` | directory does not exist yet | expected (new) |
| AC-5 Live surface "migrations `V1`–`V18` (+ forward-only additions)" | head is `V21__guided_session_replaying_prefix.sql`; V19 `guided_governance`, V20 `guided_session_recording`; 008 plans V22 | stale wording (D-2) |
| AC-5 Live surface "`/api/v1/studio/**` incl. guided-sessions and video" | OpenAPI `servers: /api/v1/studio`; also `/guided-policies/**` (014), `/tests/{id}/schedule/**`; `GuidedSessionController` `/api/v1/studio/guided-sessions` | holds; the list must be measured (D-3) |

## Corrections (D-n)

Line numbers refer to `STUDIO-OBS-010.story.md` at sha256 `bf8b1bf6…`.

| ID | Line | Kind | Finding and reason | Source | Proposed change |
|---|---|---|---|---|---|
| D-1 | `:9`, `:88` (Dependency notes; T2) | correction, **blocking for the 011 start condition** (not for 010 itself) | The user decision says 011 may start once 009's local ACs are validated **and this story's Live surface list exists**. But 010 "Depends on STUDIO-OBS-009" with no exception, and README `:47` says "only verified completed dependencies permit development of dependents". So T2 cannot lawfully run before 009 Done, and the condition cannot be met until 009 Done, which defeats the decision. [I] The decision implies an early T2; no new user decision is needed. If the coordinator reads it differently, ask the user once. | User decision 2026-10-15 (memory; 011 `:211-221`; README `:5`); README `:47` | Append to the Dependency notes and T2: "T2 (AC-5 rows whose evidence is local, plus the dated Live surface list) may start once OBS-009's locally achievable ACs are implemented and validated (the same trigger as OBS-011). Rows that depend on OBS-009 external proofs read 'owed/unrun, owner X' until then. The list is re-dated and re-checked after OBS-009 Done, before T3/T4. Nothing is removed from it without @po." T0/T1 (pilot) keep the 009 Done + D-C pass gate. The Status moves to InProgress when T2 starts (@analyst). |
| D-2 | `:71` (AC-5), `:96` (Dev Notes) | correction, low-medium | "migrations `V1`–`V18` (+ forward-only additions)" and "replace them with the V1–V18 baseline" are true in substance but invite a wrong list. The live forward-only set today is V19 `guided_governance` (014), V20 `guided_session_recording` (013) and V21 `guided_session_replaying_prefix` (015). 008 T0 A1 plans `V22__execution_replay_failure.sql` (number re-measured at W0). 011 uses this list as its no-remove boundary. | `ls backend/src/main/resources/db/migration`; 008 story `:126` | Name "V1–V18 re-baseline + forward-only V19…head (measured at T2)". The dev-DB recreation row migrates to the head. |
| D-3 | `:71` (AC-5 Live surface) | addition, low | Surfaces added since the 2026-10-10 validation that the list must include: the public `ExecutionSnapshot.replayFailure` field and `ReplayFailure` component, plus the capability operation (008 A1/P1; 43 → 44 operations); `/guided-policies/**` (014); runner per-step/total ceilings `STUDIO_RUNNER_MAX_STEP_TIMEOUT_MS` / `STUDIO_RUNNER_MAX_TOTAL_RUNTIME_MS` "120000" (`helm-chart/put-checks/values.yaml:577-579`, 015 ruling G); `contracts/v3/timing-order-vectors.json` (015 ledger 83/84). | OpenAPI `servers`; values.yaml grep; 008 story `:123-127` | Add: "the list is measured from the final tree at T2 (OpenAPI operation enumeration with count, `contracts/v3` file list, `KEY_SPECS`/`ACCEPTED_KEYS`, chart values, migration list), not typed from memory." |
| D-4 | `:61-69` (AC-4) | addition, should-fix | Rows that other stories place in this record but this story does not name [V]: (a) **KL-015-R1**: "a recording may be missing after owner loss during a pending append", until 009 AC-11 R1 a–d land (009 `:282`); (b) the **AUTHORED-ECHO-01** `authoredEchoUnobservableTargets` count in the benchmark row when nonzero (009 `:119`); (c) the **RS-1** `rs1NonScalarReadGaps` count and the F03 state in the benchmark row (009 `:111`); (d) **KL-015-GRANT / TF-5**: "unrun, owner Platform DBA / @devops" until the role model is confirmed (009 `:63`); (e) **ED-05**: in-image Node v24.20.0 vs `.nvmrc` 22, EXTERNAL-OPEN, with closure owned by OBS-010 per the 015 QA draft REQ-001, subject to the issued 015 gate; (f) FOCUS-MUTATION-01 (already in AC-1 d). | 009 story lines above; 015 `qa-formal-gate-draft01/gate.yaml` REQ-001; `po-focus-r1-placement`, `po-triage-followups` | Add an "AC-4 clarification d — inbound rows" listing a–e, with the rule "pending ⇒ release not ready; never passed by omission". The AC-4 text and meaning are unchanged. |
| D-5 | `:75` (AC-5 addition a) | anchor | `observedReplay.ts:427` → `:443`. | grep | Update. |
| D-6 | `:9` (Dependency notes) | correction, low | "OBS-011 may run in parallel to this story once OBS-009 is Done" sits unstruck beside the 2026-10-15 amendment. | 008 0.3.11 strike convention | Strike with reason (append-only). |
| D-7 | `:24`, `:57` (AC-1, AC-2) | clarification, low | "The pilot script uses the OBS-008 state copy verbatim." Since the 008 T0 close-out: the secret-fill `POLICY_DENIED` sentence is struck (A2, not renderable); "None of these" and a declined side-effect confirmation cancel and focus step N (A3); replay login and drift copy are keyed on `replayFailure` (A1), with no drift copy for a pre-Ready drift (KL-A1-1). | 008 story `:36`, `:39`, `:128`; t0 ruling A2/A3, KL-A1-1 | Add a note: the script is frozen against 008's **shipped** copy after 008 Done, not against the pre-T0 AC text. |

## Items checked that need no change

- The pilot gate (AC-1) still requires 009 AC-7 **passed**. The AE-01/FM-01 "wait or disclose" path in 009 cannot open the pilot on a failed gate.
- The FOCUS-MUTATION-01 block (a–d) matches the 015 KL text, and the `dist` digest hand-off from 009 AC-7 f matches.
- The AC-5 NTP row (R9-OBS-1/2) still holds: the runner check is unchanged in substance (`:443`).
- The carried CACHE-REAUTH, AUDIT-LABEL-PRIVACY, EXTERNAL-READINESS (F01–F04, E1–E8) and RECORDING-RUNBOOK-COPY items are still open as recorded.
- 015's R4 (`containsText` empty-after-normalization never passes) strengthens the zero-false-pass gate the pilot depends on. No 010 change.

## Acceptance criteria classification

| AC | Class | Local part (spelled out) | External part (009 register IDs) |
|---|---|---|---|
| AC-1 pilot preparation + FM-01 check | EXTERNAL | Draft the pilot script after 008's copy is frozen; prepare the probe harness copy and the per-application result template; list prerequisites | 009 AC-7 D-C **pass** (U2, U3, U4, U7, U13); participant authorization (U9); staging app, test secrets, origins (U3); the probe on the real application (U3) |
| AC-2 pilot execution | EXTERNAL | none beyond the anonymized-record template | ≥ 5 human participants (U9) |
| AC-3 remediation loop | EXTERNAL | Remediation stories themselves are local work once findings exist | Pilot findings (U9) |
| AC-4 release-readiness record | LOCAL-PARTIAL | Write the record with the fixed row shape and honest states. Every row cites an evidence path or reads "unrun/owed, owner X". Re-register 10.34 groups A–N (re-cut/carried/closed with reason). Add the D-4 inbound rows. | Gate states: G-1/G-2/G-3, C-2/C-3 (U4, U5); OBS-014 approvals, AUDIT-LABEL-PRIVACY, CACHE-REAUTH, F04/E1–E8 (U10); D-B, dev-DB recreation (U11); ED-01 owner/retention (U2); SIEM/Q3 (U6); ED-05 (U4); TF-5 (U14) |
| AC-5 runbook + Live surface + NTP row | LOCAL | The single-path rewrite (remove V33/V19/account text); every listed row; the dated Live surface list measured from the tree (D-3); the NTP row with "bound owed, owner Platform/SRE" (allowed by the AC text) | none for the AC. Rows that cite 009 live proofs (G-1 verified, revocation bound on the live stack) state "owed" until 009 provides them. |
| AC-6 devops handoff | LOCAL | The handoff document | Any push, PR or deploy (U12) is outside the story |

Totals: 2 LOCAL, 1 LOCAL-PARTIAL, 3 EXTERNAL (unchanged from 2026-10-15).

**Still-open PO question (not ruled here; carried from the feasibility analysis):** can 010 reach Done with a correct record that reads "not ready"? AC-4 says pending items "prevent release readiness". It does not say they prevent Done. This does not change feasibility, because AC-1/AC-2 are human-gated anyway.

## 10-point checklist (delta)

| # | Item | Result | Note |
|---|---|---|---|
| 1 | Title | PASS | |
| 2 | Description | PASS | |
| 3 | Testable ACs | PASS | Fixed row shape; evidence-path rule. |
| 4 | Scope IN/OUT | PASS | No code. |
| 5 | Dependencies | PARTIAL → PASS after D-1, D-6 | The early T2 is not authorized in the text. |
| 6 | Complexity | PASS | M. |
| 7 | Business value | PASS | |
| 8 | Risks | PARTIAL → PASS after D-4 | Inbound known-limit and external rows are not named. |
| 9 | Criteria of Done | PASS | The "not ready but Done" question is still open (above). |
| 10 | Alignment with landed contracts | PARTIAL → PASS after D-2, D-3, D-5, D-7 | Migration head, new public surfaces, 008 copy rulings. |

Score 8/10, GO. Executor `analyst` / gate `pm` matches the Research row.

## Not claimed

No pilot, record, runbook or Live surface list was written. No participant was contacted. No external approval was obtained or inferred. No QA verdict or Done. 015 is not complete; its gate is a draft.
