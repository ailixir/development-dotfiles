# Story STUDIO-OBS-016 — Studio deployed-stack readiness and deferred validation gates

| Field | Value |
|---|---|
| Story ID | STUDIO-OBS-016 |
| Status | **Ready** |
| Epic | Studio observed authoring |
| Depends on | STUDIO-OBS-009, STUDIO-OBS-010 |
| Dependency notes | Holding story. On 2026-10-23 the user decided to close STUDIO-OBS-009 and STUDIO-OBS-010 on local scope plus two must-haves, and to defer every other outside-owner gate. Verbatim: "The only must have on the list that i agree for now are the item 4(keep budget unlimited and the access will be handled by a RBAC implementation we're going to build in a future version) and 6. Finish them and then close the stories." **Deferred means moved here. It is not waived and not passed.** Every AC below carries the original 009/010 item ID, owner and source section, and reads "unrun, owner X" until its own evidence path exists. This story is created by moving obligations, not by adding any: no AC has a source outside STUDIO-OBS-009 / STUDIO-OBS-010. **Out of scope, dependency note only:** model access control. The user said access will be handled by a future RBAC implementation (a separate future version); it is neither an AC nor a task here. **Out of scope:** pilot users (010 pilot cohort already superseded by the requesting user's video review, 010 "Current authority", phase378). Functional-only accessibility scope (ADR-SC-006): no accessibility ACs. |
| Source | docs/stories/STUDIO-OBSERVED/STUDIO-OBS-009.story.md (AC-1, AC-4, AC-5, AC-7, AC-8, AC-9, AC-12; T0; RS71-N marker; PO notes 0.3.23–0.3.28; "PO notes — 009 local validation MET (2026-10-18)" owed table rows 1–14; "PO T0 outcomes — 2026-10-17" open B2/B3/B5; T5 R8.2; "PO reconciliation — completed local tasks"; "PO closure — 2026-10-23") · docs/stories/STUDIO-OBSERVED/STUDIO-OBS-010.story.md (AC-1 FOCUS-MUTATION-01, AC-4 clarifications a–e, AC-5, AC-6, T2–T4, "Current authority"; "PO closure — 2026-10-23") · QA round 075 `.aiox/sdc/STUDIO-OBSERVED-ORCH/recovery-20261020/real-stack71/parallel-execution-20261022/round-075/qa-gate/GATE.md` §4 (O1–O3) · register `docs/qa/evidence/STUDIO-OBS-009/prep-20261016/prerequisite-register.json` · user decision 2026-10-23 (above) |
| Size | M |

executor: "devops"
quality_gate: "pm"
sdc_reviewer: "qa"
quality_gate_tools: [requirements-traceability, evidence-review, release-checklist]

## Story

As a Studio product owner, I want every outside-owner and deployed-stack gate that STUDIO-OBS-009 and STUDIO-OBS-010 could not close locally to be carried in one place with its original ID, owner and source, so that those two stories can close on local scope without any deferred gate being read as passed or waived, and so that real deployment and any go-live on real systems stay gated on this evidence.

## Acceptance Criteria

Common rule for every AC: its state reads "unrun, owner X" or "blocked by Y" until an evidence path exists; no AC is passed by omission, inference, waiver, or by local synthetic evidence (case437/case439 give no AC-7 or D-C credit, 009 QA Results 2026-10-23). Ownership and exact wording of each source item are in the cited section; this story does not reword them.

1. **AC-1 — DEPLOY-OBSERVED-01: chart-deployed stack runs observed work.** Close condition as stated in 009: policy-content owner named (**U24**, owner: the user names one; @pm records), the CI step that runs `print-observed-catalog.mjs` inside the pushed image, and a deployed smoke recording that neither `/v2/validate-observed` nor `/v2/runs` answers 503 and that publication does not answer 409 for the catalog. Until then every deployed-stack leg reads "blocked by DEPLOY-OBSERVED-01, owner @devops". [009 AC-1 residue; 009 "PO notes — deployed-stack blocker and U22 authorization (2026-10-18)" item a; 009 "PO notes — 009 local validation MET" owed table row 2 (chart block and catalog producer already landed)]

2. **AC-2 — UAT TLS secrets and controller certificate pin.** The per-environment Secrets `checks-studio-runner-tls-uat` and `checks-studio-backend-runner-tls-uat` exist and the controller certificate pin `studioRunner.tls.controllerCertificateFingerprint256` is supplied, so UAT leaves `ContainerCreating`. All three are external inputs. [009 "PO notes — W2 findings and pre-F-merge rulings (2026-10-18)" note d (lane D2 finding F4); 009 deployed-stack note a knock-on (OI-19); runbook `docs/runbooks/studio-runner.md` §14.4]

3. **AC-3 — PID-1 proof on the deployed stack.** On the deployed stack, guided mode starts with a pid other than 1 and the pid is recorded. The negative case (pid 1 refuses `CONFIGURATION_DENIED`) stays covered by the existing runner unit tests. [009 AC-1 obligation "PID-1" d; 009 owed table row 5; U22 image smoke authorization, 009 deployed-stack note b]

4. **AC-4 — RUN-ORPHAN-01: replay child outlives a runner SIGKILL.** The in-pod check is run with PID-1 d. If it is not run it reads "unrun, owner @devops"; if it shows survivors, RUN-ORPHAN-01 becomes a GA blocker (GA plan §4.G). [009 "PO notes — W3 carries and pre-G9 rulings (2026-10-18)" item a (Aria pre-G9 ruling §1, lane F finding F-A); 009 owed table row 5]

5. **AC-5 — Vault policy test against the ED-02 dev Vault (U5).** The dev-Vault half of 009 AC-4 runs against a Vault that meets Quinn's credit rule; until then it reads "unrun, owner PUT Core/BFF (ED-02)". [009 AC-4 ("What stays external"); 009 owed table row 13; register U5]

6. **AC-6 — Staging application, SSO, origins, accounts, test secret and oracles (U3).** The approved staging application with real login, its approved origins, test account, test secret and independent oracles are provided; none is assumed or synthesised. Owner: user / application owner / Platform-SRE (ED-04). [009 T0; 009 owed table row 3; register U3; 010 AC-1 prerequisites ("Approved application/origins/account/test-secret/oracle ... remain genuine prerequisites")]

7. **AC-7 — U13 Security & Compliance acknowledgement (AUTHORED-ECHO-01 / AE-01 / FM-01).** Security & Compliance acknowledge the AUTHORED-ECHO-01 rule (rule text by @architect), with the AE-01 landing and FM-01 runner fixes recorded. **This must precede any go-live on real systems and the first real-model call.** The benchmark row discloses `authoredEchoUnobservableTargets` when nonzero. [009 AC-7 obligation AUTHORED-ECHO-01 (d, e); 009 owed table row 4; 010 AC-4 clarification d item b; register U13]

8. **AC-8 — Company benchmark D-C / T4.** Run the D-C gate on the deployed stack with pinned model, prompt and runtime versions: ≥ 20 workflows × 3 real-model repetitions plus 100 same-artifact replays (AC-7), the guided-schema probe under ED-01 before AC-7 runs (AC-8), and the isolation and mutation oracles with the real model (AC-9, which runs on the same deployed stack and real model and is unrun and externally blocked with AC-7 and AC-8). Report with denominators. The report also carries the 009 T4 **RS-1** obligation (RS-1 cases marked in the corpus manifest, `rs1NonScalarReadGaps` recorded in `benchmark.json` inside the gate denominators, outcome routed to README follow-up F03) and @qa's corpus composition and the pinned versions from 009 T0. [009 AC-7, AC-8, AC-9; 009 T0; 009 T4 and its RS-1 sub-item (AC-7 obligation RS-1 a–d); 010 AC-4 clarification d (RS-1 count and F03 row); 009 QA Results "Done is not possible" paragraph; ADR-SC-005 D-C]

9. **AC-9 — FOCUS-MUTATION-01 real-application probe.** For every application and authored fill target in the reviewed workflows, run the real-Chromium probe on the pinned runner `dist` (digest recorded) and record outcome, value-free mutation types and attributes. A failing or unchecked target blocks that application's workflow evidence. The 009 AC-7 FOCUS-MUTATION-01 change must have landed; its `dist` digest is the input. [009 AC-7 obligation FOCUS-MUTATION-01 (incl. f); 010 AC-1 obligation FOCUS-MUTATION-01 a–d; 010 AC-4 clarification d item f]

10. **AC-10 — SIEM sink routing.** The structured audit events OBS-014 emits are routed to the platform SIEM sink through chart values. Sink availability is external; if absent it reads "unrun, owner Platform/SRE". [009 AC-5 (second half); 009 owed table row 13; 009 PO validation should-fix "AC-5 names the SIEM sink owner (Platform/SRE)"]

11. **AC-11 — Price list, thoughts-billing answer and evaluation caps (U18, U2; QA round-075 O1, O3).** (a) The ED-01 owner's price list and thoughts-billing answer exist, alongside the named ED-01 gateway owner (U2). **They are informational only:** they feed cost reporting in the AC-8 benchmark report and are not an admission gate. **Budget admission follows the user's decision of 2026-10-23: unlimited, "Both: no gate, no cap"** (CSI daily model tokens `0` = unlimited, landed and tested in 009, QA round 075; model access is to be controlled by a future RBAC implementation, out of scope here). This story adds no budget gate, no cap and no headroom check. U17 (USD 500 headroom) and U7 (budget-admission signature) are **resolved by that decision**, not carried. (b) O1: `studio-runner/evaluation/cli.mjs` `CODE_DEFAULT_CAPS` (`csiDailyInputTokens: 5242880`, `csiDailyOutputTokens: 640000`) and `studio-runner/evaluation/observed-authoring/evaluate.mjs` `measureProposals` default (`csiDailyOutput: 640000`, `csiDailyInput: 5242880`) still carry the old finite CSI daily caps. They are recalibrated with the AC-8 benchmark: the CSI daily values reflect the unlimited default, and the per-session ceilings that remain finite are taken from the benchmark's measured run. No backend bound changes in this story. [009 T4 preconditions; 009 "PO notes — MODEL-SIZING ruling acknowledged (2026-10-18)" placement; 009 owed table row 1; register U18, U2, U17, U7; user decisions 2026-10-23 (009 "PO closure — 2026-10-23"); QA round 075 GATE.md §1 O1 and §4 O3]

12. **AC-12 — PM acceptance of the deployed product.** @pm records acceptance of the deployed product after AC-1 to AC-9 have evidence. Agents cannot sign for it. [009 quality_gate "pm" and QA Results "Done is not possible" paragraph (PM acceptance listed as an outside-owner gate)]

13. **AC-13 — 009 RS71-N local carry-forward items.** Each item below keeps its RS71-N wording and reads open until evidenced, never passed or waived: (a) P4/P5 `RUNNER_PORT` hazard in `GuidedPlanningIntegrationTest`; (b) N1, the 03 and 09 screenshots withheld in case439; (c) D1b and D3 not human-verified in any real-stack pack; (d) QA candidate-b surviving mutants MQ4 and MQ6; (e) the `guidedIncrementalTest` lane unrun; (f) final-tree full backend regression (`check`, C10, D2 smoke) **descoped by the user on 2026-10-23** ("Keep the scope tight, and focused tests, no regression"), recorded as descoped here, not as passed; (g) `verifyRunnerDist` rebuild or touch of `studio-runner/dist/main.js` before any push; (h) @qa round-057 recommendations R2, R3 and R5 (`G/round-057/qa-qualified/QA-GATE.md`; R1, R4 and R6 were closed in round 072); (i) QA frontend observation O1 (the D6 single re-read guard is not observable by a test); (j) case439 non-blocking UX N2 (08/12/15 harness framing) and N3 (step-4 chip cut off in 11/12); (k) the unproven cause of the slow graceful browser close (RS71-D, confidence low); (l) the 009 P4/P5 qualification that the G9b listener/orphan listing and historical Gradle/JVM PIDs are NOT_RETAINED (009 "PO reconciliation — completed local tasks" table). Any other item left open in the RS71-N marker or in the 2026-10-23 Dev Agent Record "Deferred, non-blocking findings" stays carried by reference. The runtime-role grant on `studio_guided_model_attempts.rejection_reason` (RS71-N item 8) is **not carried**: it is the V23 grant script delivered under 009 TF-5. [009 T-list marker RS71-N and its round-072 follow-up; 009 T5 P4/P5; 009 AC-12 clarification (backend lanes, D-14); 009 "Still open" and "Deferred, non-blocking findings" (Dev Agent Records 2026-10-23); 009 Change Log 0.3.37; 010 AC-3 (D1b/D3 findings of the case439 review)]

14. **AC-14 — Shared-environment transport, Vault and authorization gates (G-1, G-2, G-3, C-2, C-3).** Each reads "unrun, owner X" with its state until evidenced: **G-1** guided mTLS chain in shared environments; **G-2** no real credential in Vault until every secret-bearing hop is TLS-authenticated; **G-3** no scheduled secret-referencing run before production background and secret-use authorization sources exist; GA **C-2** production `StudioSecretUseAuthorization` source and **C-3** Vault provider enablement (owner ED-02 / PUT Core-BFF, Platform-SRE). [010 AC-4 (external gates); 009 AC-2, AC-3, AC-6; 009 owed table row 13; ADR-SC-005 "Security work becomes stories"; GA plan §4.B, §4.C]

15. **AC-15 — OBS-014 compliance approvals and F04.** Security & Compliance decisions on page-metadata/origin export to the gateway and on retention of sanitized observations and model output (with the `guided-data-flow.md` unpruned-stores residual R-1 and the two-policy-sources residual R-2 stated in the rows), the gateway-side retention answer from the ED-01 owner, and **STUDIO-OBS-F04** (artifact HMAC via Vault Transit) either landed or accepted as a named residual with an owner, with its external prerequisites **E1-E8** (owner Platform/SRE) listed. Pending until each has an evidence path. [010 AC-4 and AC-4 clarification a, b, c]

16. **AC-16 — D-B confirmation and ED-05 remainder.** (a) D-B: confirmation that nothing was ever deployed from an internal remote (owner: user / Platform-SRE). (b) ED-05 remainder (STUDIO-OBS-015 REQ-002): internal Playwright runner image, non-root user, seccomp profile and CA bundle for the deployed runner, verified on the deployed image, not only the local gate build (owner Platform/SRE; sub-items per SPK-04 questions 1-5). [010 AC-4 and AC-4 clarification d item h; ADR-SC-005 D-B residual]

17. **AC-17 — Known-limit rows and runner disclosures.** Each row stays open until its stated close condition has an evidence path: **KL-015-R1** (missing recording after owner loss during a pending append; closes on 009 AC-11 R1 a-d credited by @qa, or "not reproduced" under R1 a); **KL-015-D5** (only the launch phase of a guided start is hard-killed; closes on 009 AC-11 D5 a-e or @architect's D5 a ruling); **SEC-AUDIT-PREREADY-01** disclosure (stays until the runner sends `secretUse` `NOT_USED` on every pre-`Execute3` `RunFailure` and `PreReadyRevocationJoinedIT` pins it). **KL-015-GRANT is not carried here**: it is the TF-5 grant, which is being completed under 009/010 (V19-V23 grant script; runtime role = owner is N/A by default). [010 AC-4 clarification d items a and g; 010 AC-4 clarification e2; 009 AC-11 R1, D5; 009 W3 note item b]

18. **AC-18 — C17 real-login masking review.** The requesting user's masked-dots (password) review of the first Run and replay against the real login, with reviewer, build and recording identified; until then native content/visual correspondence stay UNASSESSED, masking INCONCLUSIVE, C17 UNRUN. The case437 local-pack acceptance gives no credit. [009 AC-10 (C-17 manual video gate); 009 "Still open" (AC-10 C-17 password-dots human check: UNRUN); 010 "PO clarification - proof and replay evidence"; 010 AC-4 clarification d; named human reviewer U8]

19. **AC-19 — 009 owed local residues F1, F2, B2/B3 with N-RS1, PLANFIX-ARCHIVE (QA round-075 O2).** Each reads open until evidenced: (a) **F1 transient watch** (G9-F1): the `awaitJoinedVideo` diagnostic stays armed; at the next recurrence the case is classified and decided, or the watch is reported "no recurrence, n runs" (owner @dev); (b) **F2 race proof** (G9-F2): a scratch-copy mutation that is RED on the unfixed code and GREEN on the fixed code (owner @qa or @dev, scratch copy only); (c) **B2** (class-P denominator) and **B3** (iframe expected outcome) rulings, plus B5's optional `exact`-mode **N-RS1** case or a disclosure sentence (owner @po with @architect; the recommended answers stay unadopted until ruled); (d) **PLANFIX-ARCHIVE**: the planfix mutation and spotless/checkstyle logs copied into `docs/qa/evidence/STUDIO-OBS-009/execution-20261018/post-g9/` (owner @dev). [009 "PO notes — 009 local validation MET (2026-10-18)" owed table rows 9, 10, 11, 12 (record R1, R2, R9, §7 AC-11, §9, §10); 009 "PO T0 outcomes — 2026-10-17" open items B2, B3, B5; 009 T5 ADJ-1 note "the B2/B3 rulings are owed"]

20. **AC-20 — 009 live, deployed-run and live-traffic residues (QA round-075 O2; 009 T5 R8.2; 009 AC-10/11/12 deployed halves).** Each reads "unrun, owner X" until evidenced on a real Linux or deployed stack: (a) **live revocation**: the AC-11 revocation behaviour checked live, not only in the joined ITs (owner per register; @dev with @devops); (b) **D2 smoke step 6**, one real guided assign on Linux with a signed token, and the **D2 smoke re-run on the residue image** `obs009-residue-local` (record R6; the original smoke is green only for the G9 image) (owner @dev/@devops, root/@devops); (c) **R8.2 d**: an alert on `terminalAbandoned` / `report.terminal_rejected`; (d) **R8.2 e**: a live check that a rejected terminal settles within `start_deadline` plus one recovery poll (owner @dev with @devops); (e) **wire canaries on real traffic**: actual gateway bytes and all text outputs scanned on the live stack for the sensitive canaries and the OBS-007 secret canary, with the authored nonsecret positive canary present (009 AC-10 first half; the C-17 half is AC-18); (f) **worker-profile dispatch** of an observed execution proven on the deployed stack (009 AC-11, OBS-007 AC-16 on real pods); (g) the **deployed real-browser E2E** leg of 009 AC-12 (the local real-stack runs case437/case439 give no deployed credit; DEPLOY-OBSERVED-01 blocks it, AC-1). [009 owed table row 7 (record R3, R6, §9) and row 13 "live revocation"; 009 T1 note "the PID-1 step 6 is owed, the residue-image smoke was not run"; 009 T5 sub-item R8.2 deferrals (AC-11 d, e); 009 AC-10, AC-11, AC-12; 009 "PO notes — deployed-stack blocker and U22 authorization (2026-10-18)" (ruling §B3: blocks the AC-12 deployed E2E)]

21. **AC-21 — 010 runbook and Live-surface remainder.** (a) The dated Live surface list is remeasured from the tree and re-dated after STUDIO-OBS-009 Done, re-checked by @architect, and accepted by @pm; nothing is removed from it without @po. (b) The NTP/clock-skew bound for runner, API and DB hosts is provided by Platform/SRE and written into the runbook clock row (until then "owed, owner Platform/SRE"). (c) The first-learn limit p95 value (010 AC-4 clarification e1, AC-5 P-1 row) is filled from the AC-8 benchmark, with the paired runbook and release-readiness rows updated together. (d) The pre-OBS-011-T0 runbook chronology stays **unmet as recorded**: no retrospective timing credit, and the Phase340 late-content proposal reads "unanswered, owner user/@pm" until answered. The rest of AC-5 already has local content (QA333, 2026-10-22). [010 AC-5; 010 T2 parent and its "2026-10-22 — local content only" note; 010 "Current authority" paragraph 3; 010 AC-4 clarification e1; 010 Dependency notes (re-date after OBS-009 Done)]

22. **AC-22 — 010 release-readiness record and @devops handoff.** (a) `docs/qa/evidence/studio-observed-authoring/release-readiness.md` (fixed row shape: gate · owner · state · evidence path · date) is consolidated with the current state of every gate in AC-1…AC-21, including the AC-4 clarification d/e inbound rows; 10.34 is re-registered against the single path; every external pending item has an owner. (b) The exact-path @devops handoff (AC-6) lists gate results, open external gates and risks; the release checklist (`.aiox-core/product/checklists/release-checklist.md`) is executed by @devops on handoff. Nothing is deployed by this AC. (c) The 010 Quality Gates "Evidence and runbook reviewed against implementing-story records" and "Independent SDC QA traceability review" are met by the AC-12 @qa traceability review. [010 AC-4, AC-6; 010 T3, its inbound-rows sub-item, T4; 010 Quality Gates 1–3]

## Tasks / Subtasks

- [ ] **T0 — Prerequisite register (AC-1, AC-2, AC-5, AC-6, AC-7, AC-11).** Re-state each external prerequisite with owner and current state from `prerequisite-register.json`; name nothing that is not already in it. @devops.
- [ ] **T1 — Deployed-stack legs (AC-1 to AC-4, AC-10, AC-20).** Policy owner named, CI catalog step, UAT Secrets and pin, deployed smoke, pid recording, in-pod RUN-ORPHAN-01 check, SIEM routing; live revocation, D2 smoke step 6 and residue-image smoke, R8.2 alert and live settle check, live wire canaries, worker-profile dispatch on real pods, deployed real-browser E2E. @devops with @dev for runner fixes.
- [ ] **T2 — Security and Vault (AC-5, AC-7).** Dev-Vault policy test; U13 acknowledgement recorded before any real-model call. @devops; Security & Compliance.
- [ ] **T3 — Benchmark and focus probe (AC-8, AC-9, AC-11).** Probe, 20x3 plus 100 replays with RS-1 counts, isolation and mutation oracles, FOCUS-MUTATION-01 probe; price list recorded as information only (no budget gate or cap); evaluation CLI caps recalibrated (AC-11 b). @dev; @qa independent reproduction.
- [ ] **T4 — Local carry-forwards (AC-13, AC-19).** Close or re-defer each RS71-N item (a)–(l) and each owed residue F1, F2, B2/B3/N-RS1, PLANFIX-ARCHIVE with evidence or a ruling. @dev, @qa; @po with @architect for B2/B3.
- [ ] **T4b — Shared-environment and compliance gates (AC-14 to AC-18).** Record state and owner per gate from the 010 release-readiness rows; evidence paths as produced by Platform-SRE, ED-02, Security & Compliance, the user and the named human reviewer. @devops coordinates; @pm classifies.
- [ ] **T4c — Runbook, Live surface and release readiness (AC-21, AC-22).** Live-list remeasurement and re-date after 009 Done; NTP skew row; p95 learn-limit value from AC-8; release-readiness consolidation and 10.34 re-registration; @devops handoff and release checklist. @analyst; @architect cross-check; @devops for the handoff.
- [ ] **T5 — Acceptance (AC-12).** @pm acceptance; @qa traceability review against the 009/010 items above and the mapping tables in the 009 and 010 "PO closure — 2026-10-23" sections.

## Dev Notes

### Decisions pending (written to the stated default)

| Question | Default | ACs that change |
|---|---|---|
| TF-5/U14 database role model and KL-015-GRANT | Not carried: completed under 009/010 (V19-V23 grant script; runtime role = owner is N/A by default), per root ruling 2026-10-23 | none |
| Who names the policy-content owner (U24) | The user; @pm records | AC-1 |
| Does this story require 009/010 to be Done first | Depends-on is ID-only for the wave planner; closure of 009/010 is the lead's action | none |

### Scope

- **In:** AC-1…AC-22 only, each moved from a cited 009/010 item. Mapping tables: 009 and 010 "PO closure — 2026-10-23" sections.
- **Out:** model access control (future RBAC version); any budget gate, cap or headroom check (user decision 2026-10-23, "Both: no gate, no cap"); pilot users (superseded, 010 phase378); accessibility work (ADR-SC-006); TF-5/U14 and KL-015-GRANT (completed under 009); any new requirement not in 009/010.

### Risks

| Risk | Mitigation in this story |
|---|---|
| A deferred gate is later read as passed because 009/010 show Done | Common rule above; every AC reads "unrun, owner X" until evidenced; @qa AC-12 traceability |
| Go-live or a first real-model call before U13 acknowledgement | AC-7 states it must precede any go-live on real systems and the first real-model call |
| Unlimited CSI budget means no cost ceiling until the future RBAC version | User decision 2026-10-23, accepted as stated; price list reported per AC-11 a for visibility only |
| Outside owners (Platform/SRE, ED-01, ED-02, S&C) never deliver | Each AC names its owner; nothing is synthesised; T5 @pm acceptance cannot sign without evidence |
| Stale evaluation caps mislead benchmark reporting | AC-11 b recalibration with AC-8 |

### Definition of Done

Every AC has an evidence path credited by @qa (or, for AC-13(f), stays recorded as descoped by the user), @qa's traceability review against the mapping tables passes, and @pm records AC-12 acceptance. No AC closes by waiver, inference or local synthetic evidence.

### Notes

- Model access RBAC is a dependency on a future version, not delivered or gated here (user, 2026-10-23).
- Nothing here authorises a deployment, schedule activation, credential use or push; those stay with @devops and the applicable controls.
- Source line numbers in 009/010 move; cite by section and item ID.

## Testing

Evidence review and requirements traceability by @qa against each cited 009/010 item and the 009/010 "PO closure — 2026-10-23" mapping tables; deployed smoke, pid record, in-pod check, Vault policy test and benchmark are run by their owners on real infrastructure. Local synthetic runs give no credit.

## CodeRabbit Integration

Documentation and evidence story; CodeRabbit focus is markdown quality and reference validity. Record an unavailable tool and use the configured independent review fallback. Never invent a CodeRabbit PASS.

## File List

- `docs/stories/STUDIO-OBSERVED/STUDIO-OBS-016.story.md` (new)
- Evidence records under `docs/qa/evidence/STUDIO-OBS-016/` (new, per AC as executed)

## Dev Agent Record

(empty)

## QA Results

(empty)

## Change Log

| Date | Version | Description | Author |
|---|---|---|---|
| 2026-10-23 | 0.1.0 | Draft created from the user's 2026-10-23 decision to close STUDIO-OBS-009 and STUDIO-OBS-010 on local scope and defer all other outside-owner gates. AC-1…AC-18 each cite their 009/010 source; no new requirement. | @sm (River) |
| 2026-10-23 | 0.1.1 | Root ruling: added AC-14…AC-18 (G-1/G-2/G-3, C-2/C-3; OBS-014 compliance approvals and F04; D-B and ED-05 remainder; KL-015-R1/D5 and SEC-AUDIT-PREREADY-01; C17 review). TF-5/U14 and KL-015-GRANT deliberately not carried. | @sm (River) |
| 2026-10-23 | 0.1.2 | PO fold of QA round 075 (`G/round-075/qa-gate/GATE.md` §1 O1, §4 O2/O3) and of the 009/010 closure mapping. O3: AC-11 reworded so budget admission follows the user's "Both: no gate, no cap" decision; price list informational only; U17/U7 resolved by the decision. O1: AC-11 b recalibrates `CODE_DEFAULT_CAPS` (cli.mjs) and the `measureProposals` default (evaluate.mjs) with the AC-8 benchmark. O2: new AC-19 (F1, F2, B2/B3 + N-RS1, PLANFIX-ARCHIVE) and AC-20 (live revocation, D2 step 6 + residue-image smoke, R8.2 d/e; plus the deployed halves of 009 AC-10 wire canaries, AC-11 worker-profile dispatch and AC-12 deployed E2E, found unhomed during the mapping). Mapping completeness: AC-8 names RS-1; AC-13 adds (h)–(l); new AC-21 (010 runbook/Live-surface remainder) and AC-22 (010 release readiness, 10.34, @devops handoff, release checklist). Tasks T1/T3/T4/T4c/T5, Scope, Risks and Definition of Done added. Every new AC cites its 009/010 source; no new requirement. | @po (Pax) |
| 2026-10-23 | 0.1.3 | Validated GO (9/10) — Status: Draft → Ready | @po (Pax) |
