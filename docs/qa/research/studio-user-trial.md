# Checks Studio — nontechnical-user trial record

**Story:** [10.19](../../stories/10.19.story.md) AC-13, closing story 10.10 AC-19(b).
**Measures:** BRD §8's *"rubber-stamp"* risk and BRD §10's **Translation trust** metric.

> ## STATUS: NOT YET RUN. AC-13 IS NOT SATISFIED BY THIS FILE.
>
> **This file is the record's structure, created empty. It is not a result, and it must never be
> read as one.** Story 10.19's criterion AC-13 stays **unchecked** and story 10.19 does not reach
> `Done` while this is the state — that is AC-13(g) and the story's *Definition of done*, not a
> judgement made here.
>
> **AC-13 is explicitly not staging-blocked.** No `ED-*` or `SPK-*` id gates it. It cannot be
> recorded *"skipped — blocked"*, and it is not recorded that way. What is missing is **scheduling
> and staffing**, and the owners for that are named below.
>
> Story 10.10 predicted this and story 10.19 repeated the prediction up front:
> *"there is no mechanism in this repository that would notice if it never happened."* There still
> is not. `docs/qa/scripts/verify-staging-registration.mjs` check (v) confirms this file has the
> sections below — **that is a presence check, not a truth check**, and it would pass just as
> happily over invented content. **If this is ever marked done without a named session, a named
> (anonymised) participant set and a written result, it was not done.**

## Owners (AC-13(e))

| Role | Owner |
|---|---|
| Designs and runs the sessions | **@ux-design-expert (Uma)** |
| Scores each transcript against the confirmed revision's actions and assertions | **@qa (Quinn)** |
| **Participant recruitment and scheduling** — the staffing ask that is actually blocking | **@pm (Morgan)**, raised through the Checks squad |

**No participant is invented.** If recruitment does not produce 3–5 people who did not author the
test under review, the trial does not run and this file keeps saying so.

## Structural prerequisite — met

AC-16(b)'s confirmed-revision artifact/hash, which a participant must be shown, rides story **10.11c**,
**merged** at `35104ee6e` (@qa gate `480c93b39`). The technical prerequisite is closed; what remains
is people and calendars.

## Protocol (AC-13(a)–(c))

1. A **scripted task** with **3–5 participants**, none of whom authored the confirmed test under
   review: *"explain, before running it, what this confirmed test will do."*
2. A **recorded transcript per participant**, scored against the actions and assertions the confirmed
   revision **actually contains** — **not** against what the author intended.
3. The **confirmation-to-edit ratio** (BRD §10) computed over the trial's own sessions.

**A trial that finds users do rubber-stamp confirmations is not a failed criterion.** A trial that
never happens, or happens with the wrong measure, is. Record the honest outcome, whatever it is
(AC-13(d)).

---

<!-- TRIAL-SESSION-DATES -->
## Session date(s)

_Not yet run. Record each session's date here when it happens. Do not pre-fill a planned date._

| Session | Date | Duration |
|---|---|---|
| _(none)_ | | |

<!-- TRIAL-FACILITATOR -->
## Facilitator

_Not yet run. Record the person who actually ran each session, not the person nominally accountable._

| Session | Facilitator | Observer(s) |
|---|---|---|
| _(none)_ | | |

<!-- TRIAL-PARTICIPANTS -->
## Participants (anonymised)

_Not yet run. 3–5 participants, anonymised ids only. **None of them may be the author of the test
under review** — record the check that this held, not just the assertion that it did._

| Participant id | Role/background (non-identifying) | Authored the test under review? |
|---|---|---|
| _(none)_ | | |

<!-- TRIAL-REVISION -->
## Confirmed revision shown

_Not yet run. Record the revision id and its canonical artifact hash exactly as the UI showed them
to the participant — copied from the session, not from a story or from memory._

| Field | Value |
|---|---|
| Confirmed revision id | _(none)_ |
| Canonical artifact hash | _(none)_ |
| Number of actions in that revision | _(none)_ |
| Number of assertions in that revision | _(none)_ |

<!-- TRIAL-SCORES -->
## Scores — one row per participant

_Not yet run. Scored by @qa against the actions and assertions the confirmed revision contains.
"Explained correctly" means the participant's description matches what the artifact does, not what
anyone intended it to do._

| Participant id | Actions described correctly | Assertions described correctly | Misread anything as a different outcome? | Notes |
|---|---|---|---|---|
| _(none)_ | | | | |

<!-- TRIAL-RATIO -->
## Confirmation-to-edit ratio (BRD §10)

_Not yet run. Computed over the trial's own sessions: confirmations divided by edits made before
confirming. Record the raw counts beside the ratio so a reader can check the arithmetic._

| Measure | Value |
|---|---|
| Confirmations | _(none)_ |
| Edits before confirming | _(none)_ |
| Ratio | _(none)_ |

<!-- TRIAL-END -->

## Outcome

_Not yet run. Write the honest result here, including a result that reflects badly on the product.
Then tell @po, who reads this file before AC-13 is ticked._
