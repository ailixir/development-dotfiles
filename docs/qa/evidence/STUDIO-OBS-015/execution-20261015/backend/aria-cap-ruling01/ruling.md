# STUDIO-OBS-015: ruling on the step-text cap (aria-cap-ruling01)

Asked by: full-suite triage E, item 5 (`../fullsuite-triage-E/review.md`, "Rulings and open points").
Owner: Aria (@architect). Captured 2026-10-16T16:23:30Z. Read-only: read, grep and shasum only. No Gradle, no source edits.

## Ruling

1. **The product truth is 500.** `AuthoringStep.text` `maxLength: 500` (openapi.yaml:3338) is the only cap for a step's text on the single observed path.
2. **`studio.authoring.max-line-chars` (1024) is left over from the compile path. Delete it.** No compatibility alias. Reasons: single path, no compat, and ADR-SC-005 D-A.
3. **Keep the stable code `SOURCE_LINE_TOO_LONG`.** It now enforces the 500 bound. It is the actionable refusal ADR-002 §34 ratified, and deleting it would be a capability loss (C, rejected below).
4. **Owner: STUDIO-OBS-015** (closure of O-1/P7, ruling1). Fix it now. The test count does not change.

## Evidence (verified by reading or grep unless marked)

| Source | What it says |
|---|---|
| HEAD `compile/StudioCompileProperties.java:139`, HEAD `application.yml:409` `studio.compile.authoring.max-line-chars: 1024` | 1024 was a **compile** bound |
| HEAD `docs/specs/studio/artifact.schema.json:35` | The 1024 rationale: "a line the author is allowed to save must be representable [in the compiled artifact]". The artifact and the compiler are now deleted (012A AC-1). |
| HEAD openapi v1 `TestRequest.steps.items` `maxLength: 500` (diff hunk, old :2686/:3047) | Even the v1 contract **declared** 500. 1024 could be reached only because the v1 `UITestRequest`/`LegacyDeserializer` save body had no per-step bean constraint. |
| Commit `e4ab6c6ec` (Story 10.34, 2026-09-18) | Froze v2 `AuthoringStep.text` at 500, in the Java DTO `@Size(max = 500)` and the TS adapter |
| `StudioService.java:549-551` (HEAD :819) | The v2 service also enforces 500: `INVALID_AUTHORING` "step text is required and limited to 500 characters" |
| `frontend/src/types/studio/legacyStudioAuthoringAdapter.ts:264,290` | The frontend contract validator uses 500 |
| Frontend editor | No `maxLength` on step input (grep). No editor limit exists. |
| ADR-002 §34.1/§34.2 (VAL-024, 2026-10-04) | Ratified "1024 characters per step" as the **compile bound mirrored to save**, with the same code and message as compile |
| 012A AC-1 | Moved `AuthoringLimits` to `studio/authoring` and "preserve[d] their current guards". The move was correct; it carried the compile number with it. |
| 015 ruling1 | Deleted the v1 generation, so 1024 is now unreachable. The test port (`legacy()` → `canonical()`) turned the contradiction red. |
| v3 schemas | `NormalizedAuthoring.steps[].text`, `planning-context.sourceSteps[].text` and `revision.StepInput.text` have `maxLength 4000`; `replay-validation.sourceSteps[].source` has 4000. This is internal transport headroom, at least 500, not an authoring cap. No change. |
| Runner / translation | `GuidedSourceClassifier:111,189` allows 4000 per text/value. `limits.schema.json` has `maxSourceSteps 100` and `maxModelInputTokensTotal 262144`. No per-step cap of 500 or 1024. |
| PRD.md, ARCH.md, ADR-SC-004/005, stories 008/012A/012B/014/015 ACs | No product statement of a step-length cap (grep). The contract is the only source of truth. |
| DB migrations | No length constraint on step text |

**What the current tree does (verified from code; the 400 body was not captured, so inferred):**
- A step of 501-1024 characters gets `400 INVALID_AUTHORING` "Invalid authoring source". This is not author-facing, so the toast reads "Failed to save".
- A step of 1025 or more gets `400 SOURCE_LINE_TOO_LONG` "the maximum is 1024", which is false.

## Options

| Option | Trade-off | Decision |
|---|---|---|
| **A. One bound, 500.** `SOURCE_LINE_TOO_LONG` is enforced against a contract constant, and the property is deleted. | No contract widening. All existing enforcement points (DTO, service, FE adapter, openapi) already say 500. Fixes the false message and the generic toast for 501-1024. Gives up env tunability, which is acceptable: this is a contract value, not an operational setting, so "Config > Hardcoding" does not apply. | **CHOSEN** |
| B. Widen `AuthoringStep.text` to 1024 | A public contract widening (ADR-002 §12 Class C) with no product driver. The only reason for 1024 (compiled-artifact representability) is gone. It touches the DTO, service, FE adapter and fixtures. Worst-case source input roughly doubles (inferred about 25k tokens, from chars/4, against a 262k budget). That is affordable but unjustified. | Rejected |
| C. Delete `SOURCE_LINE_TOO_LONG` too and rely on the generic 400 | Loses the step-numbered, author-facing refusal that VAL-024 and ADR-002 §34 ratified. Capability loss. | Rejected |

## Exact change spec (all owned by STUDIO-OBS-015)

### Backend
- **B1** `studio/dto/AuthoringStep.java`:
  - add `public static final int MAX_TEXT_CHARS = 500;` with the Javadoc "UTF-16 code units; the `AuthoringStep.text` contract bound".
  - change `@Size(max = 500)` to `@Size(max = MAX_TEXT_CHARS)`.
- **B2** `studio/authoring/AuthoringLimits.java`:
  - :61 and :69 use `AuthoringStep.MAX_TEXT_CHARS`, not `limits.maxLineChars()`.
  - Message: `"Step " + n + " is " + len + " characters long; the maximum is 500. Shorten it or split it into two steps."` Built from the constant, so the shape is unchanged.
  - Javadoc: the line bound is the `AuthoringStep.text` contract bound, counted in UTF-16 units and not configurable.
  - Order is unchanged: count, then blank, then length, all before bean validation.
- **B3** `studio/authoring/StudioAuthoringProperties.java`:
  - remove the `maxLineChars` component, its `@param`, and its check.
  - The startup message becomes `"studio.authoring.max-steps must be > 0 but was " + maxSteps`.
- **B4** `application.yml:257`: delete `max-line-chars: ${STUDIO_AUTHORING_MAX_LINE_CHARS:1024}`. Grep found no helm or doc consumer.
- **B5** `StudioService.java:549-551`: use `AuthoringStep.MAX_TEXT_CHARS` instead of the literal 500. The code and message stay as they are (HTTP never reaches this guard because the mapper runs first; it is defence in depth).

### Contract
- **O1** `openapi.yaml:363-364`: "`SOURCE_TOO_MANY_STEPS` (more than 100 steps) and `SOURCE_LINE_TOO_LONG` (a step whose `text` is longer than 500 characters, the `AuthoringStep.text` bound): the authoring bounds."
- **O2** `openapi.yaml:3338-3339` `AuthoringStep.text`:
  - keep `maxLength: 500`.
  - description: "Exact authored source, including empty, Unicode and whitespace values. At most 500 UTF-16 code units; a longer step is refused `400 SOURCE_LINE_TOO_LONG` naming the step number, never its text."
  - Why "UTF-16": JSON Schema counts code points, but Java and JS count UTF-16 units. The server's count is the stricter one, and the description makes it explicit. This mismatch already exists; it is not new.
- **O3** `studio-runner/test/run/confinement.test.ts:285`: re-anchor `BASE_SHA256` in 015 with the usual old/new comment. The current pin `54fd12cd…cd0d` matches the file today.
- **O4** No generator regeneration. Verified: there is no openapi codegen in the `frontend/` or `studio-runner/` `package.json`, and the backend uses springdoc at runtime only. `observedSchemas.json` is generated from the v3 schemas, which do not change.
- **O5** ADR-002 changelog row, authorized by this ruling and landed by 015. Text: "STUDIO-OBS-015: §34.2's 1024 per-step bound was the compile bound; with compile (012A) and v1 (015 ruling1) removed, the single save bound is `AuthoringStep.text` 500. Status unchanged (400); 501-1024 now answers `SOURCE_LINE_TOO_LONG` instead of `INVALID_AUTHORING`; ≥1025 message now states 500. No request accepted on the single path becomes refused." This is Class C because the error code changes for a range of requests; this ruling is the architect-first authorization (§19).

### Tests (names kept; inventory delta 0)
- **T1** `StudioWriteValidationControllerTest:67`: `new StudioAuthoringProperties(100)`.
- **T2** `:171`: `"x".repeat(501)`. Expected message: `"Step 2 is 501 characters long; the maximum is 500. Shorten it or split it into two steps."`
- **T3** `:208` (`exactlyTheCapsAreAcceptedAtSave`): `"y".repeat(500)`.
  - This replaces the triage-E `fix.patch` comment, whose sentence "The 1024 authoring bound is the refusal case above" is now wrong.
  - New comment: "100 steps at the single `AuthoringStep.text` bound (500)."
- **T4** New coverage inside the existing T2 method:
  - a 600-character step gets `SOURCE_LINE_TOO_LONG`, not `INVALID_AUTHORING`. This pins the 501-1024 band.
  - Adding the assertion inside the existing method keeps the test count unchanged.
- **F1** `frontend/src/pages/ChecksStudioPage/saveErrorMessage.test.ts:13`: replace the fixture message with the real server text for 501 characters (above). `saveErrorMessage.ts` already passes `SOURCE_LINE_TOO_LONG` through, so no change is needed there.

### Verification (by whoever owns Gradle)
- `--tests StudioWriteValidationControllerTest`
- vitest `saveErrorMessage.test.ts`
- runner `confinement.test.ts`
- Grep gate: `max-line-chars|maxLineChars|STUDIO_AUTHORING_MAX_LINE_CHARS|1024 char` returns 0 hits in `backend/src`, `frontend/src` and `docs/specs/studio`.

## Not ruled / noted
- `studio.authoring.max-steps` is the same kind of setting: config that sits above the contract's `maxItems: 100`, and `AuthoringV2Request` `@Size(max = 100)` caps it anyway. Out of scope here; not changed.
- An inline editor character counter is optional UX that no AC requires. Not placed.
- `legacyStudioAuthoringAdapter.ts` still has the v1 string-steps branch (:262-267). That is a ruling1 inventory question, not a cap question. Flagged only.
- Security: tightening only, which narrows input-size exposure. Messages still never echo step text. Nothing is unreleased-compat sensitive: Studio is unreleased, and any local 501-1024 v1-era step stays readable but must be shortened before the next save (inferred, not checked against any DB).
