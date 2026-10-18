# Row 85 user decision: Option C (waive the real-run positive-tie clause only)

Date: 2026-10-15 (local; 2026-10-16T02:27Z). Recorded by Pax (@po). Append-only: this record amends the row 85 acceptance subject. It does not delete or rewrite the [clarification](../po-recording85-clarification01/clarification.md), its Aria/Quinn reviews or the ledger row.

**Decision owner and provenance.** The user (Bruno, product owner) chose Option C in the Claude Code session on 2026-10-15, after the coordinator presented options A/B/C (`STUDIO-OBSERVED-NEXT/execute-015-008/claude-resume-plan-015.md` section 5). The coordinator relayed the decision to Pax, and Pax records it as relayed. For this clause only, it supersedes the earlier "all planned QA green, no waiver" instruction. Every other clause, row and gate keeps that instruction.

**Subject.** `validation-ledger.json` `/acceptanceCases/85`, `IncrementalRecordingIT.tieTolerancePreservesActualRecordedEvidence` (ARCH03 `test-delta.json` `/additionalApplicationCases/7`).

## Removed (waived by the user)

The removed requirement is to observe, end to end in an actual run, a positive equal full-key timing tie. That means two distinct admissions with identical `(startMs, kind=action, ordinal, stepId)`, carried through manifest, callback, backend and result, with per-admission seek. Option B, the fixture-owned tie characterization, is **not** adopted. No tie fixture, clock manipulation, retry feature or extra native effect is to be built for this row.

## Retained (still required, actual passing evidence + independent Quinn review)

1. **Java+TS comparator tie semantics.** ARCH03 test-delta `/additionalApplicationCases/5` (`GuidedRecordingTimingsTest.distinctAdmissionsWithIdenticalMeasuredKeysRemainDistinct`) and `/6` (`GuidedRecordingTimingsTest.tieEndSelectionAndUnicodeOrderMatchRunner`) stay in scope unchanged. These are ledger rows 83 and 84.
2. **Real-run proofs** in the actual joined runs (e.g. `admitted-drift2`, `same-pair-literal`):
   - No absent pre-native stamp is invented. The consumed attempt0 has native0 and no INVOKING stamp.
   - The consumed attempt0/native0 is retained alongside exactly one fresh attempt1/native1 replacement with genuine timing. Both immutable ledger attempts are kept.
   - Recorded video is continuous: one handle, session and origin, with privacy preserved.
   - Per-admission seek works for every admission that has a stamp. Identity is kept when offsets coincide.
   - Every actually measured timing is carried once through manifest, callback, stored backend and served result. Nothing is shifted, re-rounded or dropped.

## Effect on row 85

- Row 85 stays an obligation with the narrowed subject above. Its `executionStatus` remains `NOT_RUN`. The ledger row keeps its original assertions as history and now has a `userScopeDecision` pointer to this record. No other ledger byte changed.
- Credit requires actual passing evidence for every retained conjunct and independent Quinn review.
- The waived clause is a **user waiver**. It must not be reported as PASS, N/A or QA-granted.
- This record changes no story Status, AC text, other ledger row, completion count (86/24/55) or gate. It grants no source release.
