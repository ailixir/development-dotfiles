# OBS010 independent local runbook QA

Date: 2026-10-21. Reviewer: Quinn / independent QA.

**Verdict: LOCAL_DOC_QA_ACCEPTED_WITH_EXTERNAL_ROWS_PENDING.** No mandatory local-content correction was found in the bound current runbook. This accepts only early-T2 local AC-5 documentation content, independently of the analyst audit and PM verdict. It does not pass the story, T2, AC-5, Live-list final acceptance, pilot, deployment, release or any external control.

The actual runbook was reviewed at SHA256 6ba937d80f9da90b5a7c5671567ebf7471170ebc5c72e7309d868363e1e94dee. Canonical OBS010 remains InProgress at 6363b2b1053fab69cd840998e1cff0e7683e6f0080839df74c6af5f05788d41c. The dependency exception permits local rows before 009 Done; pilot T0/T1 still require both 009 Done and D-C PASS. No exception for live work was inferred.

## Local requirement coverage

These 17 groups combine scoped provisioning with whole-origin trust while keeping Live-surface and P-1 separate. Every named AC-5 requirement is addressed.

| ID | Requirement / runbook location | QA basis |
|---|---|---|
| AC5-01 | Single observed path — Opening; Deployment identity; Drain/rollback | Authoring, guided Run, automatic publication and explicit later replay form one path; no account-provider or legacy compile instructions. Preserve immutable receipts and avoid unknown-effect retries. |
| AC5-02 | Scoped provisioning and whole-origin trust — RBR-01 | CSI/environment/test scope, closed name/value/allowedOrigins body, create-only cas=0 and names-only reads; whole-origin trust and same-origin script risk explicit. Approved origins/accounts and G-2 remain owed. |
| AC5-03 | Rotation — RBR-02 | Protected Vault-owner same-reference rotation preserves learned hashes; actual version identifiers remain audit facts. New names require source change/relearn. Deployed proof owed. |
| AC5-04 | Revocation — RBR-03 | One control poll including queue/request plus one in-flight step; no instantaneous cancellation or completed-outcome rewrite. Lost control response disclosed without invented cause. |
| AC5-05 | Audit retention — RBR-04 | 12-month default under monthly partition pruning is not exact expiry, SIEM proof or video retention. UNKNOWN_OUTCOME is not a wire status or maybe-typed evidence for the named preready case. |
| AC5-06 | 4096 bound — RBR-05 | 4096 UTF-16 units, no truncation, distinct create/dispatch refusals and response-cap caveat match selected source. |
| AC5-07 | Password-only limit and residuals — RBR-06 | Multiple-password/non-password targets unsupported with no fallback; password-read refusal, page echoes, memory copies and browser scratch residuals explicit. |
| AC5-08 | Heap/core diagnostics — RBR-07 | Chart negative JVM flags and runner ulimit separated from unproved host/backend/operator controls; unsafe diagnostic collection not instructed. |
| AC5-09 | Vault least privilege/history — RBR-08 | Scoped API create/read plus metadata list/read, worker data-read only, no runner identity; mounted token and KVv2 history. Actual policy positives/denials owed; skipped tests do not count. |
| AC5-10 | mTLS/TLS rotation — RBR-09 | Both identities, EKUs/SANs, separated keys, issuer trust, controller fingerprint and drain/rotation inputs actionable. Actual Secrets/certs/propagation/modes/handshakes owed. |
| AC5-11 | Disposable database recreation — RBR-10 | Exact guarded quoted dropdb/createdb command recorded not run; requires owner/disposable DB/data preservation; forward migrations without repair over V34 history. D-B owed. |
| AC5-12 | Governed policy administration — RBR-11 | Authenticated version/approval/audit and separate approver; governed learning versus TrustedPolicy replay narrows, never widens. Content owner/approval missing rather than fabricated. |
| AC5-13 | Incremental learn again — RBR-12 | Fresh browser, model-free unchanged prefix and whole suffix relearn; eligible earlier drift requires no-effect proof and cannot retry unknown effects. Shipped templates match; per-app focus separate. |
| AC5-14 | G-1/G-2/G-3 — RBR-13 | Shared authenticated chain; no real credential before authenticated TLS on every secret hop; no scheduled secret use before production authorities. Local config does not close gates. |
| AC5-15 | Clocks — RBR-14 | Runner/all API replicas/workers/DB NTP, Platform/SRE bound owed, zero issuedAt tolerance, named 409 symptom and JVM-vs-DB deadline comparison. No invented tolerance/window remedy. |
| AC5-16 | Measured Live surface — RBR-18 | Dated 729-id/671-protected boundary/references retained with only 011-start PM acceptance. Final-tree post-009 remeasure/re-date and separate PM acceptance pending. |
| AC5-17 | First-learn limit/P-1 — RBR-19; readiness MODEL-SIZING e1 | Verbatim disclosure, blank p95 and pending T4. Same-pass derived-from-T4 update, below-15 re-rule/PM decision, fixture contingency and arithmetic-only capacity explicit; no chunking commitment. |

The opening paragraph gives the operator-facing one-path sequence. Deployment and implementation details stay in operations sections; no benchmark internals or developer syntax become participant tasks. RBR-15/16/17 preserve alerting, one-pod/teardown and recording qualifications without promoting local configuration to deployed proof. Existing functional-only accessibility scope is unchanged.

RBR-19 was compared directly with canonical AC-5 P-1, AC-4 e1 and the actual readiness disclosure. All retain ___ steps at p95 pending T4. Both documents must be filled in the same pass from the actual T4-derived figure, labelled derived from T4. Historical sizing/capacity arithmetic is explicitly qualified.

## External boundaries retained

- U13 Security & Compliance acknowledgement remains pending before AUTHORED-ECHO work; export/retention/gateway privacy and F04 landed-or-owned-residual decision remain release obligations.
- ED-01 owner/provider/model/rates/spend/headroom and actual benchmark/T4/D-C/T6 evidence remain owed. No provider call or headroom inference occurred.
- ED-02 production background/secret-use authorities, Vault endpoint/token/policy/TLS positives and denials, issuer/certs, DBA role/live privilege, SIEM, NTP bound, D-B, internal image/nonroot/seccomp/CA, SRE and deployed operability proofs remain owed to their named roles. Missing named people are not silently assigned.
- Approved staging apps/origins/account/secret references, named C17 masking reviewer and per-app intended-dist focus probes remain prerequisites. No local count or controlled image substitutes for live proof.
- At least five real consenting nontechnical users and explicit contact authorization remain required. No contact, recruitment, simulated pilot, usability outcome or p95 was produced.
- Final post-009 Live-list remeasurement/re-date and separate PM acceptance remain pending. Existing 011-start acceptance does not extend to release readiness.

Boundaries were checked against actual canonical 010 ACs and selected readiness rows. This is not a fresh full release-readiness audit, complete source implementation audit or deployed-control verification.

## Provenance follow-up and method

The opening UNAPPLIED/current-review-pending banner is stale preparation provenance. After both genuine local PM and QA decisions, the documentation owner may make the minimal accurate update citing both bound decisions and preserving all external/final-acceptance qualifications. This is a nonblocking bookkeeping follow-up; QA has not edited that banner.

All 20 analyst-bound public inputs and both supporting evidence manifests/artifacts were rehashed before seal. Actual runbook and canonical local AC/dependency/task text were read. Selected source excerpts independently checked create-only Vault behavior, UTF-16 bound/refusals, retention pruner/default, dump flags, certificate inputs, exact unrun DB command, policy duality, shipped incremental copy/current no-effect drift branches and sizing/disclosure conditions. PM acceptance was read but did not supply this QA verdict. Truncated long searches were used only for visible excerpts; no complete design/source review is claimed.

Only this fresh QA evidence directory was written. Runbook, story, tasks, lifecycle, Live list, prerequisites, source, SDK, pointers and ledgers were unchanged. No formal QA gate, waiver or lifecycle transition was created. No app parser/validator, test/compiler/build, lifecycle CLI, native/backend/Gradle/Docker, network/provider/Git/GUI, private corpus/capture/baseline/log/XML/media/auth body read or further delegation occurred.
