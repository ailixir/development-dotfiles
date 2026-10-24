# Round 067: Studio UX fix copy

Delegation: @ux-design-expert writes the copy for the round-067 Studio UX fixes

User decision 2026-10-23: "Fix UX + Candidate B". Scope is functional only (ADR-SC-006). These
captions are never button text, and none equals or contains a string the frozen visual harness asserts.

| Key | Exact text |
|---|---|
| `changedSinceThisRun` | `Changed since this run` |
| `seekMarkerStep` | `Jumped to step {N}.` |
| `seekMarkerAction` | `Jumped to step {N}, action: {<safe label>}.` |
| `runInProgressEvidence` | `The recording will appear here when this run ends.` |

## D10: first-secret disclaimer (frontend/src/components/studio/SecretInput.tsx)

User decision 2026-10-23: add one sentence to the first-secret disclaimer telling authors to use a functional ID
or service account and never a real person's login. It follows the existing first sentence
("Only add secrets you are authorised to use for this test."). The heading and the first sentence are unchanged
(the frozen harness asserts them), and the popup has no textbox.

New sentence: `Use a functional ID or service account for sign-in, never a real person's login.`

## Facts


- Fact (changedSinceThisRun): The step is the server's firstChangedStepId for the revision this run published
- Fact (seekMarkerStep): The last seek on this recording went to the start stamp of the step
- Fact (seekMarkerAction): The last seek went to the stamp of that action
- Fact (runInProgressEvidence): A live Run has no result yet, so it has no recording on screen
