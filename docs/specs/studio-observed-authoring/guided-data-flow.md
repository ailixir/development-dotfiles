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
| Studio backend (API pods) | Authorization, persistence, validation of every model proposal | Holds the session row lock and the audit emitter; learning origins are the test's own URLs. |
| Guided worker (`studio-runner`, separate Deployment) | Driving the browser and producing **sanitized** observations | Mounted configuration carries TLS/JWT/callback material only. It refuses a mounted `rules` key in any form (`CONFIGURATION_DENIED`) and applies the runner's one constant observation read profile to the origins of the context. |
| Model gateway (GenAI provider behind the platform gateway) | Nothing. It proposes; trusted code decides (ADR-SC-004). | **Outside the trust boundary.** |
| Application under test | Nothing | The page is untrusted input. |
| SIEM | Receives the audit stream | Sink provisioning is OBS-009. |

## 2. What leaves the trust boundary (to the model gateway)

Per model call the backend sends one prompt built by `GuidedPromptAssembler` **(code)**:

1. **The sanitized outline of the current page** (ADR-SC-007; the string `progress.observation.outline`
   and nothing else of the observation). It is at most 40,000 bytes, one line per shown element, and
   each line is `role "name" [ref]` followed by closed, bounded hints:
   - `ref`: a short per-observation reference (`e1`, `e2`, ...) the model names to pick an element;
   - `name`: the accessible name, cut at 160 characters;
   - states, `placeholder`, `url`, `near` (the nearest visible text) and `in` (the form, row, dialog
     or region that contains the element) where the page has them, and the visible text of an
     element where a read grant of the observation policy (`visibleText`) covers it;
   - `origin` of the page (its host is on the deployment's allowed domains) in the context, with the
     coverage counts (withheld regions, unsupported regions, password controls).
   Password controls, withheld elements and unsupported regions appear as lines **without a ref**, so
   the model cannot name them. The **facts table** (`progress.observation.facts`: per ref the role,
   name, editable flag, the evidence string with the parts that supplied it, and the text where the
   grant allowed it) **never leaves the backend**: the gates run over it, and a canary test proves it
   is absent from every request body.
   Under `allowStructuralDiscovery` (always `true` in the observation policy) the outline includes the
   names of controls, headings and links on the page. **These can carry personal or business data**
   (a customer's name in a heading, an account number in a link text). Visible text is exported only
   where a read grant of the observation policy covers the region; current control values are never
   rendered.
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
| `studio_guided_publication_observations` | The full sanitized `observation` of each captured page (at most 512 KiB a row, 4 MiB a session): `origin`, the `outline`, and per ref in the `facts` table the `role`, `name`, `editable`, `evidence` with its segments, and the `text` where a read grant allowed it. |
| `studio_guided_publication_preparations` | `execution_evidence`, the model-derived `proposal` (target `{kind: node, ref}` with its document and generation, operation), and the runner's preparation `proof` (ids, hashes, expiry, and the `target` the runner reported: the locator it synthesized, its tier and the `{role, name}` identity of the element). |
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

The learning run is recorded during every learn. The recording is kept and shown only for a
learn that did not publish (`FAILED`, `CANCELLED`, `EXPIRED`, `UNKNOWN_OUTCOME`,
`PUBLICATION_CONFLICT`, and a `SUCCEEDED` outcome whose publication is still `PENDING` or
`REFUSED`), as the learning attempt and never as a proof. For a learn that publishes, the
publication commit sends the `PUBLISHED` stop reason and the runner discards the recording before
upload: no object, no manifest and no `recording-evidence` callback. The proof of a published learn
is the observed replay of the published revision (trigger source `AFTER_LEARN`), stored and
retained like every replay video, not a learning recording. A kept recording is stored in the
object store and expires with `studio.execution.evidence-retention` (default 30 days), the same
window as observations. Details are OBS-013's.

If the runner misses the stop (lease lost, crash or context loss during finalize) and uploads
anyway, the backend refuses the `recording-evidence` callback for a session whose learn published
(`409 RECORDING_NOT_RETAINED`), writes no row and serves nothing: the unreferenced object is
unreadable, and the bucket lifecycle removes it within 30 days, the retention every learn
recording already has. The video route and the result projection decide on the publication, not
on the session state string, so a recording row written before the commit is never shown for a
published learn.

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

**Note 2026-10-29 (append-only): export shape of generated step code
([ADR-SC-008](../../architecture/ADR-SC-008-generated-step-code.md), contract record
[ADR-002](../../architecture/ADR-002-internal-contract-surface.md) §13).** Once the SC008 contract
freeze lands, three things change in what this document describes. Items 1 to 4 of §2 are
unchanged, and so are the sanitizer, INPUT-POLICY-01 and the rule that secret values never leave the
runner.

- **Sent to the model, new.**
  - *Repair text.* After a failed attempt the model receives its own previous step code, the closed
    error code, the stage, the line and column in that code, the match count and at most 256
    characters of "received" text that passed the outline sanitizer. Playwright error messages are
    never forwarded.
  - *Retrieved examples.* Up to 3 step-code snippets per call, each from a step whose frozen code
    passed a model-free proof of its revision, from the **same CSI only**. Authored literals are
    replaced by placeholders, and a snippet is sanitized when it is stored and again when the prompt is
    assembled. Retrieval is lexical and never runs during replay.
  - *Playwright reference.* A static text generated from the pinned Playwright 1.63.0 type
    definitions. It carries no tenant data.
- **Stored, new.** The frozen step code of every step, at most 16 KiB each, with its source hash,
  reference hash and step hash, in the learned-plan and revision rows where typed operations are
  stored today, with the same retention as a revision. It holds no secret value (a secret is an
  opaque handle resolved at dispatch) and no `<var NAME>` value (bound when the step runs). No public
  route returns it in this release.
- **Not covered by the sanitizer, accepted.** Code the model writes can read and send data through
  console output, cookies, request bodies, Node-side `page.request`, `exposeFunction` and Playwright
  error text (ADR-SC-008 Deferred items 10 and 11). During learning that code runs in the runner
  server process (item 6). The domain allow-all switch stays on (item 12), so the allowed-domains list
  restricts no navigation.
- **Video.** Unchanged: one proof video per revision, the recording of the opener page. A page the
  step code opens in a popup is not recorded in that video, and its recording is deleted when the run
  closes; the step's evidence says it acted in a separate window.
- **Condition.** The gateway owner's answer to ED-01 and compliance's confirmation of this export
  shape are required **before production use with real CSI data** (ADR-SC-008 O-1; request draft in
  `docs/specs/studio-generated-step-code/compliance-request.md`). They are not required for the
  build or for the public-site gate.

### 3.5 Metering records (new in STUDIO-OBS-014)

| Store | Content | Retention |
|---|---|---|
| `studio_guided_csi_token_days` | Per-CSI daily token counters (ids and integers only) | One row per CSI per day; not pruned (residual) |

### 3.6 Audit stream (AC-10)

Every admitted guided action and every replay dispatch emits one event; validator-refused
proposals emit `GUIDED_ACTION_REFUSED` at the implemented AC-4/5 decision. Events use logger `com.citi.put.checks.audit.studio` (`stream=studio-audit`, no MDC). Fields:
`schemaVersion, eventType, eventId, principalId, csiId, testId, sessionId|executionId,
admissionId|attemptId, origin, obligationKind, targetRole, targetLabelHash, outcome, reasonCode`.
IDs and closed codes only. The origin is emitted only when it is a bare http(s) origin (an action ran on it only after the allowed-domains check; otherwise `UNAPPROVED`); the target's label leaves only as
`targetLabelHash` = first 32 hex characters of `sha256(scopeHash + ":" + label)`.
Volume bound: at most 200 admitted + 100 refused events per session, one per replay dispatch.
Retention in SIEM is the sink's (OBS-009).

## 4. Controls

| Control | Where | Effect |
|---|---|---|
| Allowed domains | Backend (`AllowedDomains`) and runner | The deployment's allowed-domains list (`studio.navigation.allowed-domains`, runner `STUDIO_RUNNER_ALLOWED_DOMAINS`) is the only navigation control; empty denies everything. The session scope, runner context and replay requirements carry no origin list: each side checks its current list, and replay also pins each step to the origin it learned on. A test that names no URL is refused at start (`NO_APPLICATION_URL`); its first URL, in step order, must be on the list (`ORIGIN_NOT_ALLOWED`). Other authored URLs are checked when used as a destination. There is no per-CSI policy and no approval (STUDIO-GOV-001.3 and .4, then STUDIO-FLEX-001, user decisions). |
| Page hosts outside the list | Runner (`browser.ts`) | Only an author-directed navigation needs a listed host. Page-initiated navigations, redirect chains, iframes and subresources may use any host (an SSO hop, say). Before an observation, or a replay step's guard check, the runner waits up to 15 s for the main frame to be on a listed host again; it observes and acts on nothing while it waits. If the page does not return, learning ends `FAILED` (`ORIGIN_NOT_ALLOWED` when the observation is a refresh; only the host reaches runner diagnostics) and the replay step fails `POLICY_REFUSED`. IP addresses are open: the runner has no egress proxy or address deny list, and firewalls own reachability (STUDIO-FLEX-001, user decision; accepted risk in `docs/architecture/studio-execution.md`). |
| Observation read profile | Runner (`observationReadProfile.ts`) | One constant for every test: structural discovery on, visible text readable in the application region of every allowed domain, no field value readable. One grant per list entry; learning and replay take their grant ids from it (a function of the entry), so a learned read recipe replays under the same grant and is refused (`READ_REFUSED`) once its entry has left the list. |
| No mounted read authority | Runner | `rules` are refused in the worker's mounted configuration. |
| Sanitizer | Runner (`observationSanitizer.ts`) | Exports only policy-permitted classifications; withholds password controls and any `knownSecrets` value. |
| INPUT-POLICY-01 branch A | Backend | Only approved authored source regions reach the model; secrets as names only. |
| Semantic grounding and destructive-verb guard (AC-4/5) | Backend validator | A click/press/check must trace to authored text, and a control whose label holds a destructive verb (a fixed backend list: delete, remove, erase, destroy, purge, pay, transfer, send money, submit order, place order, confirm payment, cancel subscription, close account, deactivate, revoke) needs the author's own word for it. A side-effecting click or Enter is allowed: it raises no confirmation question and is never denied by a stance (STUDIO-GOV-001.3). |
| `labelSource` on clarification choices (AC-7) | Backend + UI | Page-derived labels are marked `PAGE` with role/region so the UI can mark them untrusted. |
| Per-CSI budgets (AC-8) | Backend + V19 (implemented in S3) | Concurrent sessions and daily model tokens per CSI, persisted across replicas. |
| Retention (AC-3) | Backend + V19 | §3.1–3.2. |

## 5. Residuals for the approver

1. **(open) ED-01** gateway-side retention (§2).
2. Indefinite retention of published sessions' publication copies (§3.2 a), with the integrity
   rationale; and of the stores in §3.3.
3. `targetLabelHash` is reversible by dictionary for common labels within one scope (no keyed HMAC
   this wave; see `artifact-hmac-design-note.md` for the key infrastructure question).
4. **The deployment list is the only navigation control (STUDIO-FLEX-001).** Which domains a learning
   session and every replay may open is `studio.navigation.allowed-domains`, set per environment (with the `studio.navigation.allow-all-domains` option, ON by default for now, one chart value for backend and runner, that
   ignores the list and allows any DNS-named http(s) host). IP
   addresses are open (firewalls own reachability): the browser can reach internal endpoints, including
   cloud metadata, and an IdP page can appear in the video evidence (accepted risks, user decision).
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
