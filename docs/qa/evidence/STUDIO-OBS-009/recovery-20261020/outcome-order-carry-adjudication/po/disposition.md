# PO concurrence: AC-6(c) accepted revision and outcome order

Pax (@po), 2026-10-20. **CONCUR with architect ruling `9790352c0441a7bfb74933292d3753fc7cf0d194ef3163ed7820ba834f3c580f` on the existing AC-6(c) outcome contract, retaining both proof limitations below.** This resolves the narrow PO interpretation question in the local-validation record. It is not a QA gate verdict or final-current runtime acceptance.

## Criterion and inspected proof

The read-time story is `b45807d109fa0a5ab7cf94758aa56810bab3feb67481c8373ba09df4e5cd3eae`; `StudioScheduleApiIT.java` is `67c26122f9d60f63f23229736ca36620428c29f2b7e5f9f28a2158ef693bc319`. All read-time inputs are bound in `read-time-bindings.sha256`. The architect's two-member manifest and all 39 input bindings verified against their recorded hashes. Verification of a binding is not a claim to have independently read every bound artifact's contents; the substantive PO review reads the story, the two existing test bodies, the S receipt and mutation summary, the local-validation record, the ADJ-1 co-sign and the architect ruling. Protected capture, baseline and failure payload bodies were not opened.

Story AC-6(c), lines 128–132, requires the initial unchanged green, a result-conditioned run assertion, and a deterministic acceptance-first case producing exactly one run on `originalRevision`. It expressly rejects `hasSizeLessThanOrEqualTo(1)` alone. It specifies the accepted outcome and ordering, rather than a unique database lock implementation.

The existing proof meets that stated scope:

- `editedWriterRaceSerializesWithAcceptanceAndKeepsTheAcceptedRevision` (lines 863–913) joins the processor and edit, asserts exactly `[originalRevision]` when the processor returns `ACCEPTED`, and otherwise asserts no runs. It also requires the blocked schedule and no later processing.
- `editedWriterQueuedBehindAnAcceptanceKeepsExactlyTheAcceptedRevision` (lines 923–986) processes acceptance inside an outer transaction, starts the edit before commit, observes an ungranted tuple/transaction lock and an incomplete edit, commits and joins the edit. It requires processor and occurrence `ACCEPTED`, exactly one run on `originalRevision`, and the blocked schedule. Its ordering concerns acceptance within the still-open transaction; it does not demonstrate simultaneous method entry or identify the particular lock supplying serialization.
- The sealed S receipt (`1726b7b3…`) records sc05 green with the original assertions, followed by sc06/sc07 green with the strengthened R7 case. Its historical scratch runs are not silently promoted to evidentiary current-tree runs: the later local-validation record (`bca21f53…`) credits the three schedule classes, 34 cases, at G9. The architect's G9 source-equality disposition is retained. This PO review executes no test and supplies no fresh runtime result.

## Required limits retained

**S-M4 survives:** `mutations.json` (`62173db2…`) records 34 cases, zero failures, after removing the two `ui_tests` lock sites. Accordingly, the proof does not establish that those locks are uniquely necessary, that M4 was killed, or that the lock query identifies the serialization table. The S receipt's schedule-row contention explanation remains an inference. The outcome requirement can be met without proving that particular mechanism indispensable; no new lock requirement or production rewrite follows from this concurrence.

**S3 is indirectly sensitive:** the local-validation record names five genuine S3 reds, including the deterministic case, with database constraint rejection as the recorded first failure. Those are not direct grant-binding assertion failures, and the precise reason for the constraint rejection was not traced. The unchanged positive accepted-revision assertions supply the AC-6(c) outcome proof. S3 remains supplementary mutation sensitivity with its stated limit; this concurrence does not relabel its failure or infer a direct binding mutant kill.

The AC text, thresholds, tasks and lifecycle remain unchanged. Final ordinary schedule regression on the accepted final composition is still required. Any relevant subsequent test or behavior change needs a fresh disposition. R9-OBS-1 is the existing unchanged-stamping statement in the S receipt; no clock or deadline change is authorized here.

## Separate final QA decisions

Qualified historical C10 carry is a separate decision for final independent QA. The architect's subject-by-subject carry proposal may be presented with preserved guard/test bindings and actual final ordinary regression, labelled `CARRIED_NOT_RERUN` if QA expressly adopts it. This PO concurrence does not adopt it on QA's behalf.

In particular, the existing SIGN-WITH-NOTES ADJ-1 co-sign's literal final-tree requirement for B2/B3 to be red, then green after revert, and the local-validation record's final-digest C10 obligation remain unresolved until final QA expressly adopts qualified carry or scopes the exact bounded proof it still needs. The existing security signature is preserved; no waiver is invented. Its observed `AUTHORIZATION_REVOKED` / USAGE `UNKNOWN_OUTCOME`, weak joined either-value assertion, and SEC-AUDIT-PREREADY-01 carry remain unchanged. This acceptance-scope review does not establish live revocation, post-Ready behavior or a ledger database trigger.

The separate G9 stage-file existence-before-write race proof remains owed. Neither C10-F2 stop-sender sensitivity nor deferred lean CLN-F2 discharges it. There is no new full Replay credit, attempt, timer reset, runtime authorization or external acceptance in this record. All three stories remain InProgress; 009/010 external and human obligations remain open.

Only this owned `po/` evidence directory was written. Actions were source/closed-evidence reading, read-only hash verification and evidence writing. No source/story/earlier-evidence edit, test, parser/compiler, seed, build, native/browser/Docker/network/provider/Git/contact or delegation was performed.
