# Selective public-source checks — 2026-10-20 UTC

This is documentary verification only. Input hashes bind the selected source bytes; neither them nor earlier QA records grant a source window or current runtime credit.

| Claim | Source checked | Result / limit |
|---|---|---|
| Translation and authored nonsecret switches | `GuidedTranslationProperties.java` | Both default true; application/environment lists default empty, so flags alone do not grant a scope. Runbook now names the exact allow-authored-nonsecret key. |
| Publication / replay / kill switch | `backend/src/main/resources/application.yml` | `studio.guided.publication.enabled`, `studio.observed-replay.enabled` and `studio.execution.enabled` default true. Guided chart enablement remains separate. |
| UAT render defaults | `helm-chart/put-checks/values-uat.yaml` and D2 rotation record | Observed validation/replay true; guided false; two runner replicas; trusted catalog/policy and TLS pin/Secrets still required. No render/deployment was performed. |
| Q3 audit | `application.yml`; `RetentionPruner.java` | 12-month partition-retention default and `studio_secret_use_audit` membership. Monthly pruning is not exact per-row expiry or SIEM evidence. |
| Observation/video retention / F01 | `application.yml`; `guided-data-flow.md` §3.3 | Separate 30-day defaults, qualified terminal/expiry pruning, indefinite non-AC3 stores and conditional S&C follow-up. No physical deletion proof. |
| Secret bound / create | `StudioSecretsService.java`; `HashicorpStudioVaultProvider.java` | 4096 UTF-16 units, exact create fields and create-only `cas=0`. Actual scoped platform Vault policy remains unrun. |
| Dump controls | `values.yaml`; `studio-runner/Dockerfile` | Explicit JVM no-heap/core flags and runner `ulimit -c 0`. Backend process core rlimit, operator/host restrictions and deployed effect remain owed. |
| TLS / certificate / issuer rotation | D2 `rotation-and-cert-inputs.md`; runner runbook §14 | Inputs and restart/drain requirements are recorded source/render evidence. Shared certificates, pins, token propagation, EKU/SAN/CA and actual authenticated-hop proof remain owed. Historical U21 issuer label is mapped to current U23. |
| Policy interim | `guided-data-flow.md` §§4–5; README F02 | Governed learning narrows TrustedPolicy, never widens; replay remains bounded by configured TrustedPolicy. Published replay can outlive governed-origin removal. No policy unification or external acceptance inferred. |
| Shipped008 copy | `guidedNarratives.ts` | Missing-login literal retained including internal backticks; double-backtick Markdown span renders it safely. No struck POLICY_DENIED/pre-Ready drift copy or new UI wording. |
| 012A / 014 gate names | Current exact gate files in manifest | Correct backend-runner-contracts-and-migration-re-baseline and action-safety-and-governance-for-the-learning-run names. Existing gate classifications are historical scoped evidence. |
| AC-24 carrier | Preserved PM decision; actual 10.34 and single-path disposition | Prior PM choice names existing OBS-008 AC-6 only. PO/register application and independent current review remain pending; original checkbox stays unchanged. |

Pending T4 first-learn blank, NTP bound owed to Platform/SRE, U/ED gates, F01–F04 and E1–E8 remain unchanged. This packet supplies no current process state, external approval, benchmark, participant outcome or QA verdict.
