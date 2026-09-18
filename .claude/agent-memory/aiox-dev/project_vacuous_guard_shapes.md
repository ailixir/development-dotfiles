---
name: vacuous-guard-shapes
description: "the catalogued ways an Epic 10 guard turned out unable to fail; check a new assertion against it before calling it a guard — includes #21 unfalsifiable-over-unemittable and #22 ambient-default-carries-the-property"
metadata:
  type: project
---

Epic 10 has found twenty distinct shapes of test that could not fail. Before you claim an assertion
guards something, check it against these, then falsify it and watch it go red.

**Why:** every one of these was written by someone who believed it was a guard, and most were
ticked on a story before QA caught them. The epic's standard is that an assertion nobody has seen
fail has not been shown to assert anything ([[epic10-falsification-standard]]).

**How to apply** — the shapes, in the order they were found:

1. A canary that stayed green with the redaction removed.
2. An assertion still green with the redactor deleted.
3. An isolation test that deleted its own coverage.
4. A pin check with an uncompared copy.
5. A contract check comparing route strings instead of response bodies.
6. A log assertion that grepped source text instead of capturing runtime output.
7. Two guards each covering half a property, with the branch needing both carrying no canary.
8. A scan keyed on a receiver's variable name while its non-vacuity guard pinned the method name.
9. An assertion whose stated discriminating mechanism is pre-empted by a different guard.
10. A guard satisfied by a broken implementation.
11. **An assertion whose expected value is imported from the module under test.** Found on story
    10.10's AC-2: `const narrative = narrativeFor(state)` then
    `expect(text).toContain(narrative.whatIsTrue)` — true of any content at all, and
    `toContain('')` is true of none. Eight of fifteen required facts were pinned by nothing while
    the criterion was ticked. The fix is a **deliberate second copy** of the expected text in a
    test-only module, with a header saying a future edit must not "remove the duplication". Copy
    drift reddening a test is the feature.

12. **A pin whose provenance nothing checks.** Story 10.10's repair for #11 put the expected text
    in a separate module with a header warning "do not remove this duplication by importing the
    module under test". QA performed that refactor and the suite stayed **fully green**: the two
    copies *were* compared every run, but nothing asserted where one of them came from. Blanking
    stayed caught (the length guards are independent of the pin) while **long-but-wrong rewording
    went silent for 14 of 15 facts**. **A header comment is not a guard.** Add one assertion that
    the pin module does not import what it pins — any specifier form, any spelling — and leave
    other tests free to import it where they compare against a *different* authority (a frozen
    document, not the module).

13. **A dwell shorter than the interval you removed.** Story 10.11b's AC-7/AC-8 asserted that the
    component holds no second execution source. Restoring a 700 ms poller beside the subscription
    reddened **nothing**, because the test waited 400 ms and the whole run finished before the
    poller's first tick. Dwell longer than the period of the thing you deleted, and write the
    number and the reason into the test.

14. **A stop-rule satisfied by the *other* stop-rule.** Story 10.11b's "a 401 on the stream stops
    everything" stayed green after the 401 branch was deleted from the streaming client: the client
    spent its reconnect bound, fell back to GET polling, and was denied by the *fallback's* branch
    instead. The test was asserting the sibling guard's property. Assert that it stopped **there** —
    the bound was never spent, no fallback happened — not merely that it stopped.

15. **"Occurs somewhere" where the criterion says "in order".** Story 10.11b's AC-17 checked that the
    scripted scenario contained a `logsTruncated: true` frame. Flipping that frame's flag off left it
    green, because two later frames carry the same flag. Locate each named event by index and assert
    the indices strictly increase.

Three further rules the epic paid for, all of which are really about aperture:

- **Size the fixture so the hazard actually occurs.** A hand-set `truncated: true` on a string
  nothing ever cut proves the renderer reads a boolean, not that it survives a clamp.
- **Make the mutation land inside the measurement window.** A second click after the first request
  settled measures a settled state and passes with no debounce present.
- **A predicate that asserts a helper returns its own argument is a tautology.**
  `conflictResponse(code).error === code` proves the helper is a function. Assert the property the
  fixture exists to carry instead — and expect a real predicate to find a real defect the first
  time you run it. Mine found one immediately.

Two cross-cutting habits: give each required fact **its own rendered slot** (an assertion over
concatenated text cannot say which fact went missing), and when a guard's instrument is a source
scan, add a second test that **plants every form it must catch** and asserts it caught them — a
scanner reading nothing is silent, not green.

**The twelfth shape, from story 10.14: a guard satisfied by an implementation that can never work.**
AC-3 asserted "upload before `sendFinal`" against a terminal path that story 10.13 had since
reordered to `settled → scratch.clear → wipe → sendFinal`. The video lives in scratch, so every
word of the criterion was satisfied by an implementation that uploads *after the file is deleted*:
green on every run, evidence `FAILED` on every run. It did not come from careless drafting — it
came from a dependency assumption that was true when written and false when merged. **Re-read the
seam you are inserting into on the tree as merged, and ask whether the criterion still
discriminates there**, not just whether your code satisfies it.

Its fix has a trap of its own. When the mutation is "move X after the thing that deletes X", a fake
that really deletes makes the test go red on a *missing file* — the symptom — and an implementation
that happened to keep a copy elsewhere would sail through. The fake scratch store has to **record
its `clear()` and delete nothing**, so the mutated order still uploads successfully and the only
thing that fails is the sequence. Prove that: under the mutation the evidence should still read
`STORED` while the ordering assertions go red.

**Interleaving two event sources needs one clock.** The same story's ordering journal first read
pod-log lines out of a recorded sink *after the fact*, while store calls were pushed at emission
time — so the log events all landed at the end and the sequence assertion was about the drain, not
the run. A sink observer that appends at write time fixed it. If an ordering test mixes sources,
every source must write into the shared journal at the instant it happens.

**A fake with an inspection method is a fake that fails your own surface assertion.** When the
criterion is "this client exposes exactly one operation", assert it on the *fake* too — and then
the fake's `objectAt`/`keys` must live **beside** the client (`fake.client`, `fake.puts`) rather
than on it, or every test using the double quietly makes "write-only by construction" false.

**The thirteenth shape, found by QA on story 10.14: a source-text scan over an artefact that quotes
itself.** A test grepped a Flyway migration's whole text for `ALTER TABLE … VALIDATE CONSTRAINT …`
— and the migration's own operator-remedy comment quotes that DDL verbatim, so the scan matched its
documentation. It passed with the statement deleted *and* with both DDL statements deleted, under a
docstring calling it "the difference between a deploy and an outage". **Strip comments before
scanning any artefact that documents itself**, and pair it with a control asserting *both* halves:
that the duplicate copy really exists in the raw text, and that stripping really removed it
(`raw.split(stmt).length == 3`, `stripped.split(stmt).length == 2`). One half alone proves nothing.

**The fourteenth, its runner-side twin: an ordering element the test supplies itself.** The same
story's sequence assertion ended with `journal.push('sendFinal')` executed by the test *after*
`until(inFlight === 0)` — last whatever the code did. It was named for a specific falsification and
stayed green under it while eight sibling assertions went red. The fix is that every element of an
ordering assertion must be emitted by the seam it names — here, an `onReportRequest` observer on the
fake HTTP client, invoked as the body is handed to the transport. **If a journal entry is appended
by the test rather than by a seam, it carries no information about order.**

**And a lesson about your own evidence: take the md5 from the shipped file, not from the backup.**
Two hashes in that story's falsification table matched no delivered state — the restore after each
mutation genuinely held, but `spotlessApply` reflowed the Java files afterwards, before the commit.
The TypeScript and SQL hashes were right because spotless does not touch them. A table whose hashes
do not correspond to what shipped is the "pin with an uncompared copy" shape turned on the
falsification record itself. Hash at the end, from `HEAD`.

**The numbering jumps from 15 to 17 on purpose.** This list grew by discovery and the epic's own count is
the authority; #16 is held by a shape catalogued elsewhere in the epic (a guard naming a production symbol
while asserting over a test-local stand-in). Do not renumber to close the gap — cross-references in the
stories use the epic's numbers.

17. **An enumeration over a declared set, satisfied by the *fallback* branch it was meant to exclude.**
    Story 10.11a's AC-4 enumerated `executeTest`'s `x-conflict-codes` and asserted each rendered a
    title, an explanation and a remedy over minimum lengths. The story's own falsification — add a
    sixth code to an in-test copy of the document — **would have passed**, because the sixth fell
    through to the "this page has no wording for it" narrative, which clears every length floor and
    is prose. The shape generalises: whenever a total-mapping surface has an honest
    *undeclared/unknown* state, an enumeration that only checks "something was rendered" is
    satisfied by it. Assert the declared member got **its own** wording — `not.toMatch(/no wording
    for/i)` — not merely that a region appeared. Found by writing the falsification table, before
    running it, which is the argument for writing the table first; @qa then measured the unrepaired
    form at **15/15 green while the wrong branch renders**. The epic calls this the seventeenth shape.

18. **A coverage matrix whose own required set is an editable literal, enumerated with `it.each`.**
    Story 10.11a's AC-22 matrix. @qa deleted a required shape and the whole suite stayed **green**,
    for three compounding reasons: `it.each` rows **vanish** rather than fail, so a deleted entry
    deletes its own tests; **nothing read the total**; and the file's non-vacuity floor was `>= 20`
    against an actual 26, so four could go in silence. Two of three families were transcribed
    literals rather than document reads. It is the story-10.10 matrix finding one layer out — there
    the per-entry *predicate* was tautological, here the *required set* was editable, which is
    worse, because a tautological predicate at least still runs. **Remedy:** derive every family
    the document can name, pin the rest **in the test file**, compare the id set **both ways** with
    `assertSameSet`, and add a second assertion that reads the **total**. A floor is not a guard,
    and say so in the file so the next reader does not mistake it for one.

    **Shape 18 has two remedies, and picking the wrong one is how it comes back.** Story 10.15
    shipped all three of its matrices in one story and @qa found two of them open — including the
    one whose deleted row was the *most load-bearing identity in the story*. Ask first whether a
    **production vocabulary** exists to derive the required set from. If it does — an enum, a set of
    public constants, a frozen document — **derive it and compare both ways**; the AC-7 table was
    closed for free off `VideoEvidence`'s five state constants. If it does not, because the rows are
    *fixtures* rather than a domain (identities, credentials, viewports), a derivation is impossible
    and the only honest remedy is the **deliberate second copy** pinned in the test file, compared
    both ways, with the total read. Write into that file that it must not be "simplified" into a
    derivation from the `@MethodSource` itself — that refactor looks like cleanup and restores the
    whole hole.

    **And: a "the matrix produced more than one outcome" assertion is NOT a coverage guard.** It is
    the standard companion to a comparative matrix and it feels like one. It is satisfied by any
    *sibling* row producing the missing outcome — deleting the wrong-CSI identity left it green
    because the no-ownership row still supplied the `403`. Keep it, and label it in the file as not
    a coverage guard, or the next reader counts it as one.

19. **A disclosure guard that pins the CLAIM but not its LOCATION** — and, one layer under it, **a
    scan for something that is absent**. Both found on story 10.18b's AC-20/AC-16a, by falsifying
    rather than by reading. The disclosure test asserts that the runbook still states *"no
    credentialed pilot may run until ED-02 has linked completed tickets"*; deleting that sentence
    from the preamble left the file **green**, because §9 states it too. Removing **both** copies
    reddens it. That is correct for what the criterion asks — the statement exists in the artefact —
    but a reviewer must know the guard cannot tell you *where*. The companion shape is worse: an
    assertion that no rendered value carries `?token=` is a scan for an absence, so a **misspelt
    pattern stays green forever and nobody ever sees it fail**. Remedy for both: plant the canary.
    Assert the pattern catches four credential-shaped URLs and does **not** catch `?download=true`,
    and if location matters, assert it per-file rather than over a concatenation.

20. **A discrimination control scoped by a naming allowlist rather than by a baseline diff — beside
    an assertion that is permanently red.** Story 10.18b's AC-18. The escalation test fails by
    design (dotted `envFrom` keys), and the control beside it filtered violations by
    `/^(STUDIO_SSE_|CHECKS_BYPASS_|STUDIO_RUNNER_|...)/` and asserted the remainder empty. @dev
    falsified it with a **favourable** mutation — a key that matched a prefix — and it went red.
    @qa ran the unfavourable one: `checks.studio.qa-probe-7255` gave **4 failed / 3 passed,
    byte-identical to the unmutated baseline**, because the already-red `toEqual([])` assertions each
    silently gained a key and **no number moved**. The general rule: **a permanently red assertion
    cannot also be a detector — it has no observable states left.** Anything that must be noticed
    *inside* an accepted failure must be a comparison against a **frozen baseline**, never an
    absence; and scoping by *name* protects only the names somebody thought of. **Remedy:** freeze
    the violating set, assert equality both ways, assert the occurrence count separately (a repeat
    of a listed key must still move a number), and falsify with a probe that matches **none** of
    your naming conventions.

### #21 — unfalsifiable over an unemittable state (story 10.11c, found by @qa)

The mirror of the one you are more likely to catch. Shape #21 is a **defensive branch that nothing
can exercise, carrying a comment that claims it closes a property**. Deleting the branch reddens
nothing, so the comment is the only thing asserting anything, and a comment is not a guard.

Concretely: `UITestDto.from` withheld the artifact hash when the artifact parsed to null — but
`ui_test_revisions.artifact` is `JSONB NOT NULL` and a `jsonb` column cannot hold text that fails to
parse, so the branch could never fire. 91 classes / 692 tests stayed green without it.

**The distinction to draw when you find one:** *falsifiable over an unemittable state* (a rendering
for a state the producer cannot emit — keep it, label it **defensive, not live**, and it can still
redden) versus *unfalsifiable over an unemittable state* (**remove it**). Disclosing the first and
missing the second is exactly what happened on 10.11c.

**The remedy that works: move the claim, do not invent a hazard.** Writing a test that constructs
the impossible row would be "a canary sized for a hazard that does not exist" — the catalogue one
entry over. Instead find what *actually* guarantees the property and assert that. Here it was the
schema, asserted against **`information_schema`** from an IT with a real database — not the JPA
`@Column` annotations and not the migration text, both of which are copies of it — with a column
that *is* nullable (`confirmed_by`) as the non-vacuity control. Making either column nullable in the
migration reddens it alone.

**Cheap self-check before you write a defensive branch:** can the state you are defending against be
represented by the database at all? `NOT NULL`, a `jsonb`/enum type, a `CHECK`, or a write-once
trigger may already make it unrepresentable.

### #22 — a case whose property is carried by an ambient default it never sets (story 10.30, found by @qa)

`StudioSaveInCallerTransactionIT` case (b) asserted that a caller's write made *before* `updateTest`
survives the service's `entityManager.refresh`. It passed — because Hibernate's default **AUTO**
flush mode flushes the dirty entity at the JPQL locking query one line earlier. The test never set a
flush mode, so it inherited one, and the property it named (refresh is safe for a held entity) was
false: under `FlushModeType.COMMIT` or Hibernate `MANUAL` the same write is lost silently and the
save reports success.

**The tell:** the case's name quotes a property of the *callee*, but the only thing making it true is
a setting the *caller's environment* happens to have. Remove the line you think is load-bearing; if
the case stays green, an ambient default is doing the work. Here, removing the repair (`flush()`)
leaves the `AUTO` parameter green forever — so an `AUTO`-only case was never a guard on the refresh.

**Remedy:** parameterize over the ambient setting and keep the production value as one row, so the
rows that *can* fail do, and the production row still says what production does. Assert the
precondition in-band too (`Session.isDirty()` immediately before the call), so a body that loses its
pending state to some earlier flush reports *that* instead of passing quietly. Fix in the callee when
you can: a flush before the refresh makes the property independent of the caller's mode, which is
better than a comment narrowing the claim to "true under AUTO" — nothing at a call site declares its
flush mode.
