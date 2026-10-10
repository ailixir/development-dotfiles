# Story STUDIO-OBS-010 — Nontechnical pilot, secret-login runbook and release readiness

| Field | Value |
|---|---|
| Story ID | STUDIO-OBS-010 |
| Status | **Ready** |
| Epic | Studio observed authoring |
| Depends on | STUDIO-OBS-009 |
| Source | docs/specs/studio-observed-authoring/consensus-plan.md §§10–12 · secret-login-design.md §4.3 (R1-2 statement), §4.6 (I-B7, I-C8 gates, I-C9), §8 Q3, §10 · secret-login-security-review.md condition 10, R1-2 · UI-STUDIO-GA-PLAN.md §4.C C-2/C-3, §4.J, §7 knock-on ("OBS-010 merges with the pilot/10.34 evidence") |
| Size | M |

executor: "analyst"
quality_gate: "pm"
sdc_reviewer: "qa"
quality_gate_tools: [requirements-traceability, evidence-review, release-checklist]

## Story

As a Studio product owner, I want to validate with real nontechnical users that they can author, log in with their secrets and clarify a test without learning technical syntax, and to consolidate every gate into one honest release-readiness record with an operable runbook, so that the guided experience is released only when the evidence — including the external compliance gates — actually supports it.

## Acceptance Criteria

1. **AC-1 — Pilot preparation.** A consented formative pilot with at least five nontechnical users is prepared on the supported workflow, which is now the **login workflow**: a checklist that reaches a login-protected page using `<var USER>`/`<secret PASS>` login steps inserted through the OBS-008 reference picker, then a grounded ambiguity to resolve. No external person is contacted or recruited without explicit user authorization; needed participant access, test secrets and approved origins are identified as prerequisites, not assumed. [consensus §11; design §10 OBS-010 row]

2. **AC-2 — Pilot execution and observations.** Each participant authors and runs the workflow and resolves the grounded ambiguity without capture syntax, selectors or developer instructions; anonymized observations and outcome denominators are recorded (completed / needed help / abandoned, time to first Run, clarification understood yes/no). Where a participant encounters the blocked-by-login guidance, whether they recover from it unaided is recorded as an observation. Simulated users cannot replace this gate. [consensus §11 "formative test"; GA plan §4.I I-1]

3. **AC-3 — Remediation loop.** Usability failures are routed into scoped remediation stories and the affected task is rerun with evidence of the failed attempts preserved; the promised plain-language experience is not reduced to make results pass. [consensus §11]

4. **AC-4 — Release readiness record.** One record consolidates: implementation (OBS-007/008), live proof and deployment hardening (OBS-009), secret-login proof (replacing the former "account integration" line), usability (this story), compatibility/drain/rollback (OBS-006 runbook), evidence retention, and the 10.34 staging-acceptance evidence it merges with (GA plan §7). Gates **G-1** (guided mTLS chain in shared environments), **G-2** (no real credential in Vault until every secret-bearing hop is TLS-authenticated) and **G-3** (no scheduled secret-referencing run before production background and secret-use authorization sources exist) are listed as release gates with their current state; GA items **C-2** (production `StudioSecretUseAuthorization` source) and **C-3** (Vault provider enablement) are explicit external gates. Any external pending evidence stays explicit and prevents release readiness. [consensus §§10–12; design §4.6 I-C8; security review condition 10 / F-9; GA plan §4.C, §4.J]

5. **AC-5 — Operations runbook.** `docs/runbooks/studio-guided-authoring.md` (or a linked secrets runbook) is updated to the decided flow, removing account-provider text, and gains rows for: secret provisioning per CSI/environment/test with `allowedOrigins` — including the statement that an `allowedOrigins` entry asserts the **whole origin's content is trusted** (no user-generated content) because origin binding is the trust boundary (R1-2); rotation (artifact hash unchanged, audit versions differ); revocation including the mid-run bound (one control poll plus one in-flight step); audit retention window (design §8 Q3 default: existing pruner window); the single 4096-character value bound (F-5); the multi-password-page limit (guided unsupported, legacy author-named targets); heap/core-dump operational controls (I-B7); Vault least-privilege policy and KV v2 version-history residual (I-C9); guided-bridge key/issuer/token-rotation inputs from OBS-009 (SEC-4); gates G-1/G-2/G-3. It also contains a dated **"Live surface"** list naming the routes, contracts (v3), configuration keys and migrations that are live after this wave — the list OBS-011 must not remove from. [design §4.3, §4.6, §10; security review R1-2, condition 10]

6. **AC-6 — Devops handoff.** An exact-path handoff for any requested PR/push/release lists gate results, open external gates and risks; deployment, schedule activation and production actions are not triggered by this story. [Full SDC; consensus §10]

## Tasks / Subtasks

- [ ] **T0 — Prerequisites (AC-1).** Confirm OBS-009 Done; obtain user authorization for participant contact; identify participant access, test secrets (provisioned per the runbook draft) and approved origins; freeze the pilot script against the OBS-008 UI.
- [ ] **T1 — Pilot (AC-2, AC-3).** Run sessions; record anonymized observations and denominators; route failures into remediation stories; rerun affected tasks; preserve failed-attempt evidence.
- [ ] **T2 — Runbook (AC-5).** Write the rows listed in AC-5 and the dated "Live surface" list; cross-check every row against OBS-007/009 evidence (no row describes an unimplemented control as live).
- [ ] **T3 — Release readiness (AC-4).** Consolidate gates with current state; merge with 10.34 staging acceptance; name every external pending item and its owner.
- [ ] **T4 — Handoff (AC-6).** Prepare the @devops handoff; submit to independent @qa for traceability review; only QA can set Done.

## Dev Notes

- Human participation and any staging application/secret provisioning are genuine external prerequisites; they are not silently excluded from completion and are not fabricated (wave README).
- The runbook today (`docs/runbooks/studio-guided-authoring.md`, 51 lines) describes OBS-006's publication/replay operations and still says "It does not provide account connectivity (OBS-007)… An unconfigured account provider refuses" — that sentence is corrected minimally by OBS-007 and rewritten here. Keep the V19/V33 compatibility, rollback and evidence sections; they remain true.
- Gate definitions come from design §4.6 I-C8 (G-1, G-2, G-3); the production authorization sources (C-2) and Vault provider (C-3) are outside this repository (GA plan §4.B ED-02). Record them as external with owner "ED-02 (PUT Core / BFF)" as the GA plan names it.
- 10.34 staging acceptance (Groups A–N) is the production-ready gate for the legacy path (GA plan §4.B); this story merges guided evidence into that record rather than creating a parallel one (GA plan §7 "OBS-010 merges with the pilot/10.34 evidence").
- Residuals that must appear in the record honestly (design): JVM/JS string copies, child-memory residency for the run, operator-triggered dumps, KV v2 history, same-origin script exfiltration (R1-2), page-echoed secrets visible in video, one-poll revocation window.
- Preserve 10.51's precedent for documentation: dated notes on dated records, rewrites only on live docs.

## Testing

Human task observations with anonymized records and denominators; independent @qa traceability review of the release-readiness record against OBS-007/008/009 gate files and QA reports; a checklist pass over the runbook asserting each row cites the implementing story's evidence. Participant availability is an external prerequisite, not evidence the analyst can fabricate.

## CodeRabbit Integration

### Story Type Analysis

Primary: Research/pilot and release documentation. Complexity: medium.

### Specialized Agents

@analyst owns execution; @pm provides the assigned product gate; @devops receives the handoff; independent @qa owns the SDC verdict and Done transition.

### Quality Gates

- [ ] Evidence and runbook reviewed against implementing-story records.
- [ ] Independent SDC QA traceability review.
- [ ] Release checklist (`.aiox-core/product/checklists/release-checklist.md`) executed by @devops on handoff; nothing deployed by this story.

### Self-Healing and Focus Areas

Documentation story: CodeRabbit focus is markdown quality and reference validity; QA full review limits apply (three iterations, 30 minutes). Record an unavailable tool and use the configured independent review fallback. Never invent a CodeRabbit PASS.

## File List

- `docs/qa/evidence/studio-observed-authoring/usability-pilot.md` (new)
- `docs/qa/evidence/studio-observed-authoring/release-readiness.md` (new)
- `docs/runbooks/studio-guided-authoring.md` (rewrite of the account sentence; new rows; "Live surface" list)
- `docs/runbooks/studio-secrets-provisioning.md` (new, optional — only if the guided runbook becomes unreadable; otherwise a section)
- `docs/stories/STUDIO-OBSERVED/STUDIO-OBS-010.story.md`

Not owned here: code, charts, contracts, migrations (OBS-007/009); `docs/epics/UI-STUDIO-GA-PLAN.md` (coordinator-owned; this story links to it).

## PO Validation (2026-10-09)

**Verdict:** GO — readiness 8/10 (confidence High for scope; execution depends on human participants and OBS-009 Done). Status Draft → Ready. Report: `.ai/STUDIO-OBS-010-po-validation-r2.json`. Validator: Pax (@po).

**Verified (2026-10-09):** `docs/runbooks/studio-guided-authoring.md` is 51 lines; line 3 carries the account sentence; lines 31/37/39/47 hold the finalize, receipt, replay-authority and rollback text to keep; `docs/stories/10.34.story.md` exists (staging acceptance to merge with); `docs/stories/10.51.story.md` exists (documentation precedent); `.aiox-core/product/checklists/release-checklist.md` exists; `StudioSecretUseAuthorization`/`ConfiguredSecretUseAuthorization` are the only sources (GA C-2 external); `DisabledStudioVaultProvider` is the default (GA C-3 external). Every AC-5 runbook row traces to design §4.3/§4.6 (I-B7, I-C8, I-C9), §8 Q3, F-5, R1-2 or security conditions 10–11; no row invents a control.

**10-point checklist:** title ✓ · description ✓ · testable ACs ✓ (denominators, checklist pass over runbook rows, traceability review) · scope ✓ · dependencies ✓ (OBS-009) · complexity ✓ (M) · value ✓ · risks ✓ (external prerequisites, residuals list) · Done criteria ✓ · alignment ✓ (design §10 OBS-010 rows, consensus §11 formative test, GA §4.J, §7 "merges with 10.34"). Executor `analyst` / gate `pm` valid and distinct.

**GO conditions:**
1. T0: explicit user authorization is obtained and recorded before any participant is contacted; participant access, test secret and approved origins are listed with owners (ED-02 "PUT Core / BFF" where applicable).
2. AC-4: G-1/G-2/G-3 and C-2/C-3 each carry a current-state line pointing at the OBS-009 evidence file (or "unrun, owner X"); the record cannot say "ready" while any external item is pending — no fabricated pass of 10.34 groups or external gates.
3. AC-5: the dated "Live surface" list is written before OBS-011 T0 and names routes, v3 contracts, configuration keys and migrations individually (OBS-011 AC-10 reads it as a boundary).
4. The runbook rewrite touches only the account sentence and the new rows per the 10.51 precedent; the V19/V33 compatibility, rollback and evidence sections remain true and unchanged.

**Nice-to-have:** give `release-readiness.md` a fixed row shape (gate · owner · state · evidence path · date) so @qa's traceability review is mechanical.

## Dev Agent Record

Not started. Draft preparation only; no implementation evidence yet.

## QA Results

Not reviewed. No quality verdict assigned.

## Change Log

| Date | Version | Change | Author |
|---|---|---|---|
| 2026-10-08 | 0.1.0 | Draft derived from approved observed-authoring consensus plan for SDC intake | SM preparation |
| 2026-10-09 | 0.2.0 | **Rescoped** after the 2026-10-09 decision: pilot uses the login workflow with `<secret>` references; "account integration" replaced by secret-login proof; runbook rows for provisioning (incl. R1-2 whole-origin trust), rotation, revocation, retention, 4096 bound, dumps, Vault policy, SEC-4 inputs; gates G-1/G-2/G-3 and C-2/C-3 as release gates; merges with 10.34 evidence; dated "Live surface" list for OBS-011; 6 ACs; Status Draft | @sm (River) |
| 2026-10-09 | 0.2.1 | Validated GO (8/10) — Status: Draft → Ready | @po |
