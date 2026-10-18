# STUDIO-OBS-008: PO delta re-validation against the STUDIO-OBS-015 final contract

- **Author:** Pax (@po). **Date:** 2026-10-16. **Mode:** YOLO.
- **Tree:** uncommitted working tree on `brunobuger/ui-studio`, HEAD `734ad704f`. A source-frozen 015 validation run is live.
- **What I ran:** read-only commands only: `shasum`, `grep`, `git show HEAD:…`, and a `node` parse of `openapi.yaml` with the repo's own `js-yaml`, written to the scratchpad.
- **What I did not run:** no tests, builds, installs or git writes, and nothing under `backend/`, `frontend/`, `studio-runner/`, `tools/`, `docs/specs/` or `.github/`.
- **Writes:** this directory, plus an append-only amendment in the 008 story (Change Log 0.3.9).

## Verdict

**GO with corrections, 8/10.** Status stays **Ready**. Implementation stays held until 015 is independently QA-approved Done and the root releases it. That is the existing GO condition and P0.

- 7 of 9 ACs are still accurate against 015's landed API once the corrections D-1…D-12 are applied.
- Two contract gaps were found. Neither comes from 015; both predate it (OBS-007).
  - **A1:** the public replay surface carries no `LOGIN_REQUIRED`, no login detail and no drift signal.
  - **A2:** the password-refusal copy has no public discriminator.
  - Both are resolvable inside 008's own C-int unit, the same pattern as P1–P3. So they are T0 rulings, not NO-GO.
  - They gate only the replay halves of AC-4 and the AC-3 drift copy (A1), and the secret-fill copy (A2). T1 does not wait for them.

## Contract baseline checked (sha256)

| File | Now | At the P1–P7 rulings | Delta |
|---|---|---|---|
| `docs/specs/studio/openapi.yaml` | `c053a7f7…` | `afec6c04…` | changed by 015 C3a and later fixes |
| `contracts/v3/session-view.schema.json` | `378ab88d…` | same | none |
| `contracts/v3/result.schema.json` | `7accd138…` | same | none |
| `contracts/v3/commands.schema.json` | `7a8dbc6c…` | same | none |
| `contracts/v3/publication.schema.json` | `f5314de5…` | same | none |
| `contracts/v3/action-timing.schema.json` | `d2cb597f…` | same | none |
| `contracts/v3/versions.schema.json` | `02bc1bbc…` | same | none |

- **Operations:** 43 in total and 35 public (`node` enumeration). This matches 015's C-int receipt of 43 and P7's expected 43 → 44 once the capability operation is added.
- **Absent, as expected:** `/tests/{id}/capabilities` (P1), `PublicProgress` (P2) and `PublicExplanation` (P3). These remain 008 C-int work.
- **What 015 changed that 008 consumes:**
  - `getTest` now returns `TestDetailDto` and takes no query parameter.
  - The OpenAPI `TestRequest` is now the canonical v2 write.
  - `readiness` is `UNLEARNED|LEARNING|READY|NEEDS_RELEARN`, with `firstChangedStepId`, `confirmedRevisionId` and the optional `readinessReason: BASE_IDENTITY_INCOMPLETE`.
  - `Variable.secretId` is required for `secretRef` and must match `^(?!\.{1,2}$)[A-Za-z0-9_.-]{1,64}$`.
  - `AuthoringStep.text` is capped at 500, refused as `400 SOURCE_LINE_TOO_LONG`. The cap was already present at HEAD, and the frontend already maps the code in `saveErrorMessage.ts`, so no correction is needed.
  - The start `409` adds `REVISION_CONFLICT` messageCodes `FIRST_LEARN_STEP_NARROWED|FIRST_LEARN_STEP_UNKNOWN|BASE_REVISION_MISMATCH|BASE_IDENTITY_INCOMPLETE`, plus `POLICY_NOT_APPROVED`.
  - The result adds `relearnedFrom{stepId, driftSwitchStepId?}`, and the state enum adds `REPLAYING_PREFIX`.
  - Guided routes are under `/api/v1/studio`.

## Corrections and obligations applied (story amendment D-1…D-12)

| ID | AC | Kind | Finding (verified) | Applied |
|---|---|---|---|---|
| D-1 | AC-1 | correction | `GuidedIdempotencyKey` is `required: true` on start, clarify, cancel and finalize, and `executeTest` requires a UUID key. AC-1 named only execute and finalize. | yes |
| D-2 | AC-1/AC-7 + Dev Notes | correction | The video operation is `getGuidedSessionVideo`. The allowlist already has the 10 class-A entries. | yes |
| D-3 | AC-2 | correction | "the client never lowers k" carries the same contradiction 015 fixed in 0.1.4. Now: "positioned after k" ⇒ `409 REVISION_CONFLICT`/`FIRST_LEARN_STEP_NARROWED`. The closed start body and the Learn-again start are added. | yes |
| D-4 | AC-2/AC-3 | obligation | `readinessReason: BASE_IDENTITY_INCOMPLETE` exists on `TestDetailDto`, and no AC covered it. UX writes the copy, which must not claim the author changed steps. Run sends the first step explicitly; there is no automatic full learn. | yes |
| D-5 | AC-3 | clarification | The `LOGIN_REQUIRED`/`ASSERTION_FAILED`/… items AC-3 lists are `FAILED` codes, not states. The partial and drift copies come from `relearnedFrom`. R4 whitespace-only expected ⇒ `ASSERTION_FAILED`, with no client detection. | yes |
| D-6 | AC-3 | open → A2 | A guided password-control `POLICY_DENIED` ends as `INVALID_CONTRACT` (`GuidedTranslationService.java:1951-1963`). Replay `PASSWORD_CONTROL_READ_REFUSED` is diagnostic text only. The secret-fill copy has no public trigger. | conditional text |
| D-7 | AC-4, AC-3 drift | open → A1 | `ExecutionErrorCode` has no `LOGIN_REQUIRED` and no `detail`. `RunnerReportProjection.diagnostic` (`:540-555`) writes runner codes to text only. `StepResult` has no stable step ID and no drift code. | conditional text |
| D-8 | AC-5(b)(c) | correction | `secretId` is required, with the pattern above, and the name fallback is retired (015 R-1). `ChecksStudioPage.tsx:122` can write `secretId: null`. The MSW `handlers.ts:173` falls back to `variable.name`, while the contract matches "by its `secretId`". | yes |
| D-9 | v2 items b, g1 | correction | `getTest` has no query parameter after C3a. The frontend v1 `TestRequest` (`studioTypes.ts:293`, `steps: string[]`) is not the OpenAPI `TestRequest`, which is now v2. `csiId` is required on create; the revisions are required on update. | yes |
| D-10 | AC-7 | clarification | Action seek comes only from `kind: action` timings, which are present only when video is `AVAILABLE`. The row-85 waiver means no stamp, no button. KL-015-R1 can leave the guided video absent or partial. 015's H9 note: a reaper-closed replay may carry no video status. | yes |
| D-11 | AC-2 | obligation | An empty-draft start is `409 RUNTIME_INCOMPATIBLE` with no distinguishing messageCode (015 H5 note "for @architect/OBS-008"). The client does not start a session for zero steps, and the refusal copy names no cause. | yes |
| D-12 | AC-3 | default → A3 | `clarify` needs a server `choiceId`, and no "none" choice exists. The default is `cancelGuidedSession{reason:userRequested}` followed by focus on step N. The same applies when a side-effect confirmation is declined. | yes |

## 10-point checklist (delta)

| # | Item | Result | Note |
|---|---|---|---|
| 1 | Title | PASS | |
| 2 | Description | PASS | `grep -rn guided-sessions frontend/src` → 0, re-verified today. |
| 3 | Testable ACs | PARTIAL → PASS after D-1…D-12 | The replay halves of AC-4/AC-3 drift and the secret-fill copy are testable only after A1/A2. |
| 4 | Scope IN/OUT | PASS | |
| 5 | Dependencies | PASS | 015 is still **InProgress** (story `:6`), so the hold stands. New: A1/A2/A3 at T0. 009 AUTHORED-ECHO-01 has not landed (009 is Ready), so the KL-015-Q4 conditional applies. |
| 6 | Complexity | PASS | L. A1 may add one more C-int projection, so the size risk is noted. |
| 7 | Business value | PASS | |
| 8 | Risks | PASS | Added the KL-015-R1 video gap and the H9 null video status. FOCUS-MUTATION-01 raises how often `UNKNOWN_OUTCOME` appears; no 008 obligation. |
| 9 | Criteria of Done | PASS | |
| 10 | PRD/epic alignment | PARTIAL → PASS after amendment | Dev Notes "Contract facts" overstated the replay `LOGIN_REQUIRED` and the public `PASSWORD_TARGET_*`. D-6/D-7 now govern. |

Score: 8/10, GO. Items 3 and 10 counted as fixed by the amendment. The open rulings carry the residual risk.

## Items checked that need no change

- **POLICY_NOT_APPROVED block:** the landed `startGuidedSession` 409 has these exact messageCodes.
- **Governed `POLICY_DENIED` block:** the backend sets session errorCode `POLICY_DENIED` only with a governed reason.
- **`SIDE_EFFECT_CONFIRMATION`/`CONFIRM_ACTION`:** present in the v3 clarification enums.
- **`labelSource PAGE`:** requires `role`/`region`.
- **KL-015-Q4 conditional:** trigger unchanged.
- **Item g:** fits the landed `TestDetailDto`.
- **Class-A allowlist:** 10 entries, names match.
- **FOCUS-MUTATION-01 / KL-015-R1 / KL-015-GRANT / TF-1…5:** placed outside 008. Only the D-10 note touches 008.
- **Step text cap 500:** present at HEAD, and the save-refusal mapping already exists.

## Cross-reference

Aria's concurrent `implementation-plan.md` in this directory (sha256 `9c24ef30…`, read after my findings were written) found the same replay gap on its own. Its B12/D1 proposes a "P8" ruling. My A1 is the same question. Whichever ruling lands answers both; @po takes no option.

## Not claimed

No 008 implementation, test, QA verdict or Done. No ruling for @architect. No 015 completion. MSW evidence is never live integration.
