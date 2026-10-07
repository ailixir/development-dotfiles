# Spec: Studio identity-name disclaimer (functional IDs first, personal logins at own risk)

> **Story ID:** studio-secrets-disclaimer
> **Complexity:** STANDARD (re-estimate for iteration 3: scope 3, integration 3, infrastructure 1, knowledge 2, risk 3 = 12/25; `complexity.json` scored 11 before the plain-variable contract was added).
> **Generated:** 2026-10-05
> **Status:** Draft, **iteration 4** (critique iteration 3, NEEDS_REVISION 3.98, CRIT-14..CRIT-22; PO-9 on 2026-10-06). Iteration 2 was APPROVED by @qa (4.5). Iterations 3/3b changed the trigger, surfaces and contract; iteration 4 replaces the matcher (PO-9) and closes the iteration-3 critique items.
> **Inputs:** `requirements.json` (iteration 4: `poDecisions` PO-0..PO-9, FR-1..FR-15), `complexity.json`, `research.json`, `critique.json`, `implementation.yaml#rulings` (plan v1). Every item cites a PO decision (PO-*), an FR/NFR/CON/ASM, a finding (F*), a research recommendation (R*), a critique item (CRIT-*), an @architect ruling, or a code location read on 2026-10-05/06.

---

## 0. What changed (read first)

### 0.1 Iteration 4 (critique iteration 3 + PO-9)

| Item | Change | Trace |
|------|--------|-------|
| Matcher rule | **Any token matches** (PO-9). The iteration-3 head-word rule, its matcher rules R1 (password head words) and R3 (compact suffixes), and the strip list are removed. `LOGIN_URL`, `USER_AGENT`, `LAST_LOGIN`, `EMAIL_SUBJECT`, `USER_PASSWORD` now trigger. `account` keeps the PO-5 narrow rule. Password-only names still never trigger, because they contain no identity word. | PO-9, PO-5, PO-8, CRIT-18 |
| Case parity | The matcher is **case-blind**: it splits on non-letters only and finds identity words inside letter runs, so `svcUser`, `SVCUSER` and `svcuser` give the same result on every surface. camelCase boundaries no longer exist. ASCII-only letters; Java uses `Locale.ROOT`. | CRIT-14 |
| Run path | Run on a dirty draft saves first (`onSaveBeforeRun={saveDraft}`, `ChecksStudioPage.tsx:769`). Run is now gated the same way, with the same visible reason. | CRIT-15 |
| v2 principal | The policy takes an explicit `AckSubject` resolved at each public entry point. `updateAuthoringDraft` evaluates before it delegates with `auth = null` (`StudioService.java:353`). | CRIT-16 |
| Error contract | Structured `variableNames` on both new 400s (contract extension, @architect under OQ-18); every malformed list → `INVALID_IDENTITY_NAME_ACK`, validated in the service after authorization; unknown/blank version on a required name → `IDENTITY_NAME_ACK_REQUIRED`; one entry per distinct name. | CRIT-17 |
| Stale references | `requirements.json` CON-2, NFR-3, NFR-4, ASM-1, domainModel, edgeCases, interactions cleaned; AC-10 kept with a render test. | CRIT-19 |
| @architect rulings | OQ-10, OQ-12, OQ-13 and `new-required-field` shown as RULED (plan v1). D7 diverges from two of them; that is now an explicit re-ruling question in OQ-18, not a silent reversal. | CRIT-20 |
| Gherkin, copy, names | AC-16/AC-19 label and AC-18 audit fields fixed; the reason text says where to tick; name trim/length rules specified. | CRIT-21, CRIT-22 |

### 0.2 Iteration 3

The product owner clarified the feature (PO-0, verbatim): *"the disclaimer is not for inline, its for when the user tries to add a secret name user/login/username."* Four decisions followed (PO-1..PO-4, `requirements.json#poDecisions`).

| Iteration 2 | Iteration 3 | Trace |
|-------------|-------------|-------|
| Always-on plain-variable guidance Alert, policy sentence, template notice | **Removed.** Nothing is shown unless a name matches. | PO-0 |
| `INLINE_CREDENTIAL` message gets guidance | **Removed.** The inline-credential refusal is unchanged. | PO-0 |
| Credential-name hint on `PASSWORD`, `TOKEN`, `PIN`... (advisory) | **Replaced** by an identity-name matcher (`user`, `login`, `soeid`, `email`, ...). Password names never trigger. | PO-2 |
| Plain variables: advisory only, nothing recorded (OQ-11) | **Required** own-risk checkbox, save blocked until ticked, server validation and audit line. OQ-11 closed. | PO-3, PO-4 |
| Vault dialog: disclaimer and checkbox on every create | Disclaimer and checkbox **only when the secret name matches**. `acknowledgedDisclaimerVersion` is required only for matching names. | PO-0, PO-1, PO-4 |

Superseded requirements: FR-3, FR-4, FR-5, FR-6, FR-7. Superseded decisions: D3, D4, D5, D6, D10. Modified: FR-1, FR-2, FR-8, FR-9, D1, D2, D7, D8, D9. New: FR-10..FR-15, D13..D18.

---

## 1. Overview

A Checks Studio author can give a UI test a sign-in identity: a plain variable such as `USERNAME`, or a Vault secret. Nothing in the product tells the author not to use their own login (F1, F3). This spec adds one versioned disclaimer. It appears **only when the author names a secret or variable like a sign-in identity** (PO-0). It steers the author to a CSI-owned service or functional ID. If the author goes ahead, they tick "I understand this is at my own risk", and the server records that (PO-3, PO-4).

| Surface | Status in alpha | Trigger | Gate | Server evidence |
|---------|-----------------|---------|------|-----------------|
| Studio Variables dialog (`ChecksStudioPage.tsx`) | **Live** | Non-secret row whose name matches (FR-10) and is new or renamed (FR-13) | Every save action, including Run's save-before-run, disabled until ticked, with a visible reason (FR-12) | **Yes**: `identityNameAcknowledgements` on the save body, validated and logged (FR-14). Slice B1. |
| Create Check wizard (`UiTestConfig.tsx`) | **Live UI, MSW-backed** (no UI_TEST check contract on the backend, F18) | Same | Next on Check Configuration and Create/Update Check disabled until ticked | **None: the wizard acknowledgment is UI-only** until the backend supports a UI_TEST check configuration (PO-7). Server audit line is follow-up FU-1. |
| Vault Create Secret dialog (`SecretInput.tsx`) | **Dark** until `vaultSecrets` flips (CON-2) | Secret name matches | Create disabled until ticked | **Yes**: `acknowledgedDisclaimerVersion`, required for matching names only (D7). Slice B2. |

**Product-owner position (carried from iteration 2 and confirmed by PO-3/PO-4):** authors MAY use their own login at their own risk, after an explicit, recorded acknowledgment. This still loosens PRD.md:119 and BRD:104 (CON-1, F10). The wording remains a DRAFT pending Legal/InfoSec (OQ-1, CON-5). The PRD/BRD update stays flagged (§8.2).

**What the trigger does not catch (CON-4, PO-2).** The trigger is the *name*, never the value. A personal password in `DB_PASSWORD`, or a personal login stored under a name like `CODE`, shows nothing. That is the product owner's choice, and it is stated here so nobody mistakes the disclaimer for detection.

**What the trigger also catches (PO-9).** Any name containing an identity word triggers, including names that are not sign-in identities: `LOGIN_URL`, `USER_AGENT`, `LAST_LOGIN`, `EMAIL_SUBJECT`, `MAX_USERS`. The product owner accepted these false positives (PO-9). Their cost is bounded: the checkbox appears only when such a name is introduced, never for stored names (FR-13).

### 1.0 Delivery slices

| Slice | Content | Contract change? | Gate |
|-------|---------|------------------|------|
| **A: matcher and frontend gate** | D1 constant (`draft-2`), D13 matcher (TS) and the shared case table, D14 row warning and checkbox, D15 lifecycle, D16 save gating on the Studio page and in the wizard. Nothing new is sent to the server. | **None.** | Normal SDC. |
| **B1: plain-variable evidence** | D17 `identityNameAcknowledgements` on `TestRequest` (v1 and v2), D13 matcher (Java), server validation, D9 audit logger, FE sends the field, error mapping and drift recovery. openapi, `StudioContractTest`, `BASE_SHA256`, ADR-002. | **Yes, Class C** (new optional property, two new save-time 400 codes with a structured `variableNames` list on live `POST/PUT /studio/tests`; ADR-002 §34 precedent, F17). | **Blocked on @architect's ADR-002 ruling** (OQ-18). |
| **B2: Vault-path acknowledgment** | D2 dialog warning and checkbox (name-triggered), D7 conditional field and check, D8 version pin, D9 audit line. | **Yes, Class C** (C6). | Same ruling as B1. Lands before or with the `vaultSecrets` flip. |
| **Deferred** | Wizard server audit line (follow-up FU-1, PO-7). Functional-ID request link (§8.3). DB acknowledgment table (D12, OQ-2). | — | FU-1 / OQ-7 / OQ-2 |

Slice A ships first and alone. On its own it gates the UI but records nothing. B1 and B2 share the Java matcher, the version map and the audit logger, so whichever lands first creates them.

### 1.1 Goals

- One versioned DRAFT copy constant and one matcher version, used by every surface (FR-9, FR-10, PO-1).
- A matching, newly introduced name shows an inline warning and an own-risk checkbox; saving waits for the tick (FR-1, FR-2, FR-11..FR-13, PO-3).
- The server enforces the same rule on the Studio save and on secret create, and writes one audit line per acknowledged name, never the value (FR-8, FR-14, PO-4).
- Saved tests that already hold identity-named variables keep working unchanged (FR-13, NFR-4).

### 1.2 Non-Goals

- Any disclaimer that is not name-triggered: no generic plain-variable Alert, no policy sentence, no template notice, no `INLINE_CREDENTIAL` copy (PO-0).
- Triggering on password-like names (PO-2), or any inspection of values, client or server (NFR-1, CON-4).
- Turning on `STUDIO_CAPABILITIES.vaultSecrets` (CON-2).
- Re-acknowledgment of stored identity-named variables, including when only their value changes (FR-13; confirmed by PO-6, OQ-15 closed).
- Persisting acknowledgments with the test, or making them part of revision identity (NFR-5).
- Server evidence for the wizard before a UI_TEST check contract exists. The wizard acknowledgment is **UI-only** until then (PO-7, FU-1).
- Fixing the wizard's localStorage draft (OQ-6, §8.1). Editing PRD.md or the BRD (§8.2). Final wording (CON-5).

---

## 2. Requirements Summary

### 2.1 Functional Requirements

| ID | Status | Description | P | Slice | Trace |
|----|--------|-------------|---|-------|-------|
| FR-1 | Modified | Create Secret dialog shows the identity-name warning only while Name matches. | P0 | B2 | PO-0, PO-1, PO-3 |
| FR-2 | Modified | While Name matches, Create needs the own-risk checkbox; disabled with a visible reason; resets on open, failure and any Name change. | P0 | B2 | PO-1, PO-3 |
| FR-3 | **Superseded** by FR-11 | (always-on plain-variable guidance) | — | — | PO-0 |
| FR-4 | **Superseded** by FR-10 | (password-name hint) | — | — | PO-2 |
| FR-5 | **Superseded** | (`INLINE_CREDENTIAL` guidance) | — | — | PO-0 |
| FR-6 | **Superseded** by FR-11 | (policy sentence) | — | — | PO-0 |
| FR-7 | **Superseded** by FR-11 | (template notice; the sign-on template's `USERNAME` row triggers FR-11) | — | — | PO-0 |
| FR-8 | Modified | One audit line per acknowledged name on both server paths, with the PO-4 field set, never the value. | P0 | B1, B2 | PO-4 |
| FR-9 | Modified | Copy is one versioned DRAFT constant; matcher has its own version; server holds version → copy hash. | P0 | A, B1/B2 | PO-1, PO-4, CON-5 |
| FR-10 | New | Shared identity-name matcher (any identity token, case-blind) with a shared case table. | P0 | A (TS), B1/B2 (Java) | PO-1, PO-2, PO-5, PO-9 |
| FR-11 | New | Matching non-secret rows on the Studio page and in the wizard show the inline warning and checkbox. | P0 | A | PO-0, PO-1, PO-3 |
| FR-12 | New | Every save action (Studio: header Save, Variables Save, leave-dialog Save, Run's save-before-run; wizard: Next on Check Configuration, Create/Update Check) is disabled, with a visible reason naming the rows and where to tick, while a required row is unticked. | P0 | A | PO-3 |
| FR-13 | New | Acknowledgment lifecycle: required only for new or renamed matching names; stored names grandfathered; a tick is bound to the exact name. | P0 | A, B1 | PO-3, PO-4 |
| FR-14 | New | Plain-variable server contract, validation and audit. | P0 | B1 | PO-3, PO-4 |
| FR-15 | New | Wizard: same warning + required checkbox now; the acknowledgment is **UI-only** (nothing sent or recorded) until the backend supports a UI_TEST check configuration; audit line is follow-up FU-1. | P1 | A | PO-1, PO-4, PO-7, F18 |

Acceptance criteria: AC-1..AC-3 and AC-9 (modified), AC-10 (FR-9, kept and covered by the render test T-FE-19 on all three surfaces), AC-11 and AC-12 (Vault path, back-ported into `requirements.json` per CRIT-13), AC-13..AC-21 (new; AC-14, AC-15, AC-18 and AC-21 revised in iteration 4). AC-4..AC-8 belonged to superseded requirements and are retired.

### 2.2 Non-Functional Requirements

| ID | Category | Requirement | Metric |
|----|----------|-------------|--------|
| NFR-1 | Security | Never handle, log, echo or persist a credential value. The matcher reads names only. | The matcher's signature takes a name only. Audit logger signatures cannot take a value. Log capture with a canary value finds no canary (T-BE-3, T-BE-7). |
| NFR-2 | Usability / a11y | Inline MUI `Alert severity="warning" role="note"`, at most 2 sentences, no modal, no `role="alert"`. Checkbox has an accessible name and `aria-describedby` the warning. A disabled save action always has a visible reason (WCAG 3.3.1 / G155, R7). | RTL tests T-FE-5, T-FE-15, T-FE-16. |
| NFR-3 | Honesty | Copy never claims detection is complete. | T-FE-3 (frontend guard). `PromptAssemblyTest#noMessageInTheModuleClaimsCredentialDetectionIsComplete` stays green. |
| NFR-4 | Reliability | Only deterministic 400s with stable codes (`SECRET_ACK_REQUIRED`, `IDENTITY_NAME_ACK_REQUIRED`, `INVALID_IDENTITY_NAME_ACK`), always after authorization, including shape errors in the acknowledgment list. Saved tests with identity-named variables keep saving unchanged. | T-BE-1, T-BE-2, T-BE-7, T-BE-8, T-BE-9. |
| NFR-5 | Reliability | Acknowledgments never change revision identity: not persisted, not compared by `ConfigurationChangeClassifier`, not an `AuthoringRevisionIdentity` input. | T-BE-10. |

### 2.3 Constraints

| ID | Constraint | Impact |
|----|-----------|--------|
| CON-1 | PRD.md:119 and BRD:104 prohibit pasted/inline credentials. | Required doc update (§8.2). |
| CON-2 | `vaultSecrets` stays `false`. | The B2 UI is dark. The secrets POST route is live in every non-worker profile (C3a). |
| CON-3 | Strict, pinned contracts. | B2: `CreateStudioSecretRequest` (C4). B1: `TestRequest`, pinned to `UITestRequest` by `StudioContractTest:443` (F17). Both move `BASE_SHA256` (C5). |
| CON-4 | Personal and functional credentials cannot be told apart. | The trigger is the name only. Misses are accepted (PO-2); false positives from any-token matching are accepted (PO-9). |
| CON-5 | Final wording belongs to Legal/InfoSec. | DRAFT constant (D1). |
| CON-6 | MUI + `sx`; HTTP through `apiClient`; spec phases change documents only. | This revision writes only files in this folder. |

### 2.4 Assumptions

ASM-1 (personal = SSO/SOE/network login) and ASM-4 (functional IDs can be requested) are unchanged and unverified. ASM-2 is revised: acknowledge per introduction of an identity name (new or renamed variable) and per secret creation. ASM-3 holds: identity-named plain variables are allowed after acknowledgment.

---

## 3. Technical Approach

### 3.1 Code findings (verified 2026-10-05, read-only)

C1-C15 from iteration 2 still hold. C9-C11 now matter only as locations; C10 (`INLINE_CREDENTIAL` surfaces) is no longer touched.

| # | Finding | Location |
|---|---------|----------|
| C1 | Create dialog: Name, Value, Allowed origins; `canCreate` gates Create; `closeCreate` resets; failure clears only the value. Name rule `^[A-Za-z0-9_.-]{1,64}$`. | `SecretInput.tsx:16-22,89-123,147-190` |
| C3 | Server create order: 403 → strict parse (400) → name/value/origins (400) → `vault.create` (409/503) → INFO line with no principal. Body zero-filled in `finally`. | `StudioSecretsService.java:118-148` |
| C3a | Provider `none` gives `503 VAULT_NOT_CONFIGURED` from inside `vault.create`, after every body 400. Controller is `@Profile("!worker")`. | `DisabledStudioVaultProvider.java`, `ChecksExceptionHandler.java:200-208` |
| C3b | Three texts say the secrets body has exactly three fields. | `StudioSecretsService.java:213`, `openapi.yaml:812-814,851` |
| C5 | Any `openapi.yaml` byte change moves `BASE_SHA256`. | `studio-runner/test/run/confinement.test.ts:257` |
| C6 | ADR-002 §34: a new save-time 400 on a public route is Class C; ruling first. | ADR-002 §34 (`:2906`) |
| C7 | Audit-logger pattern: dedicated logger name, allow-listed field map. | `GatewayAuditLogger.java:9-40` |
| C8 | Principal is the BFF identity email. `createTest` already resolves `identity.email()`. | `StudioService.java:239`, `:1161-1169` |
| **C16** | The Studio page saves the v1 body (`TestRequest`, no `authoringSchemaVersion`) via `PUT /studio/tests/{id}` from **four** paths, all through `saveDraft` (`SaveOutcome = 'saved' \| 'conflict' \| 'error'`, `:153`): header Save (`:758`), Run's save-before-run (`onSaveBeforeRun={saveDraft}`, `:769`), Variables dialog Save (`:1333`), leave-dialog Save (`:1427`). No other Studio call site sends `updateTest`/`createTest` with variables (`CreateTestDialog` sends `variables: []`). | `ChecksStudioPage.tsx:153,581-628,758,769,1333,1427`; `StudioController.java:98-107` (F13) |
| **C17** | v1 `UITestRequest.LegacyDeserializer` reads named paths only, so an unknown top-level field is ignored today. v2 `StudioAuthoringMapper.read` rejects fields outside `FIELDS` with `400 UNSUPPORTED_FIELD`. Unknown per-variable fields are dropped by `variableFromNode`. | `UITestRequest.java:105-146`; `StudioAuthoringMapper.java:17-29,61-68`; `LegacyStudioAdapter.java:124-144` (F14) |
| **C18** | Variables persist as the serialized `StudioVariable` list. `ConfigurationChangeClassifier` compares list equality (`:52`): a new field inside a variable would bump `configurationRevision` and clear the authoring snapshot and scope review (`StudioService.java:568-581`). Plain values feed `AuthoringRevisionIdentity` (`:867-874`). | (F15) |
| **C19** | `updateAuthoringDraft` rebuilds a `UITestRequest` component by component (`metadataOnly`), so a new component is dropped on the v2 update path unless passed through. It authorizes in `lockForAuthoringWrite` (`:719-737`) and then delegates with `updateTest(id, metadataOnly, null)` (`:353`), so **no principal exists inside `updateTest` on the v2 path** (CRIT-16). | `StudioService.java:328-358,719-737` (F16) |
| **C20** | `StudioContractTest:443` pins openapi `TestRequest` to `UITestRequest` (property names). **Every create/update method is `@Transactional`** (`createTest` overloads `:198-226`, `createAuthoringDraft` `:306`, `updateAuthoringDraft` `:328`, `updateTest` `:475-481`). Not every public method is: `compileTest`, `confirmCompile`, `executeTest`, `cancelExecution` are `Propagation.NOT_SUPPORTED`; they are not save paths. (Corrected per CRIT-16.) | `StudioContractTest.java:443`; `StudioService.java` as cited |
| **C21** | The wizard sends `configuration.uiTest.variables` (name-keyed map) on the Checks API. Backend `CheckConfiguration` has only HTTP, TCP and SPLUNK subtypes: there is no server contract for UI_TEST checks today. | `CreateCheckPage.tsx:211`; `CheckConfiguration.java:6-14` (F18) |
| **C22** | Studio page names are upper-cased as typed (`e.target.value.toUpperCase()`, `:1268`; `svcUser` → `SVCUSER`), and the name placeholder is `USERNAME`. Wizard names are upper-cased on add (`newVarName.trim().toUpperCase()`, `UiTestConfig.tsx:73`) and on prefill (`v.name.toUpperCase()`, `CreateCheckPage.tsx:116`). The Vault dialog **keeps case** (`SecretInput.tsx:16,155`). The Studio body sends JS-trimmed names and drops empty rows (`toContractVariables`, `ChecksStudioPage.tsx:118-126`). So the same author input reaches the matcher in different case on different surfaces (CRIT-14). | as cited (F19) |
| **C23** | Run's save-before-run: `useRunGate` calls `saveBeforeRun()` when the draft is dirty and stops silently on any outcome other than `'saved'` ("The page owns the conflict and error alerts; Run just stops", `useRunGate.ts:386-394`). `RunControl` already renders a visible reason under a disabled Run (`data-testid="run-blocked-reason"`, `RunControl.tsx:268-290`). | `useRunGate.ts:91,386-394`; `RunControl.tsx:52,114,265-290` |
| **C24** | Error bodies are `{error, message}` only: `ErrorResponse` (`openapi.yaml:2487-2492`) and `handleStudioValidation` (`ChecksExceptionHandler.java:233-236`). A list of names can be carried only in the message today. | as cited |
| **C25** | The server neither trims nor bounds variable names (`LegacyStudioAdapter.variableFromNode`; openapi `Variable.name maxLength: 64` is not enforced server-side). | `LegacyStudioAdapter.java:124-144`; `openapi.yaml:2538` |

### 3.2 Decisions

| # | Decision | Slice | Trace |
|---|----------|-------|-------|
| D1 | **Single versioned copy constant (modified).** `frontend/src/components/studio/credentialDisclaimer.ts` exports frozen `CREDENTIAL_DISCLAIMER`: `id: 'studio-credential-disclaimer'`, `version: 'draft-2'` (copy changed from `draft-1`), `status: 'DRAFT'`, the strings in §3.3, and `ackTextSha256` (B1/B2). Header comment: "DRAFT copy. Not approved. Final wording requires Legal/InfoSec sign-off (CON-5). Changing any string requires a new `version`." | A | FR-9, CON-5 |
| D2 | **Create Secret dialog (modified, name-triggered).** When `isIdentityName(newName)` matches: above Value, `<Alert severity="warning" role="note" id="identity-name-warning">` with `identityNameWarning`; an unchecked `Checkbox` in `FormControlLabel` labelled `ackLabel`, `inputProps={{'aria-describedby': 'identity-name-warning identity-ack-reason'}}`; while unticked, a visible `FormHelperText id="identity-ack-reason"` with `ackMissingReason.create`. `canCreate` gains `&& (!matched \|\| acknowledged)`. `acknowledged` resets on open, in `closeCreate`, in the failure branch, and on **every** Name change (D15). When Name does not match, nothing new renders. `describeFailure` maps `SECRET_ACK_REQUIRED`. The ack logic never reads `newValue`. | B2 | FR-1, FR-2, PO-3, R3, R7, C1 |
| D3-D6 | **Superseded** (always-on Alert, password-name hint, `INLINE_CREDENTIAL` copy, policy sentence). Not built. | — | PO-0, PO-2 |
| D7 | **Vault field (modified, conditional).** The client sends `acknowledgedDisclaimerVersion` **only when the name matched and the box was ticked**. openapi `CreateStudioSecretRequest`: add the property (`type: string, minLength: 1, maxLength: 64, nullable: true`), **not** in `required`. `createTestSecret` description (`:812-814`), the 400 description and the `invalidRequest` example (`:851`) name all four fields and `SECRET_ACK_REQUIRED` (C3b). Java: the record gains the field; `invalidRequest()` text becomes "The body must be a JSON object with name, value, allowedOrigins and, for a sign-in identity name, acknowledgedDisclaimerVersion". **Proposed order:** 403 → strict parse → name/value/origins → **acknowledgment** → Vault. If the name matches and the version is missing, blank or not accepted → `400 SECRET_ACK_REQUIRED` ("Confirm the own-risk notice before creating a secret with this name."). If the name does not match, the field is ignored when present. **Behaviour change (live route):** a matching name without the field moves from `503`/`201` to `400`; a non-matching name is unchanged. Class C (C6). **Divergence from @architect rulings (plan v1, `implementation.yaml#rulings`), submitted for re-ruling under OQ-18, not decided here:** (1) `new-required-field` RULED the field into `required` from day one; D7 proposes optional and conditional, because PO-0/PO-1 make the acknowledgment exist only for matching names, and a required field would force the client to send an acknowledgment the author never gave. (2) OQ-12 RULED the order 403 → parse → **ack** → name/value/origins → Vault; D7 proposes ack **after** name/value/origins, because the check now depends on the name. The matcher accepts any string, so the ruled order is also implementable: an invalid matching name without the field would then get `SECRET_ACK_REQUIRED` instead of the name 400. Until @architect re-rules, B2 does not start (OQ-18). OQ-12's ruling that `400` may replace `503 VAULT_NOT_CONFIGURED` is kept unchanged. | B2 | FR-2, FR-8, PO-4, C3-C6, OQ-12, OQ-18 |
| D8 | **Accepted versions server-side (modified; adopts the OQ-13 ruling unchanged).** `CredentialDisclaimerVersions` (in `studio.credentials`, shared by B1 and B2) maps `version → ackTextSha256`, one entry today (`draft-2`). `ackTextSha256` = SHA-256 hex of UTF-8 `identityNameWarning + "\n" + ackLabel`, using the **template** text with the literal `{name}` placeholder, so the hash does not depend on the name. Pin: as RULED for OQ-13 (option (b) modified, PF-2): `docs/specs/studio/credential-disclaimer-version.json` (`{id, version, ackTextSha256}`) is the reviewable source; the frontend constant keeps literals and does **not** import it; three tests close the triangle (T-FE-2 hash, a frontend `fs` test against the JSON, T-BE-5 against `CredentialDisclaimerVersions`). The only change from the ruling's text is the hash input name (`short` became `identityNameWarning` when the copy changed in iteration 3). OQ-10 RULED (one accepted version; O-22 for the first post-flag bump) also stands. | B1/B2 | FR-9, PO-4, R1, OQ-10, OQ-13 |
| D9 | **Audit logger (modified, shared).** `CredentialAckAuditLogger`, logger name `studio.credentials.audit`, INFO, modelled on C7. One method: `acknowledged(AckSubject subject, Surface surface, Operation operation, String name, String matchedToken, String disclaimerVersion)`, where `AckSubject` is `{principal, csiId, environment, testId}`. No parameter can carry a value. Allow-listed fields: `principal`, `csiId`, `environment`, `testId`, `surface` (`VAULT_SECRET` \| `STUDIO_VARIABLE`), `operation` (`CREATE_SECRET` \| `CREATE_TEST` \| `UPDATE_TEST`), `name`, `matchedToken`, `matcherVersion`, `disclaimerId`, `disclaimerVersion`, `disclaimerSha256` (looked up in D8, never sent by the client), `serverTimestamp`. It never throws. Vault path: subject resolved after authorization, line written after `vault.create` returns. Plain path: D17. The record attests that the authenticated caller asserted acknowledgment of version V for that name; a human tick is not provable server-side (CRIT-6, OQ-2). | B1/B2 | FR-8, PO-4, NFR-1, C7, C8 |
| D10, D11 | Retired (template notice superseded by PO-0; functional-ID link stays in backlog §8.3). | — | PO-0, OQ-7 |
| D12 | Option only: DB acknowledgment row, if InfoSec requires queryable evidence (OQ-2). Columns gain `surface`, `operation`, `matched_token`. | Optional | OQ-2 |
| **D13** | **Shared identity-name matcher (new; rule replaced in iteration 4 by PO-9).** Defined in §3.5. Frontend: `isIdentityName(name: string \| null \| undefined): {token: IdentityToken} \| null` and `IDENTITY_MATCHER_VERSION = 'identity-names-1'` in `credentialDisclaimer.ts`. Backend: `IdentityNameMatcher` in `studio.credentials` with the same contract (null → no match). The version id stays `identity-names-1` because no earlier definition ever shipped. **One rule set, one case table:** `docs/specs/studio/identity-name-cases.json` (`{matcherVersion, cases: [{name, matches, token}]}`; `name` may be JSON `null`) is read by a Vitest test (via `fs`) and by a JUnit test (via `Path.of("..", "docs", ...)`, the `StudioContractTest` precedent). Both suites fail on any divergence, and both also assert, for every case, that the ASCII-upper-cased and ASCII-lower-cased name give the same result (case parity, CRIT-14). [AUTO-DECISION] One implementation shipped to both sides, or two implementations pinned by one table? → **two, pinned** (reason: the server must re-run the rule to enforce and to log `matchedToken` (PO-4), and the repo has no TS↔Java code-sharing mechanism; the shared table is how "single shared matcher" (PO-1) is made enforceable). | A (TS + table), B1/B2 (Java) | FR-10, PO-1, PO-2 |
| **D14** | **Row warning and checkbox (new).** For each non-secret row (Studio: `plain`; wizard: `plain`, `number`, `boolean`) whose name matches: under the Name field, `<Alert severity="warning" role="note" id={`identity-warning-${rowId}`}>` with `identityNameWarning` (name interpolated). If the row requires acknowledgment (D15), a `Checkbox` labelled `ackLabel` with `aria-describedby` the warning id. A grandfathered row shows the warning only. Non-matching rows render exactly as today. The placeholder `USERNAME` (C22) is not a name and never triggers. Secret rows are covered by D2 at secret creation. | A | FR-11, PO-1, PO-3, NFR-2 |
| **D15** | **Acknowledgment lifecycle (new).** `requiresAck(row) = row is non-secret && isIdentityName(row.name) && !storedNonSecretNames.has(trim(row.name))`. **Name comparison (CRIT-22):** exact and case-sensitive, after trimming on both sides; a null, empty or whitespace-only name never matches and never requires acknowledgment. FE `trim` is the same `String.prototype.trim` that `toContractVariables` applies before sending (`ChecksStudioPage.tsx:118-126`), so the FE compares exactly the names it sends; the server uses `String.trim()` (D17). Studio: `storedNonSecretNames` = trimmed non-secret names in the last loaded/saved `TestDto.variables`. Wizard create: empty set, so prefilled rows require acknowledgment too (the value is typed fresh for this check). Wizard edit: names in the stored check configuration. A tick is stored as `{rowId, name}` and counts only while `row.name === name`. **Distinct names (CRIT-17d):** `pendingAckNames` and the B1 entries are per distinct trimmed name; a name counts as acknowledged only when every required row with that name is ticked. **Server-required names (B1, CRIT-17a):** after a `400 IDENTITY_NAME_ACK_REQUIRED`, the page adds the response's `variableNames` to a `serverRequiredNames` set; a non-secret row whose trimmed name is in that set requires acknowledgment even if the FE matcher missed it (matcher drift, stale bundle). The set is cleared on reload and on a successful save. [AUTO-DECISION] Does renaming one matching name to another matching name reset the tick? → **yes, always** (reason: the evidence names the variable; the author acknowledged the warning that showed the old name; PO-3 says re-evaluate on name change). [AUTO-DECISION] Value-only edits of a stored matching variable → **no re-acknowledgment** (reason: the trigger is the name, PO-0; re-ack on value edits trains click-through, R4). Confirmed by the product owner (PO-6, OQ-15 closed 2026-10-06). A kind change from secret to plain makes the row non-secret and, if the name is not a stored non-secret name, requires acknowledgment. | A | FR-13, PO-3 |
| **D16** | **Save gating with a visible reason (new; Run added in iteration 4, CRIT-15).** `pendingAckNames` = distinct names of rows that require and lack a tick (D15). While non-empty, on the Studio page: header Save (`:758`), Variables dialog Save (`:1333`) and leave-dialog Save (`:1427`) are disabled, and **Run is disabled too**: `RunControl` gains an optional `blockedReason?: string \| null` prop; when it is non-null and no run is in progress, Run is disabled and the text renders in the existing `run-blocked-reason` caption (C23). The page passes the `ackMissingReason.save` text while `pendingAckNames` is non-empty. `saveDraft` keeps an early-return guard as defence in depth: it sends nothing, shows the same reason in the save snackbar and returns `'error'`, so `useRunGate` stops without further alerts (C23). `SaveOutcome`/`RunSaveOutcome` are unchanged. A visible reason with `ackMissingReason.save` (names listed, says to open Variables) appears in the Variables dialog actions area (where it reads the same; the checkbox is on the row above), under the header Save button and under Run (`FormHelperText`/caption, linked via `aria-describedby`). The leave dialog shows the same reason. **Wizard:** variables live on step 1 (Check Configuration) and Create/Update Check on step 3 (Review) (`CreateCheckPage.tsx:58,446-481`). Next on Check Configuration is disabled while `pendingAckNames` is non-empty, with `ackMissingReason.wizard` shown in the step-1 message area (`:446`); Create/Update Check (`:480`) is also disabled with the same reason above the button. No modal. | A | FR-12, FR-15, PO-3, NFR-2, C16, C23 |
| **D17** | **Plain-variable contract (new; error contract and principal fixed in iteration 4).** **Shape:** an optional **top-level, transient** `identityNameAcknowledgements: [{variableName, disclaimerVersion}]` on `TestRequest` (POST and PUT `/studio/tests`, v1 and v2 bodies). [AUTO-DECISION] Top-level list or a per-variable field? → **top-level list** (reason, verified: a field inside `Variable` would persist in the variables JSON, make an ack-only difference a configuration change through `ConfigurationChangeClassifier:52` (bumping `configurationRevision` and clearing the authoring snapshot and scope review, C18) and be echoed in `TestDto.variables`; per-variable unknown fields are silently dropped today (C17). A top-level list leaves `Variable`, persistence and revision identity untouched (NFR-5)). **openapi:** `TestRequest` gains `identityNameAcknowledgements` (`type: array`, `maxItems: 100`, items `IdentityNameAcknowledgement`: `additionalProperties: false`, `required: [variableName, disclaimerVersion]`, `variableName` `type: string, minLength: 1, maxLength: 64`, `disclaimerVersion` `type: string, maxLength: 64`); not in `required`; not in `TestDto`. The description states the rule and both 400 codes. **Structured error (CRIT-17a; contract extension for @architect, OQ-18):** both new codes return `IdentityNameAckErrorResponse` = `ErrorResponse` + `variableNames` (`type: array`, items `string`, `maxItems: 100`): the distinct offending names, sorted, never values. Java: a dedicated `StudioIdentityNameAckException` mapped in `ChecksExceptionHandler` next to `handleStudioValidation` (C24). If @architect rejects the extension, the fallback is: names only in `message`, rename is the only recovery for a server-only match, and D15's server-required set and the §7 drift mitigation are dropped. **Java parsing:** `UITestRequest` gains `JsonNode identityNameAcknowledgements` (raw, may be null). `LegacyDeserializer` copies the raw node without validating it; `StudioAuthoringMapper.FIELDS` adds the key so the v2 body accepts it (its value is not checked there); `updateAuthoringDraft` does not need to pass it through `metadataOnly`, because the policy runs before delegation (below). Shape validation happens only in the service policy, after authorization (CRIT-17b, NFR-4). The client sends one entry per distinct acknowledged required name (D15), never identity, time, token or hash. **Policy:** `IdentityNameAckPolicy.evaluate(List<StudioVariable> stored, List<StudioVariable> requested, JsonNode acks, AckSubject subject) → AckDecision` (the required names with their matched tokens and the accepted version), throwing on failure. Names on both sides are compared after `String.trim()` (characters ≤ U+0020), exactly and case-sensitively; a null or blank name is never required and never "stored". Steps, in order: (1) **shape**: `acks` null or JSON null → empty list; otherwise it must be an array of at most 100 objects, each with exactly `variableName` (string, non-blank after trim, length ≤ 64 after trim) and `disclaimerVersion` (string, length ≤ 64; blank allowed here). Any violation → `400 INVALID_IDENTITY_NAME_ACK`. (2) **reference**: every entry's trimmed `variableName` must be the trimmed name of a non-secret variable in `requested`, and no two entries may share a trimmed `variableName`; otherwise `400 INVALID_IDENTITY_NAME_ACK` (`variableNames` = the offending entry names). (3) **required** = the **set** of distinct trimmed names of non-secret `requested` variables that match D13 and are not among the trimmed non-secret names in `stored` (create: `stored` is empty). Any required name without an entry whose `disclaimerVersion` is in `CredentialDisclaimerVersions` (so missing, blank or unknown versions all count as missing) → `400 IDENTITY_NAME_ACK_REQUIRED`, message "Confirm the own-risk notice for: NAME_A, NAME_B." and `variableNames` = those names (CRIT-17c). (4) Entries for names that are not required (grandfathered or not matching) are accepted, ignored and not logged. **Where it runs, with whose principal (CRIT-16):** the policy runs exactly once per HTTP save, at the public entry point that holds the caller's `Authentication`, with `AckSubject` built from `extractIdentity(auth).email()` (C8). *Create* (v1 and v2, both reach the private `createTest`, `StudioService.java:233-244`; `createAuthoringDraft` `:307-311` delegates with `auth`): after `requireRegisteredCsi` and `requireWrite` (`:243-244`), with `stored` empty, `csiId` = request CSI. *v1 update* (`updateTest`, `auth != null` branch): after the row lock, authorization, `STALE_REVISION`, `CSI_IMMUTABLE` and `AUTHORING_V2_REQUIRED`, before `changeClassifier.classify` (`:548`) and any setter, with `stored` = `test.getVariables()` read before `setVariables` (`:555`), `csiId` = the row's CSI. *v2 update* (`updateAuthoringDraft`): after `lockForAuthoringWrite` (`:719-737`, which authorizes and checks `STALE_REVISION`) and `CSI_IMMUTABLE` (`:336-338`), **before** it delegates with `updateTest(id, metadataOnly, null)` (`:353`), with `stored` = the locked row's variables. The `auth == null` branch of `updateTest` (the internal path, also reached from `updateAuthoringDraft`) never runs the policy; no HTTP route reaches `updateTest` with `auth == null` except through `updateAuthoringDraft` (`StudioController.java:78,99-107`). **Audit:** after the write (so a create knows its new `testId`), the service registers one `TransactionSynchronization.afterCommit` callback that writes one D9 line per required name: `acknowledged(subject, STUDIO_VARIABLE, CREATE_TEST\|UPDATE_TEST, name, token, version)`. Every create/update method is `@Transactional` (C20), so a rolled-back save leaves no line. **Back-compat (existing saved tests):** stored names are grandfathered, so any existing test saves with no entries and no change in behaviour, including legacy rows and the sign-on template's `USERNAME` once saved. [AUTO-DECISION] Enforce on every save, or only on create and rename? → **only on introduction (create, add, rename, kind change into non-secret)** (reason: PO-0 says "when the user tries to add"; PO-6 confirmed). **Length edge (CRIT-22):** `variableName` is bounded at 64 like the documented `Variable.name`, which the server does not enforce (C25). A matching variable name longer than 64 characters after trim therefore cannot be acknowledged: the save gets `400 INVALID_IDENTITY_NAME_ACK` (if the FE sent an entry) or `IDENTITY_NAME_ACK_REQUIRED`, and the recovery is to shorten the name. [AUTO-DECISION] Enforce `Variable.name ≤ 64` in this story? → **no** (reason: it would add a new 400 for every over-long name, matching or not, which is outside PO-0..PO-9; the edge needs a 65-character identity name). **Deployment order:** the frontend that sends the field may ship before the backend that enforces it: the v1 deserializer ignores unknown top-level fields today (C17), and the Studio page uses v1 (C16). The reverse order makes a stale bundle get `400 IDENTITY_NAME_ACK_REQUIRED` for a newly added identity name only. | B1 | FR-14, NFR-4, NFR-5, PO-3, PO-4, PO-6, C16-C20, C24, C25 |
| **D18** | **Wizard acknowledgment is UI-only (new; confirmed PO-7).** The wizard gets the same warning and required checkbox (D14-D16) in Slice A. **Until the backend supports a UI_TEST check configuration, the wizard acknowledgment is UI-only: nothing is sent to the server and no audit line is written.** It sends nothing new, because the backend has no UI_TEST check configuration to receive it (C21). Follow-up FU-1, requirement on the future UI_TEST check-configuration story: carry `identityNameAcknowledgements` with the D17 shape and rules, scoped to the check (`surface: CHECK_WIZARD_VARIABLE`, `testId` = the referenced Studio test, plus `checkId`). | A (UI) | FR-15, PO-1, PO-4, C21 |

### 3.3 DRAFT copy (placeholder quality, NOT approved, CON-5)

All strings live in `CREDENTIAL_DISCLAIMER` (D1), version `draft-2`. `{name}` and `{names}` are interpolated at render time; the hash (D8) covers the template (`identityNameWarning` and `ackLabel` only). `draft-2` has never shipped, so iteration 4's reason-text edits do not need a new version; the first shipped copy is the one Slice A lands.

| Key | DRAFT text | Surface |
|-----|-----------|---------|
| `identityNameWarning` | "DRAFT: \"{name}\" looks like a sign-in identity. Use a service or functional ID owned by this CSI, not your own login, because anyone who can run this test signs in with it and run videos show what it opens." | D2, D14 |
| `ackLabel` | "DRAFT: I understand this is at my own risk." (PO-3 wording, DRAFT-prefixed) | D2, D14 |
| `ackMissingReason.save` | "Open Variables and confirm the own-risk notice for {names} to save." (CRIT-22: says where to tick; the same text gates Run) | D16 |
| `ackMissingReason.wizard` | "Confirm the own-risk notice for {names} in Check Configuration to continue." | D16 (wizard) |
| `ackMissingReason.create` | "Confirm the own-risk notice to create this secret." | D2 |

Server messages (not part of the hashed copy): `IDENTITY_NAME_ACK_REQUIRED` "Confirm the own-risk notice for: {names}."; `INVALID_IDENTITY_NAME_ACK` "identityNameAcknowledgements must be a list of at most 100 {variableName, disclaimerVersion} entries naming non-secret variables in this request, once each."; both carry `variableNames` (D17) when @architect accepts the extension; `SECRET_ACK_REQUIRED` as in D7. The `DRAFT:` prefix stays until Legal/InfoSec approve (OQ-1).

### 3.4 Data flow

```
Studio plain variable (Slice A, then B1):
  author adds/renames row → isIdentityName(name)? → requiresAck (not a stored non-secret name)?
  → row: warning (role=note) + unchecked checkbox → pendingAckNames non-empty → all saves and Run disabled + reason
  → tick → saveDraft (Save, Variables Save, leave Save, or Run's save-before-run) → PUT /studio/tests/{id} {…, variables, identityNameAcknowledgements:[{variableName, disclaimerVersion}]}   (B1)
  → server: lock + 403/409 checks → D17 policy at the entry point (AckSubject from auth; shape → reference → required)
     → 400 INVALID_IDENTITY_NAME_ACK | 400 IDENTITY_NAME_ACK_REQUIRED {variableNames} → FE marks rows server-required | continue
  → classify/persist variables exactly as today (acks not persisted) → commit → afterCommit: one audit line per required name

Wizard (Slice A only): same row UI, Next (Check Configuration) and Create/Update Check gating; payload unchanged (D18).

Create secret (B2; UI dark until vaultSecrets=true):
  Name matches? → warning + checkbox + reason → tick → POST {name, value, allowedOrigins, acknowledgedDisclaimerVersion}
  → 403 → parse → name/value/origins → matcher(name)? ack accepted? else 400 SECRET_ACK_REQUIRED → vault.create
  → audit line (VAULT_SECRET) → 201.   Non-matching name: no UI change, field omitted, server unchanged.
```

### 3.5 Identity-name matcher (`identity-names-1`, iteration 4)

Input: a variable or secret name (`null` allowed). Output: the matched token or no match. Values are never input. **Rule (PO-9): any identity word anywhere in the name triggers**; only `account` is narrowed (PO-5).

1. **Null and blank.** `null`, empty or whitespace-only → **no match**.
2. **ASCII lowercase.** Map `A`-`Z` to `a`-`z`; leave every other character unchanged. No locale-sensitive case API may be used. Java: if `toLowerCase`/`toUpperCase` is called at all, it must be `toLowerCase(Locale.ROOT)` (under a Turkish default locale, `"LOGIN".toLowerCase()` gives `logın` and would miss); the reference implementation is an explicit ASCII mapping. TS: an explicit ASCII mapping (`/[A-Z]/g`), not `toLowerCase()`, so both sides agree on non-ASCII input.
3. **Segment.** Split into maximal runs of `[a-z]` (ASCII letters only). Everything else is a boundary: digits, `_ - .`, spaces, and every non-ASCII character. Character classes are explicit ASCII ranges on both sides (Java `[a-z]`, never `\p{Alpha}` or `Character.isLetter`; TS no `u`-flag Unicode classes). Two consecutive segments are **joinable** when the characters between them are only `_`, `-`, `.` or space (so a digit between them prevents joining).
4. **Merge** joinable pairs, left to right, each segment merged at most once. The list is exhaustive: `user+id → userid`, `user+name → username`, `login+id → loginid`, `login+name → loginname`, `soe+id → soeid`, `e+mail → email`. No other pair merges (so `soe+name` stays two segments).
5. **Identity words** W = `user`, `login`, `soeid`, `email`. Scan segments left to right; the first segment that **contains** any word in W as a substring decides. Within it, the hit at the lowest index wins; at `user`, report `username` if the segment continues `username`, `userid` if it continues `userid`, else `user`. `login` covers `loginid`/`loginname` (reported `login`). → **match**.
6. **Account (PO-5)**, only if step 5 found nothing: a segment matches iff it equals `account` and (it is the only segment, or the previous segment is joinable and in Q), or it equals q + `account` for q in Q. Q = `svc, service, functional, func, fid, test, app, application, system, sys, batch, bot, automation`. Token `account`. → **match**.
7. Otherwise → **no match**.

Reported tokens (`matchedToken`) are exactly `user | username | userid | login | soeid | email | account` (PO-4).

**Why case-blind substring matching (CRIT-14).** [AUTO-DECISION] Normalize names identically on every surface, or make the matcher case-blind? → **case-blind: segment on non-letters only and find identity words inside letter runs** (reason: the Studio page and wizard upper-case names (C22), which destroys camelCase boundaries; the Vault dialog keeps case, as do non-FE clients and the server. Making every surface upper-case would rename stored Vault secrets and still leave run-together names (`EMAILADDRESS`, `USERNAMEUAT`) unmatched. Without camelCase boundaries and with substring search, a name gives the same result whatever its ASCII case, so `svcUser` (Vault), `SVCUSER` (Studio) and the name the server receives all agree. Each surface runs the matcher on the name as it holds it, which is the name it sends, so FE and BE agree per save). **Cost:** substring search adds matches the token rule would not (`MAX_USERS`, `SUPERUSER`, `ABUSER`). Under PO-9's any-token rule these are the same kind of false positive the product owner accepted, and they cost a tick only when introduced (FR-13).
[AUTO-DECISION] `E_MAIL`, `e-mail`? → **match** via the `e+mail` merge (reason: common spelling of the email login; the merge is a closed pair, so `THE_MAIL` or `E_MAILBOX` do not match).
[AUTO-DECISION] Digits: a boundary, and they block merges (`USER_2_NAME` → `user`, not `username`; `SOE_1_ID` → no match) (reason: one simple rule on both sides; the match result for `user`/`login`/`email` names is unaffected).
`account` narrowing: product-owner decision PO-5 (OQ-14 closed). Any-token matching and the removal of the head-word rule: PO-9 (CRIT-18 closed). Password-only names never trigger because they contain no identity word (PO-2, PO-8); no separate password rule is needed.

| Name | Result | Token | Why |
|------|--------|-------|-----|
| `USERNAME`, `user`, `USER_NAME`, `CUSTOMER_USERNAME`, `USERname`, `USERNAMEUAT` | match | username / user / username / username / username / username | step 5 (merge for `USER_NAME`) |
| `USER_ID`, `userId`, `USERID` | match | userid | step 5 (merge for `USER_ID`) |
| `USER_2_NAME`, `USER1`, `1USER`, `TEST_USER_2`, `svc_user`, `svcUser`, `SVCUSER`, `DB_USER_VALUE`, `SUPERUSER`, `MAX_USERS`, `USER_EMAIL` | match | user | step 5 (first segment with a hit decides) |
| `USER_AGENT`, `userAgent`, `USERAGENT`, `USER_ROLE`, `USER_PASSWORD`, `USER_TOKEN` | match | user | step 5, PO-9 (formerly no match) |
| `APP_LOGIN`, `app-login`, `APP.LOGIN`, `SSO_LOGIN_UAT`, `APPLOGIN`, `loginId`, `LOGIN_ID`, `LOGINID`, `LOGINIDDEV` | match | login | step 5 |
| `LOGIN_URL`, `LOGIN_PAGE`, `LOGIN_BUTTON`, `LAST_LOGIN`, `LOGIN_PWD`, `LOGIN_PIN` | match | login | step 5, PO-9 (formerly no match) |
| `SOEID`, `SOE_ID`, `soeId`, `SOEIDVALUE` | match | soeid | step 5 (merge for `SOE_ID`) |
| `EMAIL`, `EMAIL_ADDRESS`, `emailAddress`, `EMAILADDRESS`, `SSOEMAIL`, `EMAIL_ID`, `E_MAIL`, `e-mail`, `eMail`, `RECIPIENT_EMAIL`, `EMAIL_SUBJECT` | match | email | step 5 (merge for `E_MAIL`); `EMAIL_SUBJECT`, `EMAIL_ID` per PO-9 |
| `ACCOUNT`, `SVC_ACCOUNT`, `SERVICE_ACCOUNT`, `TEST_ACCOUNT`, `SVCACCOUNT`, `svcAccount`, `SVC_ACCOUNT_ID`, `ACCOUNT_1` | match | account | step 6 (PO-5) |
| `accountId`, `ACCOUNT_ID`, `ACCOUNTID`, `ACCOUNT_NUMBER`, `FROM_ACCOUNT`, `BANK_ACCOUNT`, `SVC_2_ACCOUNT` | **no** | — | step 6 narrowing (PO-5); digit blocks the qualifier |
| `PASSWORD`, `PWD`, `PASSWD`, `DB_PASSWORD`, `TOKEN`, `API_KEY` | **no** | — | no identity word (PO-2, PO-8) |
| `SOE_NAME`, `soename`, `SOE`, `SOE_1_ID`, `E_2_MAIL`, `THE_MAIL`, `E_MAILBOX` | **no** | — | no listed merge, no identity word |
| `FIRST_NAME`, `BROWSER`, `CODE`, `CSI_ID`, `ID1`, `USE_R` | **no** | — | no identity word |
| `null`, `""`, `"   "`, `"123"`, `"_-."` | **no** | — | step 1 / no segments |
| `USÉR` (U+00C9), `LOGİN` (U+0130) | **no** | — | non-ASCII letters are boundaries |

Every row above is a case in `identity-name-cases.json`. Both suites also run every case with ASCII upper- and lower-casing (same expected result), and the Java suite runs once with `Locale.setDefault(new Locale("tr", "TR"))` to prove `LOGIN` still matches. Known misses are accepted (CON-4): a login stored as `CODE` or `ID1`.

---

## 4. Dependencies

| Dependency | Purpose | Slice | Verified |
|-----------|---------|-------|----------|
| `@mui/material` 5.18.0 `Alert`, `Checkbox`, `FormControlLabel`, `FormHelperText` | Row and dialog UI | A, B2 | ✅ (C14) |
| Spring `TransactionSynchronization` | After-commit audit line (D17) | B1 | ✅ transactional service (C20) |
| SLF4J dedicated logger | Audit | B1/B2 | ✅ (C7) |
| Log forwarding/retention for `studio.credentials.audit` | Durable evidence | B1/B2 | ⚠️ unverified (OQ-2) |
| `@/utils/config/studioCapabilities` | Read only (CON-2) | A | ✅ (module path per CRIT-12) |

---

## 5. Files to Modify/Create

### 5.1 New files

| File | Purpose | Slice |
|------|---------|-------|
| `frontend/src/components/studio/credentialDisclaimer.ts` | D1 constant, D13 `isIdentityName`, `IDENTITY_MATCHER_VERSION` | A |
| `frontend/src/components/studio/credentialDisclaimer.test.ts` | T-FE-1, T-FE-3, T-FE-14 (A); T-FE-2 and the OQ-13 JSON pin test (B) | A |
| `frontend/src/components/studio/IdentityNameAck.tsx` (+ test) | Shared row warning + checkbox used by the Studio page and the wizard (D14); T-FE-19 | A |
| `docs/specs/studio/identity-name-cases.json` | Shared matcher case table (D13) | A |
| `backend/.../studio/credentials/IdentityNameMatcher.java` (+ `IdentityNameMatcherTest`) | D13 Java side; test reads the case table | B1/B2 (first to land) |
| `backend/.../studio/credentials/CredentialDisclaimerVersions.java` | D8 | B1/B2 |
| `backend/.../studio/credentials/CredentialAckAuditLogger.java` (+ test) | D9 | B1/B2 |
| `backend/.../studio/credentials/IdentityNameAckPolicy.java` (+ test) | D17 policy (`evaluate(stored, requested, acks, AckSubject)`: shape, reference, required set; audit registration) | B1 |
| `backend/.../studio/credentials/AckSubject.java` | D9/D17 subject record `{principal, csiId, environment, testId}` | B1/B2 |
| `backend/.../studio/dto/IdentityNameAcknowledgement.java` | D17 validated entry record (built by the policy from the raw node) | B1 |
| `backend/.../studio/StudioIdentityNameAckException.java` | D17 400 with `variableNames` (only if @architect accepts the extension, OQ-18) | B1 |
| `docs/specs/studio/credential-disclaimer-version.json` | D8 pin file (OQ-13 RULED, option (b) modified) | B1/B2 |

### 5.2 Modified files

**Slice A:** `ChecksStudioPage.tsx` (D14 rows in the Variables dialog, D15 state from loaded variables, D16 gating at `:758`, `:769` (Run, via `blockedReason`), `:1333`, `:1427` and in `saveDraft`; medium risk, heavy uncommitted WIP); `RunControl.tsx` + test (optional `blockedReason` prop rendered in the existing `run-blocked-reason` caption, C23); `pageAuthoringUx.test.tsx` or a co-located page test; `UiTestConfig.tsx` + `UiTestConfig.test.tsx` (D14); `CreateCheckPage.tsx` (D16 Next-on-Check-Configuration and Create/Update Check gating and reason only; the localStorage draft is **not** touched, OQ-6).

**Slice B1 (Class C, after the ruling):** `studioTypes.ts` `TestRequest` (field); `ChecksStudioPage.tsx` `saveDraft` body (one entry per distinct acknowledged name) and D15 `serverRequiredNames` from the 400 `variableNames`; `saveErrorMessage.ts` + test (map `IDENTITY_NAME_ACK_REQUIRED`, `INVALID_IDENTITY_NAME_ACK`); `ChecksExceptionHandler.java` (map the new exception, C24); MSW Studio save handler under `frontend/src/services/mocks/studio/` (accept the field, mirror the rule); `UITestRequest.java` (raw `JsonNode` component, deserializer copies it unvalidated); `StudioAuthoringMapper.java` (`FIELDS`); `StudioService.java` (call the policy at the three entry points named in D17 with an explicit `AckSubject`; `updateAuthoringDraft` evaluates before delegating, so `metadataOnly` needs no pass-through); `openapi.yaml` (`TestRequest` property, `IdentityNameAcknowledgement` schema, `IdentityNameAckErrorResponse` if ruled, description, 400 codes and examples on POST/PUT `/studio/tests`); `StudioContractTest.java` (parity at `:443` plus new assertions); `confinement.test.ts:257` (re-anchor at landing from the committed openapi); ADR-002 (written by @architect).

**Slice B2 (Class C):** `SecretInput.tsx` + test (D2); `secretsApi.ts` (optional field); `CreateStudioSecretRequest.java`; `StudioSecretsService.java` (D7 order and text, D9); `openapi.yaml` (C3b texts); `StudioContractTest.java`; `confinement.test.ts`; ADR-002.

Not modified: `studioCapabilities.ts`, `CredentialPatternScreen.java`, `saveErrorMessage.ts` `INLINE_CREDENTIAL` text and `conflictNarratives.ts` (D5 superseded), PRD.md, BRD.

---

## 6. Testing Strategy

Narrowest first. Frontend: `pnpm exec vitest run <files>`. Backend: `./gradlew test --tests 'com.citi.put.checks.studio.credentials.*'`, then the touched service tests, `*StudioContractTest`, `*PromptAssemblyTest`.

### 6.1 Unit tests

| ID | Test | Covers | Slice |
|----|------|--------|-------|
| T-FE-1 | Constant: `status === 'DRAFT'`; `identityNameWarning` ≤ 2 sentences; DRAFT prefix on warning and label | NFR-2, CON-5 | A |
| T-FE-2 | `ackTextSha256 === sha256(identityNameWarning + "\n" + ackLabel)` (template text) | D8 | B |
| T-FE-3 | Honesty guard regex over every string (carried from iteration 2) | NFR-3 | A |
| T-FE-14 | `isIdentityName` passes every case in `identity-name-cases.json`, each also ASCII-upper- and lower-cased; `matcherVersion` equals `IDENTITY_MATCHER_VERSION` | FR-10, AC-13 | A |
| T-FE-19 | AC-10 render test: the Studio row and the wizard row (via `IdentityNameAck`) render `CREDENTIAL_DISCLAIMER.identityNameWarning` and `ackLabel` from the constant; B2 extends it to `SecretInput` | FR-9, AC-10 | A (+B2) |
| T-FE-20 | `RunControl`: `blockedReason` set → Run disabled and the text in `run-blocked-reason`; null → unchanged behaviour | FR-12, AC-15 | A |
| T-FE-5 | `SecretInput`: name `APP_LOGIN` → warning with `role="note"`, checkbox named `ackLabel`, `aria-describedby` resolves; name `DB_PASSWORD` → neither | FR-1, AC-1, NFR-2 | B2 |
| T-FE-6 | Matching name, unticked → Create disabled, reason visible; tick → enabled | FR-2, AC-2 | B2 |
| T-FE-7 | Tick, then change Name (to another matching name) → unticked; also after cancel, success, failure | FR-2, AC-3, D15 | B2 |
| T-FE-8 | Body keys: matching → four keys incl. version; non-matching → three keys; `redactBody` kept; canary never in console | D7, NFR-1 | B2 |
| T-BE-5 | Version parity (FE source or shared JSON) equals the server map | D8 | B |
| T-BE-6 | `IdentityNameMatcherTest` passes every case in the shared table, each also ASCII-upper- and lower-cased; repeated under `Locale.setDefault(tr-TR)` | FR-10, AC-13 | B |
| T-BE-1 | Secrets: matching name without/blank/unknown version → `400 SECRET_ACK_REQUIRED`, body zero-filled; non-matching without field → `503` (provider none); matching with version → `503`; unknown field → `400 INVALID_SECRET_REQUEST` with the new text | D7, AC-11, AC-12 | B2 |
| T-BE-2 | Secrets: non-member → `403` before any 400 | NFR-4 | B2 |
| T-BE-3 | Secrets: success with canary → exactly one `studio.credentials.audit` line (`surface=VAULT_SECRET`) with all D9 fields; no canary in any log; failed create → no line; throwing logger still `201` | FR-8, AC-9 | B2 |
| T-BE-4 | `CredentialAckAuditLoggerTest`: field set equals the allow-list; `disclaimerSha256` from D8; never throws | D9 | B |
| T-BE-7 | `IdentityNameAckPolicyTest`: create with `APP_LOGIN` and no entry → `400 IDENTITY_NAME_ACK_REQUIRED` with `variableNames: ["APP_LOGIN"]`; with entry → OK; required name with blank or unknown version → `IDENTITY_NAME_ACK_REQUIRED` (pinned); shape errors (non-array, >100 items, item not an object, missing or extra field, non-string, blank or >64-char `variableName`, >64-char version) → `INVALID_IDENTITY_NAME_ACK`; entry for an absent or secret variable, or two entries with the same trimmed name → `INVALID_IDENTITY_NAME_ACK`; two rows with the same matching name and one entry → OK, one audit line; `" APP_LOGIN "` compares equal to `APP_LOGIN`; message and `variableNames` never contain a value | FR-14, AC-18 | B1 |
| T-BE-8 | Update: stored `USERNAME` unchanged (value changed too) and no entry → OK, no audit line; rename `USERNAME` → `SVC_LOGIN` without entry → 400; secret→plain kind change of a matching name without entry → 400 | FR-13, AC-16, AC-19 | B1 |
| T-BE-9 | Order: non-member with a malformed ack list → `403` (shape is validated after authorization); stale revisions → `409 STALE_REVISION` before any ack 400; nothing written on a 400; v1 and v2 bodies alike | NFR-4 | B1 |
| T-BE-10 | Same body with and without an ack entry → identical `configurationRevision`, `sourceRevision`, persisted variables JSON and authoring hash | NFR-5, AC-20 | B1 |
| T-BE-11 | Audit after commit: success → one line per distinct required name with every D9 field (`principal`, `csiId`, `environment`, `testId`, `surface=STUDIO_VARIABLE`, `operation`, `name`, `matchedToken`, `matcherVersion`, `disclaimerId`, `disclaimerVersion`, `disclaimerSha256`, `serverTimestamp`); rollback (forced) → no line; canary value absent | FR-8, FR-14, AC-9 | B1 |
| T-BE-12 | v2 path: body with `authoringSchemaVersion: 2` and the field is accepted (not `UNSUPPORTED_FIELD`) on create and update; the policy runs exactly once per request; the v2 update audit line carries the caller's `principal`, the row's `csiId` and `operation=UPDATE_TEST`; the v2 create line carries `operation=CREATE_TEST` and the new `testId` (CRIT-16) | D17 | B1 |

### 6.2 Integration tests

| ID | Test | Slice |
|----|------|-------|
| T-FE-15 | Studio page: add row `APP_LOGIN` → warning + checkbox; header Save, Variables Save, leave-dialog Save and Run disabled, with "Open Variables and confirm the own-risk notice for APP_LOGIN to save." visible under Save, under Run and in the Variables dialog; `saveDraft` guard sends no request; tick → enabled; rename to `SVC_USER` → unticked again; row `LOGIN_URL` → warning + checkbox (PO-9); row `PASSWORD` → nothing new; typing `svcUser` (stored as `SVCUSER`) → warning (AC-14, AC-15, AC-17) | A |
| T-FE-16 | Studio page: loaded test with stored `USERNAME` → warning, no checkbox, Save enabled (AC-16) | A |
| T-FE-17 | Wizard: create with prefilled `USER_ID` → Next on Check Configuration disabled with `ackMissingReason.wizard`, and Create Check disabled with the same reason; tick → both enabled; payload unchanged (AC-21) | A |
| T-FE-18 | Studio save body carries one `identityNameAcknowledgements` entry per distinct ticked required name, none otherwise; `400 IDENTITY_NAME_ACK_REQUIRED` with `variableNames: ["CODE_X"]` for a row the FE matcher did not flag → mapped message, and that row now shows the checkbox and blocks saving until ticked (drift recovery, D15) | B1 |
| T-CT-1 | Contract: `TestRequest` ↔ `UITestRequest` parity incl. the new property (`:443`); `IdentityNameAcknowledgement` schema closed; POST/PUT 400 descriptions list both codes; secrets assertions from iteration 2 updated for the optional field | B1, B2 |
| T-CT-2 | `BASE_SHA256` green on arrival, re-anchored from the committed openapi | B1, B2 |
| T-CT-3 | `PromptAssemblyTest` honesty guard green | B |

### 6.3 Acceptance tests (Given-When-Then)

```gherkin
Feature: Studio identity-name disclaimer

  Scenario: AC-14 matching new row warns and asks (FR-11, PO-9)
    Given the Studio Variables dialog
    When the author adds a plain variable named APP_LOGIN
    Then the row shows the DRAFT warning steering to a service or functional ID
    And an unchecked "I understand this is at my own risk" checkbox
    When the author adds a plain variable named LOGIN_URL
    Then that row also shows the warning and the checkbox
    When the author adds a plain variable named PASSWORD
    Then that row shows neither

  Scenario: AC-15 saving and running wait for the tick, with a reason (FR-12)
    Given a required row APP_LOGIN is unticked
    Then header Save, Variables Save, leave-dialog Save and Run are disabled
    And "Open Variables and confirm the own-risk notice for APP_LOGIN to save." is visible under Save and under Run

  Scenario: AC-16 / AC-19 existing tests are grandfathered (FR-13, FR-14)
    Given a saved test with a plain variable USERNAME
    When the author opens it
    Then the row shows the warning, no checkbox, and Save is enabled (AC-16)
    When the author changes only its value and saves without identityNameAcknowledgements
    Then the save succeeds without an audit line (AC-19)

  Scenario: AC-17 renaming resets the tick (FR-13)
    Given the author ticked SVC_USER
    When the name changes to SVC_LOGIN
    Then the checkbox is unchecked and Save is disabled

  Scenario: AC-18 server enforces and records (FR-14)
    Given a caller with write access
    When it saves a new plain variable APP_LOGIN without identityNameAcknowledgements
    Then the response is 400 IDENTITY_NAME_ACK_REQUIRED with variableNames [APP_LOGIN]
    When it saves with [{variableName: APP_LOGIN, disclaimerVersion: draft-2}]
    Then the save succeeds and one studio.credentials.audit line records principal, csiId, environment,
      testId, surface STUDIO_VARIABLE, operation, name APP_LOGIN, matchedToken login, matcherVersion,
      disclaimerId, disclaimerVersion, disclaimerSha256 and serverTimestamp
    And no log line contains the variable value

  Scenario: AC-20 acknowledgments do not change revisions (NFR-5)
    Then saving the same variables with or without an acknowledgment entry gives the same revisions

  Scenario: AC-21 wizard gate (FR-15)
    Given the Create Check wizard with a prefilled plain variable USER_ID
    Then Next on Check Configuration and Create Check are disabled until the own-risk checkbox is ticked
    And "Confirm the own-risk notice for USER_ID in Check Configuration to continue." is visible

  Scenario: AC-1/AC-2 Vault dialog is name-triggered (FR-1, FR-2)
    Given vaultSecrets is enabled in a test render and the Create Secret dialog is open
    When Name is APP_LOGIN
    Then the warning and checkbox show, and Create is disabled until ticked
    When Name is DB_PASSWORD
    Then no warning or checkbox shows

  Scenario: AC-11 documented route change (FR-8)
    Given provider "none" and a caller with write access
    When it posts a valid body named APP_LOGIN without acknowledgedDisclaimerVersion
    Then the response is 400 SECRET_ACK_REQUIRED (previously 503)
    When the body is named DB_PASSWORD without the field
    Then the response is 503 VAULT_NOT_CONFIGURED (unchanged)
```

---

## 7. Risks & Mitigations

| Risk | Prob. | Impact | Mitigation |
|------|-------|--------|------------|
| **B1 adds a save-time 400 on a live route** used by every Studio author. | Certain once landed | Med | Grandfathering (D17) means no existing test changes behaviour; only newly introduced identity names need an entry, and the shipped FE sends it. ADR-002 ruling first (OQ-18, §34 precedent); behaviour table and release note. |
| Matcher false positives train authors to tick blindly (R4). Any-token and substring matching (`LOGIN_URL`, `USER_AGENT`, `MAX_USERS`) raise their rate. | High | Med | Accepted by the product owner (PO-9). Bounded: a tick is required only when a matching name is introduced, never for stored names (FR-13); `account` stays narrowed (PO-5). Shared case table makes changes deliberate (new `matcherVersion`). |
| Matcher false negatives (personal login under `CODE`; any password name). | High | Med | Accepted by PO-0/PO-2 and stated in §1 and §1.2. PO-8 confirms that password-named Vault secrets show nothing. |
| FE and BE matchers drift, or a cached MFE bundle lags a `matcherVersion` bump. | Low | High | One case table read by both suites, with case-parity and Turkish-locale runs (D13). A server-side match the FE missed returns `400 IDENTITY_NAME_ACK_REQUIRED` with `variableNames`; the page then shows the checkbox on those rows (D15 server-required set), so the author can recover without renaming. If @architect rejects `variableNames` (OQ-18), the only recovery is renaming and this mitigation does not hold. |
| Stale FE bundle against an enforcing BE. | Low | Low | Ship FE first; v1 ignores the unknown field until then (C17). |
| Ack field rejected as `UNSUPPORTED_FIELD` on v2 (C17), or the v2 audit line has no principal (C19). | Med if missed | Med | D17: `FIELDS` gains the key; the policy runs in `updateAuthoringDraft` before delegation with an explicit `AckSubject`; T-BE-12 asserts principal, csiId and operation. |
| Run on a dirty draft with a pending acknowledgment fails silently (C23). | Certain if missed | Low | D16 disables Run with the visible reason; the `saveDraft` guard also shows it; T-FE-15, T-FE-20. |
| Audit line not durable, and attests an API assertion rather than a UI tick. | Med | Med | OQ-2 to InfoSec; D12 option; dedicated logger name. |
| Wizard collects ticks the server never sees. | Certain until FU-1 | Low | Stated in §1, FR-15 and D18 (UI-only, PO-7); FU-1 tracks the server audit line. |
| Legal/InfoSec reject own risk or rewrite copy. | Med | Med | One constant; version bump; matcher and contracts unchanged. |
| `ChecksStudioPage.tsx` WIP conflicts. | Med | Low | Shared `IdentityNameAck` component keeps page edits small. |

---

## 8. Open Questions

| ID | Question | Status / Blocking | Owner |
|----|----------|-------------------|-------|
| OQ-1 | Final wording and Legal/InfoSec sign-off on own risk. | Open. Blocks GA copy, not implementation. | @pm → Security & Compliance |
| OQ-2 | Is a log line enough evidence, or build D12? | **Partially closed by PO-4** (log line on both paths). Sufficiency open. | @architect + InfoSec |
| OQ-3 | Acknowledgment granularity. | **Closed (PO-3):** per introduced name / per secret creation. | — |
| OQ-4 | Value scanning. | **Closed (PO-0, PO-2):** none. | — |
| OQ-5 | Alpha plain-variable copy. | **Closed (PO-0):** no always-on copy. | — |
| OQ-6 | Wizard localStorage draft. | Open, routed separately (§8.1). | @architect / @dev |
| OQ-7, OQ-8 | Functional-ID request link and its delivery path. | Backlog (§8.3). | @pm / @architect |
| OQ-9 | Template notice. | **Closed (PO-0):** superseded. | — |
| OQ-10 | Accept the previous disclaimer version for one release after a copy bump? | **RULED in plan v1:** no overlap now (one accepted version); the first copy bump after the flag flips decides (ADR-002 O-22). Applies to both paths unchanged. | — |
| OQ-11 | Advisory-only on plain variables? | **Closed (PO-3/PO-4):** required checkbox and server evidence. | — |
| OQ-12 | Vault path: may a matching-name body without the field turn `503` into `400`, and where does the ack check sit? | **RULED in plan v1:** `400` may replace `503`; order 403 → parse → ack → name/value/origins → Vault. D7 keeps the first part and **diverges on the order** (ack after name/value/origins); re-ruling requested in OQ-18 (b). | @architect |
| OQ-13 | Version pin mechanism. | **RULED in plan v1:** option (b) modified, three-way test pin, no production import (PF-2). D8 adopts it unchanged. | — |
| OQ-14 | `account` narrowing. | **Closed (PO-5, 2026-10-06):** narrow rule adopted (§3.5 step 6). | — |
| OQ-15 | Grandfathering / value-only edits. | **Closed (PO-6, 2026-10-06):** existing variables exempt until added or renamed. | — |
| OQ-16 | Wizard server evidence. | **Closed (PO-7, 2026-10-06):** warning + required checkbox now; acknowledgment UI-only; server audit line is follow-up FU-1 (blocked on a backend UI_TEST check configuration, C21). | — |
| OQ-17 | Password-named secrets. | **Closed (PO-8, 2026-10-06):** identity names only; password names never trigger. | — |
| OQ-19 | Head word only, or any token? (raised by CRIT-18) | **Closed (PO-9, 2026-10-06):** any token matches; `LOGIN_URL`, `USER_AGENT`, `LAST_LOGIN`, `EMAIL_SUBJECT`, `USER_PASSWORD` trigger. | — |
| **OQ-18** | ADR-002 ruling for both contract changes. Questions for @architect: **(a)** Class C for the `TestRequest` change (optional `identityNameAcknowledgements`, `IDENTITY_NAME_ACK_REQUIRED`, `INVALID_IDENTITY_NAME_ACK` on POST/PUT `/studio/tests`). **(b)** Re-rule OQ-12's order for the Vault path: D7 proposes the ack check after name/value/origins (the ruled order is also implementable, see D7). **(c)** Re-rule `new-required-field`: D7 proposes `acknowledgedDisclaimerVersion` optional and required only for matching names (PO-0/PO-1); the ruling made it required for every body. **(d)** Accept the `variableNames` extension of the error body for the two new codes (D17, CRIT-17a), or choose the fallback (names in `message` only; renaming is the only recovery). **(e)** Confirm that the internal `updateTest(…, null)` path skips the policy (D17). The spec does not reverse (b) or (c) on its own: until ruled, B2 does not start. | **Blocks B1 and B2.** | @architect |

### 8.1 Separately routed security defect (OQ-6)

Unchanged: the wizard autosaves `uiVariables` values to `localStorage` key `checks:create:draft` (`CreateCheckPage.tsx:134-145`), removed only on successful create (`:256`). Route to @architect/@dev as its own defect.

### 8.2 Required documentation update (flagged, not edited here)

`PRD.md:119` and `docs/brd/checks-ui-studio.brd.md:104` still say pasted/inline credentials are prohibited. Once OQ-1 resolves, update both (and review `PRD.md:77,205`) to the effect of: "discouraged; a sign-in identity named as such needs an explicit, recorded own-risk acknowledgment; functional IDs recommended". Owner: @pm.

### 8.3 Backlog

| Item | Unblocked by |
|------|--------------|
| "How to request a functional ID" link in the warning | OQ-7, OQ-8 |
| **FU-1** Wizard server audit line (`surface: CHECK_WIZARD_VARIABLE`, D17 shape and rules) | Backend UI_TEST check configuration (C21); @architect assigns, @pm tracks (PO-7) |
| DB acknowledgment table (D12) | OQ-2 |

---

## 9. Implementation Checklist

### Slice A: matcher and frontend gate (no contract change)

- [ ] `credentialDisclaimer.ts` with `draft-2` strings (incl. `ackMissingReason.wizard`), `isIdentityName` (§3.5, ASCII-only), `IDENTITY_MATCHER_VERSION`; `identity-name-cases.json` with every §3.5 row; T-FE-1, T-FE-3, T-FE-14.
- [ ] `IdentityNameAck` component (D14) and tests; T-FE-19 (Studio and wizard rows).
- [ ] `RunControl` `blockedReason` prop; T-FE-20.
- [ ] Studio page: D14 rows, D15 lifecycle from loaded variables (trimmed, distinct names), D16 gating on the three Save buttons, Run and the `saveDraft` guard; T-FE-15, T-FE-16.
- [ ] Wizard: D14-D16 on `UiTestConfig`, Next on Check Configuration and Create/Update Check; T-FE-17. Do not touch the localStorage draft (OQ-6).
- [ ] Confirm no backend, openapi, `BASE_SHA256` or ADR file is touched. Do not change `vaultSecrets`.

### Slice B1 / B2 (gated on the @architect ruling, OQ-18)

- [ ] **@architect, before any code:** ADR-002 section with the Class C ruling for both changes, a behaviour table (B1: new matching name without entry → `400 IDENTITY_NAME_ACK_REQUIRED`, previously `200`; B2: matching name without field → `400 SECRET_ACK_REQUIRED`, previously `503`/`201`; non-matching and grandfathered unchanged), consumer re-check (Checks frontend Studio page, `SecretInput`, the MSW Studio save handler; no MSW secrets handler exists, CRIT-12), release-note line, §13 row `AUTHORIZED, NOT YET LANDED`. Answer OQ-18 (a)-(e); OQ-10 and OQ-13 are already ruled, OQ-12 needs the re-ruling in (b).
- [ ] Shared backend: `IdentityNameMatcher` (T-BE-6), `CredentialDisclaimerVersions` (T-BE-5), `CredentialAckAuditLogger` (T-BE-4).
- [ ] B1: raw-node component and deserializer, `FIELDS`, `IdentityNameAckPolicy` with `AckSubject` at the three entry points (D17), structured 400 (if ruled), after-commit audit; FE body, error mapping and server-required rows; MSW handler; openapi; contract test; T-BE-7..12, T-FE-18, T-CT-1..3. Deploy FE before BE enforcement.
- [ ] B2: D2, D7, D9 on the secrets path; T-FE-5..8, T-BE-1..3. Land before or with the `vaultSecrets` flip.
- [ ] Re-anchor `BASE_SHA256` once per landing, from the committed openapi, after a green-on-arrival check.

### Follow-up

- [ ] @pm: track follow-up FU-1 (wizard server audit line). Send DRAFT copy to Security & Compliance (OQ-1) with the evidence note (OQ-2). Open the OQ-6 defect. Raise FU-1's blocker (UI_TEST check configuration) with @architect.

---

## Metadata

- **Generated by:** @pm via spec-write-spec (autonomous / YOLO)
- **Iteration:** 4 (critique iteration 3 + PO-9, 2026-10-06)
- **Auto-decisions (iteration 3, still in force):** D13 two implementations pinned by one case table; D15 rename always resets, value edits never re-require (confirmed PO-6); D17 top-level transient list rather than a per-variable field; D17 enforce only on introduction (grandfather stored names). D7's "ack after name validation" is no longer an auto-decision: it is a re-ruling request to @architect (OQ-18 (b)).
- **Auto-decisions (iteration 4):**
  - [AUTO-DECISION] CRIT-14: normalize identically on every surface, or a case-blind matcher? → case-blind segment-substring matcher (§3.5; reason: the only option that gives one result per name on every surface without renaming stored Vault secrets).
  - [AUTO-DECISION] `E_MAIL` → match via a closed `e+mail` merge; digits block merges (§3.5).
  - [AUTO-DECISION] CRIT-15: gate Run by disabling it with a visible reason (new `RunControl.blockedReason`), rather than a new `'blocked'` save outcome (reason: no change to the `SaveOutcome`/`RunSaveOutcome` unions, and the existing `run-blocked-reason` caption already gives the visible-reason pattern).
  - [AUTO-DECISION] CRIT-16: run the policy at the public entry points with an explicit `AckSubject`; `updateAuthoringDraft` evaluates before it delegates with `auth = null`.
  - [AUTO-DECISION] CRIT-17: propose a structured `variableNames` list (needs @architect, OQ-18 (d)), with a stated fallback; shape validated in the service after authorization; blank/unknown version on a required name → `IDENTITY_NAME_ACK_REQUIRED`; one entry per distinct name.
  - [AUTO-DECISION] CRIT-22: do not enforce `Variable.name ≤ 64` in this story; the >64-character identity-name edge is documented (D17).
  - [AUTO-DECISION] Wizard gating also on Next (Check Configuration), with its own reason text (reason: the checkbox lives on step 1 and Create is on step 3; a reason that names a place the author is not looking at fails G155).
- **Critique items addressed:** CRIT-14 (§3.5, D13), CRIT-15 (D16, C23, T-FE-15/20), CRIT-16 (D17, C19/C20, T-BE-12), CRIT-17 (D17, §3.3, T-BE-7, §7), CRIT-18 (PO-9, §3.5, AC-14), CRIT-19 (`requirements.json`, header, AC-10/T-FE-19), CRIT-20 (D7, D8, §8 OQ-10/12/13/18), CRIT-21 (§6.3), CRIT-22 (§3.3, D15, D17).
- **Article IV note:** every rule in §3.5 traces to PO-2, PO-5, PO-8, PO-9 or CRIT-14 (case parity). The `e+mail` merge, substring search and digit rule are @pm auto-decisions made to satisfy CRIT-14; they are listed above so @qa and the PO can see them.
- **Next:** @qa `*critique-spec studio-secrets-disclaimer` (iteration 4). Then @architect rules OQ-18 (a)-(e) and regenerates `implementation.yaml` using `critique.json#iterations[2].implementationYamlMustChange` plus the iteration-4 changes (RunControl, AckSubject entry points, structured error, raw-node parsing).

---

## Revision history

| Iteration | Date | Change | Driver |
|-----------|------|--------|--------|
| 2 | 2026-10-05 | Per-path own-risk table; Slice A/B split; D7 behaviour change documented; C3a/C3b; audit sequencing; contract test assertions; D11 dropped; D10 conditional. | CRIT-1..CRIT-10 |
| **3** | **2026-10-05** | **Iteration 3 — PO clarification 2026-10-05.** Disclaimer is name-triggered (PO-0). FR-3/4/5/6/7 and D3/4/5/6/10 superseded. New shared identity-name matcher `identity-names-1` with a shared case table (FR-10, D13, §3.5). Plain variables on the Studio page and in the wizard get an inline warning and a required own-risk checkbox that gates every save action, with a visible reason (FR-11..FR-13, D14..D16). New transient `identityNameAcknowledgements` on `TestRequest`, server rule with grandfathering, `IDENTITY_NAME_ACK_REQUIRED` / `INVALID_IDENTITY_NAME_ACK`, after-commit audit (FR-14, D17). Wizard evidence deferred: no backend UI_TEST check contract (FR-15, D18, OQ-16). Vault path made name-triggered with a conditional field and the ack check moved after name validation (D2, D7). Audit logger unified as `studio.credentials.audit` with the PO-4 field set (D9). Copy bumped to `draft-2`. Slices re-cut to A / B1 / B2. OQ-3/4/5/9/11 closed; OQ-2 partially closed; OQ-14..OQ-18 added. | PO-0..PO-4 |
| **3b** | **2026-10-06** | **Iteration 3b — PO answers 2026-10-06.** OQ-14 closed (PO-5: narrow `account` rule adopted). OQ-15 closed (PO-6: existing variables exempt until added or renamed). OQ-16 closed (PO-7: wizard shows the same warning and required checkbox now; its acknowledgment is UI-only until the backend supports a UI_TEST check configuration; server audit line tracked as follow-up FU-1). OQ-17 closed (PO-8: identity names only). OQ-18 stays open for @architect. No design change. | PO-5..PO-8 |
| **4** | **2026-10-06** | **Iteration 4 — critique iter 3 + PO-9.** Matcher replaced: any identity token triggers (PO-9), case-blind segment-substring matching with ASCII-only classes and `Locale.ROOT`, closed merge list, `account` narrow rule kept; example table rewritten (former non-matches `LOGIN_URL`, `USER_AGENT`, `LAST_LOGIN`, `EMAIL_SUBJECT`, `USER_PASSWORD` now match) (CRIT-14, CRIT-18). Run's save-before-run gated with a visible reason (CRIT-15). Policy runs at the public entry points with an explicit `AckSubject`; v2 update evaluates before delegating (CRIT-16). Error contract: structured `variableNames`, shape errors → `INVALID_IDENTITY_NAME_ACK` after authorization, unknown/blank version → `IDENTITY_NAME_ACK_REQUIRED`, distinct-name semantics, FE drift recovery (CRIT-17). `requirements.json` stale references cleaned, AC-10 kept (CRIT-19). OQ-10/12/13 marked RULED; D7 divergences sent to @architect as OQ-18 (b)/(c) (CRIT-20). Gherkin labels and audit fields (CRIT-21). Reason copy says where to tick; name trim/length rules (CRIT-22). Wizard Next gated. | CRIT-14..CRIT-22, PO-9 |
