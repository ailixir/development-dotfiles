# Guided learning run — data flow for the compliance approval (STUDIO-OBS-014 AC-2)

| Field | Value |
|---|---|
| Date | 2026-10-13 |
| Status | Draft for the external Security & Compliance review. **The approval is external and is gated in STUDIO-OBS-010. This document does not record it as obtained.** |
| Scope | The guided ("learning") run of Checks Studio after STUDIO-OBS-014: what leaves the trust boundary, what is stored, for how long, under which controls, and what remains open. |
| Sources | ADR-SC-005 (P0 "compliance approval of page-metadata/origin export and retention"), ADR-SC-004 (trust boundaries, INPUT-POLICY-01), rulings `docs/qa/evidence/STUDIO-OBSERVED-NEXT/ar-2-3-obs014.json` (AR-2), `po-x6-and-leftovers.json` (X6), `c2b-spec.json`, `ar-mounted-rules.json`, `ar-2-r14-stops.json` |
| Author | @dev (Dex), lane B14. Statements marked **(code)** were read in the working tree on 2026-10-13. Statements marked **(open)** are questions, not facts. |

## 1. Actors and trust boundary

| Actor | Trusted for | Notes |
|---|---|---|
| Studio backend (API pods) | Authorization, policy, persistence, validation of every model proposal | Holds the governed policy, the session row lock and the audit emitter. |
| Guided worker (`studio-runner`, separate Deployment) | Driving the browser and producing **sanitized** observations | Mounted configuration carries TLS/JWT/callback material only. Since S3 it refuses a mounted `applicationPolicy` or `rules` key in any form (`CONFIGURATION_DENIED`) and receives the policy in the hash-bound context. |
| Model gateway (GenAI provider behind the platform gateway) | Nothing. It proposes; trusted code decides (ADR-SC-004). | **Outside the trust boundary.** |
| Application under test | Nothing | The page is untrusted input. |
| SIEM | Receives the audit stream | Sink provisioning is OBS-009. |

## 2. What leaves the trust boundary (to the model gateway)

Per model call the backend sends one prompt built by `GuidedPromptAssembler` **(code)**:

1. **The sanitized observation of the current page** (`progress.observation`, exported unchanged):
   - `origin` of the page (one of the session's approved origins);
   - per node: `role`, `name` (accessible name), `elementType`, `controlType`, `classification`,
     `policyRuleId`, visibility/actionability flags, structural ids (`nodeId`, `parentNodeId`,
     `regionId`, `formId`, `labelNodeIds`), and `locatorHints` (role+name, label, testId, text or
     placeholder **values**);
   - coverage metadata (counts of withheld regions and password controls).
   Under `allowStructuralDiscovery` (always `true` in a governed policy) this includes the names of
   controls, headings and links on the page. **These can carry personal or business data** (a
   customer's name in a heading, an account number in a link text). Visible text and control values
   are exported only where an approved governed read grant (`visibleText` / `controlValue`) covers
   the region.
2. **The execution evidence** of the last action (kind, document id, generation, origin).
3. **Authored source text** of the test steps, limited to the regions INPUT-POLICY-01 branch A
   approves, plus opaque tokens for `<secret ID>` / `<var NAME>` (names only).
4. **The plan state** (obligation ids, target intents, needs, bindings: ids and closed codes).

Not sent: password field values and anything matching a `knownSecrets` value (withheld by the
runner's sanitizer), secret values (secrets are resolved only at dispatch, inside the runner),
cookies, raw DOM, screenshots or video.

**(open) ED-01 — gateway-side retention.** Whether the gateway or the provider logs or retains
prompts and completions, for how long, and in which region is **unknown**. It is a question to the
gateway owner (ED-01) and a precondition for the OBS-010 approval.

## 3. What is stored, and for how long

### 3.1 Learning-session state (pruned by AC-3)

| Store | Content | Retention |
|---|---|---|
| `studio_guided_sessions.progress` | The latest sanitized observation, execution evidence, the open clarification (question and choice labels), resolved clarifications, origin, translation bootstrap and acquisition state, model reservations, secret release decisions (ids and codes) | **Pruned** `observation-window` (default **30 days**, `STUDIO_GUIDED_OBSERVATION_RETENTION`) after the session's hard expiry, once the session is terminal. Only `stepIndex`, `errorCode`, `detail` (`{stepId, loginStepsPresent}`), `teardownStatus`, `publicationRevisionId`, `publicationRevisionDigest` and `evidenceRef` are kept (retain-list, fail-closed; `studio_guided_progress_retained_keys()` in V19). |
| `studio_guided_model_attempts.safe_result` | The validated model output (proposal, plan, question) | Set to NULL by the same prune for every terminal attempt. Identity, digests, token counts and timestamps stay. |

The prune runs hourly (`GuidedObservationPruner` → SQL function `studio_guided_prune_session`),
judges the window on the database clock only, and is write-once (`pruned_at`). Start-up refuses a
window shorter than 24 hours; the database refuses one shorter than 1 hour.

### 3.2 Publication copies (PO ruling X6)

While a session runs with publication enabled (the default), the backend also copies evidence into
four append-only publication tables. **The content is not IDs/codes only.**

| Table | Field-level content |
|---|---|
| `studio_guided_publication_bases` | Session/test/CSI identity, revisions and hashes, the original principal id, `runAuthorization`, `replayRequirements`, and `initialContext` `{kind, origin}` (a page origin). |
| `studio_guided_publication_observations` | The full sanitized `observation` of each captured page: `origin`, and per node `role`, `name`, `locatorHints` values, and `permittedBusinessData` / `nonsecretApproved` content where a governed read grant allowed it. |
| `studio_guided_publication_preparations` | `execution_evidence`, the model-derived `proposal` (target locator role/name or value, operation), and the runner's preparation `proof` (ids, hashes, expiry). |
| `studio_guided_publication_admissions` | Ids and hashes only (admission, preparation, obligation, proposal hash). |

Retention:

- **(a) Published sessions** (a `studio_guided_publications` row exists): **retained indefinitely**,
  as long as the published revision exists. They are hash-bound into the revision's publication
  receipt (`publicationEvidenceHash`) and are its provenance; pruning them would break the
  integrity the replay relies on. The prune leaves them byte-unchanged (proven by
  `GuidedObservationPrunerIT`).
- **(b) Never-published sessions** (terminal, no publication row): the `observations`,
  `preparations` and `admissions` rows are **deleted** by the AC-3 prune under the same 30-day
  window. Their `bases` row and `studio_guided_publication_attempts` rows are **kept**: they hold
  identity, hashes, authorization and validator receipts, and the base's `initialContext.origin`.

### 3.3 Other stores (retention not changed by this story)

**"Observations and model output are pruned after the window" is true only for the AC-3 stores
in §3.1 and the never-published copies in §3.2 (b).** The stores below still hold page-derived and
model-derived content after the window. Their retention is **indefinite**: `backend/src/main` has
no `DELETE` for them, and V14 triggers guard their content (`tr_guided_plan_immutable`,
`tr_guided_obligation_assignment`, `tr_guided_question_assignment`, `tr_guided_admission`,
`tr_guided_preparation_identity`; `studio_guided_commands` has no trigger). Content class is
inferred from the DDL by @architect (AR-2 residuals) and was not traced field by field. They are
not in STUDIO-OBS-014's AC-3 scope (AC-2 clarification R-1): pruning them is a follow-up story for
@pm (per-table tracing and a prune design by @architect first). It is not release-blocking by
default; the OBS-010 compliance gate decides, and if Security & Compliance do not accept this
disclosed indefinite retention, the follow-up becomes an OBS-010 release blocker.

| Store | Content class | Retention |
|---|---|---|
| `studio_guided_actions.proposal`, `studio_guided_obligation_admissions.proposal` | Target locator role/name | Indefinite (immutability triggers) |
| `studio_guided_clarification_contexts` (`identity`, `meanings`) | Question and choice text | Indefinite |
| `studio_guided_translation_plans.plan` | Model output (plan) | Indefinite |
| `studio_guided_preparations.proof` | Ids, hashes, expiry | Indefinite |
| `studio_guided_commands.response` | Cached command responses, which may embed clarification payloads | Indefinite |
| `studio_guided_publication_bases` `initialContext.origin` | A page origin; kept for never-published sessions too (AR-2 e) | Indefinite |
| `ui_test_revisions` (artifact, learned plan) | The published replay plan (locators) | Life of the test |

### 3.4 Video (STUDIO-OBS-013)

The learning run's recording is stored in the object store and expires with
`studio.execution.evidence-retention` (default 30 days), the same window as observations.
Details are OBS-013's.

Local recording scratch uses a private worker scope and process-incarnation marker. Normal
settlement removes the owned recording after its upload attempt. After SIGKILL, the next startup
may remove only marker-verified recordings whose owner is definitely dead; it preserves live,
foreign, unmarked and uncertain ownership. Restart never uploads or invents a callback for a dead
session. Legacy unmarked scratch is not claimed as recovered. Browser/profile process reclamation
retains its separate OBS-009 scope.

This cleanup assumes the trusted host, dedicated non-root service account and private scratch
required by ADR-001. Page/model/API input cannot choose its paths or ownership. Linux uses
`/proc/self/fd` anchoring; macOS uses checked private paths, no-follow opens and inode fences.
It does not provide a filesystem sandbox against a malicious unsandboxed native process sharing
the runner UID. Candidate/entry/depth/reclaim limits and elapsed-work checks bound scheduled work;
the five-second cooperative budget cannot cancel a stalled OS filesystem call. A failed cleanup
cannot declare worker readiness while operations remain pending. The exact boundary and required
platform proofs are in the [dated portability ruling](../../qa/evidence/STUDIO-OBSERVED-NEXT/strict-qa-20261014/architecture/portability-addendum.md).

### 3.5 Governance and metering records (new in STUDIO-OBS-014)

| Store | Content | Retention |
|---|---|---|
| `studio_guided_policies`, `_policy_versions`, `_policy_approvals`, `_policy_audit` | The governed policy per application environment: allowed origins, observation application policy, side-effect stance, destructive vocabulary; author, approver, approval reference; trigger-written change chain | Indefinite, immutable (audit trail) |
| `studio_guided_session_policies` | Which policy version each session ran under, and its hash | Indefinite, immutable |
| `studio_guided_csi_token_days` | Per-CSI daily token counters (ids and integers only) | One row per CSI per day; not pruned (residual) |

### 3.6 Audit stream (AC-10)

Every admitted guided action and every replay dispatch emits one event; validator-refused
proposals emit `GUIDED_ACTION_REFUSED` at the implemented AC-4/5/6 decision. Events use logger `com.citi.put.checks.audit.studio` (`stream=studio-audit`, no MDC). Fields:
`schemaVersion, eventType, eventId, principalId, csiId, testId, sessionId|executionId,
admissionId|attemptId, origin, obligationKind, targetRole, targetLabelHash, outcome, reasonCode`.
IDs and closed codes only. The origin is emitted only after it is verified to be one of the
session's approved origins (otherwise `UNAPPROVED`); the target's label leaves only as
`targetLabelHash` = first 32 hex characters of `sha256(scopeHash + ":" + label)`.
Volume bound: at most 200 admitted + 100 refused events per session, one per replay dispatch.
Retention in SIEM is the sink's (OBS-009).

## 4. Controls

| Control | Where | Effect |
|---|---|---|
| Governed observation policy (AC-1) | Backend policy service + V19 (start-time enforcement implemented in S3) | Per application environment, versioned, approved by a Security approver who is not the author, audited by triggers. A learning session starts only under an approved, current version; its origins must stay inside the platform-trusted origins. |
| Hash-bound policy in context | Backend context + runner | The runner refuses (`IDENTITY_MISMATCH`) a context whose policy hash it does not reproduce; the backend ends the session `RUNTIME_INCOMPATIBLE` on first receipt. Implemented in S3 with C2b. |
| No mounted read authority | Runner (implemented in S3) | `applicationPolicy` and `rules` are refused in the worker's mounted configuration. |
| Sanitizer | Runner (`observationSanitizer.ts`) | Exports only policy-permitted classifications; withholds password controls and any `knownSecrets` value. |
| INPUT-POLICY-01 branch A | Backend | Only approved authored source regions reach the model; secrets as names only. |
| Semantic grounding, destructive-verb guard, side-effect stance (AC-4/5/6) | Backend validator | A click/press/check must trace to authored text; destructive verbs need the author's word; `CLARIFY_FIRST` (default) asks before the first side-effecting action, `DENY` refuses. Side-effecting is fail-closed (ruling AR-SEC001-FM): every click except one that only focuses a text field, textarea or select, every Enter press, and any press inside a form. So under `DENY` the learning run can navigate to authored URLs, fill, check/uncheck, select, read and assert, but cannot click buttons, links, labels or toggles. *(Implementation status: see the story's Dev Agent Record.)* |
| `labelSource` on clarification choices (AC-7) | Backend + UI | Page-derived labels are marked `PAGE` with role/region so the UI can mark them untrusted. |
| Per-CSI budgets (AC-8) | Backend + V19 (implemented in S3) | Concurrent sessions and daily model tokens per CSI, persisted across replicas. |
| Retention (AC-3) | Backend + V19 | §3.1–3.2. |

## 5. Residuals for the approver

1. **(open) ED-01** gateway-side retention (§2).
2. Indefinite retention of published sessions' publication copies (§3.2 a), with the integrity
   rationale; and of the stores in §3.3.
3. `targetLabelHash` is reversible by dictionary for common labels within one scope (no keyed HMAC
   this wave; see `artifact-hmac-design-note.md` for the key infrastructure question).
4. **Two policy sources for one application (interim, AC-2 clarification R-2).** Learning sessions
   take origins and read rules from the governed policy (AC-1); replay still binds
   `currentPolicyHash` to the platform-configured `TrustedPolicy` (AR-2 g). Interim behaviour:
   (1) governed origins must be a subset of the trusted origins, re-checked at every learning
   start, so governance can narrow but never widen; (2) approving or narrowing a governed policy
   version changes **no** replay binding or verdict for an existing revision, so a CSI owner who
   removes an origin stops new learning on it while published revisions keep replaying against it
   for as long as the platform `TrustedPolicy` allows it; (3) replay is bounded by the platform
   `TrustedPolicy` alone. Unifying the two sources is a follow-up story for @pm, @architect ruling
   first.
5. Guards are proven with a controlled model provider only; real-model behaviour of the guards is
   measured in OBS-009's benchmark.
6. `studio_guided_csi_token_days` grows by one row per CSI per day (ids and integers).

### STUDIO-OBS-015 retained incremental source and materialization facts

Incremental sessions add immutable `studio_guided_relearn_plans`, `_relearn_switches`,
`_prefix_requests`, `_no_invocation_receipts` and `_suffix_acceptances`. Their bounded metadata
records the pinned base, exact prefix program, authenticated no-invocation transition and retained
successful admissions. A receipt hash establishes integrity; owning-worker RS256 and connector
mTLS establish callback authority. The receipt never establishes publication success by itself.

`studio_guided_materialization_versions` retains at most 201 version headers per session, and
`studio_guided_materialization_inputs` retains at most 200 distinct input entries. Each input is
stored once, with a 32 KiB canonical entry bound; canonical current payload and aggregate immutable
entries remain bounded to 1 MiB. Historical versions reconstruct an exact ordered input prefix.
These private entries include nonsecret input values and secret identifiers, never resolved Vault
values. The latest `studio_guided_materializations` payload and existing residual source manifests,
proposals, plans and command caches remain retained under F01. The source manifest additionally
retains private `authoringSnapshot`: the exact normalized authored v2 contexts and text plus complete
referenced declaration identities, with plain values represented by hashes.

The existing V19 pruner retains its scoped progress/model-result/publication-copy behavior. It does
not erase these private input histories or authoring snapshots. Safe immutable transition metadata
and version headers remain available after progress pruning. This disclosure does not claim complete
input erasure or change F01's Security & Compliance and OBS-010 release gate.

Internal pure publication evidence exposes input metadata minus resolved values with hashes of the
full private entries, and exact authored source needed to recompute snapshots. Positive model,
provider and public projections exclude the added private authoring snapshot, historical input
values, prefix program and receipt proof facts. These facts are not log payloads, video annotations
or UI explanations. Existing gateway/Vault/SIEM external evidence requirements remain separate.

STUDIO-OBS-015 checkpoint05 source uses the same retained private stores for internal accepted-plan
IDs, immutable historical preparation/version joins, and old/first/later suffix acceptance audits.
Internal server plan validation does not strip IDs or rewrite stored plans into model wire shape.
Current-session human prefix consent is retained by existing clarification progress; the protected
pending action remains unadmitted during the wait, and confirmation obtains a fresh observation,
context acknowledgement and preparation on the same owned browser before dispatch. Earlier lawful
prefix navigation/read/fill can precede that wait. The application fixture source measures these
boundaries and actual media clocks; it neither manufactures action timings nor changes the existing
retention or external gateway/Vault/SIEM evidence requirements. Current source remains unexecuted.
