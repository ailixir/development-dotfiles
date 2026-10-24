# Bounded QA re-review — corrected full runbook source audit

Decision: **BOUNDED_FULL_DOCUMENTARY_AUDIT_CORRECTION_ACCEPTANCE**. No remaining mandatory findings in this affected-change re-review. DOC-RB-01, DOC-RB-02 and DOC-RB-03 are resolved for the exact sealed successor b. This accepts the corrected documentary source-audit scope; it is not story credit, a lifecycle gate, fresh baseline, runtime validation or integration authority.

Subject: `docs/qa/evidence/STUDIO-OBS-011/t0/early/obs011-runbook-audit-resume20261020b`.
Subject manifest SHA-256: `d16d242e523bdc08c779fdd49688c42b2380ac03d34868a5bb5a4188af974ac3`.
Full corrected preview SHA-256: `edef74f59e9f1e52f8b1195e90ef99ff900cc35cfb92e1ac1909da7a5e5f3c0c`.
Exact full patch SHA-256: `2d79f10c9683e200dc4df8f0b9995b12166d49db2c553af347e2dae3e5b1c3ec`.
Unchanged shared base SHA-256: `8971ca6b0f5f08b3b35041abe960065d1b6f4fdf4e5fa3b9557a30dd9c16223b`.
Prior all-findings review manifest: `665dbfd07ea99b83e789c1957548b4b3995d87931bcbd829d1454c7e42a47f9a`.
Reviewer: Quinn under the already-applied aiox-qa skill; no delegation. UTC: 2026-10-20T03:31:10.276036+00:00.

## Findings disposition

- **DOC-RB-01 — RESOLVED_DOCS_ONLY:** Sections5/6/12(a) now describe the effective studio.execution.dispatcher.enabled property, distinguish the rendered STUDIO_DISPATCHER_ENABLED alias from the literal-true worker-profile override, require effective-property verification, and qualify scheduled closure/recovery on that effective property. The affected operative prose has no remaining alias-based guarantee. Audit rows5/6/12 agree. This remains a source-configuration inference, not a process measurement or source fix.
- **DOC-RB-02 — RESOLVED_DOCS_ONLY:** Sections6/12(a) explicitly retain the instruction to leave the effective dispatcher property enabled while engaging the execution kill switch. They state that queued work waits for a scheduler to resume and perform closure/reaping, and that deadlines alone do not close rows. The old until-its-deadline assertion is absent from affected operative prose.
- **DOC-RB-03 — RESOLVED_DOCS_ONLY:** Section9.1 limits caller-supplied X-User-* trust to identity-headers, distinguishes the fixed core-service administrative identity and CSI-GET-only augmentation of a resolved identity, and retains the ED-02 real-identity proof gap. The related audit row agrees.

The related unchanged sections5/6/12(a) instructions were read in context, along with section9.1 and the matching current audit rows. No contradictory affected operative statement remains. The replay kill switch remains distinct from guided admission/refusal and guided drain. No additional broad source audit or runtime proof was performed.

## Exact verification and honest reuse

- Verified all8 current manifest payload hashes and sizes and the expected subject/preview/patch pins.
- Re-read only the nine named correction sources below, checking their exact unchanged hashes/sizes and relevant statements. The entire reused108-entry inventory equals the predecessor inventory; all108 current source hashes/sizes still match. Unaffected full sections1-3/5-13 conclusions come from the prior complete review and its exact unchanged source pins, not a newly claimed broad audit.
- Independently reconstructed the full one-target28-hunk unified patch in memory against the unchanged read-only shared base, checking target headers, hunk positions, context/counts and exact output bytes. It equals the pinned successor preview. No application occurred.
- Independently applied exactly the seven declared text replacements in memory to the predecessor preview. They produce the complete successor preview byte-for-byte: the current audit link plus the bounded finding corrections are the only preview changes. The audit changes are matching rows5/6/9/12 and successor provenance/binding notes; unrelated section conclusions remain reused.
- Verified the original partial subject/QA and full-audit subject/QA manifests and all their payloads. All four sealed prior packets remain intact, including every original per-target patch; the five unrelated documentation proposals retain their earlier bounded approval.
- Original header rows, section4 and section12(e) remain exact shared-base bytes. Section14 remains exact predecessor-preview bytes, including its pre-existing dated14.6 note. The exact documentary patch touches only docs/runbooks/studio-runner.md; it does not collide with the010 guided-authoring runbook or change source/tests/behavior/accessibility/skills/governance.

| Exact correction source | Re-read anchor lines | SHA-256 |
|---|---|---|
| `backend/src/main/resources/application-worker.yml` | 23 | `bf0c42d16bfdfbb1f7d5f7a5d9206f6ce98fe58e4c3bddd0f5bfff64160c3a65` |
| `backend/src/main/resources/application.yml` | 360 | `271fac527d075f996173e6cf1ef52d409d4416d3d6a46114fc541097b3a25f75` |
| `helm-chart/put-checks/templates/_helpers.tpl` | 574 | `976cc0e8cd9a97240fa18651481172d89354fbd59b8131bb47437973ad45962f` |
| `helm-chart/put-checks/templates/deployment.yaml` | 524 | `9f7fda6a66f5758788fc4ec9c51894cb3c7eee39dcbcaf73730164ee662ab977` |
| `backend/src/main/java/com/citi/put/checks/studio/dispatch/StudioDispatchScheduler.java` | 35 | `68c044e2066c5903fa40888477eab9cfe3ff732473c53fb14d1cecca01af0f07` |
| `backend/src/main/java/com/citi/put/checks/studio/recovery/StudioRecoveryScheduler.java` | 22 | `7cd30d7888a553197c610e07396b620fabdefe73a61d2bae376ee04a60f219c3` |
| `backend/src/main/java/com/citi/put/checks/studio/recovery/PendingReaper.java` | 65 | `4f643583b8739682a3482f13396d47b461fc41f2b67fddcfcde583abf3d8caff` |
| `backend/src/main/java/com/citi/put/checks/security/BffSessionAuthenticationFilter.java` | 110, 165 | `316e55bd24f1df49d6e61e4459ae82351fc3b4d9ae9a005bf6b55835603eb6a9` |
| `backend/src/main/java/com/citi/put/checks/config/IdentityBypassProperties.java` | 43 | `d78ca84409399fffc35bf824d882c507340032d41663f7782b0fe4d01168d5e1` |

## Gateway and remaining gates

The current studio.gateway.* protection gap remains explicitly disclosed and unfixed in section11 and the audit. Neither the obsolete studio.compile.gateway.* guard nor rendered environment entries establish current gateway integrity. The separately owned009 Gage/Dex placement mentioned by root supplies no source-fix credit here; its draft was not re-audited. No product or policy claim is added.

The full requested documentary source-audit scope is accepted by combining the prior complete sections1-3/5-13 review with these narrowly verified corrections. All actual runtime/external/release gates, the21 external inputs, fresh backend check --rerun-tasks plus JaCoCo prerequisite before011 credit, and full affected final QA suites remain owed. Preserved section4/14 historical accounts receive no fresh audit/runtime credit. Root retains integration and lifecycle ownership; unavailable29815 restoration, parked C8/GST infrastructure, lean deferrals and functional-only accessibility scope are unchanged.

## All eight prior conditions — exact references and retained text

Source for every numbered condition: `docs/qa/evidence/STUDIO-OBS-011/t0/early/obs011-runbook-audit-resume20261020-qa-review/review.json`, `conditions[0]` through `conditions[7]`, sealed by manifest `665dbfd07ea99b83e789c1957548b4b3995d87931bcbd829d1454c7e42a47f9a`. Successor inputs/receipt preserve this array verbatim. Conditions2 and3's required independent correction review is satisfied only for this exact successor's documentary scope by this review; their historical pending wording remains preserved. Their non-documentary limits and all other conditions remain in force.

1. Documentation review only. No patch application, integration/source-window/lease authority, storycredit, lifecycle transition, fresh-baseline credit or runtime approval.
2. All three mandatory factual corrections must be prepared in a new sealed docs-only revision and independently re-reviewed; preserve this subject and earlier packets.
3. Full requested section coverage was reviewed, but C-OBS009-3/F2 documentary acceptance remains pending these corrections. This does not invalidate the earlier bounded approval of the five unaffected documentation patches.
4. The current studio.gateway.* protection gap is explicitly disclosed and remains unresolved. Separate architecture triage owns product/source placement; this review requests no product fix and treats neither old studio.compile.gateway.* guards nor environment entries as effective gateway-integrity proof.
5. Keep all external gates open: ED-02 identity/Vault/secret-use policy and linked tickets; ED-03/SPK-03 storage/IAM/lifecycle/consistency; ED-04/SPK-05 CNI/destinations; ED-05/SPK-04 current image/sandbox/PID; ED-06/SPK-02 proxy/cookie/media/reconnect/CSRF; section14 provisioning/sizing/PKCS12/JDK/cert-manager and release proof.
6. The model string and global/us/eu location advice are inherited platform-approval inputs, not verified provider availability/compatibility or an actual approval. Real endpoint, model/location, identity, allowlists, quota and release scenarios remain environment-owner proof.
7. Fresh backend check --rerun-tasks plus JaCoCo before011 credit and full affected final suites remain owed. Retain original tests/assertions/skips/timeouts and010 Live surface. C8/GST infrastructure stays parked and lean-deferred work stays deferred.
8. Root retains integration/lifecycle ownership. No staging, commit, push, deployment, signal, held-resource cleanup or external contact. No accessibility/skill/governance scope expansion. USD500 shared ceiling retained; actual aggregate spend unavailable.

## Execution boundary

Read-only public source/evidence inspection, hashing and in-memory text/diff reconstruction only. No actual patch application/source edit, project test/build, Helm render, Node/Gradle/Docker/native/network/provider/contact/process/resource/private/protected-baseline/runtime-body/source-window/lease/lifecycle/git/cleanup action. Only this new review directory was written. No credentials, owner approval, external input or operating authority was fabricated.
