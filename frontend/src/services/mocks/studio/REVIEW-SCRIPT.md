# Reviewer script for the compile-review fixtures

Story 10.10, AC-19(a). One row per fixture in `compileFixtures.ts`: what a **non-technical reader**
should be able to say out loud after reading the surface that fixture produces, without being told
anything else.

This is a reviewer's instrument, not a test. The mechanical half of AC-19(a) — no bare enum value
standing alone as an explanation, no unrendered identifier, no code fragment outside the source
region — is asserted in `compileStates.test.tsx`. What a script cannot assert is whether the
sentences are *readable*, and this is where that judgement gets written down instead of assumed.

AC-19(b) — a representative non-technical-user trial — is **deferred to story 10.19** and is
recorded skipped, never passed. Reading this table is not that trial and must not be reported as
one.

| Fixture | Matrix id | A reader should be able to say… |
|---|---|---|
| `compilingDraft` | `FX-STATE-COMPILING` | "My draft is saved. The machine is working on my steps right now. There's nothing for me to approve yet, and the page will stop watching on its own." |
| `awaitingDraft` | `FX-STATE-AWAITING_CONFIRMATION` | "There's a version ready for me to look at. It will not run until I say so, and nothing will say so for me." |
| `readyDraft` | `FX-STATE-READY` | "I approved a version, and that version is the one that runs. I can see which one it is." |
| `needsRevisionDraft` | `FX-STATE-NEEDS_REVISION`, `FX-ACCEPTED-BETWEEN-REJECTED`, `FX-EXHAUSTED-TRUE` | "Two of my four lines could not be made to work, and I can see which two. It already tried three times and stopped. Asking again will not help — I need to change those lines." |
| `staleDraft` | `FX-STATE-STALE`, `FX-CODE-DECLARED` | "Nothing I wrote is wrong and nothing was lost. Their side didn't answer in time. I press the button to ask again." |
| `poolSaturatedDraft` | `FX-CODE-DECLARED` | "Too many of these were running at once, so mine didn't start. Not my fault, and I just ask again." |
| `undeclaredCodeDraft` | `FX-CODE-UNDECLARED` | "Something stopped it and this page doesn't have words for that one, but it shows me the reason the server gave so I can quote it. My draft is still saved." |
| `clampedStringsDraft` | `FX-TRUNC-CLAMPED-STRING` | "The explanation for line 2 is cut off — I can see where it was cut." |
| `stepTruncatedDraft` | `FX-TRUNC-STEP` | "There were more problems with line 2 than it is showing me. That is different from line 2 having no other problems." |
| `documentTruncatedDraft` | `FX-TRUNC-DOCUMENT` | "This list is not the whole list. Some lines' reasons were left out to keep the report small, so a line with nothing next to it might still have had a problem." |
| `notExhaustedDraft` | `FX-EXHAUSTED-FALSE` | "It tried once. It hasn't used up its tries. What I'm reading is that one try, not a history." |
| `artifactRejectionDraft` | `FX-ARTIFACT-REJECTION` | "This problem isn't about one of my lines — it's about the test as a whole." |
| `misalignedDraft` | `FX-MISALIGNED-DOCUMENT` | "Something is wrong with the reasons it sent: they don't line up with my steps, and it is telling me that rather than guessing." |
| `conflictResponse('STALE_CANDIDATE')` | `FX-CONFLICT-STALE_CANDIDATE` | "What I was reading isn't current any more. Nothing was approved. It has shown me what the draft holds now, and I decide again." |
| `conflictResponse('TEST_DELETED')` | `FX-CONFLICT-TEST_DELETED` | "This draft is gone. Nothing I press here will bring it back." |
| `conflictResponse('TEST_QUARANTINED')` | `FX-CONFLICT-TEST_QUARANTINED` | "My work is still there. It's on hold until someone sorts out the CSI. It was not deleted." |
| `rejectionResponse('INLINE_CREDENTIAL')` | `FX-REJECTION-INLINE_CREDENTIAL` | "One of my lines looks like it has a password in it. I should point at a vault entry instead." |
| `rejectionResponse('SOURCE_TOO_MANY_STEPS')` | `FX-REJECTION-SOURCE_TOO_MANY_STEPS` | "My test has more steps than one test may hold. I split it." |
| `rejectionResponse('SOURCE_LINE_TOO_LONG')` | `FX-REJECTION-SOURCE_LINE_TOO_LONG` | "One line is too long — it tells me which one by number, not by quoting it back." |
| `rejectionResponse('SOURCE_TOO_LARGE')` | `FX-REJECTION-SOURCE_TOO_LARGE` | "The whole draft is too big to send. I split it." |
| `awaitingDraft` (variables) | `FX-SECRET-REF` | "One of my values is a vault reference. The page never shows me the secret itself, and neither does the test." |

## What a reader should **not** be able to say, from any fixture

- "It checked that my steps do what I meant." Nothing here says that, and `forbiddenClaims.ts`
  plus AC-9's assertion over rendered text exist to keep it that way. Static validation
  *"cannot prove the locator matches the application or the assertion captures the user's
  intent"* (architecture §4.1, §4.5).
- "The list of problems is complete." Only true when no truncation flag is rendered — which is
  exactly why all three flags are rendered.
- "I can see the code that will run." Not yet: the API returns neither the artifact nor its hash
  on any declared response (AC-15). Both slots say so rather than being filled from the English.
