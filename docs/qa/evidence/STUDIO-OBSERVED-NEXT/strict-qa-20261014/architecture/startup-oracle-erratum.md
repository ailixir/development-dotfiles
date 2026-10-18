# Startup-oracle wording erratum — 2026-10-14

Aria, bounded architecture clarification. This explicitly supersedes only the sentence in `architecture/addendum.md` requiring "the fix-reverted negative control against the same frozen build". The earlier text and source receipt are retained unchanged as history. No source, build, test, CLI or lifecycle action is authorized by this erratum; OBS-015 remains unstarted.

**Correction:** my strict addendum unintentionally introduced a new requirement to repeat the historical browser-fix mutation on the final integrated frozen build. That requirement is withdrawn as an erroneous restatement of the original plan, not waived as an unmet planned test. No concrete uncovered defect relative to the original T1/T2 ruling was found that justifies a new mutation run.

The exact original `STUDIO-OBS-013/ar-qa-sec001-oracle-revision.json` T2 states that non-vacuity is to become a per-run assertion using actual chrome://version and chrome://prefs-internals pages rather than resting on the earlier manual revert red2, "which is not re-run". Its `verificationOwed.runs` also names a reverted-fix red run. Read as a whole, that list required establishing discrimination after the T1/T2 tightening, not indefinitely rerunning source mutations for every later source freeze. The retained R13 `qa-fixes/README.json` `tightening.red` and ledger `qaFixSec001OracleRevision` record red3: 3/3 A failures with the browser fix reverted, T1 and T2 passing, B passing as expected. That original source-bound red3 receipt must be independently checked; it is not a current-build result. Red2 remains historical v2 evidence and cannot alone be mislabelled a final-T1/T2 mutation execution. Invalid off-the-record-control ERR_INVALID_URL attempts remain invalid and uncredited.

For the current final source freeze, the originally planned continuing discriminator is the real per-run T2 positive control, with T1/A/B/C unchanged. The actual `guided-recording.test.ts` source inspected here:

- Decodes the uploaded app WebM at full-resolution rgb24 over [0,a0+1000ms], requires a nonempty complete-frame window, and rejects any non-content-free frame with content outside the app region (A).
- Caps the app-region union and each independently measured login/final box to10% of frame area (T1).
- Records actual chrome://version and chrome://prefs-internals in a same-size plain persistent Chromium context; applies the same maxRowRuns/outsideBox helpers and same app region, and requires at least one non-content-free frame with >=10,000 outside pixels (T2). Only numerical counts leave the helper, and its sensitive temporary recording/profile directory is deleted in finally.
- Keeps -250<=t1-a0<=500 as seek alignment only (B), with explicit comments that B does not prove SEC-001 or discriminate the reverted fix. Structural about:blank/sole-recording checks remain required (C).

Independent QA must verify these tests execute unskipped against the actual final source/dist manifest, inspect numerical facts before assertions, and retain current A/T1/T2/B/C results separately from historical red2/red3. Current per-run T2 on the frozen build plus verified historical tightened red3 establishes the originally planned discrimination; no final-build mutation/rebuild is required. A failed/missing T2, inflated region, missing decode tool, skipped fixture or failed cleanup still fails this validation. This erratum neither approves tests nor sets a story Done.

If historical red3 provenance cannot be independently verified, report that evidence gap honestly and return it to the coordinator. Do not quietly substitute the historical v2 red2 receipt for the tightened mutation proof or alter shared source/dist during an active integration window.

Reviewed by reading only; no test was run by this architecture clarification.
