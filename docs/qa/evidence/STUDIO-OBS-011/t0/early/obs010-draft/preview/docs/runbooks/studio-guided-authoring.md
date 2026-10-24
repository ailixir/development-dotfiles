# Guided authoring and observed replay operations

Prepared 2026-10-18 for STUDIO-OBS-010 T2 / OI-25. This preview describes the single observed path implemented by OBS-007/012A/012B/013/014/015/008 and the local OBS-009 work. **Shared-environment controls remain owed/unrun where named below. This is not deployment or release approval.**

The path is plain-language authoring → guided Run → automatic publication → later explicit observed replay. The first Run is recorded. Finalize saves the original Run's learning and does not start another browser, contact a model or resolve a secret. There is one runner process/image/listener, `node dist/main.js`; guided work is a mode. Details of the pod, strict environment-key allowlist, TLS and shared-plane connector are in [runner operations §14](studio-runner.md#14-one-entrypoint-tls-everywhere-the-one-pod-guard-and-the-new-secrets-studio-obs-009).

## Deployment identity, flags and publication

Apply the ADR-SC-005 V1–V18 re-baseline and forward-only V19…head (currently V22; see RBR-10/18). Deploy the matching backend, packaged v3 schemas, reference fixtures, immutable execution profile/catalog and runner build/Chromium identities. Image labels alone do not prove these identities. Backend `studio.observed-replay.catalog-json` and `policies-json` are trusted deployment inputs. Runner `STUDIO_RUNNER_OBSERVED_CATALOG_FILE`, `STUDIO_RUNNER_OBSERVED_IMAGE_DIGEST` and `STUDIO_RUNNER_OBSERVED_POLICY_FILE` come from deployment, never from jobs or artifacts. CI must run the in-image catalog producer `dist/print-observed-catalog.mjs` against the pushed image digest; the CI/deployed leg of DEPLOY-OBSERVED-01 is owed/unrun, owner @devops / Platform-SRE. User-named per-environment policy content ownership is still U24, pending.

The application defaults enable `studio.guided-authoring.translation.enabled`, authored nonsecret input, `studio.guided.publication.enabled` and `studio.observed-replay.enabled`. `studio.execution.enabled` is the kill switch. Backend defaults do not imply the chart's guided mode is enabled: `studioRunner.guided.enabled` is false in every shipped values file. Observed is enabled in UAT values; that does not prove deployability. Publication and replay switches remain independent controls: disabling publication stops new publications; replay availability still depends on replay enablement, exact catalog support and fresh authority. Never manufacture a base for an old session or extend its lifecycle to save it.

Publication/choice schema changes require the exact supported build, not merely a matching executable profile. Keep a supported exact historical build or deliberately learn again. Never rewrite historical schema/build pins or remove a choice witness. Benign prompt/provider changes alone do not invalidate saved execution compatibility. OBS-006 compatibility and immutable receipts remain the basis; the single-path migration generation replaces its old staged-cutover instructions.

`POST /api/v1/studio/guided-sessions/{id}/finalize` uses ambient `put_session`, a stable `Idempotency-Key` and the closed v3 body `{schemaVersion:3,expectedSourceRevision,expectedConfigurationRevision}` with exact decimal-string revisions. It never accepts caller-supplied owner fences, hashes or internal tokens. OBS-008 sends it automatically once at FINALIZING. Lost responses/reconnects repeat the same key/body. Cookie expiry,401,503, validation refusal or disconnect stays pending/not-ready, never success. Finalization validates original admissions/assertions/dependencies and observations, pure-Node validation and uncached Core authorization, then commits publication revision/receipt/head/session atomically. A source/configuration/head/fence change loses the CAS; preserve actual browser evidence and do not replay effects.

Read expired-session publication receipts through `GET /api/v1/studio/guided-sessions/{id}/result` with fresh Core canRead and the original principal. PUBLISHED is history; `currentReadiness` separately says whether that exact revision is currently runnable. Receipt reads do not revive a worker. Current denial still refuses. Successful publication creates no synthetic ordinary PASSED run.

Every later Run gets fresh execute/secret-use authorization. The30s replay grant is not extended by queue/transport/lock wait. Pure validation has at most three claims per session across keys/restarts and a15s deadline; publication Core grant is at most5s, capped by original claim/session/worker authority. Configuration may tighten these limits. Runtime/artifact/frame bounds apply while receiving. Recording dimensions are trusted hash-bound configuration, independent of authored viewport; Ready never resets run time.

## Operating rows and evidence

Each RBR id matches the accepted dated Live list. “Local” means source/implementing-story proof; it does not imply the deployed half passed. The [traceability matrix](../qa/evidence/STUDIO-OBS-011/t0/early/obs010-draft/traceability.md) maps every row to the implementing record and outstanding input.

### RBR-01 — Provision a secret for one test

Use the persisted test's CSI, environment and UUID scope. `POST /api/v1/studio/tests/{id}/secrets` needs CSI write access and creates only (`options.cas=0`); body fields are exactly `name`, `value`, `allowedOrigins`. GET on the same route needs read access and returns names only. Scope is never supplied in the body. The KVv2 path is `{mount}/data/studio/{csiId}/{environment}/{testId}/secrets/{name}`; the configured path template must retain every scope dimension. Insert the saved USER variable / PASS secret through the reference picker; never put resolved credentials in authored instructions, diagnostic text, screenshots or shell history. The create response contains name/version/origins, never value.

An `allowedOrigins` entry asserts the **whole origin's content is trusted** (R1-2). A matching origin does not protect against same-origin script exfiltration. Entries must be distinct normalized http(s) origins without path/query/credentials; the provider stores comma-separated `allowedOrigins`. Do not approve an untrusted page merely because its password field is masked. The trusted password-target/form-action checks still apply.

The authorizing secret-use source is separate from Vault connectivity; a saved secret grants no right to use it. Changing test environment hides the previous subtree; deleting a test does not purge it. Record the stale subtree for its Vault owner. **Deployment: owed/unrun, owner PUT Core/BFF (ED-02/U5); approved app/origins/account/test secrets U3 absent; G-2 must pass before real credentials enter Vault.** Sources: OBS-007 gate; `StudioSecretsController`, `StudioSecretsService`, `VaultScope`, `HashicorpStudioVaultProvider`; runner runbook §9.2.

### RBR-02 — Rotate the value, preserve the learned artifact

Studio create is not replace/rotate/delete. The authorized Vault operator rotates the same scoped name directly in KVv2, preserving approved `allowedOrigins`, or creates a new name and edits the reference (which is a source/configuration change and follows re-learn rules). Use a protected Vault interface for the value; no value is placed in a command example. Same-reference value rotation leaves artifact/plan/policy hashes unchanged and yields fresh actual Vault version identifiers in audit. Do not manufacture a version from the artifact. Old KVv2 versions remain until the Vault retention/deletion policy removes them. The application's entitlement/revocation source must be checked independently. **Deployed rotation proof owed/unrun, owner PUT Core/BFF (U5).** Sources: OBS-007 gate and C11/C15; OBS-009 `GuidedPublicationReplayIT` rotated-value cases and the T0/P7 evidence; runner runbook §9.2.

### RBR-03 — Revocation and honest cancellation

Revoke through the actual secret-use authorization source. Deleting a current Vault version is not a substitute for authorization revocation. Before dispatch/admission, fresh denial refuses send. Mid-run revocation is observed on control polling; the stated bound is **one control poll including request/queue time plus one already-in-flight step**. The design oracle requires a<=2s control poll and no next-step typing; a step already in flight may finish. Do not promise instantaneous erasure or preempted effects. API-assigned AUTHORIZATION_REVOKED requires actual trusted revocation facts; arbitrary runner text cannot supply it, and completed outcomes are not rewritten. Actual user cancel keeps its precedence with separate revocation audit.

When the revocation control response is lost on an unlearned guided run, KL-009-REVOKE-UNLEARNED may surface RUN_ERROR/CANCELLED with API ERROR and null error_code; do not infer a happier result or an unobserved revocation cause. Real shared-stack control-poll proof remains **owed/unrun, owner Platform/SRE + @devops (U4; OBS-009 AC11 live half)**. Local F/R10 receipts and OBS-007 AC13/C4 supply only their stated controlled proofs.

### RBR-04 — Audit retention and interpretation

Q3 uses the existing partition-retention pruner window unless Security requires otherwise. `checks.partitioning.retention-months` defaults12; `RetentionPruner` includes `studio_secret_use_audit`. This is monthly partition pruning, not an exact per-row expiry time or proof of an external SIEM's policy. **Actual SIEM sink/routing/retention and Q3 decision: owed/unrun, owner Platform/SRE (U6) with Security & Compliance.**

Audit stores scoped identities, versions and actual release/usage outcomes, never values. Wire `secretUse` remains USED/NOT_USED/REFUSED; missing results cannot manufacture NOT_USED. Audit-only UNKNOWN_OUTCOME is uncertainty, not a new wire status. SEC-AUDIT-PREREADY-01 disclosure: **For a revocation recorded before Ready, the secret-use audit reads `UNKNOWN_OUTCOME` for a secret that provably was never in the child. A reviewer must not read it as "maybe typed".** The accepted residue remains until its exact runner correction and pinned test close it; independent ADJ-1 co-sign is still a separate requirement. Do not confuse this12-month audit window with guided observation/video defaults30d, nor with F01's indefinitely retained private stores. Sources: secret-login design §8 Q3; OBS-007 gate; OBS-009 pre-G9 ruling §2; `RetentionPruner` / application.yml; guided-data-flow §3.3.

### RBR-05 — One4096 bound

The create and dispatch bound is4096 characters (backend UTF16 units), with no truncation. Oversized create refuses INVALID_SECRET_VALUE; an older oversized Vault value refuses SECRET_TOO_LONG before send. Keep the default64KiB Vault response cap unless an independently reviewed change proves maximum values and too-long errors remain readable. A smaller cap can turn the intended refusal into VAULT_UNAVAILABLE. Source: OBS-007 AC12/C13 and `StudioSecretsService.MAX_VALUE_LENGTH`, resolver bound; runner runbook §9.2.

### RBR-06 — Password-only limit and residuals

At GA, secret fill supports the trusted single eligible password control; multiple-password pages and non-password targets are unsupported, with no fallback adapter or policy opt-out. Password-control reads are refused. If the application later echoes a secret as plain text, video masking does not protect that echo. Child/browser memory holds plaintext for the run, JVM/JS/HTTP/parser string/buffer copies are not all erasable, and transient browser session/cache files remain a disclosed residual. Never claim zero memory residency or universal masking. Sources: ADR-SC-005 Secrets default; OBS-007 gate; secret-login design §4.2/I-B.

### RBR-07 — Dumps and diagnostics

Use the chart's JVM no-dump flags and runner `ulimit -c 0` launch; the runner rejects injected NODE_OPTIONS. These source/render controls do not prove the backend's process core rlimit, host policy or operator-triggered dumps. Backend core rlimit and operational dump restriction remain **owed/unrun, owner Platform/SRE**, and diagnostic procedures must not collect secret-bearing heaps/cores without their actual controls. Debugging must retain redacted, value-free identities; never stringify a dispatch frame or secret-bearing exception. Sources: OBS-009 D2 receipt/Dockerfile/values and architect A6; OBS-007 I-B7.

### RBR-08 — Vault least privilege and history

API identity requires `create` + `read` only on its scoped `{mount}/data/studio/...` data paths and `list` + `read` on matching `{mount}/metadata/studio/...`; worker identity requires data `read` only. The documented generic `studio/*` pattern must be narrowed to that identity's approved CSI/environment/test scope in the platform policy. No backend update/delete/destroy/undelete/root capability is required; the runner has no Vault identity or connection. Create-only `cas=0` and metadata existence distinguish duplicate names; platform behavior for a create-without-update duplicate still needs real policy verification. Runner startup refuses `STUDIO_RUNNER_VAULT_ADDRESS`.

Token delivery is a mounted file re-read by the backend client, not a value in jobs/env/logs. KVv2 version history, soft-deleted versions and metadata survive unless Vault's owner purges them. `vault kv delete` alone leaves the name/list/history; re-create returns409 and use can report UNKNOWN_REFERENCE. Authorized metadata deletion is a separate destructive Vault-owner action. Never give its power to the runtime identity to make cleanup convenient. **Actual dev-Vault read/create/list inside scope and write/list-outside-scope denials remain owed/unrun, owner PUT Core/BFF (ED-02/U5); the local `VaultPolicyIT` is skipped with no body and any local rehearsal is non-crediting.** Sources: OBS-009 D3 receipt; runner runbook §9.2; provider implementation; secret-login design I-C9.

### RBR-09 — TLS identities, tokens and rotation

Supply `studioRunner.tls.secretName` (runner PEM key/cert/CA), `backendTls.secretName` (API/worker PKCS12 key/trust stores and password files), and the backend cert SHA256 `tls.controllerCertificateFingerprint256` as32 uppercase colon-separated hex pairs. No pin default exists. Mount read-only directories, no subPath. Runner certificate needs serverAuth+clientAuth and Service DNS SANs; backend certificate needs clientAuth+serverAuth and callback-Service SANs. Backend trust must be limited to the service-plane issuer, not a shared mesh/cluster CA. Runner/backend private keys remain in different pods. Issuer/CA/EKU/SAN/lifetime/cert-manager compatibility are Platform/SRE inputs, not fixture assumptions.

The runner reads key/cert/CA once; probes re-read each run. Rotate runner Secret + `tls.rotationRevision` and roll out together. For backend certificate rotation, update backend Secret, controller fingerprint and rotationRevision in the same quiet release and restart API/worker as required. Issuer/trust changes must move both directions together. In-flight mixed-version dispatch can fail ambiguously; drain first, preserve receipts and let legitimate reapers settle, never retry unknown effects.

Guided mode also needs external RS256 issuer/subject/public key and three audience-scoped token files: runner callback, backend runner-controller (`studio-guided-runner`) and translation-controller (`studio-guided-controller`). Directory-mounted files are re-read at send. Issuer refreshes at<=60s cadence; token life<=300s and propagation delay remain inputs to prove. For key/issuer rotation drain, change configured key+issuer together and restart controllers/workers; no signing key is placed in runner. The D2 input record historically says U21 for issuer; the current prerequisite register tracks it as **U23**, which governs the missing input.

**Shared certificates/Secrets/controller pin, propagation, mode/CA/handshake proof: owed/unrun, owner Platform/SRE + @devops (U4/U23, SEC4/G1/G2)**. Full exact inputs: [D2 rotation record](../qa/evidence/STUDIO-OBS-009/execution-20261018/d2/rotation-and-cert-inputs.md); runner runbook §14 and D3 final receipt.

### RBR-10 — Disposable dev database after D-B

The 012A lane-M evidence records this command, **not run**:

```sh
: "${CHECKS_DEV_DB_NAME:?}"
dropdb --if-exists -- "$CHECKS_DEV_DB_NAME"
createdb -- "$CHECKS_DEV_DB_NAME"
```

Only the user/database owner, after identifying a disposable development DB and preserving wanted data, may run that reset. Then start the application using the normal local startup so Flyway installs V1–V18 and current forward-only V19…head (currentlyV22). Do not apply the new baseline over the old V34 history or use flyway repair to conceal checksums. No production/shared schema reset is implied. **D-B “nothing ever deployed from an internal remote” confirmation and actual devDB recreation remain owed/unrun, owner user / Platform-SRE (U11).** Source: `STUDIO-OBS-012A/lane-m/ledger.json` notRun; 012A gate REQ002/003; 010 PO deltaD2.

### RBR-11 — Governed policy administration

Manage `/api/v1/studio/guided-policies/**` through the authenticated API and its version/approval/audit process. Learning needs a current approved version for the application environment; approver is not the author. The default approver-group set is empty, so every approval403s until provisioned. **Approver-group provisioning OI12: owner not named in implementation sources; @pm must obtain a named environment owner.** This is not silently assigned here.

Interim R2: learning uses governed read/discovery policy; replay uses configured `TrustedPolicy`. At every learning start, governed origins are constrained to trusted origins: governance may narrow, never widen. A governed-policy removal alone does not revoke a published replay while TrustedPolicy still allows that origin. F02 is PM backlog with architect ruling first; it becomes blocking only under README's unsafe-interim/mixed-mode/Security rejection conditions. Read grants must be governed/hash-bound; mounted rules are not a workaround for nonscalar-read gaps (F03). User must name U24's trusted per-environment policy-content owner/content and Security approval; @devops applies approved content at deploy. **U24 and actual approval provisioning are owed.** Sources: OBS-014 gate; guided-data-flow §§4–5; README F02/F03; 010 PO notes.

### RBR-12 — Incremental learn again

After an edit, the next Run repeats the unchanged learned prefix in a fresh browser, then learns from the first changed step. The shipped copy says `Steps changed — next Run learns from step {k}`, `Repeating saved steps 1–(k-1)…`, and `Learning from step {k}`. `Learn again from step {N}` deliberately invalidates that step and suffix. It does not replay unknown effects or restore a lost live session. Login/secret rules apply to prefix replay as well. A changed/missing prefix must refuse with its actual cause; do not invent pre-Ready drift copy. Per-application focus compatibility is a separate pre-pilot probe repeated on application/dist changes (FOCUS-MUTATION-01). Sources: OBS-015 Done gate with its explicit carries; OBS-008 shipped `guidedNarratives.ts` and Done gate.

### RBR-13 — External gates stay explicit

**Secret-login gates** (distinct from GA plan operability G1…G3): G1 shared guided verified mTLS+JWT chain; G2 **no real credential in Vault until every secret-bearing hop is TLS with an authenticated peer**; G3 **no scheduled secret-referencing run before production background and secret-use authorization sources exist**. GA C2 production StudioSecretUseAuthorization and C3 Vault provider enablement are ED02 (PUT Core/BFF), still owed. Local configuration/handshake tests do not close these gates. Sources: OBS-009 AC2/3/6; secret-login security condition10; GA C2/C3; 010 AC4. Do not activate schedules or create credentials from this document.

### RBR-14 — Cross-host clocks

Runner, every API replica/worker and database host must be NTP-synced. **Bound owed, owner Platform/SRE (U11).** R9-OBS2 checks `issuedAt <= Date.now()` on runner with zero tolerance; a runner clock behind the minting clock by more than mint-to-submit latency can refuse a valid grant with409 AUTHORIZATION_EXPIRED. R9-OBS1 stamps `pending_deadline_at = acceptedAt +600s` on JVM, while dispatch judges with DB `clock_timestamp()`. Inspect actual host synchronization and the supplied bound when investigating. Do not add tolerance or lengthen the30s grant as a remedy. Sources: 010 AC5 clock row; 012A architect R9/R10 ruling.

### RBR-15 — Lost-terminal alert and companion recovery check

R8.2d specification matches runner stdout JSON event `report.terminal_rejected` or `report.terminal_abandoned`, at least1 in5min; group executionId/runnerInstanceId/namespace/pod, deduplicate per execution15min, resolve after30min quiet. Production pages Studio on-call; staging tickets. Carry only event/status-or-reason/attempts/executionId/attemptId/pod. `report.ownership_lost`409 is excluded. Counters are in memory with **no exported metrics endpoint**; implement from logs or a genuine log-derived metric. **Render/fire/routing/forwarding owed/unrun, owner @devops + Platform/SRE; monitoring stack unnamed.** Alerting does not prove settlement: AC11e must observe a live rejected terminal settled within `start_deadline` +one recovery poll. Source: [D2 alert specification](../qa/evidence/STUDIO-OBS-009/execution-20261018/d2/r82-alert-spec.md).

### RBR-16 — One-pod guided limit and teardown carries

Guided mode requires exactlyone runner replica, autoscalingoff, `shareProcessNamespace:true`, runnerenabled and one container; the chart fails render otherwise. Shipped files set2 replicas, so enabling guided needs the explicit1-pod override. Capacity is1 and routing to a second pod cannot recover in-memory ownership. **U20/root R1 user decision remains open; deployed behavior/PID1 reaping owed to Platform/SRE/@devops.** Use the chartered quiet drain window, never add a second guided Deployment. RUN-ORPHAN-01 remains conditional release debt: runner SIGKILL may leave child/browser alive until the in-flight step ends, up to clamped step timeout; the in-pod check is unrun, owner @devops, and survivors are a GA blocker. KL015D5's historical “about15s” occupancy bound covers launch only; close its old known-limit row only on the exact009 D5a–e independent credit or architect ruling. Source: OBS009A2.6; runner runbook§14.3; 010AC4d/e.

### RBR-17 — Recording access and availability

First learning Run video is `GET /api/v1/studio/guided-sessions/{id}/video`; later replay uses the execution video route. Access always needs current CSI read authority. Unavailable or expired recording does not change run outcome, prove a pass, create evidence or authorize another Run. Preserve actual endpoint status/problem code, expiry/partial state and storage limitation. Use neutral operator descriptions “recording unavailable” / “recording expired” without guessing why; the UI's shipped wording is frozen in `videoEvidenceNarratives.ts` and is not rewritten here. Logical expiry does not prove physical object deletion; Sonic/lifecycle/ingress/calibration remain external ED03/ED06/SPK03/SPK06. Sources: OBS013 PASS and OBS008 CONCERNS gates; 010 RECORDING-RUNBOOK-COPY; ADR-SC-006 scope.

### RBR-18 — Dated Live surface boundary

The machine list of record is [2026-10-18 Live list](../qa/evidence/STUDIO-OBS-010/live-surface-20261018/live-surface-list.json), SHA256 `e5c58fa57f389879b2843815b5b389d0efa99921bc142155d6b18b970d7c2c57`: **729 ids,671 protected**, with the [readable list/sign-offs](../qa/evidence/STUDIO-OBS-010/live-surface-20261018/live-surface-list.md) and [finalize record](../qa/evidence/STUDIO-OBS-010/live-surface-20261018/finalize-record.md). It enumerates public `/api/v1/studio/**` operations (including guided-sessions/video/guided-policies/capability), ExecutionSnapshot.replayFailure/ReplayFailure, v3 contracts including timing-order-vectors, backend/runner/chart keys and defaults/kill switch, runtime ceilings and migrationsV1–V22. The protected boundary is671, not the608 currently live entries.

Accepted by PM with notes for the011 start path only. After009Done, before010T3/T4, remeasure/re-date on the final tree, correct stale `g9Record`/`storyStatusChange`, CON25/33 deltas, CHN12 anchor, CHT07/08 ranges and AX5…8 dark vocabulary, then obtain separate PM acceptance. No removal without PO disposition. This draft does not cut a new list or claim final acceptance.

### RBR-19 — First-learn limit, pending T4

> A test's first learn runs in one session with a model budget of 24 proposals. With an ideal model this is enough for about 20 steps. Repairs and clarifications lower it. A first learn of a longer test may stop with `BUDGET_EXCEEDED` before it completes. Edits to an already-learned test re-learn only from the first changed step. The measured limit from STUDIO-OBS-009 T4: ___ steps at p95.

**pending T4; measured p95 owed to STUDIO-OBS-009 T4, owner @pm / benchmark executor.** Fill the blank only from the actual report, label “derived from T4”, and update the AC4e1 readiness row in the same pass. If T6 yields a derived limit<15, cite the new ruling and obtain PM's pre-pilot decision on whether disclosure remains enough. Sizing basis is fixtureB7 ×1.85 contingency, recalibrated byT4. Aii capacity “about6.5 full-envelope sessions or about12 ten-step learns per CSI/day” is **ruling arithmetic, not a measurement**; measured capacity is min(output-side,input-side) using T4 bytes/call. `maxSourceSteps` remains100; chunking is a post-GA candidate, no commitment. Source: MODEL-SIZING §9.1.1/2/4; PM ack§4; 010AC4e1/AC5P1.

## Drain, rollback and evidence

Keep the forward schema and immutable receipts. Disable new publication claims/commits and new observed acceptance/dispatch/admission first, then drain or cancel admitted runs under existing deadlines. An image lacking the exact observed profile/build refuses before browser, with no alternate authoring engine. Restore a supported catalog/image or deliberately learn again. Do not reset schedules, retarget activations, rewrite pins, reuse consumed secret setup or reconstruct workers from history; old activation/new head stays ACTIVATION_REVISION_MISMATCH. A rollback rehearsal on deployed topology is owed GA-operabilityG2 / planned10.34GroupN, owner @devops + @data-engineer; this prose is no rehearsal evidence.

Keep actual source/dist/schema/catalog/image/Chromium identities, receipts, request counts and accepted/unknown outcomes for each proof. Controlled PostgreSQL/CoreHTTP/compiled-child/Chromium joins prove only their recorded scope. Real-model D-C, login oracle, wire canaries, human C17 masking, real Vault/SIEM/ingress,5-person pilot and Security/Compliance remain separately owed. No release readiness while an applicable external gate is pending.
