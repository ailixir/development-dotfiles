# STUDIO-OBS-011 T0: R-CO co-sign (@ux-design-expert, Uma)

**Date:** 2026-10-18
**Verdict:** **SIGN-WITH-NOTES**
**Method:** read-only (grep, sed, cat). No node, no tests, no source edits (a backend baseline run is in progress). [V] means I read it; [I] means I inferred it.

## Inputs read

- `docs/qa/evidence/STUDIO-OBS-011/t0/t0-record.md` (OI-3 `:313`, co-sign row `:336`, 11-FE `:356`)
- `docs/qa/evidence/STUDIO-OBS-011/t0-prep-20261018/t0-proposal.md`: CLN-N6 `:129`, **R-CO `:200`**, **R-08-1e `:243-247`**
- `docs/qa/evidence/STUDIO-OBS-011/t0/lanes.v3.json`, `lanes[id=11-FE]` (`:614-668`) and `anchorsS011["11-FE"]`
- `docs/stories/STUDIO-OBSERVED/STUDIO-OBS-011.story.md`: CLEANUP-OBSERVATIONS `:271`, C-OBS008-1/3/5, P-11
- `docs/qa/evidence/STUDIO-OBS-012B/ux-gate.json` OBS-UX-1 (`:89-91`), where this wording item started
- Frontend: `RunDetailsDrawer.tsx:351-359`, `StudioScheduleDialog.tsx:172-174`, `GuidedCompletion.tsx:115-131,170-181`, `guidedNarratives.ts:134-138,246-250,518-523`, `PlanExplanation.tsx:66-70`, `useGuidedSession.ts:496-503`, `studioGuidedApi.ts:124`, `executionErrorNarratives.ts`, `guided.test.tsx:335-338`, `scheduleProvenance.test.tsx:24-31`

## 1. R-CO (CLN-N6 / CLEANUP-OBSERVATIONS): APPROVED

**Exact copy change.** This is the one-line approval that R-CO asks for.

`frontend/src/components/studio/runs/RunDetailsDrawer.tsx:357`

```diff
-              <Typography variant="body2">Confirmed revision: {snapshot.revisionId ?? 'Unavailable'}</Typography>
+              <Typography variant="body2">Learned revision: {snapshot.revisionId ?? 'Unavailable'}</Typography>
```

- Only the label changes. The value, the `'Unavailable'` fallback, the element, the `run-schedule-provenance` test id and the other lines of the block (`:353-359`) stay as they are.
- **It matches the existing copy.** The schedule dialog already says `Current learned revision: {test.confirmedRevisionId}` (`StudioScheduleDialog.tsx:173`) [V]. The drawer shows the revision *this run* executed, not the test's current one, so "Learned revision:" without "Current" keeps the two facts apart. "Confirmed revision" is not visible text anywhere else in `frontend/src`; the remaining hits are comments and identifiers (`studioTypes.ts`, `executionErrorNarratives.ts:201`) [V grep]. The identifiers (`confirmedRevisionId`, `revisionId`) are contract names and stay unchanged.
- **The 11-FE prohibitions hold.** This adds no copy key: the drawer copy is inline JSX, not a `guidedNarratives.ts` row. It adds no state, and it involves no contract or pin.

**Note N1 (required, or the R-CO part carries).** A unit test asserts the old text, and that test file is **not in the 11-FE `writes` list**:

`frontend/src/components/studio/scheduling/scheduleProvenance.test.tsx:30`

```diff
-    expect(screen.getByTestId('run-schedule-provenance')).toHaveTextContent(`Confirmed revision: ${scheduled.revisionId}`);
+    expect(screen.getByTestId('run-schedule-provenance')).toHaveTextContent(`Learned revision: ${scheduled.revisionId}`);
```

Add `frontend/src/components/studio/scheduling/scheduleProvenance.test.tsx (via sandbox; only if R-CO approved; :30 assertion text only)` to `lanes[id=11-FE].writes`. If that is not done, the full-suite verify in 11-FE fails. No other test, e2e spec or a11y baseline contains either string [V grep of `frontend/src`, `frontend/e2e`, `docs/qa/accessibility`]. The targeted verify set should also include `src/components/studio/scheduling` (and `src/components/studio/runs` if that folder has tests).

## 2. R-08-1e (publication disabled → `REFUSED`): frontend side checked, no copy change needed

This is the visible behaviour I was asked to review: a terminal `SUCCEEDED` with publication disabled now reports `publication {status: "REFUSED", receipt: null}` and `currentReadiness NOT_PUBLISHED`, not `PENDING`.

- **Before (the problem):** `PENDING` maps to `kind: 'saving'`, which is an info Alert with "Saving what this run learned…" (`GuidedCompletion.tsx:125-126`, `guidedNarratives.ts:135`) [V]. With publication disabled it never resolves. Precisely, this is a never-ending "saving" message, not a spinner component: `GuidedCompletion.tsx` renders no progress indicator [V grep].
- **After:** `REFUSED` maps to `kind: 'notReady'`, which is a warning Alert with **"Run completed; steps not ready to repeat."** (`GuidedCompletion.tsx:128`, `guidedNarratives.ts:247`) [V]. `guided.test.tsx:337-338` already pins this mapping [V]. The current-readiness line becomes **"Steps not ready to repeat."** (`PlanExplanation.tsx:70`, `guidedNarratives.ts:519`) [V]. Both messages state the state in visible text. Neither claims success or a conflict. This is correct and honest. I support `REFUSED` over a new enum value.
- **Polling stops.** The controller answers `200` once `outcome` is present (proposal `:104`). `studioGuidedApi.ts:124` maps that response to `final`. `useGuidedSession.ts:500-502` then clears `PUBLICATION_PENDING` and settles once the video is not `PROCESSING` [V code read; end-to-end behaviour [I], not run].
- **The MSW mocks already emit `REFUSED`** (`guidedHandlers.ts:743,:795`; `guidedFixtures.ts:396,:595`) [V]. The frontend needs no change for R-08-1e.

**Note N2 (correction to the proposal, record only).** Proposal `:245` says the frontend maps `REFUSED` to "`publicationConflict` copy" and sends a refinement to the F08 post-GA copy pass. The visible text of that key is "Run completed; steps not ready to repeat.", and it does **not** claim a conflict. Only the internal key *name* says "conflict". So the user sees no imprecision, and **no F08 copy item is needed for R-08-1e**. Do not rename the key in 011: C-OBS008-3 requires byte-identical templates and the same key set, and 11-FE prohibits new copy keys.

## 3. Accessibility (ADR-SC-006)

No screen-reader, keyboard, live-region or WCAG work is proposed or needed. Both changes keep the state in visible text labels. `studioWcagAudit.test.tsx` is unaffected by this label change [I: the drawer label is plain text, and the audit is a regression guard only].

## 4. Not done / limits

- No tests, type-check or build were run (constraint: no node). Every behaviour statement above comes from reading code.
- I edited no source, story or lane file. N1's `writes` addition is for root or @po to apply to `lanes.v3.json`.

## One-line co-sign

**R-CO: YES.** Change `RunDetailsDrawer.tsx:357` "Confirmed revision:" to "Learned revision:" in 11-FE, together with the `scheduleProvenance.test.tsx:30` assertion (N1). R-08-1e needs no frontend copy change (N2). Signed: Uma (@ux-design-expert), 2026-10-18.
