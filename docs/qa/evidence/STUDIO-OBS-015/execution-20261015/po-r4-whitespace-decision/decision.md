# R4: `containsText` with an expected value that is empty after whitespace normalization

Recorded by Pax (@po) on 2026-10-16. Machine record: `decision.json` in this folder (source hashes, story before/after hashes).
I did not run any build or test. The code anchors below were read at the working tree [V]; anything marked [I] is inferred.

Sources:
- Quinn, `../qa-source-review-final01/review.md` §7 "H6" and §9 R4 (sha256 `fdfa4254…`).
- Aria, `../backend/r2-diagnosis01/aria-h8-h6-ruling01/ruling.md` §H6.1 edge case and its `[AUTO-DECISION]` "whitespace-only expected → Playwright parity (passes), flagged to Pax" (sha256 `86a53bec…`).
- Dex-R, `../runner/h6-source01/notes.md` (the applied H6 patch).

## Decision

**Do not accept it as Playwright parity. A `containsText` assertion whose expected value is empty after `normalizeWhiteSpace` never passes.** The fix goes into **STUDIO-OBS-015 now**, in the runner only, and it reports the existing `ASSERTION_FAILED` outcome. For every non-empty expected value, Playwright 1.63 parity (F4) stays as Aria ruled it.

Why:
1. **It is a false pass, and false passes are a hard gate.** A check that cannot fail is not a check. OBS-009 AC-7 (D-C) makes "zero false passes" a hard gate, and OBS-010 AC-1 does not open the pilot until it passes. In a monitoring product, a check that is silently green is worse than one that is red.
2. **015 caused it.** Before H6, a whitespace-only expected value usually *failed* (`innerText.includes("  ")`, ruling H6.1). H6 is a 015 change, so the vacuous pass is a 015 regression and is closed in 015. This differs from KL-015-Q4, FOCUS-MUTATION-01 and KL-015-R1: those were limits that already existed, and they were placed elsewhere.
3. **The refusal is not invented (Article IV).** The runner already refuses a blank value on the read side: `observationCollector.ts:728` (`!captured.trim()` → `POLICY_DENIED`) and `guided/runtime.ts:415` (`READ_DENIED`). This decision applies the same blank-value rule to the expected side of `containsText`. Aria picked parity only because she would not invent refusal semantics, and she left the product question to @po.
4. **It is rare, which keeps the fix small, but rare is not safe.** Plain-English steps almost never produce a whitespace-only expectation. That is why the runner backstop is enough and no authoring-time refusal is required (§3). It is still not a reason to leave a path that passes vacuously.

## 1. Paths affected [V]

- An expected value comes from an `authoredLiteral` (a source span or a configuration value) or from a `binding` (`guided/types.ts` `assert.expected`).
- Source spans need `start < end` (`GuidedSourceReferenceValidator.java:88-94`) but may be whitespace only. Configuration values have no blank check.
- Reads refuse blank captures using JS `trim()`. JS `trim()` does not remove U+200B or U+00AD, but `normalizeName` does (`observationCollector.ts:52`). So a binding captured as only `​` or `­` passes the read guard and then normalizes to `""`. **This binding path cannot be seen at planning time.** That is why the guard goes in the runner.
- The only `containsText` implementation is `observationCollector.ts:752`. Guided learning (`runtime.ts:407`), guided prefix replay (`runtime.ts:383`) and published observed replay (`executor/observedReplay.ts:386`) all reach it (ruling H6.2 [V]).
- No other predicate is affected:
  - `url` and `title` use exact equality (`observationCollector.ts:627`);
  - `hasValue` is exact (`:750`);
  - `visible` has no expected value.

## 2. Required change (owner Dex-R; Quinn re-gates). Spec

**`studio-runner/src/run/observationCollector.ts`**, `invoke` → `case 'assert'`. Replace line 752 (H6) with:

```ts
          // F4 (studio-inference-contract-v1 §6): Playwright 1.63 normalizeWhiteSpace parity on both sides; read values stay byte-exact.
          // PO R4 (2026-10-16): an expected value that is empty after normalization is not an assertion and never passes.
          if (operation.predicate === 'containsText') { const expected = normalizeName(value()); return { assertionPassed: expected !== '' && normalizeName((element as HTMLElement).innerText).includes(expected) }; }
```

- The result is `assertionPassed: false`, which gives ledger `FAILED` / `ASSERTION_FAILED`. Guided learning gets this through `runtime.ts:428` and then stops at `:432`. Replay gets it through `observedReplay.ts:386` `demand(... === true, 'ASSERTION_FAILED')`.
- **Do not throw inside the page.** `browser.ts:509` maps any in-page exception other than the two password/focus codes to `TARGET_CHANGED`. That exception is raised after `begin()` (`browser.ts:504`), so the runtime records `UNKNOWN_OUTCOME` (`runtime.ts:440-443`), and replay would read it as drift. Both would misreport the cause.
- `value()` still refuses `null` with `POLICY_DENIED` (unchanged). Comparison stays in-page and returns a boolean only, so nothing new leaves the page.
- No change to `read`, `businessText`, `hasValue`, `assertPage`, the contracts, the schemas, the backend or `EXECUTOR_VERSION` (`2.1.0`; the same reasoning as ruling H6.2).

**Tests:**
- `studio-runner/test/run/observationCollectorInvoke.test.ts`:
  - In the F4 table, the row `['Order 42 confirmed', '   ', true]` becomes `false`.
  - Add two rows: `['Order 42 confirmed', '​', false]` and `['Order 42 confirmed', ' \n\t­', false]`.
  - Add `it('containsText never passes an expected value that is empty after whitespace normalization (PO R4)')`. It covers an element whose `innerText` is empty and an expected value of `'  '` → `false`. This proves the empty-contains-empty case does not pass either.
- `studio-runner/test/fixtures-tier/observed-contains-text-parity.test.ts`:
  - Take the whitespace-only row out of the parity comparison.
  - Assert it as a **documented intentional divergence**: the runner returns `false`, and the pinned `expect(locator).toContainText('   ')` passes. Label the row `PO R4 divergence`.
  - Every other row stays a parity row.
- Red-before: run both files against the H6 collector (`e073909b…`). Only the changed or added R4 rows may fail.

**Build and run set:**
- Rebuild the runner `dist` (`build` script). Record the new `dist/run/observationCollector.js` hash and the dist manifest hash. "Dist stable" changes once more; this is expected.
- The final run set must execute against this post-R4 dist and digest:
  - the two test files above;
  - the full runner unit tier;
  - the joined `assert-fail` label. Its base learning must still pass step 3, and the deliberate variant failure must still fail.
- R4 is runner-only. It does not add to Quinn's R1-R3 backend scope.

**Documentation (owner @architect, non-blocking for the code):** append a dated note to `docs/architecture/studio-inference-contract-v1.md` F4 (line 124): "Exception (PO R4, 2026-10-16): a string `toContainText` expectation that is empty after whitespace normalization never passes." @po did not edit the architecture doc.

## 3. Rejected options

| Option | Why rejected |
|---|---|
| Accept as Playwright parity and record a known limitation | A vacuous pass breaks the D-C zero-false-pass hard gate and the product's truthfulness. It is also a regression that 015 itself introduced. |
| Refuse at the proposal validator | `GuidedProposalValidator` sees only ids, never values (privacy boundary, `:340-363`). It cannot evaluate the text. |
| Refuse at source-reference resolution (`GuidedSourceReferenceValidator.resolve`, slot `assert.expected`) | The slot does not know the predicate. A configuration value of `""` for `hasValue` ("field is empty") is a real, non-vacuous check and would be refused. It also misses the binding path. |
| Refuse at plan admission (a join of predicate and resolved value after `inputs.validate`, `GuidedTranslationService.java:202`, `:986`, plus the refine and answer paths) | Not required now. The runner guard already removes the false pass on every path. The benefit would only be an earlier message plus a model repair (an `INVALID_CONTRACT` repair, `:1628-1632`). The cost is a predicate-aware check at three or more admission sites for a case not yet observed. **Revisit trigger:** if any D-C benchmark run or pilot session fails at a `containsText` step because the expected value is empty after normalization, @po reopens this and places an authoring-time refusal. |
| A new specific outcome code (for example `EMPTY_EXPECTATION`) | `Ledger.outcomeCode` is a closed enum in v3 (`guided/types.ts:24`). A new code is a contract, generator and pins change, which is not justified for this case. `ASSERTION_FAILED` is truthful: the assertion did not pass. |
| Throw `POLICY_DENIED` in the page | It would be reported as `TARGET_CHANGED` / `UNKNOWN_OUTCOME` (`browser.ts:509`), see §2. |

## 4. Story record

- STUDIO-OBS-015 gets an appended block, "PO decision R4", placed after the Known limitations entries, plus Change Log row 0.1.9.
- AC text, Tasks, ledger rows and Status (**InProgress**) are unchanged.
- @dev adds the three runner files to the File List. The H6 files are not listed there yet [V].
- @qa records the R4 disposition in the gate record. @po does not edit QA Results.

## Auto-decisions

- `[AUTO-DECISION]` Accept or refuse → refuse, meaning it never passes (reason: D-C zero-false-pass hard gate; this reuses the existing blank-value read rule, so it invents nothing).
- `[AUTO-DECISION]` Where → runner `invoke`, the only `containsText` implementation (reason: it covers literal, configuration and binding values in learning, prefix replay and published replay; the backend cannot see binding values).
- `[AUTO-DECISION]` Signal → `assertionPassed:false` / `ASSERTION_FAILED` (reason: a closed enum; an in-page throw would be misreported as drift or unknown).
- `[AUTO-DECISION]` Story → 015 now (reason: H6 in 015 introduced the vacuous pass; the change is two lines plus tests; a final run set is already pending).
- `[AUTO-DECISION]` Authoring-time refusal → not required; recorded with a revisit trigger (reason: rare, and the runner guard already gives zero false passes).
