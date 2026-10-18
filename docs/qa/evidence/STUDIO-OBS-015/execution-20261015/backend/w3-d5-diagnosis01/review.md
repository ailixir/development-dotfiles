# STUDIO-OBS-015 w3-d5-diagnosis01: B1C-01 / `assert-fail` (UNKNOWN_OUTCOME) and `unused-declaration` (PAUSED)

Dex-D5 (@dev, diagnosis). 2026-10-16. Read-only on backend/, studio-runner/, frontend/, tools/, docs/specs/.
No Gradle and no JUnit run. Nothing committed. No QA credit. Quinn re-gates.
Input run: `w3-w01-full-incr01` (source digest `af9530fd…`, runner dist `060d9a53…`).
Live ReplayIT = run copy `702d1be9…` [V].
[V] = I read it, ran it, or quoted the log. [I] = inferred, not executed.

## Verdict

| ID | Cases | Symptom | Root cause | Class |
|---|---|---|---|---|
| D5-1 | `incrementalStepTwoAssertionFailureIsFactualAndNeverRelearned` (B1C-01, `:10603`) and joined `assert-fail` (`:13532`) | `UNKNOWN_OUTCOME`, expected `FAILED` | The assertion is never reached. The fixture's mutation runs inside the **focus** handler of the fill target. The runner's committed POST_FOCUS_CHANGED guard refuses that fill as an unknown-effect outcome. | **Test fixture defect.** No production defect. |
| D5-2 | joined `unused-declaration` (`:13239`; same literal again at `:13255`) | `PAUSED`, expected `DISABLED` | `DISABLED` is not a schedule state. The DB CHECK and OpenAPI allow only `ENABLED`, `PAUSED` and `BLOCKED`. A schedule that was never enabled is `PAUSED` with `requested_enabled=false`. | **Test expectation defect** (wrong vocabulary). No production defect. |

`fix.patch` is test-side only and covers both. It applies cleanly against the live tree (`git apply -p0 --check` OK).
The result sha256 is `b691c832…`.

## D5-1: where the outcome becomes UNKNOWN_OUTCOME

Answer to the question asked:
- It is **not** the runner's assertion-result mapping.
- It is **not** backend outcome classification.
- It is **not** a lost ACK.
- It is the preceding **fill** (B1C-01 step 1 ordinal 0, `assert-fail` step 1 ordinal 0). Its focus-time page mutation trips POST_FOCUS_CHANGED.

### Chain, in the executed dist

The dist file hashes equal the h8h6 post-build capture [V]:
- `observationCollector.js` `5b803800…`
- `browser.js` `f1409ce2…`
- `observedReplayAdapter.js` `ba83ecf9…`
- `runtime.js` `6b75489d…`

Steps:
1. **The fixture mutates on focus.**
   - ReplayIT `:1722-1723` (`assert-fail`) and `:11537-11539` (`b1c-assert2`) both add `destination.addEventListener('focus', …textContent='changed-after-read')`.
   - Only the mixed session gets this. `incrementalDomVariant` is set after the base learn (`:13295`, `:11877`).
2. **The collector refuses the fill.**
   - `observationCollector.ts:734` calls `element.focus()`, which runs the handler synchronously.
   - `:738` then re-checks `this.matches(target, locator, true)`.
   - `matches` (`:602-603`) takes the document-wide MutationObserver records (`:42-44`, `subtree`). Any record that is not a `class`/`style` attribute change bumps `revision`, so `observedRevision !== revision` (`:606`) and `matches` returns false.
   - The collector throws `POST_FOCUS_CHANGED` before `element.value = …` (`:739`). The field is never written.
3. **The browser maps it to UNKNOWN_OUTCOME.**
   - `browser.ts:504` `begin()` has already fired `beginInvocation`, so the native fence has started.
   - `:509` maps `POST_FOCUS_CHANGED` to `Error('UNKNOWN_OUTCOME')`.
4. **The prefix adapter passes it through.** `observedReplayAdapter.ts:76` → `:82` turns it into `ObservedRefusal('OUTCOME_UNKNOWN')`.
5. **The runtime records an unknown outcome.**
   - `runtime.ts:383` (prefix branch) → catch `:438-443`.
   - The code is neither `TARGET_CHANGED` nor a policy refusal, and `nativeFence.started` is true. So the ledger gets `state UNKNOWN_OUTCOME`, `outcomeCode ACK_LOST`.
   - `:453` sends the outcome callback; `:454` calls `stop('UNKNOWN_OUTCOME')`.
6. **The backend applies the reported state faithfully.**
   - `GuidedSessionService.outcomeV2` `:2294-2297` calls `stop(session, report.state)`, which gives session `UNKNOWN_OUTCOME`.
   - The runner's later `lifecycle` notice is refused at `active:2467` (via `lifecycle:2376`), because the session is already terminal.
   - For comparison, a real assertion failure maps to `FAILED/ASSERTION_FAILED` at `runtime.ts:428`, then `:432`, then the same backend line. That path is correct but is never reached here.

### Run evidence

XML `TEST-…ReplayIT.xml` system-out; the line numbers are XML lines [V].

- **B1C-01 mixed session `4ea9ebc0` (CSI-B1-22).**
  - Admitted: navigate (`89979`), read (`89980`), fill (07:04:54.436, `89981`).
  - **No** `GUIDED_ACTION_ADMITTED` for the assert.
  - At 07:04:54.640 (`89983`): `GuidedSessionException: UNKNOWN_OUTCOME` at `GuidedSessionService.active:2467` ← `lifecycle:2376`, 204 ms after the fill.
- **`assert-fail` mixed session `f0ea5a0e` (CSI-INC-44).**
  - Fill admitted at 07:11:07.039 (`90627`).
  - Same refusal at 07:11:07.228 (`90628`).
  - No assert admission.
- **Control: `unknown2` (CSI-INC-43, mixed `6bb22bdb`).** This case deliberately throws after native completion on the same fill and **passes**. It shows the same signature: fill at 07:10:55.681 (`90605`), refusal at 07:10:55.900 (`90606`).
- **H6 is effective [V].**
  - Both base sessions learned through their `containsText` steps (`25c497c1`, `380d57a6`: assert/status admitted, through checkpoint 10).
  - The probe's no-trigger control returns `assertionPassed:true` for the padded read value.
- **Native-mode hook is inert here [V].** The `b1c-assert2`/`assert-fail` modes are not in the inject list (ReplayIT `:25019`). Only `NATIVE_*` events are recorded.

### Real-Chromium probe [V]

`probe/probe.mjs` → `probe/result.json`.
- It runs studio-runner's Playwright 1.63.0 and imports the **dist** collector read-only.
- It installs the collector in an isolated world exactly as `browser.ts:306-311` does.
- It uses the ReplayIT `/flow` markup with the padded binding value.

| Trigger | fill | Order reference text | `containsText(read value)` |
|---|---|---|---|
| none | `{}` | unchanged | `true` |
| `focus` (as today) | **throws `POST_FOCUS_CHANGED`**; field not written | `changed-after-read` | not reached |
| `input` | `{}` | `changed-after-read` | **`false`** |
| `change` (patch) | `{}` | `changed-after-read` | **`false`** |

### Story and ledger expectation

- AC-4(1) and AC-6: "assertion FAIL in the prefix ⇒ run stops, nothing re-learned".
- Ledger row 26 (`prefixAssertionFailureStopsWithoutReinterpretation`): "Step2 assertion FAIL stops session … original failing assertion retained".
- The test's `FAILED` + `ASSERTION_FAILED` is therefore the correct oracle, and the fixture has to actually produce an assertion failure.

### Classification

**Test fixture defect.**
- POST_FOCUS_CHANGED was committed at HEAD `d954a21c5` and is pinned by `observationCollectorInvoke.test.ts:133-159`.
- Its UNKNOWN_OUTCOME mapping is consistent with at-most-once: focus already ran application JavaScript after the native fence, so "no effect" cannot be claimed.
- These two cases have never passed in any recorded run [V, results JSON]. The earlier failures were at base learning (H6).

### Fix (in `fix.patch`)

- Both fixtures move the mutation from `'focus'` to `'change'`, which fires after the fill's write.
- Each change carries a disclosure comment.
- **No assertion is changed.** The scenario stays the same: a successful binding read, a successful binding fill, then the step's own `containsText` on a real changed DOM fails factually.
- This is a disclosed fixture correction and needs Quinn's acknowledgement.

### Design observation (not a 015 defect; for @architect/@po) [I]

- The focus guard counts **any** non-class/style mutation anywhere in the document, not only on the target.
- So applications that render helper text, validation hints or autocomplete lists on focus will see every fill end `UNKNOWN_OUTCOME`.
- This is a capability boundary of the OBS-004/012A runner, similar in kind to KL-015-Q4. No change is proposed here.
- It is a candidate known-limitation or backlog item for Pax to place.

## D5-2: `unused-declaration` PAUSED vs DISABLED

### Expected semantics [V]

- **Ledger row 36** (`unusedDeclarationEditStaysReadyThroughAcceptanceAndDispatch`): "change unused variable advances config counter and **preserves disabled schedule** … **schedule never autoenabled**".
- **T0 implementation-ruling.md:** "Existing schedule invalidation on variable/config edits stays in force; READY does not reactivate schedules."
- **State domain:**
  - `V16__scheduling.sql:17-18`: `state DEFAULT 'PAUSED'`, `requested_enabled DEFAULT false`.
  - `:35-40`: CHECK allows only ENABLED, PAUSED (`NOT requested_enabled`) and BLOCKED.
  - `openapi.yaml:3004-3009`: enum `PAUSED|ENABLED|BLOCKED`. "Create a paused schedule".
- **So "disabled" in the ledger prose means not enabled**, which the persisted schema can only express as `PAUSED` + `requested_enabled=false`.

### Cause [V]

- The fixture inserts the schedule without `state`, so it is `PAUSED`/`false` (ReplayIT `:13160-13161`).
- `StudioScheduleInvalidation.invalidate:22-31` only touches `requested_enabled=true` rows, so this row is correctly left untouched.
- The literal `"DISABLED"` cannot be stored (CHECK constraint), so `:13239` and `:13255` could never pass.

### Classification and fix

- **Test expectation defect.**
- `"DISABLED"` becomes `"PAUSED"` at both sites, with a one-line comment.
- `requested_enabled == false` is retained.
- The second check (after execute and dispatch) still pins "never autoenabled".
- Nothing is weakened: `PAUSED` is the only non-enabled, non-blocked state.

## Patch verification

- `git apply -p0 --check` against the live tree: **OK** [V].
- Base `702d1be9…` → result `b691c832…`. One file, 4 hunks: 5 edited lines and 3 added comment lines.
- Only string literals and comments change, so compilation is not affected [I]. javac was not run.
- Line lengths: the new comment lines are ≤ 107. One edited pre-existing line goes from 124 to 125 columns (`focus` → `change`). The other two edited lines get shorter (136 → 134).
- Not run: Gradle/JUnit, spotless, checkstyle, spotbugs, the runner test tiers, and CodeRabbit (WSL-only).

## Expected after the patch (re-run `guidedIncrementalTest`) [I]

- **B1C-01 / `assert-fail`:**
  - The step-2 assert is admitted, dispatched once, and gives `FAILED/ASSERTION_FAILED`, so the session is `FAILED`.
  - The runner then stops with `CONTEXT_LOST`. Its later lifecycle refusal is expected and harmless.
  - The remaining assertions (gateways zero, no revision, `publication REFUSED` per `GuidedSessionService:2750-2756`, `NATIVE_COMPLETED == 1`) have **not executed in any run**, so their outcome is unknown.
- **`unused-declaration`:** it proceeds to the execute/dispatch assertions, which have not executed before. Their outcome is unknown.
