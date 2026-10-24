# OBS010 independent PM review of early-T2 local runbook content

Date: 2026-10-21. Reviewer role: Morgan / PM. Verdict: **LOCAL_DOC_PM_ACCEPTED_WITH_EXTERNAL_ROWS_PENDING**.

I accept the actual current runbook content for the narrowly authorized early-T2 local documentation scope. The canonical story permits those local AC-5 rows before OBS009 Done. No missing local product requirement or required wording correction was found. This is not formal story quality-gate approval, completed T2/AC-5, final Live-list acceptance, production readiness, deployment approval or pilot authorization. Independent QA remains separate.

The reviewed runbook is SHA256 `6ba937d80f9da90b5a7c5671567ebf7471170ebc5c72e7309d868363e1e94dee`; canonical OBS010 remains `6363b2b1053fab69cd840998e1cff0e7683e6f0080839df74c6af5f05788d41c`, InProgress. Both remained unchanged. All 20 analyst-bound public input digests were independently rechecked; actual runbook content and canonical AC-5 were read directly. The analyst conclusion was supporting mapping, not substituted for this PM judgment.

| Requirement | Actual runbook | PM assessment |
|---|---|---|
| Single observed path | Opening; Deployment identity; Drain/rollback | Accept local content: Author → guided Run → publication → explicit later replay; no alternate account-provider or compile authoring flow. |
| Scoped secret provisioning | RBR-01 | Accept local content: CSI/environment/test scope, exact create body, names-only read and no credential values in examples. |
| Whole-origin trust | RBR-01 | Accept local content: Explicit whole-origin assertion and same-origin script residual; approved actual origins remain owed. |
| Rotation | RBR-02 | Accept local content: Same-reference rotation keeps learned hashes; actual Vault versions differ; authorization and retention remain separate. |
| Revocation bound | RBR-03 | Accept local content: One control poll including request/queue plus in-flight step; no instantaneous erasure or outcome rewrite. |
| Audit retention | RBR-04 | Accept local content: 12-month partition-pruner default distinguished from exact expiry, SIEM and observation/video retention; uncertainty disclosed. |
| 4096 bound | RBR-05 | Accept local content: UTF-16 units, no truncation, create/dispatch refusals and response-cap caveat. |
| Unsupported password cases | RBR-06 | Accept local content: Multiple/non-password targets unsupported; no fallback, universal masking or zero-memory promise. |
| Dump controls | RBR-07 | Accept local content: Source/render controls separated from actual backend/host/operator restrictions still owed. |
| Vault privilege and history | RBR-08 | Accept local content: Scoped API/worker capabilities, no runner identity, mounted token and retained version/metadata residual. |
| TLS and rotation inputs | RBR-09 | Accept local content: Both certificate roles, pin, trust/keys, token issuer, quiet drain/rotation and actual shared proof obligations. |
| Dev DB recreation | RBR-10 | Accept local content: Guarded quoted dropdb/createdb command remains unrun; only disposable owner-approved DB after D-B. |
| Governed policy administration | RBR-11 | Accept local content: Version/approval/audit, separate approver, governed learning/configured replay and never-widen boundary; owner/approval owed. |
| Incremental learn again | RBR-12 | Accept local content: Fresh browser, model-free unchanged prefix, relearn suffix, eligible drift constraints and no unknown-effect retry; shipped templates retained. |
| G-1/G-2/G-3 | RBR-13 | Accept local content: Shared chain, authenticated TLS before real credentials and production authorization before schedules remain explicit gates. |
| Cross-host clocks | RBR-14 | Accept local content: Runner/API/worker/DB NTP, Platform-SRE bound owed, named 409 symptom and no tolerance/window remedy. |
| Measured Live surface and P-1 | RBR-18; RBR-19 | Accept local content: Historical dated boundary retained pending post-009 remeasurement/separate PM acceptance; exact first-learn disclosure matches paired AC4 e1, blank pending T4. |

The mapping has 17 review groups; the final group covers the independently named Live-surface and P-1 requirements. RBR-15/16/17 additional operational disclosures remain in place, without promoting deployed alerting, one-pod/PID1 behavior, recording/storage or masking proof. Source/controlled evidence is described within its stated scope.

RBR-19 reproduces the complete canonical first-learn disclosure, including `___ steps at p95`, and the actual release-readiness MODEL-SIZING e1 disclosure says the same thing. Both remain pending T4. The runbook requires a same-pass update from the actual T4 report labelled derived from T4, preserves below-15 re-rule/PM decision, identifies per-CSI capacity as ruling arithmetic, and promises no chunking. The incremental phrases were compared with shipped `guidedNarratives.ts`; no pre-Ready drift wording is invented.

The opening UNAPPLIED/current-review-pending banner records an earlier preparation state. This verdict accepts the bound current content; it does not itself edit that provenance. After separate local QA accepts, the documentation owner may make the minimal accurate provenance update pointing to both actual verdicts. It must keep shared controls owed and avoid suggesting final T2, story, Live-list or release acceptance.

External obligations remain unchanged: OBS009 Done AND D-C PASS before pilot T0/T1; named approved application/origins/account/secret references; explicit participant-contact authorization and at least five real consenting users; per-app focus proof on intended pinned dist; actual ED-01 owner/pricing/spend/headroom and T4/D-C/T6 evidence; U13, compliance/export/retention/F04 disposition; ED-02/Vault/background authorities; certificates/issuer/DB role/SIEM/NTP/internal-image/SRE/D-B proof; named C17 masking reviewer; post-009 measured Live-list re-date and separate PM acceptance. No owner identity, measurement, approval or outcome was invented.

Only this review evidence directory was written. No runbook/story/checkbox/status/Live/signoff/source/SDK/pointer/ledger mutation occurred. Public-document/source excerpts and SHA metadata were used; JSON parsing was confined to public evidence metadata. No app/parser validation, test/compiler/build/lifecycle CLI, server/native/Gradle/Docker/provider/network/Git/GUI or participant-contact action occurred. No further delegation was performed. No new accessibility requirement, waiver or product requirement was introduced.
