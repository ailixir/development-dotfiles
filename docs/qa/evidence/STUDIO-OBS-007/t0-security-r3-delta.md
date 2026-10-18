# STUDIO-OBS-007 T0 independent security R3 delta check

Date: 2026-10-10. Reviewer: Quinn, independent security remit. Scope: design intake only; no lifecycle gate, implementation approval or Done transition. Reviewed HEAD: `734ad704f6ae508dbb10d9b5127a315bb0df5f81`.

## Disposition

**RELEASE SECURITY T0 / sufficient design coverage for Lane C T1, with implementation-proof conditions below.** The R3 single-path design carries all prior conditions 1–9 and the tightened R1 password-target protections into the 19 ACs. Removing legacy variants does not weaken those protections. The initial HOLD identified four concrete implementation ambiguities and a migration omission. Aria's durable `.ai/STUDIO-OBS-007-architect-t0-rulings.json` resolves D1–D4, explicitly assigns D5's additional guards to data-engineer ownership, and resolves audit retention through RULING-5; its hash is appended below. I independently read and concur with those rulings: they preserve the ACs through precise implementation phases, require no PO acceptance weakening and need no new product decision. Root may release T1 after its other T0 ownership/reconciliation checks. **V34 DDL remains held by root until architect/data-engineer record the revocation-event uniqueness semantics below.** No runtime proof is claimed, and later implementation QA must enforce every oracle below.

This is static, repository-local verification. No test, Gradle command, provider call, model call, browser run, deployment, scheduling action or external contact was performed. No CodeRabbit verdict is claimed. Existing `.aiox-core/core/permissions/dispatch-governance.js` worktree changes were preserved. Actual spend is unavailable; shared wave ceiling remains USD 500.

## Source identities

SHA-256 over raw file bytes at review time:

| Source | SHA-256 |
|---|---|
| `docs/stories/STUDIO-OBSERVED/STUDIO-OBS-007.story.md` | `6c7d54734dae80a6d09522ccf0a5030211a28a0cd00446ec5c8df1206327f326` |
| `docs/architecture/ADR-SC-005-single-path-observed-authoring.md` | `39488993572a831b3dc4fac1eb8aa471d2703a4504b340bcd19f83952ca681f4` |
| `docs/specs/studio-observed-authoring/secret-login-design.md` R3 | `8c1cd118beed176b1e622a25ebe07f5c1d4ea406cf156535526ded6ca8b24d57` |
| `docs/specs/studio-observed-authoring/secret-login-security-review.md` including R1 delta | `c5ce3be4543ae51618455b14909caabaf9cc46b9dd7fce0a2ff57516394cde49` |
| `.codex/skills/aiox-qa/SKILL.md` | `17afd341497b8e535b80c05b7aafe61305f56cdabb2742f8396eb98eec655d99` |
| `.aiox-core/development/agents/qa.md` SOT | `42e0f57a5d2eaca345d074ec53100faabebd42047081325cde2123911aa88b00` |

The entire story, ADR, R3 design and security review were read, including history, placement maps, boundaries, all ACs and all oracle rows. QA constitution and declared security/traceability task guidance were read. Production-seam hashes are appended below. Line references identify the reviewed tree and can drift.

## R3 differences from the R1 security review

| Delta | Security disposition and binding proof |
|---|---|
| Legacy password-only adapter and multi-password fallback removed | Accepted: AC-4/5/7 retain trusted isolated-world password resolution, prepare-to-fill element identity, type/origin/form-action checks and no opt-out. SEC-5/6, C-1, C-18/19/20 must exercise the observed adapter, never cite `playwrightAdapter.ts` as feature evidence. |
| Login detection now uses the same observation signature for learn and replay | Accepted: AC-18/19, §5 oracle six cases. It annotates existing failure only, excludes a replay secret-fill failure, preserves failed step, and obtains the reached-document observation after login. Document-wide count/button correlation has the stated false-positive limit. No localized text heuristic. |
| Two audit paths replace three | Accepted: AC-14 has exact `GUIDED`/`OBSERVED_REPLAY`; design §7 SEC-9's “all three paths” is errata, never an extra legacy implementation requirement. D1 must distinguish resolution outcome from actual usage. |
| Account provider, grant/handle fields and cookie import removed | Accepted: AC-1/15 and SEC-10 require closed schemas, complete deletion and cookie-call spy. CSI/environment/test/principal authorization must survive account removal, not be inferred from the removed handle. |
| Observed replay uses ordinary dispatch-time resolution | Accepted subject to D4 and ordinary observed retry proof: AC-6/7/13, SEC-2/8, C-2/4. Existing observed dispatch is a distinct branch and currently closes definite refusals rather than using the ordinary retry pass. |
| Migration re-baseline and version collapse follow in OBS-012A | Accepted sequencing: V34 now; preserve V30–V33 and both staged V19 orders; later absorb into V17. D5 must enumerate every current v2 DB guard changed in V34. Tuple collapse and public route relocation remain OBS-012A, not a reason to weaken this story's v3 pins. |
| One runner TLS/client-certificate listener | Accepted as OBS-009/010 release controls, not proven here. G-1/G-2/G-3 remain open. No real credential may be provisioned or scheduled by treating controlled fixture proof as deployment approval. |
| Translation/publication/replay default on | Accepted: AC-17 changes both conditional-bean gates and property default; approved nonsecret-input policy remains distinct from secret-value exclusion. Kill switch test must refuse both learn and replay, including worker profile. Defaults do not close transport or authorization gates. |
| Incremental prefix replay added to GA wave | Accepted placement in OBS-015: reused secret steps run through the same observed adapter and scope checks; no new secret-bearing channel or repeated admission is authorized here. |

## Required technical rulings before T1

| ID | Severity | Contradiction or missing invariant | Required resolution, AC and exact oracle |
|---|---|---|---|
| D1 | HIGH | AC-14/design I-C10 demand `USED`, `NOT_USED`, `REFUSED` usage but the prescribed table `outcome` enum contains resolution facts only. A DDL implementing only that enum cannot represent the required distinction. | Preserve the exact resolution enum; define a separate `usage_outcome` constrained by `row_kind`. RELEASE forbids usage outcome; USAGE requires it, including replay `USED/NOT_USED/REFUSED` and the supported guided ledger outcomes. AC-2/14/19, SEC-9 and C-11/16 must prove a declared-but-unreached secret is `NOT_USED`, successful fill is `USED`, refused fill is `REFUSED`, each joins its actual RELEASE; force retry with two distinct attempts and no value in either column. |
| D2 | HIGH | AC-6/C-15 say to strip the whole `secret` before hashing while a changed `secret.secretId` must cause `IDEMPOTENCY_CONFLICT`. Digest equality alone cannot satisfy both. Current `transport.ts:72` hashes the whole body. | Canonical digest strips the whole secret object; idempotency state separately binds only safe declared `secretId` plus `sourceInputId`, checked before returning replay state. No value, version or origins retained in this identity record. AC-6/19 C-15: changed value yields same digest; changed ID with same digest is rejected as conflict; actual input/proposal binding still rejects mismatched IDs; store inspection contains no canary. |
| D3 | HIGH | A 2 s sweep plus independent 2 s runner poll does not guarantee AC-13's ≤2 s from authorization revocation. Existing `runCoordinator.ts:475-509` schedules the next poll 2 s after the prior HTTP read settles; failures currently leave execution running. | Keep sweep/audit but do not depend on it for stop latency. Architect proposes names-only authorization rechecks on control reads/progress acks and guided claim/renewal, absolute 1 s cadence with ≤1 s request deadline, fail-closed local stop on missed deadline for secret-bearing runs/sessions. Precisely state time origin and include elapsed request/queue time; preserve ≤2 s plus one already in-flight step. AC-13/19 C-4 must measure worst-phase revocation, slow/lost responses and both paths, zero next-step keystrokes, local stop/inventory disposal and write-once `revoked_at`/`REVOKED_MID_RUN`; a sleep aligned to sweep is inadequate proof. |
| D4 | HIGH | AC-3 requires literal comparison to resolved Vault values by `ObservedRevisionVerifier` and runner validator. The existing verifier is a pure immutable revision check used by readiness and has no resolver; values must be fetched only inside dispatch resolution scope. | Preserve pure token-span/provenance checks with zero Vault reads. Architect proposes an explicit `ObservedRevisionVerifier.assertResolvedSecretLiterals(artifact, ephemeralResolvedValues)` invoked inside `ObservedReplayAuthorization.job()`'s ordinary resolution scope, and the runner validator's equivalent check on Execute3 secrets before perform. AC-3/6/7/19 SEC-8: planted-value literal rejected on actual backend and runner paths, token-overlap rejected in pure validation, no value fetched in readiness/finalize, no value cache/fingerprint persisted, rotation preserves artifact hash. If a revised AC names these two phases, PO must validate the clarification without deleting either rejection. |
| D5 | HIGH | AC-15/design §6 enumerate profile/scope/execution functions, but current V33 also hard-codes artifact version 2 and closed observation coverage without `passwordControls`. Merely changing the named functions leaves v3 publication impossible. | Architect/data-engineer must include `ck_observed_revision_origin` (`V33:217-220`), publication attempt/validator-receipt guards (`:180-201`), receipt/execution schema pins, and `studio_publication_observation_shape` (`:413-422`) with v3 coverage/pins, plus all dependent producer/consumer checks. AC-1/14/15/19 SEC-3/8/9, C-11/16 and joined publish/replay must use real PostgreSQL and both staged-V19 orders. Positive v3 and negative malformed/account-field/old-pin fixtures are required; do not weaken closed shapes or immutable evidence checks. |

These are technical design clarifications, not authorization to add an account provider, restore a legacy adapter, widen secret targets, relax timing, suppress a test or change lifecycle status. D1–D4 are closed at design level by RULING-1…4 respectively; D5 is closed at design level by the ruling's dataEngineer ownership reconciliation and Dara's `t0-data-design.md`. Actual implementation must still prove them. In particular D4 preserves both named verifiers' actual-value refusal via transient entry points; moving that check into dispatch does not remove it. This conclusion supersedes the initial HOLD recorded during review.

## Conditions 1–9 carried from the security review

| Condition | AC trace | Exact oracle requirement |
|---|---|---|
| 1, tightened R1-1/2/3 | 1, 4, 5, 7, 19 | SEC-6/C-1: node-free only with secretRef, declaring step/slot, `passwordControls===1`; C-18: same-document swap, detached/re-attached element, post-pin type flip ⇒ `TARGET_CHANGED`, zero typing; C-19: cross-origin form action and form-less changed origin refusal; C-20: open shadow, light+shadow ambiguity, offscreen decoy, iframe/closed-shadow absence, one candidate function. |
| 2, tightened sweep | 2, 13, 14, 19 | C-4 mid-run both paths, ≤2 s plus existing in-flight step, no next fill, disposed inventory, `revoked`/`stop REVOKED`, `REVOKED_MID_RUN`; D3 resolves timing. |
| 3 | 11, 19 | C-3 preferences before both launches, absent-file negative refusal, profile/user-data scan before close/clear; record actual Chromium version and honest transient-file residual. |
| 4 | 9, 19 | C-5 real streaming secret-read path, both actual byte-array body writers erased after send/throw, SecretValue and RunJob printable without value; TRACE every appender plus API/SSE/metrics/idempotency, including C-4 outage/definite-refusal sub-runs. |
| 5, tightened 4096 | 1, 12, 19 | C-13 create 4097 ⇒ `INVALID_SECRET_VALUE`; existing 5000 ⇒ `SECRET_TOO_LONG`, no send, no truncation; SEC-4 sanitizer/bridge bounds and 65th secret refusal; origins limits retained. |
| 6, legacy clause retired | 8, 19 | C-14 password hasValue/controlValue ⇒ named read refusal on learn and replay, never a password reading in error; page-supplied text-control canary is redacted. |
| 7 | 6, 19 | C-15 exact value-difference digest equality and ID-difference conflict; D2 preserves both. |
| 8 | 2, 14, 19 | C-16 StrictInternalBodyReader parses new secretUse/revoked, rejects unknown keys/invalid status, deliberate full-document digest/op-count re-anchor. |
| 9 | 6, 10, 19 | Every placed SEC/C row executed. C-6 captures authentic pre-redaction Playwright error with canary and zero post-redaction sinks, not a fabricated claim of raw provider evidence. C-17 implemented capacity==1 refusal or measured two-session isolation branch recorded; manual video gate remains OBS-009. |

## All 19 ACs to proof

Coverage below means specified design coverage, **not tests passed**. Every row is an implementation obligation.

| AC | SEC/C oracle or direct story oracle | Required production seam and observable result |
|---|---|---|
| 1 | SEC-1/6/8, C-1/13/16/20; closed-schema/codegen checker | v3 generated schemas/types and classpath copy, structural no-value secret inputs, legal target/value pairing, coverage bounds, IPC/account removal and exact tuple. Generated artifacts match source. |
| 2 | C-16; internal-contract/route/digest pins | Actual callback/control parser accepts secretUse/revoked; unknown fields remain rejected; LOGIN_REQUIRED/read refusal codes; conflict code removal; old/new pins quoted. |
| 3 | SEC-1/8, C-12 | Actual classify→masked gateway bytes→materialize→builder/lowerer→backend/runner verifier; IDs only, no token-overlap/value literal, hash stable across rotation; D4 applies. |
| 4 | SEC-5/6, C-1 | Proposal validator, runtime binding, recipe validator and perform enforce same declaring step/slot, cited document/generation, origin/form-action; wrong-step recipe yields REFERENCE_MISMATCH before fill. |
| 5 | SEC-5/6, C-18/19/20 | Isolated-world collector's single bounded complete candidate function and retained handle; no exported password node, no replacement element, no typing after focus mutation; README GA limits. |
| 6 | SEC-2/3/4, C-2/15/17 | Scope/preflight/prepare/dispatch, no early value reads, exactly one admitted value-bearing guided frame, erase/dispose all exits, capacity choice, safe digest identity. D2 applies. |
| 7 | SEC-2/5/6/8, C-1/2/4; rotation/isolation | Real observed dispatch→job→IPC→adapter, fresh Vault resolve in actual retry pass, missing origins fail closed, same password guard, zero model calls. |
| 8 | C-14 | Actual observed executor/collector on both paths rejects password reads and excludes observed value from failure. |
| 9 | C-5 plus C-4 failure sub-runs | Streaming Vault reader and both actual guided/observed wire writers, printable objects and all backend sinks, buffers zero on success and exceptional exits, residuals recorded. |
| 10 | SEC-7, C-6 | Static production-sink guard and actual guided/replay redaction paths; authentic raw-error capture paired with zero sink hits, blocked child diagnostic env. |
| 11 | C-3 | Both persistent contexts, prewritten preferences, missing-file refusal, disk scan before cleanup and Chromium version evidence. |
| 12 | SEC-4, C-7 backend half, C-13 | Create API and dispatch bounds; route-set and no-value-response pins. UI/MSW half remains OBS-008. |
| 13 | SEC-2, C-4 | Actual retry/outage/recovery and at-most-once observed/guided paths, bounded revocation both modes; D3 applies. |
| 14 | SEC-9 corrected to two paths, C-11/16; rotation | Transactional release/usage audit rows, attempts/coordinates/version identifiers, distinct unreached/refused usage, append-only table, canary scan; D1/D5 apply. |
| 15 | SEC-10; both migration-order tests | Account code/ABI/DB removal, no cookie capability/calls; V34 fail-loud guards and complete closed v3 publication, unchanged V30–33; D5 applies. |
| 16 | AC-16 worker and !worker integration | Real API-accepted observed dispatch uses observed route in both profiles; verifier injected, no fallback to legacy route. |
| 17 | AC-17 two context-load tests | No guided properties ⇒ required beans and approved defaults present; execution kill switch refuses learn and replay. |
| 18 | §5 oracle 3 cases × 2 paths, C-12 backend | Missing login=false, wrong password=true, passing registration assert unannotated; annotation never changes result, correct failed step/reached observation, no password value read. |
| 19 | SEC-1…10; §5; rotation/revocation/isolation; end-to-end; C-1…7/11…20 | Actual backend/PostgreSQL/Core-HTTP/runner/Chromium, publish + two distinct replay receipts with same artifactHash and silent gateways; exact source/build/pins/counts/skips. C-12 includes clarification/result/repair bytes under T2; UI explanation render remains OBS-008. |

## Production seams and additional implementation cautions

1. `GuidedDispatchService.java:80-104` consumes/commits before constructing/sending an ephemeral frame and rejects ambient transactions. Preserve at-most-once and no outbox. Recovery tests must never resend an already-consumed action to obtain a passing proof.
2. `StudioDispatcher.java:320-367` has ordinary scoped resolution/close on failure. `:380-426` is currently a separate observed branch: it neither resolves secrets nor follows ordinary definite-refusal retry semantics. AC-7/13 must actually change this branch; a passing legacy C-4 is insufficient.
3. `VaultStudioReferenceResolver.java:63-94` preflight currently reads secret values and erases them. Names-only start/prepare must use a scoped existence/metadata seam instead; `StudioVaultProvider` currently has read/list but no explicit exists method. Authorized-start/prepare read counter must also be zero, not just the already-denied case. No secret bytes may enter classifier, prompt or session row during existence checking.
4. `RunJob.java:78-83,123-155` retains a deep-copied observed JsonNode, and `HttpRunnerDispatchClient.java:105-116` serializes `job.observed()` directly for observed jobs. Replacing only `resolvedSecrets` and the ordinary body writer leaves this observed value-bearing envelope exposed to record-toString/Jackson copying. AC-9's single SecretValue writer and all-value-free printable guarantee must cover the actual observed envelope and exception paths.
5. Collector `:35-41,504-515,544-560` already tracks mutation revision and complete candidate-universe guards. The new resolver must retain these guards: a currently attached handle alone cannot detect detach/re-attach between prepare and fill. Do not assert uniqueness from a truncated/budget-exhausted count. Overflow or unknown traversal completeness must refuse, never clamp to a usable count. Existing fill `:667-677` rechecks after synchronous focus; new password fill must preserve that check and `/trap` zero-typing proof.
6. `observedReplayAdapter.ts:17` creates observations with `knownSecrets:[]` today; it must receive/withhold actual secrets before actions and sanitize every following observation. Rotation/isolation canaries must exercise that actual adapter, not substitute fake observation exports.
7. `HashicorpStudioVaultProvider.java:350` parses a tree, both wire clients use ofString, create bound remains 8192, control service has cancellation only, and translation has false defaults/two absent matchIfMissing gates. These are accurately specified required changes, not evidence already implemented.
8. V34 is free at review time. V33 has exact v2 SQL predicates and closed coverage keys (D5). Profile split remains necessary: observed/publication configuration is !worker, while readiness injects verifier optionally. Setter is not dead code.
9. C-7 backend and C-12 backend are this story's obligations; UI/MSW/explanation render remains OBS-008. C-8/9/10 and human video masking are OBS-009/010. Preserve all external G-1/2/3 gates and stated JVM/JS/TLS, video echo, whole-origin trust and Vault version-history residuals.
10. AC-14 retention default is unchanged. Root/architect RULING-5 selects monthly partitions keyed by immutable `release_occurred_at`; USAGE carries the RELEASE timestamp so both remain in the same retention month, while `occurred_at` records actual event time. The existing twelve-month pruner performs detach/drop. An immutable insert trigger plus transactional lock validates the full scoped RELEASE locator; actual session/admission/execution FKs remain. AC-14 does not require an audit self-FK, and no self-FK is claimed. Ordinary UPDATE/DELETE remain refused; controlled partition ownership/retention role must not grant generic DELETE authority. RELEASE→USAGE locator writes remain append-only and insertion must enforce identical scope/attempt/secret/coordinate and duplicate refusal. Cross-month retention must not orphan retained USAGE, block approved expiry indefinitely or allow mismatched links. DDL/FK strategy remains a data-engineer implementation choice under these invariants; require actual PostgreSQL missing/wrong-scope/duplicate/concurrent USAGE refusal, cross-month alignment and detach/drop retention oracles alongside SEC-9/C-11. A USAGE referencing a pruned RELEASE must fail, and no retained USAGE may outlive its RELEASE partition. This does not change Q3's window.

## Completion boundary

Remaining DDL clarification (AC-13/14/19, C-4/C-11): the write-once `REVOKED_MID_RUN` authorization decision must coexist with exactly one terminal USAGE summary for each RELEASE. Architect/data-engineer must explicitly define its row kind, affected-release link, decision-stage discriminator and uniqueness key before V34 SQL edits. The proposed separate LIVE_RECHECK authorization-decision RELEASE linked to the prior resolved RELEASE is acceptable in principle only if it records no send/value, does not replace the original resolution fact, creates no second terminal USAGE, preserves the complete scoped locator/retention month, and repeated/concurrent sweep/control checks cannot duplicate the event. This remaining data-model clarification does not affect independent Lane C contract construction and is not claimed closed by this review. Root owns its pre-DDL hold and durable amendment.

Only this evidence file is owned by this check. Root owns T0 File List/Dev Agent Record reconciliation (including build-time classpath-copy KI-1 and shared CredentialPatternScreen KI-2), dispatch sequencing, tests, cost accounting and later independent SDC review. Root must cite this report and the ruling hashes; T1 must land as one compile-green batch before T2/T3, each lane reviewed before T4. This report does not certify implementation, a deployment, a real provider, a production credential or a human pilot.

## Durable ruling and production-seam hash manifest

| Source | SHA-256 |
|---|---|
| `.ai/STUDIO-OBS-007-architect-t0-rulings.json` | `4d741f49656a6467b946ecde6cde92265a61e8969f8c13c5d4399eb28bcc66ff` |
| `docs/qa/evidence/STUDIO-OBS-007/t0-data-design.md` | `0d1bf7383ac02932a5052e8e3df827c6979f23392c4865fbee58cd76a326164e` |
| `backend/src/main/java/com/citi/put/checks/studio/guided/bridge/GuidedDispatchService.java` | `4c4d41d0f1bc2bac7e9f4a8aa9881a1066f68ef82a4930167a210a7ecb20aed3` |
| `backend/src/main/java/com/citi/put/checks/studio/dispatch/StudioDispatcher.java` | `f35d62a0e26473c61afe61aeda2623809ffd9503a215b33fe90aaa8aa9e4c39e` |
| `backend/src/main/java/com/citi/put/checks/studio/dispatch/RunJob.java` | `3a20dfeefb6550731f4ad79526c23c8e68103a13c14299095123e23617c0766c` |
| `backend/src/main/java/com/citi/put/checks/studio/dispatch/HttpRunnerDispatchClient.java` | `a3db293eacf118569d1b130bb24e867041b69476ad978f81005829eb34a13d37` |
| `backend/src/main/java/com/citi/put/checks/studio/guided/bridge/GuidedRunnerClient.java` | `1045d1a706a34c10791a335e674dd2893f392e77d32086947f68e76d0b2fa876` |
| `backend/src/main/java/com/citi/put/checks/studio/guided/publication/ObservedRevisionVerifier.java` | `204d2fcc66a04e9e1ca476f954189a2b08f9a13ab8ef321f9350b67e7dc4ade7` |
| `backend/src/main/java/com/citi/put/checks/studio/guided/publication/ObservedReplayAuthorization.java` | `8c129bd8c3a97c3f26c5cd967e57bcee18d5eab2cb7c4af439c975faef0a1331` |
| `backend/src/main/java/com/citi/put/checks/studio/internal/ExecutionControlService.java` | `f190dd267cd30d4a6e3796896c55e889f41f82a3bb03ca2949585350989a9dd1` |
| `backend/src/main/java/com/citi/put/checks/studio/secrets/VaultStudioReferenceResolver.java` | `b93072c9797ef86a5990c185de773cd90a508bc838f2218d72b6f09a3b178ac0` |
| `backend/src/main/java/com/citi/put/checks/studio/secrets/StudioVaultProvider.java` | `666abdd7cf385dd76337f82aebc013bd237af676ceb5a6c3eec10008d17e31de` |
| `backend/src/main/java/com/citi/put/checks/studio/secrets/HashicorpStudioVaultProvider.java` | `baab52e93c9b1b21031b3d4f33dbe1882362739471605efbffe0b3f7071a6634` |
| `backend/src/main/java/com/citi/put/checks/studio/secrets/StudioSecretsService.java` | `aa38e51ed271b80df68a1865510043d42e33c97abea2190cc3e89d1a00aa200c` |
| `backend/src/main/java/com/citi/put/checks/studio/guided/translation/GuidedTranslationConfiguration.java` | `c7bbf305dc6d9e6acf01cbe836d15af979690ca94ad7b8479aafd442d25c277d` |
| `backend/src/main/java/com/citi/put/checks/studio/guided/translation/GuidedTranslationProperties.java` | `07918c5c4a6cf9c40a4d199930a9e1c44f69dfabdad13710cb656384c0bb76ec` |
| `backend/src/main/resources/db/migration/V33__studio_observed_publication.sql` | `1119fe64db48d1eeb90fb3798cdd51eea1cd9da63bc0fd13d162af5309d6e50d` |
| `studio-runner/src/guided/transport.ts` | `bada1cc6afe548274737a2ddc90bbf14e0601039ebd296ab3d7102b8c77e4d57` |
| `studio-runner/src/run/observationCollector.ts` | `d67478b454ee60e8f532513be1c96916f6b14e97ab2f1cf4e55b9a6cfd13407f` |
| `studio-runner/src/run/browser.ts` | `26bafde12692b584521a136a91d63affb86e2a5f7a1ab24e2741fbb972aa0a3c` |
| `studio-runner/src/run/observedReplayAdapter.ts` | `02b5b79e460a134ae7408ba7029de43f31365c43bf5e7ac3c563431525281006` |
| `studio-runner/src/server/runCoordinator.ts` | `616bb068ea4267c062cf63d868ead2e882fe38c824ca83d2686a82a4f2f6029e` |
| `studio-runner/src/reporting/reportClient.ts` | `871d3a3e39828422b105fd7003bcb5ace9172dfa5accb31010bd9e2943e2bae4` |
| `studio-runner/src/validator/observedReplay.ts` | `2a9b8d5e9364de8d5b4133ad7da16c13e996fce0a294fa2a107e1829427ada63` |
