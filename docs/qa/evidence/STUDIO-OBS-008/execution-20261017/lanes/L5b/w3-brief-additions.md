# L5b W3 brief additions (root, 2026-10-17)

These are added to `lanes.json` `w0Refold20261017.lanes[id="L5b"]`. They come from the W2 lane exits and the @dev technical gate (`lanes/tech-gate-L4-L5a/review.md`).

1. **Write set + `frontend/src/components/studio/templates/index.ts`.** Export `availableQuickStartTemplates` (DV-3), move the page off `PRODUCTION_ALPHA_TEMPLATES`, and delete the stand-in.
2. **Verify + `grep -rn "PRODUCTION_ALPHA_TEMPLATES" frontend/src   # expect 0`**, next to the existing `STUDIO_CAPABILITIES` grep (F-L4-3).
3. **D-5 / Q2 (confirmed by @dev).** Pass the session's `firstLearnStepId` into `GuidedCompletion` for the drift sentence's original k. After a drift, `relearnedFrom.stepId` equals j.
4. **P6 "re-read after save".** `useStudioCapabilities` has no refetch, so use `studioApi.getCapabilities` directly or add a refetch inside the L5b set.
5. **`guided/index.ts`.** Whether to re-export L2b's `useGuidedSession` is L5b's call (L5a Q3).
6. **Narrow layout (375×812) page case.** Owned by L5b (AC-9). L5a covered only the component level.
7. **Frozen interfaces to build against:**
   - `lanes/L2b/w2.0-root-integration.md`, plus L2b's compatible body change (`useGuidedSession(testId, options?)`).
   - `studioGuidedTypes.ts` is now `d3644969…`.
   - The F1 baton hashes are recorded at F1 close.
8. **Commit-set note (F-L5a-2).** `guided.test.tsx` copy-table tests read files under `docs/qa/evidence/STUDIO-OBS-008/`. Any commit of the L5a files must include those files.
