# Story STUDIO-OBS-010 — Nontechnical pilot, single-path runbook and release readiness

| Field | Value |
|---|---|
| Story ID | STUDIO-OBS-010 |
| Status | **Ready** |
| Epic | Studio observed authoring |
| Depends on | STUDIO-OBS-009 |
| Dependency notes | The pilot opens only after OBS-009 AC-7 (the ADR-SC-005 D-C benchmark gate) is **passed**, not merely run. OBS-011 may run in parallel to this story once OBS-009 is Done, but must not remove anything on this story's dated "Live surface" list — write that list first (T2). Human participants, the compliance approval, ED-02 and the D-B confirmation are external prerequisites, never fabricated. |
| Source | docs/architecture/ADR-SC-005-single-path-observed-authoring.md (D-B residual, D-C, "Security work becomes stories" (approval gated here), "Operations", placement map row OBS-010, Supersedes GA plan D-1/§6) · docs/specs/studio-observed-authoring/secret-login-design.md R3 §4.3 (R1-2 statement), §4.6 I-B7/I-C8/I-C9, §8 Q3, §10 row OBS-010 · docs/specs/studio-observed-authoring/secret-login-security-review.md condition 10, R1-2 · docs/epics/UI-STUDIO-GA-PLAN.md §4.B, §4.C C-2/C-3, §4.F F-2, §4.J, §7 ("OBS-010 merges with the pilot/10.34 evidence") · docs/stories/10.34.story.md (staging acceptance register) · UX panel 2026-10-09 (state copy the pilot script uses) |
| Size | M |

executor: "analyst"
quality_gate: "pm"
sdc_reviewer: "qa"
quality_gate_tools: [requirements-traceability, evidence-review, release-checklist]

## Story

As a Studio product owner, I want to validate with real nontechnical users that they can author, log in with their secrets, resolve a clarification and re-learn a changed step without learning technical syntax, and to consolidate every gate — including the external compliance, Vault, authorization and deployment-history confirmations — into one honest release-readiness record with an operable runbook, so that the single observed path is released only when the evidence actually supports it.

## Acceptance Criteria

1. **AC-1 — Pilot preparation (gated on D-C).** A consented formative pilot with at least five nontechnical users is prepared on the **login workflow**: a checklist that reaches a login-protected page using `<var USER>`/`<secret PASS>` steps inserted through the OBS-008 reference picker, a grounded ambiguity to resolve, and one edit of a middle step followed by a Run that re-learns only from that step (OBS-015). The pilot script uses the OBS-008 state copy verbatim. The pilot does not start until OBS-009 AC-7 reports the D-C gate passed (≥ 90 %, zero false-pass, zero leak). No external person is contacted or recruited without explicit user authorization; participant access, test secrets and approved origins are identified as prerequisites, not assumed. [ADR-SC-005 D-C "Before any human pilot"; placement map row OBS-010; consensus plan §11]

2. **AC-2 — Pilot execution and observations.** Each participant authors and runs the workflow, resolves the ambiguity and performs the incremental re-learn without capture syntax, selectors or developer instructions; anonymized observations and outcome denominators are recorded (completed / needed help / abandoned, time to first Run, clarification understood yes/no, "Steps changed — next Run learns from step k" understood yes/no). Whether a participant recovers unaided from the blocked-by-login guidance is recorded. Simulated users cannot replace this gate. [consensus plan §11 "formative test"; GA plan §4.I I-1; UX panel copy]

3. **AC-3 — Remediation loop.** Usability failures are routed into scoped remediation stories and the affected task is rerun with evidence of the failed attempts preserved; the promised plain-language experience is not reduced to make results pass. [consensus plan §11]

4. **AC-4 — Release readiness record.** One record (`docs/qa/evidence/studio-observed-authoring/release-readiness.md`, fixed row shape: gate · owner · state · evidence path · date) consolidates: implementation (OBS-007/012A/012B/013/014/015/008), deployment and live proof incl. the D-C benchmark report (OBS-009), secret-login proof, usability (this story), compatibility/drain/rollback (OBS-006 runbook as amended), evidence retention, and the **10.34 staging acceptance re-registered against the single path** (the legacy-path groups no longer apply as written; each group is re-cut, carried or closed with a reason). Explicit **external gates**, each with current state and owner, none of which may read "obtained" without the evidence path: **G-1** (guided mTLS chain in shared environments), **G-2** (no real credential in Vault until every secret-bearing hop is TLS-authenticated), **G-3** (no scheduled secret-referencing run before production background and secret-use authorization sources exist), GA **C-2** (production `StudioSecretUseAuthorization` source) and **C-3** (Vault provider enablement) — owner ED-02; the **OBS-014 compliance approvals** (page-metadata/origin export to the gateway; retention of sanitized observations and model output; gateway-side retention answer from ED-01's owner); the **D-B confirmation** that nothing was ever deployed from an internal remote (owner: user / Platform-SRE); ED-01 gateway owner named (today TBD). Any pending external item prevents release readiness. [ADR-SC-005 D-B residual, "Security work becomes stories", "Operations"; design §4.6 I-C8; security review condition 10 / F-9; GA plan §4.B, §4.C, §4.J, §7]

   **AC-4 clarification — two OBS-014 residuals the record must carry (@po (Pax) 2026-10-13; record `docs/qa/evidence/STUDIO-OBSERVED-NEXT/po-ar2-notes.json` notes 1 and 2; source OBS-014 AC-2 clarification R-1/R-2, architect AR-2). Clarifies row content only; the AC-4 text and meaning are unchanged.**

   a. **R-1 (retention residual):** the "OBS-014 compliance approvals — retention of sanitized observations and model output" row cites the `guided-data-flow.md` section that names the stores AC-3 does not prune and their indefinite retention, plus the state of the @pm follow-up story. If Security & Compliance approve only with those stores pruned, the follow-up becomes a pending item under this AC ("any pending external item prevents release readiness"). It is never passed by omission.

   b. **R-2 (two policy sources):** one row names the interim state. Learning uses the governed policy, and replay uses the configured `TrustedPolicy`, with governance able to narrow but never widen. It gives the @pm follow-up story and its state. Whether the follow-up blocks release is for @pm/@architect to classify, not for this record to assume. The AC-5 "governed read/discovery policy administration" runbook row states the same interim behaviour (OBS-014 AC-2 clarification b).

   c. **Artifact HMAC (STUDIO-OBS-F04), a named-residual decision point.** This clause was added on 2026-10-13 by Morgan (@pm) on the lead's instruction, from architect ruling `docs/qa/evidence/STUDIO-OBSERVED-NEXT/ar-ac11-and-refusal-codes.json`, ruling 1. It clarifies row content only and is open to @po ratification. The record carries one row for README follow-up item **STUDIO-OBS-F04** (artifact HMAC via Vault Transit). That row either shows F04 landed, with its evidence path, before any deployed observed-replay pilot, or it shows the external OBS-010 security review's acceptance of its absence as a **named residual, with an owner recorded**. Its external prerequisites E1–E8 (owner Platform/SRE; recorded next to ED-02) are listed with their state. While neither outcome holds, the row is pending, and it is never passed by omission.

5. **AC-5 — Operations runbook (single path).** `docs/runbooks/studio-guided-authoring.md` (or a linked secrets runbook) is rewritten to the single path: account-provider and compile/legacy text removed; rows for: secret provisioning per CSI/environment/test with `allowedOrigins` — including the statement that an `allowedOrigins` entry asserts the **whole origin's content is trusted** (R1-2); rotation (artifact hash unchanged, audit versions differ); revocation incl. the mid-run bound (one control poll plus one in-flight step); audit retention window (design §8 Q3 default); the single 4096-character bound; the **multi-password and non-password limit** (unsupported at GA, no fallback — ADR default); heap/core-dump controls (I-B7); Vault least-privilege policy and KV v2 history residual (I-C9); mTLS/TLS chain and client-certificate **rotation inputs** from OBS-009 (SEC-4, G-2); **dev-database recreation after the D-B re-baseline** (command from OBS-012A evidence); governed read/discovery policy administration (OBS-014); incremental re-learn semantics for operators ("Learn again" from the first changed step, D-D); gates G-1/G-2/G-3. It also contains a dated **"Live surface"** list naming the public routes (`/api/v1/studio/**` incl. guided-sessions and video), `contracts/v3` documents, configuration keys (incl. the on-by-default flags and the `studio.execution.enabled` kill switch), migrations `V1`–`V18` (+ forward-only additions), chart values and runner config keys that are live after this wave — the list OBS-011 must not remove from. [design §4.3, §4.6, §10 row OBS-010; security review R1-2, condition 10; ADR-SC-005 "Operations", defaults "Secrets", D-D]

   **AC-5 addition — clock synchronisation row (inherited from STUDIO-OBS-012A; architect ruling `docs/qa/evidence/STUDIO-OBS-012A/root/architect-ruling-r9-r10.json`, adjacent findings R9-OBS-1 and R9-OBS-2, 2026-10-13).** In 012A, replay-grant times are minted and judged on the database clock (R9 option B). The ruling deliberately leaves two cross-host clock comparisons in place:

   a. **R9-OBS-2, the runner pre-admission check.** The runner's `submitObserved` validates the grant with the runner's own `Date.now()`. `studio-runner/src/validator/observedReplay.ts:427` requires `issuedAt <= now` with zero tolerance. If the runner clock is behind the minting clock by more than the mint-to-submit latency, a valid grant is refused with 409 `AUTHORIZATION_EXPIRED`.

   b. **R9-OBS-1, the acceptance deadline.** API replicas and workers stamp `pending_deadline_at` (`acceptedAt` + the 600 s pending SLA) from the JVM clock. Dispatch judges it against the database `clock_timestamp()`.

   The runbook gets one row covering both: runner, API (every replica and worker) and database hosts are NTP-synced. **The stated skew bound is owed by Platform/SRE.** Until they provide it, the row reads "bound owed, owner Platform/SRE", and no number is invented. The row names the symptom from (a) so an operator can recognise it. It never offers a tolerance or a longer grant window as a remedy; the 30 s grant window is not lengthened. This adds one row to the list above. AC-5's meaning is unchanged.

6. **AC-6 — Devops handoff.** An exact-path handoff for any requested PR/push/release lists gate results, open external gates and risks; deployment, schedule activation and production actions are not triggered by this story. [Full SDC; consensus plan §10]

## Tasks / Subtasks

- [ ] **T0 — Prerequisites (AC-1).** Confirm OBS-009 Done and the D-C gate passed; obtain user authorization for participant contact; identify participant access, test secrets (provisioned per the runbook draft) and approved origins; freeze the pilot script against the OBS-008 UI copy.
- [ ] **T1 — Pilot (AC-2, AC-3).** Run sessions; record anonymized observations and denominators; route failures into remediation stories; rerun affected tasks; preserve failed-attempt evidence.
- [ ] **T2 — Runbook and Live surface (AC-5).** Write the rows and the dated "Live surface" list **before OBS-011 T0**; cross-check every row against OBS-007/009/012A/014 evidence (no row describes an unimplemented control as live).
  - [ ] Clock synchronisation row (AC-5 addition, R9-OBS-1/R9-OBS-2): NTP for runner, API and DB hosts; skew bound recorded as provided by Platform/SRE or "owed, owner Platform/SRE"; symptom named; no tolerance or window remedy.
- [ ] **T3 — Release readiness (AC-4).** Consolidate gates with current state; re-register 10.34 against the single path; name every external pending item and owner.
- [ ] **T4 — Handoff (AC-6).** Prepare the @devops handoff; submit to independent @qa for traceability review; only QA can set Done.

## Dev Notes

- Human participation, staging application, secret provisioning, compliance approval and the D-B confirmation are genuine external prerequisites; they are not silently excluded from completion and are not fabricated (wave README; ADR-SC-005 D-B "recorded as owed, not obtained").
- The runbook today (`docs/runbooks/studio-guided-authoring.md`) describes OBS-006's publication/replay operations; OBS-007 and OBS-013 each correct one sentence; this story rewrites it for the single path. The V19/V33 compatibility and rollback sections are **no longer true** after OBS-012A's re-baseline — replace them with the V1–V18 baseline and the dev-DB recreation row (the 10.51 "rewrite live docs" precedent applies; the old text is history in git).
- 10.34 (Groups A–N) was the production-ready gate for the **legacy** path (GA plan §4.B). ADR-SC-005 places "10.34 re-registered against the single path" here: each group is re-cut (still applies to the single path), carried (external) or closed (legacy-only) with a reason; no group is marked passed without evidence.
- Residuals that must appear honestly: JVM/JS string copies, child-memory residency for the run, operator-triggered dumps, KV v2 history, same-origin script exfiltration (R1-2), page-echoed secrets visible in video, one-poll revocation window, gateway-side retention unknown until ED-01 answers.
- GA plan path-independent items (CSRF D-1, schedule activation E-1/E-2, evidence store F-1, operability G-*, repo/CI A-*) are listed in the record as **tracked in the GA plan** with their state, not closed here.

### PO validation — 2026-10-09 (0.2.x dual-path draft) — SUPERSEDED by the ADR-SC-005 re-cut; historical

> Verdict then: **GO 8/10 — Draft → Ready**, report `.ai/STUDIO-OBS-010-po-validation-r2.json`. Carried forward as recommendations: (1) explicit user authorization recorded before any participant contact, prerequisites listed with owners (ED-02 "PUT Core / BFF"); (2) each gate carries a current-state line pointing at an evidence file or "unrun, owner X" — the record cannot say "ready" while any external item is pending; (3) the dated "Live surface" list is written before OBS-011 T0; (4) fixed row shape for the record. Its condition "runbook rewrite touches only the account sentence; V19/V33 sections remain true" is **void** — D-B re-baselines the migrations.

## Testing

Human task observations with anonymized records and denominators; independent @qa traceability review of the release-readiness record against OBS-007…015 gate files, QA reports and the OBS-009 benchmark report; a checklist pass over the runbook asserting each row cites the implementing story's evidence; `release-checklist.md` executed by @devops on handoff. Participant availability and external approvals are prerequisites, not evidence the analyst can fabricate.

## CodeRabbit Integration

### Story Type Analysis

Primary: Research/pilot and release documentation. Complexity: medium.

### Specialized Agents

@analyst owns execution; @pm provides the product gate; @devops receives the handoff; independent @qa owns the SDC verdict and Done transition.

### Quality Gates

- [ ] Evidence and runbook reviewed against implementing-story records.
- [ ] Independent SDC QA traceability review.
- [ ] Release checklist (`.aiox-core/product/checklists/release-checklist.md`) executed by @devops on handoff; nothing deployed by this story.

### Self-Healing and Focus Areas

Documentation story: CodeRabbit focus is markdown quality and reference validity; QA full review limits apply. Record an unavailable tool and use the configured independent review fallback. Never invent a CodeRabbit PASS.

## File List

- `docs/qa/evidence/studio-observed-authoring/usability-pilot.md` (new)
- `docs/qa/evidence/studio-observed-authoring/release-readiness.md` (new)
- `docs/runbooks/studio-guided-authoring.md` (single-path rewrite; new rows; "Live surface" list)
- `docs/runbooks/studio-secrets-provisioning.md` (new, optional — only if the guided runbook becomes unreadable; otherwise a section)
- `docs/stories/10.34.story.md` (dated re-registration note only; the register itself per its own process)
- `docs/stories/STUDIO-OBSERVED/STUDIO-OBS-010.story.md`

Not owned here: code, charts, contracts, migrations (OBS-007…015, 009); `docs/epics/UI-STUDIO-GA-PLAN.md` (coordinator-owned; linked).

## PO Validation (2026-10-10) — single path (0.3.x)

**Verdict: GO (8/10) — Status: Draft → Ready.** Report `.ai/STUDIO-OBS-010-po-validation-sp.json`. Validated by Pax (@po) against ADR-SC-005 (D-B residual, D-C, "Security work becomes stories", "Operations", placement map row OBS-010, Supersedes GA plan D-1/§6). The 0.2.1 verdict stays superseded history. Thin and bounded: six ACs, six files, no code.

**10-point checklist:** 1–10 PASS. Executor `analyst` / gate `pm` matches the Research row.

**Anchors spot-checked at HEAD (working tree 2026-10-10):** runbook `studio-guided-authoring.md:7` (V33) and `:41` "Staged V19 compatibility and rollback" exist and are the sections AC-5 replaces; `docs/stories/10.34.story.md` Groups A–N (`:66` Group A) exist; GA plan `:202` "OBS-010 merges with the pilot/10.34 evidence"; design R3 `:16,:109` R1-2 whole-origin statement, `:107` §4.1 Q3 retention default, `:263` §10 row OBS-010; security review condition 10 `:60`; ADR D-B records the deployment-history confirmation as "owed, not obtained"; `.aiox-core/product/checklists/release-checklist.md` exists (L2 — executed by @devops, never edited).

**Should-fix (non-blocking):**
1. AC-5 lists roughly fifteen runbook rows — at T2 add a row → implementing-story evidence table to the Dev Agent Record so @qa's "each row cites evidence" pass is mechanical.
2. AC-4: for ED-01 "owner TBD", record who was asked and when, not only the state.

**GO conditions:** the pilot never starts before OBS-009 AC-7 reports the D-C gate **passed**; no participant is contacted without explicit user authorization; the dated "Live surface" list is written at T2 before OBS-011 T0; the release record cannot read "ready" while any external gate (G-1/G-2/G-3, C-2/C-3, OBS-014 approvals, D-B confirmation, ED-01 owner) is pending; only independent @qa sets Done.

## Carried review follow-ups — 2026-10-14

[placement-key: resumed-qa-20261014:STUDIO-OBS-010]

Pax places the accepted nonblocking concerns from the completed 012B/013/014 reviews here. These remain open work under the existing anchors below; this placement changes no AC text, task, lifecycle status or external gate. Source and acceptance limits: [`po-closure-placements.json`](../../qa/evidence/STUDIO-OBSERVED-NEXT/resume-20261014/po-closure-placements.json).

- **VIDEO-LOGGING** (013:TEST-003; AC-4 evidence access / AC-5 runbook; owner @architect + @dev evidence owner): Reconcile AR-1 INFO+ bucket/endpoint log prohibition with shared VideoObjectServer WARN cause logging. Record a dated ruling and implement the agreed log-capture assertion if required. Body/header tests do not prove logs; no plaintext secret leak was identified. Open follow-up; no pass or waiver supplied by closure.
- **CACHE-REAUTH** (014:D-2b cached 2xx reauthorization; AC-4 security readiness / UI-STUDIO-GA-PLAN D-2b; owner @qa security + platform/backend): Keep D-2b open for cached 2xx responses, including governed-policy POST caching. The five policy operations are two GET and three POST. Record the security disposition and supporting reauthorization evidence; current idempotency tests do not resolve it. Open security-readiness item; release record may not silently mark it resolved.
- **AUDIT-LABEL-PRIVACY** (014:SEC-003; AC-4 Security & Compliance decision; owner Security & Compliance; @pm for any mitigation follow-up): Carry the disclosed dictionary-recovery risk of truncated unkeyed SHA-256(scopeHash:label) targetLabelHash into the explicit compliance decision. If keyed audit-label hashing is required, @pm owns a separate architect-first mitigation backlog/story before the affected approval. F04 remains artifact HMAC only and supplies no audit-label mitigation. No compliance acceptance is claimed. A required mitigation stays a pending external approval item until implemented and reviewed.
- **EXTERNAL-READINESS** (014:R-1 indefinite guided stores, 014:R-2 learning versus replay policy sources, 014:Exact-field nonscalar reads, 014:Artifact HMAC / external E1-E8, 014:Compliance approval and gateway retention ED-01; AC-4 existing F01–F04 rows / AC-5; owner @pm + @architect + Security & Compliance + Platform/SRE + gateway owner): Retain F01 indefinite-store retention, F02 separate learning/replay policy, F03 evidence-gated nonscalar reads and F04 artifact-HMAC conditions exactly as the README states. F04 is pilot-blocking by default unless externally accepted as a named residual; E1–E8 remain UNCONFIRMED and E1–E4 gate implementation. Keep ED-01 retention, compliance approval, D-B, ED-02, G-1/G-2/G-3, C-2/C-3, SIEM/Q3 and dev-DB recreation explicitly open where recorded. No source or gate promotion occurs here. The closure accepts scoped CONCERNS only, never external release approval.
- **RECORDING-RUNBOOK-COPY** (013:MNT-001; AC-5 playback runbook; owner @dev evidence owner): Use the neutral recording wording agreed in OBS-008 for unavailable/expired guided evidence; keep status/code semantics and actual storage limitations explicit. Open follow-up; no pass or waiver supplied by closure.


### Strict local-proof reconciliation — 2026-10-14

The dated CONCERNS placement list above is retained as history. Current dispositions below follow independent strict Quinn approval of 013/014 and the existing strict 012B closure. Existing acceptance criteria, tasks, lifecycle and external gates are unchanged. Full source/proof links: [`closure-placements-reconciliation.json`](../../qa/evidence/STUDIO-OBSERVED-NEXT/strict-qa-20261014/po/closure-placements-reconciliation.json).

- **VIDEO-LOGGING**: 013 closes A13-5 with fixed safe logging and four captured full-throwable metadata/range tests across shared execution/guided subjects; final normal backend is green. No local logging validation is deferred to 010. Accurate evidence-access/runbook disclosure remains; no observed plaintext secret leak is claimed. [reconciliation-key: strict-qa-20261014:VIDEO-LOGGING]
- **CACHE-REAUTH**: D-2b cached 2xx reauthorization remains open, including the two GET and three POST policy operations. Context-policy forgery refusal and idempotency tests do not resolve it. [reconciliation-key: strict-qa-20261014:CACHE-REAUTH]
- **AUDIT-LABEL-PRIVACY**: The unkeyed truncated targetLabelHash dictionary-recovery risk still requires its explicit Security/Compliance disposition. If mitigation is required, PM owns a separately designed follow-up. F04 artifact HMAC does not fix audit-label hashing. [reconciliation-key: strict-qa-20261014:AUDIT-LABEL-PRIVACY]
- **EXTERNAL-READINESS**: F01 indefinite non-AC3 stores, F02 learning/replay policy sources and its architect/015/security conditions, F03 benchmark-gated non-scalar reads, and F04 artifact HMAC retain every README condition. E1–E8 remain UNCONFIRMED, E1–E4 gate F04 start and F04 blocks a deployed replay pilot unless externally accepted as a named residual. Gateway/ED-01 retention, Vault/ED-02, staging, SIEM/Q3, G-1/G-2/G-3, C-2/C-3, D-B, Security/Compliance and user dev-DB recreation are not obtained. [reconciliation-key: strict-qa-20261014:EXTERNAL-READINESS]
- **RECORDING-RUNBOOK-COPY**: Use the neutral recording wording agreed by OBS-008 when writing the single-path runbook; retain exact status/code semantics and honest storage limitations. That work remains open. [reconciliation-key: strict-qa-20261014:RECORDING-RUNBOOK-COPY]

## Dev Agent Record

Not started. Draft preparation only; no implementation evidence yet.

## QA Results

Not reviewed. No quality verdict assigned.

## Change Log

| Date | Version | Change | Author |
|---|---|---|---|
| 2026-10-08 | 0.1.0 | Draft derived from approved observed-authoring consensus plan for SDC intake | SM preparation |
| 2026-10-09 | 0.2.0 | **Rescoped** after the 2026-10-09 decision: login-workflow pilot; secret-login proof; runbook rows; gates G-1/G-2/G-3 and C-2/C-3; merges with 10.34; "Live surface" list; 6 ACs; Status Draft | @sm (River) |
| 2026-10-09 | 0.2.1 | Validated GO (8/10) — Status: Draft → Ready (dual-path draft). Report `.ai/STUDIO-OBS-010-po-validation-r2.json` | @po |
| 2026-10-09 | 0.3.0 | **Re-cut to the single path (ADR-SC-005).** Pilot gated on the D-C benchmark pass and extended with an incremental re-learn task (D-D); release record adds the OBS-014 compliance approvals, the D-B deployment-history confirmation and the ED-01 owner as external gates and re-registers 10.34 against the single path; runbook rewritten for one path (legacy/compile text removed, dev-DB recreation after D-B, mTLS/TLS rotation inputs, policy administration, no-fallback multi-password limit); "Live surface" list names `/api/v1/studio/**`, `contracts/v3`, V1–V18, flags and kill switch. Prior PO GO (0.2.1) marked superseded and kept as history. Status **Ready → Draft**, pending @po re-validation | @sm (River) |
| 2026-10-10 | 0.3.1 | Validated GO (8/10) — Status: Draft → Ready (single-path draft). Report `.ai/STUDIO-OBS-010-po-validation-sp.json` | @po |
| 2026-10-13 | 0.3.2 | AC-5 addition: one clock-synchronisation runbook row placed from architect ruling `docs/qa/evidence/STUDIO-OBS-012A/root/architect-ruling-r9-r10.json`, adjacent findings R9-OBS-2 (the runner's zero-tolerance `issuedAt <= Date.now()` pre-admission check) and R9-OBS-1 (`pending_deadline_at` stamped by the JVM, judged by the DB). Runner, API and DB hosts are NTP-synced; the skew bound is owed by Platform/SRE and never invented; no tolerance or window remedy. Placement record `root/po-placements-r9-r10.json`; matching T2 sub-item. AC meaning, other ACs and Status (**Ready**) are unchanged | @po (Pax) |
| 2026-10-13 | 0.3.3 | AC-4 clarification a–b for the two OBS-014 residuals that architect AR-2 handed to @po. Record `docs/qa/evidence/STUDIO-OBSERVED-NEXT/po-ar2-notes.json`. **R-1:** stores that AC-3 does not prune are retained indefinitely. The compliance-retention row cites the data-flow section and the state of the @pm follow-up, and becomes pending if Security & Compliance require pruning. **R-2:** two policy sources, learning governed and replay configured; one row records the interim state and the @pm follow-up, and the AC-5 policy-administration row states the interim behaviour. AC text and meaning, tasks and Status (**Ready**) are unchanged | @po (Pax) |
| 2026-10-13 | 0.3.4 | AC-4 clarification c: one release-readiness row points to README follow-up **STUDIO-OBS-F04** (artifact HMAC via Vault Transit) as a named-residual decision point. Either F04 lands before any deployed observed-replay pilot, or the OBS-010 security review accepts its absence as a named residual with an owner. E1–E8 (Platform/SRE, UNCONFIRMED) are recorded next to ED-02. Source: architect ruling `docs/qa/evidence/STUDIO-OBSERVED-NEXT/ar-ac11-and-refusal-codes.json`, ruling 1. AC text and meaning, tasks and Status (**Ready**) are unchanged. Added on the lead's instruction and open to @po ratification | @pm (Morgan) |
| 2026-10-14 | 0.3.5 | Recorded owned resumed-QA follow-ups in the dated carried-review section; source `resume-20261014/po-closure-placements.json`. Existing AC/task text and meaning and Status Ready preserved; no follow-up or external approval marked complete. | @po (Pax) |
