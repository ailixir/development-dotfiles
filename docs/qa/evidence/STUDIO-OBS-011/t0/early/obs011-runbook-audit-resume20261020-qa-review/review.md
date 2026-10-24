# Independent QA review — full OBS011 runbook source audit

Decision: **CHANGES_REQUESTED_DOCS_ONLY**. All mandatory findings are listed together below: **DOC-RB-01, DOC-RB-02, DOC-RB-03**. No code/configuration fix or lifecycle action is requested.

Subject manifest SHA-256: `8b445844b7e1a9f089d622e65f5e58a7e449365671b567118702d72ed1e4189f`.
Subject patch SHA-256: `f983cb17d79df67035c00f2a6bb409b13519441938526b8317ff7e4765f791a0`.
Shared base SHA-256: `8971ca6b0f5f08b3b35041abe960065d1b6f4fdf4e5fa3b9557a30dd9c16223b`.
Final preview SHA-256: `cad5c63af1018379a0ebd8a35a8d7014b87ca5124780ebdd7e23bf3187af816e`.
Prior six-patch QA manifest: `1b2469254ff9b9e19f93353b1701407f13982e6bd23fc209d66bbd8346a14d68`.
Reviewer: Quinn, aiox-qa skill; no delegation. UTC: 2026-10-20T03:24:46.130047+00:00.

## Scope and exact verification

Read the sealed audit/seal/preparation/inputs/manifest, final patch/preview, story C-OBS009-3 requirement and prior review conditions. Independently checked all108 captured public input SHA-256/byte counts and every recorded anchor's complete line set; all match. All six subject manifest entries match. A separate strict in-memory unified-diff parser reconstructed the single exact target from the unchanged shared base:28 hunks, exact context/counts/headers, byte-identical final preview. No patch was applied.

The original six-patch manifest and all16 entries remain intact; all six original per-file patches remain intact. Only the proposed runbook target is superseded. The other five retain the earlier bounded approval. Original audit header rows, section4 and section12(e) are exact shared-base bytes; section14 is exact starting-preview bytes, including its pre-existing dated14.6 note. Full requested sections1-3 and5-13 were reviewed; sections4/14 received preservation checks without fresh runtime/source-audit credit. No010 guided-authoring runbook edit/collision, source/test/contract change or accessibility/skill/governance expansion is in the patch.

## Mandatory findings

### DOC-RB-01 — MEDIUM — section5; related dispatcher instructions in6/12(a)

Preview anchor: `preview/docs/runbooks/studio-runner.md:287`.

The new operative sentence says STUDIO_DISPATCHER_ENABLED=false disables both schedulers, but the captured worker profile defines studio.execution.dispatcher.enabled=true literally. The alias is referenced only by the lower packaged application.yml property; rendering the alias into the worker environment is not proof that the worker profile consumes it.

An operator can mistake a rendered alias for an effective stop or diagnose a healthy active worker as unable to dispatch/reap. This is a source-configuration inference, not an inspected process result.

Smallest docs-only correction: State that effective studio.execution.dispatcher.enabled=false disables the scheduler beans. Distinguish the chart-rendered STUDIO_DISPATCHER_ENABLED alias from that effective property; disclose the literal worker-profile override and require effective-property verification. Do not prescribe a new code/config fix or claim deployed behavior. Reconcile the section5 audit row accordingly.

Exact public source evidence:

- `backend/src/main/resources/application-worker.yml:23` — SHA-256 `bf0c42d16bfdfbb1f7d5f7a5d9206f6ce98fe58e4c3bddd0f5bfff64160c3a65`.
- `backend/src/main/resources/application.yml:360` — SHA-256 `271fac527d075f996173e6cf1ef52d409d4416d3d6a46114fc541097b3a25f75`.
- `helm-chart/put-checks/templates/_helpers.tpl:574` — SHA-256 `976cc0e8cd9a97240fa18651481172d89354fbd59b8131bb47437973ad45962f`.
- `helm-chart/put-checks/templates/deployment.yaml:524` — SHA-256 `9f7fda6a66f5758788fc4ec9c51894cb3c7eee39dcbcaf73730164ee662ab977`.
- `backend/src/main/java/com/citi/put/checks/studio/dispatch/StudioDispatchScheduler.java:35` — SHA-256 `68c044e2066c5903fa40888477eab9cfe3ff732473c53fb14d1cecca01af0f07`.
- `backend/src/main/java/com/citi/put/checks/studio/recovery/StudioRecoveryScheduler.java:22` — SHA-256 `7cd30d7888a553197c610e07396b620fabdefe73a61d2bae376ee04a60f219c3`.

### DOC-RB-02 — MEDIUM — section12(a)

Preview anchor: `preview/docs/runbooks/studio-runner.md:783`.

The retained operative rollback warning still says turning off the dispatcher leaves queued work until its deadline. When the effective dispatcher property is false, StudioRecoveryScheduler is also disabled, so passage of the deadline does not itself close rows. This contradicts the newly corrected sections5/6.

Rollback instructions imply automatic deadline closure even after the component that performs it has been disabled.

Smallest docs-only correction: Replace “until its deadline” with “until a scheduler resumes and performs closure/reaping”; retain the instruction to leave the dispatcher enabled while engaging the execution kill switch. No source change.

Exact public source evidence:

- `backend/src/main/java/com/citi/put/checks/studio/recovery/StudioRecoveryScheduler.java:22` — SHA-256 `7cd30d7888a553197c610e07396b620fabdefe73a61d2bae376ee04a60f219c3`.
- `backend/src/main/java/com/citi/put/checks/studio/recovery/PendingReaper.java:65` — SHA-256 `4f643583b8739682a3482f13396d47b461fc41f2b67fddcfcde583abf3d8caff`.

### DOC-RB-03 — MEDIUM — section9.1

Preview anchor: `preview/docs/runbooks/studio-runner.md:573`.

The retained current security statement says any of the three bypasses makes Studio authorization use whatever identity the caller wrote in a header. Only identity-headers accepts X-User-* input. With that flag closed, core-service returns a fixed administrative identity; csi-read augments an already resolved identity only for CSI GETs and does not authenticate Studio writes from headers.

The audited runbook collapses three distinct authorization effects and contradicts its own corrected section9 table and warning.

Smallest docs-only correction: Qualify the header-identity statement specifically to identity-headers; describe the fixed core-service admin bypass and CSI-GET-only role augmentation separately or refer to the already-correct section9 table. Preserve ED-02 and its real-identity proof gap. No authorization change.

Exact public source evidence:

- `backend/src/main/java/com/citi/put/checks/security/BffSessionAuthenticationFilter.java:110` — SHA-256 `316e55bd24f1df49d6e61e4459ae82351fc3b4d9ae9a005bf6b55835603eb6a9`.
- `backend/src/main/java/com/citi/put/checks/security/BffSessionAuthenticationFilter.java:165` — SHA-256 `316e55bd24f1df49d6e61e4459ae82351fc3b4d9ae9a005bf6b55835603eb6a9`.
- `backend/src/main/java/com/citi/put/checks/config/IdentityBypassProperties.java:43` — SHA-256 `d78ca84409399fffc35bf824d882c507340032d41663f7782b0fe4d01168d5e1`.

## Section coverage and supported conclusions

| Section | Assessment |
|---|---|
| 1 | Supported changed chart/security/image/provenance facts; runtime image/cluster enforcement remains external. |
| 2 | Supported conditional policies, API+worker ingress, guided callback connector, additive broad object-store-port gap and observed binding facts; reuse exact unchanged prior source conclusions. |
| 3 | Supported local/RWX versus S3 IAM distinction and one-key logical retention/lifecycle declaration; no actual IAM/deletion proof. |
| 5 | Seven ledger states, unissued reclaim, ambiguous non-resend, guarded closures and separate deadlines supported; DOC-RB-01 remains. |
| 6 | Effective execution stop closes queued/claimed replay work and preserves admitted callbacks/reads; guided409/start gate is separate from guided drain. Effective dispatcher-property qualification needed under DOC-RB-01. |
| 7/7.1 | Source supports observation-only/full-snapshot SSE, bounded fallback with no401/403 bypass, authorized404 versus invisible403, expired410, range416, store503 and separate pre-auth nested503. No real proxy/cookie claim. |
| 8 | Attempt-derived .result.json/.webm keys, internal identity-checked reconciliation and no public raw-manifest route supported. |
| 9/9.1 | Default-closed flags, local-profile exceptions, header-first selection and CSI write/read authorization supported; DOC-RB-03 remains. |
| 9.2 | Create-only KVv2, scoped names-only secret preflight, dispatch reads, mounted-token/path/size guards, password/origin/form checks and destructive V18 supported. CLI/soft-delete/CAS examples remain explicitly unrun/external. |
| 10 | put_session cookie, credentialed CORS and disabled CSRF source match; platform cookie attributes and CSRF control remain open, with no invented delivery. |
| 11 | Mounted mandatory per-role Spring file/checksum, managed-property/source guards and configured prod250 concurrency/30pool/500batch supported. Actual renamed gateway protection gap honestly disclosed. |
| 12(a-d)/After rollback | Current public V12-V22, V18 DROP TABLE, classpath/forward-only config, conditional release-managed objects, external resources, persisted expiry and local-PVC/readability qualifications supported. Retired operative inference cutover removed. DOC-RB-02 remains. |
| 13 | Disabled/Vertex enumeration and chart/backend selection, UI_TEST mounted delivery, configured gateway and guided bounds/empty allowlists supported. Provider/model/location/workload identity remain external inputs. |

The review reused exact unaffected conclusions from the prior six-patch review for mounts, API/worker ingress, callback connector, observed bindings and unchanged historical preservation; their exact listed source hashes still match. Changed statements were assessed against the listed public source/config/contracts, not by treating prior runtime evidence as fresh proof. Public migration files were read as current repository inputs, never as an inspected database/protected baseline. Quoted operator commands remain unrun. Section13's inherited platform-approved location advice is not a provider compatibility certification.

## Retained conditions

1. Documentation review only. No patch application, integration/source-window/lease authority, storycredit, lifecycle transition, fresh-baseline credit or runtime approval.
2. All three mandatory factual corrections must be prepared in a new sealed docs-only revision and independently re-reviewed; preserve this subject and earlier packets.
3. Full requested section coverage was reviewed, but C-OBS009-3/F2 documentary acceptance remains pending these corrections. This does not invalidate the earlier bounded approval of the five unaffected documentation patches.
4. The current studio.gateway.* protection gap is explicitly disclosed and remains unresolved. Separate architecture triage owns product/source placement; this review requests no product fix and treats neither old studio.compile.gateway.* guards nor environment entries as effective gateway-integrity proof.
5. Keep all external gates open: ED-02 identity/Vault/secret-use policy and linked tickets; ED-03/SPK-03 storage/IAM/lifecycle/consistency; ED-04/SPK-05 CNI/destinations; ED-05/SPK-04 current image/sandbox/PID; ED-06/SPK-02 proxy/cookie/media/reconnect/CSRF; section14 provisioning/sizing/PKCS12/JDK/cert-manager and release proof.
6. The model string and global/us/eu location advice are inherited platform-approval inputs, not verified provider availability/compatibility or an actual approval. Real endpoint, model/location, identity, allowlists, quota and release scenarios remain environment-owner proof.
7. Fresh backend check --rerun-tasks plus JaCoCo before011 credit and full affected final suites remain owed. Retain original tests/assertions/skips/timeouts and010 Live surface. C8/GST infrastructure stays parked and lean-deferred work stays deferred.
8. Root retains integration/lifecycle ownership. No staging, commit, push, deployment, signal, held-resource cleanup or external contact. No accessibility/skill/governance scope expansion. USD500 shared ceiling retained; actual aggregate spend unavailable.

## Execution boundary

Only read-only public repository inspection, hashing, anchor verification, and independent in-memory patch reconstruction. No project test/build/native/Helm render/Docker/network/provider/contact/private/protected baseline/current runtime-body/process/resource/source-window/lease/lifecycle/git operation was performed. Wrote only this new QA review directory. Sealed subjects and unrelated dirty files are untouched.
