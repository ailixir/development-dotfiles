# STUDIO-OBS-008 lane L4 receipt: references, secrets, runtime capability (W2)

- **Executor:** Uma (@ux-design-expert), YOLO. @dev technical gate at F1.
- **Date:** 2026-10-17. Repo root `/Users/brunobuger/orca/workspaces/put-checks/ui-studio` (git worktree, branch `brunobuger/ui-studio`).
- **Node:** v23.10.0 (host default, as the environment note asks for frontend lanes). pnpm 10.33.0. vitest 1.6.1.
- **Git:** none. No commit, push, stash or install. `.aiox-core/core/permissions/dispatch-governance.js` untouched. No PID signalled.
- **Governing definition:** `prep-20261016/lanes.json` → `w0Refold20261017.lanes[id=L4]` (sha256 of lanes.json at receipt `42f85ee0…`).
- **Exit status:** **MET.** Every L4 verify row is green on L4's files (details and one caveat in §3).

## 1. Files written (sha256 at receipt)

| File | sha256 | Pre-edit sha256 |
|---|---|---|
| `frontend/src/components/studio/references/ReferencePicker.tsx` (new) | `9c482a1dbd00bae4768563568c3b062ee8656179ee57c9ec994bc8eca20349a8` | — |
| `frontend/src/components/studio/references/referenceTokens.ts` (new) | `1eeee6fb785ef2610e76ecf17a4f2e784a3cf83b6fea1662728ed8dbf11b2352` | — |
| `frontend/src/components/studio/references/index.ts` (new) | `8f6480988b7944b1cdd69cf0f58b824a72946e899484dcf75fb047fc51b690ba` | — |
| `frontend/src/components/studio/references/referencePicker.test.tsx` (new) | `df708a082a1c0fe77ae16cd8c6db65c67863eae617f23786790270783dfcb168` | — |
| `frontend/src/components/studio/references/referenceTokens.test.ts` (new) | `f4e04d4375e11166eca4ded261ae539ad5355d0126b79ba4cec5a9c617c1aba1` | — |
| `frontend/src/components/studio/SecretInput.tsx` | `0653a8b7c1eb55f129ab4fc7274f632a6abb4b18c3d164829bb2c257da949794` | `ce76295c02c95cf222d66e486d7a97411672919baf543c2717e562cf4c75908f` |
| `frontend/src/components/studio/SecretInput.test.tsx` | `04a301542c0e1a0c7cd38877fa69f6c78acd944c22cce3d32e1a107e71174246` | `8b2c11478e18c600a666d3369fd419fef15c5054ffa29d03e1806cc35cc02722` |
| `frontend/src/services/mocks/studio/secretsHandlers.ts` (new) | `f83122f5b78f7d024854a83d0ea4bdde3f2080397209138e5cc3764a3719e506` | — |
| `frontend/src/components/checks/wizard/configs/UiTestConfig.tsx` | `33d5b9fe01855a63207e55b8ec267ff6945998601959fa502fe496d357c858b2` | `6a12d66f0b21c680584590b0b4b7e7888274c79ca7bba8751a98258ec8048968` |
| `frontend/src/components/checks/wizard/configs/UiTestConfig.test.tsx` (**DV-1, not in the L4 write list**) | `8596b3b854a7e91799fb5256ff30979cc921e2dc66b3a9e7a956cf7da8d83054` | `b1c1394452b7787f36529ce67d5037426ddb632d5f70c23cd7ec44741cba49ee` |
| `frontend/src/components/studio/templates/quickStartTemplates.ts` | `a1699b957ae98a442c8fadac9a82174eff92584f76e1f7410009cd71ad44507f` | `5eae648ebfde584f7e760ea59215df47aca75f97e859bc4ad0ae4530b0286ef6` |
| `frontend/src/components/studio/templates/quickStartTemplates.test.ts` | `295d78cb6f12a7491e2904cf4a7639fdcce5a612ee23d4a23f06e632c2967be0` | `beea940247750266d314fec90686188ace6c24471738cea23ec09963a2a0d7a8` |
| `frontend/src/components/studio/OnboardingCoach.tsx` | `11a9e284d8c0ecb453f782cdfdd0b453945b845721e95d1e8bddb0f5c250b1a9` | `9584ebc6c699e03329d2f5ffd7c2530c56c9f13db7cbdddafdd12b1081f25295` |
| `frontend/src/utils/config/studioCapabilities.ts` (**baton → L5b at F1**) | `0200c089e7081767f365c5387c3c24208ba74460eeab96a21811158220cbdaf0` | `9e299300575105b1f1182aec0788f9b049c25b3e48822bc0363c4b23ceb51456` |

The two template files were already modified in the working tree before L4 started (part of the uncommitted 015-Done tree, R4). The pre-edit hashes above are that working-tree state, not HEAD.

## 2. What was built

- **`useStudioCapabilities(testId)`** (`studioCapabilities.ts`). Signature as frozen in the plan: `{status: 'unknown'|'loading'|'ready'|'unavailable', capabilities}`, typed as a discriminated union (`capabilities` non-null only when `ready`). It reads `studioApi.getCapabilities` (frozen W2.0 client, `__doNotRetry`). `null` id → `unknown` with no request. A new id → `loading` at once, so another test's answer is never shown. A late answer for an old id is dropped. Any refusal, network error or malformed `200` body → `unavailable` (fail-closed `isStudioCapabilities` shape check). Helper `vaultSecretsEnabled(state)`. `STUDIO_CAPABILITIES` is kept unchanged so `ChecksStudioPage.tsx` compiles until L5b deletes it.
- **`referenceTokens.ts`** (pure). `isReferenceName` (the `Variable.secretId` pattern `^(?!\.{1,2}$)[A-Za-z0-9_.-]{1,64}$`), `varToken`, `secretToken` (both throw on an invalid name), `insertAtSelection(text, start, end, token) → {text, caret}` (clamps and orders bounds and keeps the surrounding text). It also holds the visible copy helpers `secretsUnavailableText(state, noTestHint)` and `secretFailureText(failure, fallback)` (DV-4).
- **`ReferencePicker.tsx`**. An "Insert reference" button opens a menu with two sections. "Variables" lists declared plain variables. "Secrets" holds the Vault names from `secretsApi.listSecrets(testId)`, read fresh on each open and only when the capability is on, plus "New secret…". The picker emits `{kind, name, token}`, and the host applies `insertAtSelection`. When the capability is not on, the Secrets section shows the reason as text and offers no secret item and no "New secret…". There is no `<` autocomplete.
- **`SecretInput.tsx`**. The create dialog is extracted as the named export `CreateSecretDialog`, which both the select and the picker reuse. The value is a `type=password` field with `autoComplete="new-password"` and is cleared on success and failure. `onCreated` receives a **projection** `{name, version, allowedOrigins}`, so an extra field in a create answer is dropped. The select keeps the chosen name visible while the list loads (this removed a pre-existing MUI out-of-range warning). Name validation now uses the shared `isReferenceName`.
- **`secretsHandlers.ts`** (MSW mirror; exports the handler array `secretsHandlers` plus `resetSecretsMocks` and `seedSecretNames`). It is **not** wired into `handlers.ts`. It stores name, version and normalized origins, and never the value. The closed create body follows `CreateStudioSecretRequest`, with `INVALID_SECRET_REQUEST/NAME/VALUE/ORIGINS` and `409 SECRET_ALREADY_EXISTS`. Origins are normalized as `SecretOrigins.java` does. The `201` body is exactly `{name, version, allowedOrigins}`.
- **`UiTestConfig.tsx`** reads `useStudioCapabilities(formData.uiTestId)`. The Secret type and `SecretInput` appear only when the capability is on. Otherwise the row states the reason, and the "alpha" copy is gone. Clearing a secret removes `secretId`, which is never written as null, empty or an alias (D-8). The props `any` types are replaced by a structural type, and the parent `CreateCheckPage.tsx` type-checks unchanged.
- **`quickStartTemplates.ts`**: `availableQuickStartTemplates(secretsAvailable)`. A template that declares a secret is offered only when the capability is on.
- **`OnboardingCoach.tsx`**: an optional `capabilities` prop. Secret references are mentioned only for a ready `vaultSecrets: true` answer. Without the prop the state is unknown and secrets are not mentioned, so the page's current `<OnboardingCoach step={0} …/>` still compiles.

## 3. Verify rows (the run of record started 16:20:39)

| Row | Command (from `frontend/`) | Result |
|---|---|---|
| vitest | `pnpm exec vitest run src/components/studio/references src/components/studio/SecretInput.test.tsx src/components/studio/templates src/components/checks/wizard --minWorkers=1 --maxWorkers=2` | **exit 0**. 5 files, **146/146 passed**, 0 skipped. No stderr warnings |
| type-check | `pnpm run type-check` | **exit 0** at ~16:16 on the live tree after all L4 source edits. **Caveat:** re-runs at 16:20 and 16:21 returned **exit 2**, with the only errors in `src/components/studio/guided/clarification.test.tsx:43,44` (L5a's in-flight file, not L4's). Isolation run: `pnpm exec tsc --noEmit -p <scratchpad>/tsconfig.l4-isolation.json` (extends `frontend/tsconfig.json` and excludes only that L5a file) returned **exit 0** |
| eslint | `pnpm exec eslint` on the 14 L4 files | **exit 0**, 0 errors, 0 warnings |

Informational runs (not L4 verify rows):
- Consumers of L4 files: `pnpm exec vitest run src/pages/ChecksStudioPage/pageAuthoringUx.test.tsx src/pages/ChecksStudioPage/pageSaveAndStop.test.tsx src/test/a11y/studioWcagAudit.test.tsx --minWorkers=1 --maxWorkers=2` returned **exit 0, 23/23**. The a11y audit stays green as a regression guard and was not extended.
- Mutation check: two temporary edits, each restored byte-identical (hashes re-verified). Removing the hook's id-mismatch reset failed 2 tests (the hook reset test and the wizard reset test). Removing the create projection failed 1 test (`CreateSecretDialog … passes on only {name, version, allowedOrigins}`). The mutated files existed on disk for about 20 s, so a concurrent run in that window could have seen them.
- Baseline before any edit: the same three pre-existing suites were 40/40 green.

## 4. Exit criterion → tests

**E1. Never-echo canaries (AC-5(c); design I-B6, I-C11; oracles C-7/C-12, UI halves owned by L4).** Each test asserts that the value is absent and the ID is present.
- `referencePicker.test.tsx` › `ReferencePicker: "New secret…" never echoes the value` › `on success: inserts the ID, and the value is in no DOM, name, payload, storage, log or response`: DOM, input values, accessible names, `onInsert` payload, localStorage/sessionStorage, console with `debugMode` on, and MSW response bodies. The create answer's keys are exactly `allowedOrigins,name,version`. The ID is listed as `<secret NEW_PW>` on the next open.
- same › `on failure: clears the value, shows why, inserts nothing, and the value is nowhere`
- same › `passes on only {name, version, allowedOrigins} even if a create answer carried more`
- `SecretInput.test.tsx` › `secretsHandlers (MSW mirror): never echoes the value and matches the contract`: 16 tests. They cover the create answer shape and normalization, Ajv validation against `openapi.yaml` `StudioSecret`/`StudioSecretList`/`ErrorResponse`, 12 refusals (each body has no canary and nothing is stored), the 409 duplicate, and `SecretInput on the mirror: the value is cleared and shown nowhere, the ID is selected`.
- `SecretInput.test.tsx` › `CreateSecretDialog (shared with the reference picker)` › `passes on only {name, version, allowedOrigins}, even if a create answer carried more`
- Pre-existing tests, kept green: `SecretInput` › `lists the names under the test, creates by name, and clears the value afterwards`; `maps a %i %s on create to its message and clears the value` (×4); `the value never reaches the console (F19, NFR-1)` (×4).
- `UiTestConfig.test.tsx` › `creating a secret from the wizard stores only its ID; the value is in no change, DOM or input`
- **Not in L4 scope:** the clarification view, result view and plan-explanation canaries belong to the L5a/L5b components.

**E2. Capability off / on / unknown / error (AC-5(a), P1).**
- `referencePicker.test.tsx` › `useStudioCapabilities (P1: off / on / unknown / error)`: 16 tests. They cover unknown with no request; on and off from the OpenAPI examples; `guidedStartForbiddenScope` keeping vault on; 401/403/400/500 and network errors each unavailable after exactly one request; 5 malformed `200` bodies unavailable; reset on selection change; and a late answer dropped.
- `referencePicker.test.tsx` › `ReferencePicker: secrets follow the capability` › `capability off|unknown (unsaved test)|loading|error: says why, offers no secret and no "New secret…", reads nothing`, plus the capability-on and 503 cases.
- `UiTestConfig.test.tsx` › `UiTestConfig secrets follow the server capability`: 9 tests (off ×2, on, unknown, loading, error ×3 (403, 500, network), and reset on a test change).
- `referenceTokens.test.ts` › `secretsUnavailableText (capability off / on / unknown / error)`: 5 tests.
- `referencePicker.test.tsx` › `OnboardingCoach describes secrets only when the capability is on`: 6 tests.
- `quickStartTemplates.test.ts` › `with secrets unavailable, offers no template that declares or references a secret`; `with secrets available, offers every template, the sign-on check included`.

**E3. The picker inserts `<secret ID>` by `secretId` (D-8).**
- `referencePicker.test.tsx` › `capability on: lists the Vault names read when the menu opens and inserts <secret ID> by that name (D-8)`
- same › `inserts at the step's selection and keeps the surrounding text` (a real host using `useStudioCapabilities` and `insertAtSelection`)
- same › `"New secret…"` success: inserts the create answer's `name`
- `referenceTokens.test.ts` › `reference names (D-8 grammar)` (15), `tokens` (5), `insertAtSelection` (5)
- `UiTestConfig.test.tsx` › `writes the picked Vault name as secretId, and None removes it (never null or empty)`

**A2 (struck secret-fill copy; its absence is asserted).**
- `referencePicker.test.tsx` › `ruling A2: the struck secret-fill copy is absent from this lane` › `is in no L4 source file` (a raw scan of the 9 L4 source files) and `is not rendered by the picker or its create dialog in any capability state`
- `referenceTokens.test.ts` › `ruling A2: the struck secret-fill copy` › `is produced by no helper in this lane`. This includes `secretFailureText(new Error('INVALID_CONTRACT'))`.
- `SecretInput.test.tsx` › `CreateSecretDialog …` › `does not render the struck secret-fill copy (ruling A2)`
- `quickStartTemplates.test.ts` › `carries no struck secret-fill copy (ruling A2)`
- `UiTestConfig.test.tsx` › `renders neither the alpha copy nor the struck secret-fill copy (ruling A2) in any state`
- The AC-9 negative assertion on an `INVALID_CONTRACT` **result** belongs to the result view (L5a/L5b), not L4.

## 5. Copy strings and sources

| String | Where | Source |
|---|---|---|
| "Insert reference" | picker button | New (Uma). Story AC-5(b) "an **insert menu**"; UX panel "New (008)" as cited in AC-5 |
| "Variables" | picker section | Existing: the page's Variables dialog title (`ChecksStudioPage.tsx` "Variables") |
| "Secrets" | picker section | New (Uma). AC-5(b) |
| "No variables yet. Add one in Variables." | picker, empty | New (Uma). Points to the existing Variables dialog |
| "Loading secrets…" | picker | New (Uma) |
| "No secrets stored for this test yet." | picker, empty | New (Uma). `openapi.yaml` `listTestSecrets` "The names stored in Vault for this test" |
| "New secret…" | picker item | `implementation-plan.md` AC-5(b): "“New secret…” opens the existing `SecretInput.tsx`" |
| "Save the test before adding secrets" | capability unknown (picker) | Existing `SecretInput.tsx` default hint (pre-edit `ce76295c…`) |
| "Select a Studio test first" | capability unknown (wizard) | Existing `UiTestConfig.tsx` hint (pre-edit `6a12d66f…`) |
| "Vault is not connected for this environment." | capability off | Existing `SecretInput.tsx` `VAULT_NOT_CONFIGURED` text; `openapi.yaml` `VAULT_NOT_CONFIGURED` example message |
| "Checking whether secrets are available for this test…" | capability loading | New (Uma). `getStudioTestCapabilities`: "A client treats loading … as unavailable" |
| "Studio could not confirm that secrets are available for this test, so they are off." | capability error | New (Uma). AC-5(a) "Disabled means unavailable, never simulated"; `getStudioTestCapabilities` "an error and any non-200 as unavailable and never simulates a value" |
| "Could not load secrets" | picker list failure | Existing `SecretInput.tsx` fallback |
| "Use in Studio steps as <var NAME>" | wizard hint, secrets not on | Existing wizard hint with the secret clause dropped while secrets are unavailable (GA C-7) |
| "Use in Studio steps as <var NAME> or <secret SECRET_ID>" | wizard hint, capability on | Existing, unchanged |
| "Save keeps your steps, environment, and variables together." | onboarding step 2, capability not on | Existing onboarding string with the secrets clause removed (GA C-7 "onboarding mention secrets that are disabled") |
| "Save keeps your steps, environment, variables, and secure secret references together." | onboarding step 2, capability on | Existing, unchanged |
| Create dialog strings ("Create Secret", "Name", "Value", "Allowed origins", helper texts, "Create", "Cancel"), the `secretFailureText` messages, "+ Create new secret…" | SecretInput | Existing, moved unchanged |
| **Removed:** "Vault secrets are unavailable in this alpha." | wizard | AC-5(a) "the 'alpha' copy follow it"; GA C-1 |

Accessibility follows ADR-SC-006: visible text labels and visible state only. No live region, aria-only annotation, keyboard shortcut, reduced-motion handling or a11y test was added.

## 6. Deviations

- **DV-1. `UiTestConfig.test.tsx` was rewritten. It is not in the L4 write list, and no lane owns it.** The old test mocked the whole `@/utils/config/studioCapabilities` module as `{STUDIO_CAPABILITIES}`, so after the planned W2 migration `useStudioCapabilities` would be undefined, and its MSW server refused the new capabilities GET. The L4 verify row runs `src/components/checks/wizard`, so the row could not go green without this edit. It is the companion test of a file L4 owns, and it creates no overlap. Pre-edit sha256 `b1c13944…`, kept for rollback. **Root: please record it in L4's write set, or rule otherwise.**
- **DV-2.** The hook tests and the OnboardingCoach tests live in `references/referencePicker.test.tsx`, because the write list has no `studioCapabilities.test.ts` and no `OnboardingCoach.test.tsx`.
- **DV-3.** `PRODUCTION_ALPHA_TEMPLATES` is kept as a fail-closed alias (`= availableQuickStartTemplates(false)`, same content as before), because `ChecksStudioPage.tsx` (L2a, then L5b) and `pageAuthoringUx.test.tsx` import it. `templates/index.ts` is in no lane's write set and does not re-export `availableQuickStartTemplates`. Import it from `templates/quickStartTemplates`, or have root/L5b add the re-export.
- **DV-4.** The copy helpers (`secretsUnavailableText`, `secretFailureText`, `SECRETS_NEED_SAVED_TEST`) sit in `referenceTokens.ts`, not in a component file, so the lint rule `react-refresh/only-export-components` stays warning-free. `SecretInput.tsx` imports `references/referenceTokens` directly, not the index, to avoid an import cycle.
- **DV-5.** `SecretInput` shows the currently chosen name as an option while the list loads. This is an existing-behaviour polish that removes the MUI out-of-range warning seen in the baseline run.

## 7. Batons and notes for root / L5b / L2a

- **Baton `studioCapabilities.ts` L4 → L5b at F1** (sha256 `0200c089…`). `STUDIO_CAPABILITIES` is read only by `ChecksStudioPage.tsx` (lines 86, 1312, 1326 at page sha256 `87f141b5…`). In W3, L5b should do the following:
  - Read `useStudioCapabilities(testId)` once.
  - Pass the result to `ReferencePicker`, `OnboardingCoach capabilities` and `availableQuickStartTemplates(vaultSecretsEnabled(caps))`.
  - Replace the page's "alpha" copies with `secretsUnavailableText`. These are at page lines ~905, ~1281 and 1333, plus `pageSaveAndStop.test.tsx:263`.
  - Delete `STUDIO_CAPABILITIES` and `PRODUCTION_ALPHA_TEMPLATES`.
- **D-8 editor rule (UX call delegated to @ux-design-expert by the story).** A secret row with no chosen secret is never written with a null, empty or alias `secretId`. The wizard implements this by removing the key. For the page's Variables dialog, my recommendation to L5b is to keep the row visible as incomplete ("choose or create a secret") and not send it until a Vault name is chosen. Separately, when a `<secret ID>` is inserted, the host also declares a `secretRef` with `secretId = ID` if one is missing (documented on `InsertedReference`).
- **F1 (L2a):** compose `secretsHandlers` into `handlers.ts`, then remove the `listTestSecrets`/`createTestSecret` class-A allowlist entries (`studioContract.test.ts:640-641`). The mirror has module-level state, so call `resetSecretsMocks()` wherever the studio mocks are reset.
- **Upstream drift observed during the lane (both before any L4 code was written):**
  - `docs/specs/studio/openapi.yaml` was `c377e480…` at lane start and `2f4041ae…` at receipt (mtime 16:01:33). The elements L4 uses are re-verified present and unchanged in content: `listTestSecrets` :813, `createTestSecret` :849, `getStudioTestCapabilities` :937 with its three `200` examples, the `CreateStudioSecretRequest` bounds, and the `Variable.secretId` pattern. The tests read the current document at run time.
  - The frozen W2.0 `studioGuidedTypes.ts` was `bda1be53…` and is now `d3644969…` (mtime 16:00:44, presumably the L2b body step). The `StudioCapabilities` and `GUIDED_START_UNAVAILABLE_CODES` declarations L4 imports are unchanged in content.
  - `studioApi.ts` still matches the frozen `582e04ca…`.
- **Observation for @architect / L1 (not acted on):** the backend `StudioSecretsService.MAX_VALUE_LENGTH = 4096` disagrees with the OpenAPI `CreateStudioSecretRequest.value.maxLength: 8192`. The frontend and the mirror follow the contract (8192).

## 8. Not run

Full `pnpm run lint`, the full vitest suite, build, Playwright and any backend command. These are outside the L4 verify rows.

## Follow-up §5 (2026-10-17, after root decisions)

**Root decisions recorded:**
- DV-1 (`UiTestConfig.test.tsx`) is ACCEPTED into L4's write set.
- `templates/index.ts` is assigned to L5b in W3, and the `PRODUCTION_ALPHA_TEMPLATES` stand-in stays.
- The `studioGuidedTypes.ts` hash change was L2b's compatible body step.

**Ruling:** `prep-20261016/t0-rulings/w1-confirmations.md` §5 (sha256 `baea6a75…`), option (a). The secret value bound is **4096** (OBS-007 AC-12, F-5), and the contract is corrected to match the backend. That resolves this receipt's §7 observation. §5.3 names exactly three L4 places (rows 5–7). A grep of every L4 file for `8192|4096|MAX_VALUE_LENGTH` found no other place.

| §5.3 row | File | Change | sha256 after |
|---|---|---|---|
| 5 | `frontend/src/components/studio/SecretInput.tsx:24` (`:23` before the added comment line) | `MAX_VALUE_LENGTH` 8192 → 4096. This feeds `inputProps.maxLength` and the Create gate | `53a6c1aa4b1131e75c43c67a126bcc503f31f9fcd0aaded749c686ae49027c1d` |
| 6 | `frontend/src/services/mocks/studio/secretsHandlers.ts:24` | `MAX_VALUE_LENGTH` 8192 → 4096. This drives the `INVALID_SECRET_VALUE` branch | `19b4b779327cf04d6b2d36663efae479eb3c00f7f7cdcc8e681a8fdfdd9b7eb8` |
| 7 | `frontend/src/components/studio/SecretInput.test.tsx` | The bound is pinned, see the tests below | `f1e14bba9f0f1b6dfdbf46a754c7d1d2eb5dead4c564e7e99015e2763c242506` |

New and changed tests in `SecretInput.test.tsx`:
- `secretsHandlers (MSW mirror) … › accepts a value of exactly 4096 characters and refuses 4097 (W1 §5)` (new). A 4097-character value gets `400 INVALID_SECRET_VALUE` and stores nothing. A 4096-character value gets `201`. The fixture lengths themselves are asserted.
- `… › refuses a value of 4097 characters with 400 INVALID_SECRET_VALUE, stores nothing and quotes no value`. This replaces the old over-long case (`canary + 'x'.repeat(8192)`), and the value is now exactly 4097 characters.
- `CreateSecretDialog … › caps the value field at 4096 characters and creates a 4096-character secret (W1 §5)` (new). The Value field has `maxlength="4096"`. Pasting 4097 characters leaves 4096 in the field. A 4096-character secret is created on the mirror, and the field is cleared afterwards.

**Verify (from `frontend/`):**

| Row | Result |
|---|---|
| `pnpm exec vitest run src/components/studio/references src/components/studio/SecretInput.test.tsx src/components/studio/templates src/components/checks/wizard --minWorkers=1 --maxWorkers=2` (started 16:28:45) | **exit 0**, 5 files, **148/148** (146 + 2 new). No stderr warnings |
| `pnpm exec eslint` on the three changed files | **exit 0**, 0 errors, 0 warnings |
| `pnpm run type-check` (16:29:31, live tree) | **exit 0**. L5a's earlier `clarification.test.tsx` errors are gone. The isolation tsconfig run also gave exit 0 |
| Mutation check: both constants set back to 8192 temporarily, then restored byte-identical (hashes re-verified) | 3 failures, all three §5 pins above. The mutated files were on disk for about 20 s |

**Contract seen at re-run:** `docs/specs/studio/openapi.yaml` sha256 `b5ecdcad…`, with `:4429` `maxLength: 4096` (L0 unit 3 present in the tree). The frontend constants now equal the document. The optional parity line from §5 (`studioContract.test.ts`) belongs to L2a and is not adopted here.

## Gate fixes (2026-10-17, @dev tech gate `lanes/tech-gate-L4-L5a/review.md`)

Root records: DV-1 is in L4's write set, and DV-3 (the `templates/index.ts` re-export) goes to L5b. `secretsHandlers.ts` was **not** touched in this step, because L2a holds `services/mocks/studio/*` for F1.

| Finding | Change | File sha256 after |
|---|---|---|
| **F-L4-2** (low, real edge case) | `ReferencePicker.tsx`: a new effect resets `createOpen` to `false` whenever `!secretsOn`. A dialog that was open when the capability turned off is closed for good and does not reopen when the capability returns. New test: `ReferencePicker: secrets follow the capability › closes "New secret…" for good when the capability turns off, so it never reopens by itself`, which renders ON with the dialog open, then OFF (the dialog is gone), then ON (no dialog, nothing inserted) | `ReferencePicker.tsx` `e2d54d9e22aeb833fab6295fddfc90646450f521b38a74cfa6948062d0f8fd7d` |
| **F-L4-1** (low) | `referencePicker.test.tsx`: the success test reopens "New secret…" after the create. It asserts that Value, Name and Allowed origins are `''`, and runs `expectNoCanaryOnScreen()` while the dialog's fields are mounted. Then it cancels and continues as before | `referencePicker.test.tsx` `064060367f366cd8e8d39ce2644fbf77c7f98eca462c436a7457dff6ad343991` |

**Verify (from `frontend/`):**

| Row | Result |
|---|---|
| `pnpm exec vitest run src/components/studio/references src/components/studio/SecretInput.test.tsx src/components/studio/templates src/components/checks/wizard --minWorkers=1 --maxWorkers=2` (started 16:38:08) | **exit 0**, 5 files, **149/149** (148 + 1 new). No stderr warnings |
| `pnpm exec eslint` on the two changed files | **exit 0**, 0 errors, 0 warnings |
| `pnpm exec tsc --noEmit -p <scratchpad>/tsconfig.l4-isolation.json` | **exit 0**. I did not re-run the full `pnpm run type-check` for this step |
| Mutation check: the new reset line removed temporarily, then restored byte-identical (hash re-verified) | The new F-L4-2 test failed (1 failed / 39 passed). The F-L4-1 reopen assertions were not mutation-checked |
