---
name: epic10-vacuous-guard-shapes
description: Running catalogue of the twenty-one guard shapes Epic 10 has found that could not fail — check every new story against this list before gating
metadata:
  type: project
---

Epic 10 has now found **twenty-one** guards that could not fail, plus one that was created and
destroyed before it shipped. Hunt for the next one in every gate.

**Why:** the epic's stories repeatedly ship redaction/cleanup that works beside a test that cannot
tell. @sm now writes criteria as experiments ("record which mutation turned which named test red")
specifically because of this history.

**How to apply:** when gating an Epic 10 story, walk this list against the new tests before
accepting any mutation table. Reproduce at least four mutations yourself.

Known shapes, in the order they were found:

1. Assertions that grep source text instead of capturing runtime output.
2. Canaries that are never actually placed in the request.
3. Isolation tests that delete their own coverage (a hardcoded directory/file list that a new
   module escapes).
4. Pin checks with an uncompared extra copy.
5. Contract checks comparing route strings instead of bodies.
6. (10.13) An assertion whose cut point is placed *before* the value, so both orders pass — fixed
   by padding so the cut lands inside the value and asserting the fragment.
7. (10.13) A post-release test that trips an earlier guard (`close`) and never reaches the branch
   under test (`release`), making that branch unreachable in production too.
8. (10.13, found by @qa) **Two guards each covering half a property, with the branch that needs
   both never carrying the canary.** `outputRelay.write`'s no-newline overflow branch sliced before
   redacting; the redact-before-truncate test planted the canary but ended its line with `\n` so it
   travelled the other branch, and the one test that reached the overflow branch ran with
   `values: []`. Line coverage read 98.68 % and hid the intersection.

9. (10.13 recheck, found by @qa) **An assertion whose stated discriminating mechanism is pre-empted
   by a different guard**, so the comment reads as load-bearing and the assertion is not. Spotted
   by noticing that a *surviving* mutant was survived precisely because of it — a surviving mutant
   is a pointer to a vacuous guard, not just a gap.
10. (10.13 recheck, caught by @dev before shipping) **Padding sized so the value lands on the near
   side of the cut it claims to straddle.** Always re-run the new guard with the *old* arithmetic
   and confirm it passes; if it fails either way, it is not proving what it says.

11. (10.9, found by @qa) **A structural source scan keyed to the receiver's variable name, whose
   non-vacuity guard pins only the method name.** `NoAutoConfirmTest`'s "exactly one production
   caller" (AC-21) and `RepairLoopTest`'s "no path to confirm" (AC-12) both matched the literals
   `compileStateService.confirm(` and `states.confirm(`, while asserting for non-vacuity that
   `public UUID confirm(` exists — which reads reassuringly and proves nothing about the receiver.
   A temporary production `@Component` calling `stateService.confirm(..., "system")` — an
   auto-confirmation with no principal, in the very package the second scan polices — left both
   tests green. Probe shape that found it: add the forbidden thing under a *different local name*
   and re-run.

12. (10.10, found by @qa) **An assertion whose expected value is imported from the module under
   test** — the frontend form of the same disease. AC-2's `it.each(DECLARED_STATES)` did
   `const narrative = narrativeFor(state)` from the production constants module the component
   renders from, then `expect(text).toContain(narrative.whatIsTrue)`. True for any content,
   including one character; `toContain('')` is true for none. Four hand-written literal-regex tests
   rescued three of five states; the other two were unguarded — 8 of 15 required facts could be
   reduced to `'x'` with the full suite green. Probe shape that found it: **replace the production
   copy with junk and run the suite.** For any UI story, do this before accepting a "renders the
   narrative" test. Sister shape to #4 (a pin with an uncompared copy) — here the two copies are
   the same object.

13. (10.10 round 2, found by @qa) **A deliberate second copy whose independence is protected only
   by a comment.** The fix for shape 12 was to pin AC-2's expected text in `pinnedNarratives.ts` as
   a second copy, with a header warning that a future "remove the duplication" must not import the
   module under test. Nothing enforced it: performing exactly that DRY refactor left the suite
   **fully green** (52/52), silently converting a real pin back into a tautology. Distinct from #4
   — there the copies were never compared; here they are compared every run, and what is unguarded
   is the pin's **provenance**. It is the *regression path* back into shape 12, not shape 12 itself.
   Mitigating detail worth copying: independent length guards on the harness
   (`MIN_PHRASE_LENGTH`, `MIN_RENDERED_FACT_LENGTH`) still caught *blanking* after the refactor;
   only *silent rewording* reopened. Probe shape: **after any "write a second copy" fix, simulate
   the DRY cleanup and re-run.** Remedy is one import assertion, which is a legitimate instrument
   because the property genuinely is about imports.

14. (10.14, found by @qa) **A source-text scan over an artefact that quotes itself.** The assertion
   greps a file for the statement whose presence and ordering it is asserting, and the *same file*
   contains a prose copy of that statement. `ErrorCodeVocabularyTest`'s form assertion did `containsIgnoringCase("ALTER TABLE ui_test_executions VALIDATE
   CONSTRAINT ck_ui_test_executions_error_code")` plus an `indexOf` ordering check over the whole
   migration text — and the migration's (good, correct, helpful) operator-remedy comment quotes
   that statement verbatim. It stays **green with both DDL statements deleted**. Distinct from #1:
   the artefact under test is the one being read, and the false evidence lives *inside* it. The
   same file had a parser control for its value list and not for its form assertions — so the
   author already knew the hazard and applied the remedy one assertion too narrowly. Probe shape:
   **delete the statement, keep the comments, re-run.**

15. (10.14, found by @qa) **An ordering assertion against a sentinel the test appends after the
   fact.** `terminal-order.test.ts` built a six-element journal — five entries captured at their own
   seams, and `'sendFinal'` `journal.push`ed by the test body after
   `await until(() => coordinator.inFlight === 0)`. Last by construction, so every
   `indexOf(X) < indexOf('sendFinal')` is unfalsifiable and only the `toBeGreaterThanOrEqual(0)`
   presence check can move. The test named for AC-3's own falsification (a) — *"move the manifest
   write after `sendFinal` -> the named test red"* — stayed **green** under exactly that mutation
   while eight siblings failed. The docstring claimed the element came "from the HTTP client"; it
   did not. Sibling form of #9. Probe shape: **for every ordering assertion, ask which seam wrote
   each element and reject any the test wrote itself.**

16. (10.17, found by @qa) **A guard whose name states a structural property of a production
   symbol while its body asserts only over a test-local stand-in** — or re-asserts a sibling's
   behavioural property under the structural name. The structural claim lives in prose; nothing
   executes it. It **survives ordinary mutation testing**, because the sibling mechanism reddens it
   and that red is then recorded as evidence for the claim it never made. Two instances in one
   story. (a) AC-22's `enumerates the producers reachable from a run and finds one call site, which
   is the guard` enumerates nothing: it plants a canary through `snapshot.appendLog` and reads it
   off `snapshot.logs.entries()` — the same mechanism as the sibling three lines above. AC-22's own
   named falsification (*route one existing producer around the redactor*) leaves the suite **fully
   green, 886 passed** — `RunSnapshot.logs` is public, `logs.append` bypasses the redactor, and past
   `maxLogEntryLength` it leaves a raw fragment nothing can scrub. The recorded mutation (remove the
   redactor *inside* `appendLog`) breaks the guard from the inside, where three tests watch.
   (b) AC-16b's gate-shut tripwire says *"the envelope's accepted key set carries no policy field"*
   and iterates `Object.keys(validJob())`, a hand-built fixture; adding `targetPolicy` to the real
   `ACCEPTED_JOB_KEYS` leaves 886 green. Distinct from #1/#11/#14 (those at least scan something)
   and from #15; nearest relative is #9. **Probe shape: for every test whose name contains a
   structural verb — "enumerates", "is the only", "carries no", "exactly one" — find the production
   symbol the name refers to and mutate *that symbol*, not the behaviour beside it.**

**10.11b (2026-09-15) — hunted, no seventeenth shape.** Ten mutations re-applied, all reproduced.
Two instances of *already catalogued* shapes, both benign, recorded so they are not re-found as new:
AC-9's ordering guard pushes its own `'wrote:N'` sentinels from the test body after
`await until(surfaced.length === 1)`, so the `indexOf` assertion is unfalsifiable by construction
(**#15**), and when the wave-5 drift is injected the test reddens by the `until` **timing out**, not
by the `order` assertion (**#9**). Neither is vacuous overall — the `toEqual` guards the test's own
construction and the real discrimination is `expect(open.finished).toBe(false)` read from
`res.writableEnded`, which the buffering-reader mutation reddens. **Probe worth reusing: for any
"negative control" row in a mutation table, re-run it literally.** 10.11b's NC row claimed the test
stays green; the shipped test was *stronger* than its criterion and went **red**. Dropping the one
extra assertion reproduced the green. A mutation table row can be wrong in the safe direction too.

**#17 — a fallback branch that satisfies the guard's quality floor while being the wrong branch.**
Found by **@dev** on 10.11a (2026-09-15) by writing the mutation table *before* running it, and
confirmed by @qa by measurement. AC-4 enumerated the document's declared `409` codes and asserted
each rendered a title/explanation/remedy over length floors. Adding a sixth **declared** code fell
through to the **undeclared**-code narrative — which is prose, clears every floor, and is green.
Repair: a per-declared-code `expect(title).not.toMatch(/no wording for/i)` before the floors.
Measured both ways: with the repair the mutation reddens that exact line; **without it the file is
15/15 green while the wrong branch renders.** Generalisation: whenever a total mapping has an
explicit fallback/unknown branch, the enumeration must assert *which* branch was taken, never only
that the output looks well-formed.

**#18 — a coverage matrix whose own required set is an editable literal, enumerated with `it.each`.**
Found by @qa on 10.11a (2026-09-15) by probing, not reading. Deleting one entry from
`EXECUTION_FIXTURE_MATRIX` left the suite **green** (198 tests, 197 green, 1 pre-existing red):
the `it.each` rows for that id simply cease to exist, and **no assertion reads the total**. The
file's own floor (`length >= 20` against 26 actual) had six rows of slack. This is shape #6 (*a
pinned copy whose provenance nothing checks*) applied to the **coverage requirement** rather than to
an assertion, and the failure mode is *silent subtraction*, not a false green. Aggravator here: two
of the matrix's three enum families were **transcribed literals** while only the third was derived
from a carrier asserted against the document. **Probe to reuse on every `it.each`-driven matrix:
delete one row and see whether anything goes red — if the answer is only "the test count drops",
the matrix guards the tests and nothing guards the matrix.** Remedy is one `assertSameSet` of the
matrix's id suffixes against the document, both directions.

**#19 — A whole evidence tier gated on an environment probe that fails OPEN, reported as a green
file.** Found by @qa on 10.18a (2026-09-15) by breaking the prerequisite, not by reading. The suite
discovers its external dependency at import time (`helm version`, `docker image inspect <tag>`) and
converts absence into `skip`. Measured: `helm` replaced by a binary that exits 127 →
`chart.test.ts` is **1 passed | 89 skipped (90)** and the file is GREEN;
`STUDIO_RUNNER_IMAGE=<nonexistent tag>` → `sec2.test.ts` is **1 passed | 3 skipped (4) in 1 ms** and
GREEN. The surviving test asserts a tautology (`expect(typeof DOCKER).toBe('boolean')`) and carries
the disclosure in its *name*, which is not what a pipeline reads. Aggravator: the arming key is an
env var, so a **typo in a CI tag disarms it identically to a missing stage** — and `ci/stages.md`
ran the tier in the stage documented as *not* needing the image, with the image built two stages
later and `STUDIO_RUNNER_IMAGE` set nowhere in the repo.
Distinct from the epic's a/b deferral convention, where the criterion is **declared** blocked with a
gate, spike and owner; here the criteria are declared **passed**. Distinct from #3 — nothing is
hardcoded, the *environment* deletes the coverage. Distinct from #16 — the body does not assert over
a stand-in, it asserts nothing at all.
**Probe to reuse on any suite that shells out: break the prerequisite (wrong tag, tool off PATH) and
re-run. If the file is green, the tier proves nothing where it will actually run.** Remedy: make
absence FAIL unless an explicit documented opt-out env var is set.
Diagnostic worth carrying from the same story: 10.18a applied the right discipline to the halves it
declared **blocked** (unconditional `it.skip`, cannot self-arm) and the wrong one to the halves it
declared **passed** (environment-conditional, self-disarms). Check both directions in one pass.

**#16 sub-form (10.18a, @qa) — a "render mutation MN turns the named test red" row that asserts the
mutated *render*, not the named test's failure.** Sound only while the guard and the mutation row
read the identical rendered value; silently stops corresponding if a guard changes its read path.
Not counted as a new shape; note it when auditing mutation tables built on `helm template`.

**#20 — A discrimination control scoped by a NAMING ALLOWLIST rather than by a baseline diff.**
Found by @qa on 10.18b (2026-09-16) by running the *unfavourable* variant of the author's own
mutation. 10.18b ships `envfrom-keys.test.ts` deliberately RED (AC-18: 15 invalid dotted `envFrom`
keys per value set, escalated not allowlisted — the correct call, mandated by the criterion itself).
Beside the red sits a control, *"this story's OWN rendered keys are all valid — the escalation
covers nothing of ours"*, whose stated purpose is that *"it was already broken" cannot absorb a new
mistake*. It filters violations by
`/^(STUDIO_SSE_|CHECKS_BYPASS_|STUDIO_RUNNER_|STUDIO_OBJECT_STORE_|STUDIO_EVIDENCE_)/`.
The author's mutation (M15) adds `STUDIO_SSE_HEARTBEAT.seconds`, which **matches the prefix** and
duly reddens it. @qa added `checks.studio.qa-probe-7255` instead: the file reported **4 failed / 3
passed — byte-identical to the unmutated baseline.** The control stayed green, the four expected
reds each silently gained one more violating key, and **no number moved**.
Distinct from #18 (there the required *set* is an editable literal; here the *ownership predicate*
is). Distinct from #4/#13 (nothing is copied). **Probe to reuse whenever a story ships an
intentional red with a "covers nothing of ours" companion: introduce the defect under a name the
companion's predicate does not match, and check the totals rather than the named test.** Remedy:
freeze the violating **set** (or count) per surface and assert equality, so any new violation moves
the signal regardless of its name.

**Companion operational shape, same story (OPS, not a guard shape): a permanently-red CI stage
cannot report a new red.** Once a stage is non-zero by design, its exit code carries no
information, the "every other test here must be green" instruction is prose no pipeline reads, and
the natural accommodation is `continue-on-error` — which reinstates #19 through the front door.
When a story deliberately ships a red gate, ask what the pipeline is supposed to do with it.


**10.15 (2026-09-16) — hunted, found no NEW shape (#20 was landed the same day by 10.18b's gate,
independently). Three fresh INSTANCES, all found by probing.**
Two of **#18** and one of **#16's sub-form**, in a story whose mutation table honestly read
"19 of 19, none survived".
- **#18 twice.** Deleting `Arguments.of("UNAVAILABLE", 404)` from AC-7's `evidenceStates()` left
  `ExecutionVideoEvidenceIT` **BUILD SUCCESSFUL, 13 passed**. Deleting the *wrong-CSI* identity —
  AC-1's most load-bearing row — from `identities()` left `ExecutionVideoAuthorizationIT`
  **BUILD SUCCESSFUL, 12 passed**, because the non-vacuity guard (`contains(200).contains(403)`)
  was satisfied by the surviving no-ownership row. **Contrast measured in the same story:** deleting
  a row from AC-13's `cases()` reddened its guard, which carries `hasSize(6)` plus a max computed
  from the table.
- **#16 sub-form.** AC-7's `everyEvidenceStateIsAnsweredAndBothSurfacesAgree` asserts the snapshot's
  status against a case-row literal and the route's status against a second case-row literal —
  nothing relates the two surfaces, yet the message says *"the snapshot route and this route must
  not drift apart"*. Under a mutation it printed that message for a **single-surface** mismatch.

**New diagnostic (not a shape): a story can ship a catalogued remedy on one artefact and not on its
siblings, and no mutation table can see the gap** — every mutation reddens through the *surviving*
rows, so the table is honest and the matrix is still unguarded. **When a story applies a named
remedy once, grep the same story for the same construct.** Second time the epic has recorded this
(10.14's #14 was "the author already knew the hazard and applied the remedy one assertion too
narrowly"). Probe: delete one row from *every* `@MethodSource`/`it.each` table in the story, not
just the one the criteria name.

**#20's companion OPS shape applies to 10.15 and cuts both ways.** 10.15 ships
`ExecutionVideoContractEscalationTest` permanently red (ESC-1, ESC-2, both Class C, correctly left
red). I used that as the *mitigation* for its Docker-conditional tier — two unconditional non-Spring
reds mean the tier can never report `BUILD SUCCESSFUL` by skipping, which is true and measured. But
the same fact means the task's **exit code carries no information**, so a NEW red is invisible to a
pipeline, and the natural accommodation (`continue-on-error`) reinstates **#19** through the front
door. **Whenever a permanent red is used as an anti-#19 argument, say in the same breath what the
pipeline is supposed to read instead** — a per-class pass/skip/fail count compared to a frozen
baseline, not the exit code.

**Also cleared on 10.15, worth copying rather than re-finding:** the right way to close **#14**
when the artefact documents its own marker convention in prose — match at **YAML key positions**
(`^[ \t]*x-not-yet-implemented[ \t]*:`) and, in the same test, assert the **prose is still
present**, so the narrower scan is provably narrower and not merely lucky.

Lessons that are not guard shapes:

- (10.17 recheck, @qa) **The fix for a naming-overclaim shape is itself prone to the naming
  overclaim.** The test written to close shape #16 was named *"offers no way into the bounded buffer
  except `appendLog`"* while its body checked that universal only for `append` — and
  `LogBuffer.entries()` still returned the **live internal array**, so `(logs.entries() as
  LogEntry[]).push(...)` was another way in. After closing a bypass, **re-read the new test's name as
  a literal universal claim and try to falsify the claim, not the assertion.**
- (10.17 recheck, @qa) **"Close the bypass rather than watch it" generalises only with two riders.**
  (a) *A closure is only as closed as everything it returns* — remove the mutator and the object may
  still hand out its mutable interior; close, then ask what the closed surface still hands out, and
  keep a small assertion on the production object so a later refactor that reopens it announces
  itself. (b) *Where closing is unavailable, watching is not second-best, it is the whole of it* —
  Epic 10 has at least four (`PLAYWRIGHT_BROWSERS_PATH`, which ADR-001 §4.2 requires; the ED-02
  bypass, 10.18's to remove; `x-assigned-by`; and `bounds.ts`'s truncate-before-redact ordering,
  which @po ruled must stay watched rather than restructured). Safe form: **close when the bypass is
  removable without moving a responsibility to a module that should not hold it; otherwise watch, and
  point the watcher at the production symbol rather than at a stand-in.**
- Closing changes what "red" means: forcing the removed bypass makes the *product* fail, so a
  mutation table entry may read "16 red" when the mechanism is a crash, not detection. Say which.

Two lessons from the 10.13 recheck that are not guard shapes:

- **A reviewer's "one-line fix" can itself be a vacuous-guard generator.** I recommended raising a
  test timeout so a derived bound could be the discriminator. Because the load was pre-applied
  before the clock started, that alone would have converted a framework failure into a *silent
  pass*. Verify a recommended fix by mutating against it, not by reasoning about it.
- **"Not live today" claims must be checked for a second producer.** Grep every call site into the
  sink, not just the one the author names. In 10.13 there were two producers, not one; the
  conclusion held only because both shared a single construction site.

Corollary worth carrying: **high line coverage on a module is evidence against nothing here.** Ask
which *branch* the canary travels, not whether the line is executed.

21. (10.11c, found by @qa) **A defensive invariant documented as closed, with no test able to
   distinguish it from its absence — the source comment is the only evidence.**
   `UITestDto.from`'s "both or neither" rule
   (`hash = artifact == null ? null : candidate.getArtifactHash()`) carries a four-line comment
   saying a hash without its artifact "would invite a caller to confirm a revision it has no way to
   review... and this is where it is closed". Rewriting it to publish the hash anyway reddened
   **nothing** in the whole `com.citi.put.checks.studio.*` package (91/692, the identical 6
   pre-existing failures).
   Distinct from #5/#11: there an assertion existed but could not reach the code; here **no
   assertion exists at all**. Probe shape that found it: in the same story, @dev disclosed the
   mirror case — a rendering that is *falsifiable over a state the producer cannot emit*. **When an
   author discloses one unemittable-state guard, grep for its mirror: the unfalsifiable one over
   the same unemittable state is the one that does not get listed.** Look for prose that asserts a
   property is "closed"/"guaranteed here" and ask which test would notice if it were not.

**10.16b (2026-09-16) — no new shape; one #21 instance.** The fix (seek helper `slackMs` 60 → 100)
is justified by prose alone: "slack equals `MEDIAN_TOLERANCE_MS`, so an in-tolerance step is never
mis-attributed". Setting the default to 90 left everything green, because the widest captured lead
was 85.3 ms. **Probe for any "is raising this detector parameter a disguised widening?" question:**
take the real captured data, shift the measured quantity by d over a wide range, and score each
verdict against the true error, under both the old and new values. Count false fails and false
passes. It settled 10.16b in minutes: the old value produced false fails, and the new one added no
false passes below one cadence. Also, cited "real recording" provenance can often still be checked:
the developer's capture directory was in the shared scratchpad, so hash the files and re-parse them
before the scratchpad is cleaned.

**10.16a (2026-09-16): hunted; no new shape, three fresh instances, all found by probing.**
- **#12:** AC-2's expected wording was imported from the narratives module. Rewording PROCESSING to
  "No recording exists" left 161/161 green, because distinctness and length floors do not pin
  meaning.
- **#18:** AC-6's two-base `CASES` table. Deleting the cross-host row *and* applying the page-origin
  bug left 145/145 green. Deleting the row alone looks harmless, because a sibling test still
  catches the AC's named mutation. **Pair the row deletion with the bug that only that row can
  catch.**
- **#16 sub-form:** "takes X and nothing else" asserted as `fn.length === 1`. **`Function.length`
  ignores defaulted parameters**, so `(path, token = localStorage.getItem(...))` stays green.
- Also: a developer claim that deleting a store field makes re-reads a type error was false,
  because the page uses `(s: any)` selectors. Check "the compiler will catch it" claims with tsc.

**10.16b recheck (2026-09-16) — reading a constant from another test file as text is NOT shape #1/#14 if
it fails closed.** @dev read `MEDIAN_TOLERANCE_MS` from the file that must not be edited, using an
anchored column-0 regex that requires exactly one match. **Probe matrix to reuse on any "read the value
from source" guard:** change the value (it must follow); change the declaration form (typed, `export`,
float, indirect; it must fail loudly); add a decoy in a string, in a comment and in a skipped block (it
must fail loudly or ignore it); then **decouple the consuming assertion from the declaration** (`X + 50`,
or an indented shadowing const). The last one survives: the read binds to the *declaration*, not to the
*value in use*. It is still strictly better than a literal, which misses value changes too. Remedy: also
count the consuming call text and any-indentation declarations.

Related: [[qa-review-verification-depth]], [[epic10-gate-policy]]
**10.16a recheck (2026-09-17) — no new shape; two probes worth reusing.**
- **"Exactly N requests" via `waitFor(() => expect(list).toHaveLength(N))` proves "N by the first
  successful poll", nothing more (#16 family).** The sync `expect` after it runs in the same tick
  and is dead weight. A duplicate issued 300 ms after acceptance left the test green; it reddened a
  *sibling* only by leaking into its reset array. **Probe: delay the duplicate, then run the test
  with `-t` alone.** Lengthening the waitFor's timeout neither weakens nor fixes this.
- **Import-provenance scanners that strip only `.tsx?` miss a `'./x.js'` specifier, which Vite
  resolves to `x.ts`.** Try the `.js` form whenever a #13 guard filters specifiers by name. In
  10.16a an exact-imports-list assertion in the sibling control caught it; the named test did not.
