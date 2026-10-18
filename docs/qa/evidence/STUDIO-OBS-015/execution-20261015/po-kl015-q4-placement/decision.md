# KL-015-Q4 and AUTHORED-ECHO-01 placement

Recorded by Pax (@po) on 2026-10-16. Machine record: `decision.json` in this folder, which lists source hashes and before/after story hashes.

Source: @architect (Aria) ruling Q4, `../backend/b2-d3-diagnosis01/aria-append-ruling01/ruling.md`.
- I did not run any build or test.
- I read the cited anchors at the working tree. They match, with one exception: the bridge-design sentence is at `:109`, not `:111`.

## 1. Known limitation in STUDIO-OBS-015

STUDIO-OBS-015 now has a new "Known limitations" section, plus Change Log row 0.1.6.

**KL-015-Q4.** If a target's accessible name contains an authored nonsecret literal, the target cannot be observed. Examples: "check title is Reports", a heading assert, a select option, or a short literal such as `1`.

- This is the specified runner boundary (consensus-plan.md:88). It is not fixed in 015.
- The D3 fixture literal `"Reports overview"` is disclosed.
- No 015 AC, task, ledger row or Status changes. Status stays **InProgress**.
- @qa carries the limitation into the gate record.

## 2. AUTHORED-ECHO-01 goes into STUDIO-OBS-009 as an AC-7 obligation (a–f)

The fix must land before the first real-model call of the D-C benchmark. Version 0.3.11 adds the obligation, a T4 sub-item, File List entries, a narrow "Not owned here" exception and a sequencing note with OBS-011. Status stays **Ready**.

Steps a–f:
- **a. Rule and approval.** @architect writes the rule. Security & Compliance acknowledges it before any code merges.
  - PO default: `sourceSpan` literals are no longer withheld from nodes.
  - Secrets, `knownSecrets`, captured values and `configuration` values stay strictly withheld.
  - @po does not decide the optional echo scrub.
  - Dated contract-text notes are added. There is no wire change.
- **b. Fixture tests.** Positive cases: Reports, Order confirmed, London, `1`/`OK`. Negative controls show that the strict classes are still withheld.
- **c. Joined regression.** The test uses the same-name literal.
- **d. Safety.** Canaries are unchanged, and the `dist` digest is recorded.
- **e. Benchmark accounting.** `benchmark.json` gets an `authoredEchoUnobservableTargets` field inside the gate denominators, written as 0 when there are none. If the fix has not landed, T4 waits for a written decision from @pm and @architect.
- **f. Copy cleanup.** Any shipped OBS-008 copy is removed.

The AC-7 gate, corpus and thresholds are unchanged.

**Why 009 and not the GA plan:** the gate this protects is AC-7. 009 already owns the one runner process (AC-1), the `dist` digest (AC-12 i), the canaries (AC-10) and benchmark accounting (the RS-1 precedent). Nothing in GA plan §4 gates the 009 benchmark.

**Rejected homes:**
- 011 is behaviour-neutral.
- 008 alone cannot make the target learnable.
- 015 was excluded by the ruling.
- The README backlog is unscheduled.

## 3. Conditional copy in STUDIO-OBS-008 (a–d)

At T2, @dev records whether AUTHORED-ECHO-01 has landed. If it has not:
- add target-not-found copy for an authored literal, with wording by @ux-design-expert;
- add no API field;
- add Vitest+MSW positive and control tests;
- name the copy key so that OBS-009 f can remove it.

This adds Change Log row 0.3.7. Status stays **Ready**.

Because 008 runs before 009, this copy is expected to be needed.

## Flags for the lead

1. AUTHORED-ECHO-01 is not on the 2026-10-15 OBS-011 start list.
   - If 011 starts first, the coordinator must give `observationCollector.ts` and `guided/runtime.ts` a single owner.
   - Adding the item to the start list would need a user decision.
2. The Security & Compliance acknowledgement is a new external dependency on the timing of AC-7.
