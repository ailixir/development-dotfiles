# Broad historical grep reconciliation — unresolved rule mismatch

The original co-sign command is verified against current frozen backend/src: **78 matching lines**. historical-grep.json contains every path/line/text. The virtual five-path overlay removes74 and retains4. Zero broad matches cannot be honestly met inside the authorized five files.

The four retained lines are all in backend/src/test/java/com/citi/put/checks/studio/support/LegacyV20ConfirmedBaseFixture.java:

| Line | Statement | Retained semantics |
|---|---|---|
|1296|verifyHistoricalVerdict(a, a.verdict());|commitHistoricalV20 (:1198) calls actual V20 verdict checker|
|1309|verifyHistoricalCandidate(commit.snapshot(), candidate, a.verdict());|same V20 writer checks its candidate|
|1489|private static void verifyHistoricalCandidate(...|V20 checker definition|
|1561|private static void verifyHistoricalVerdict(...|V20 checker definition|

This file explicitly targets20 at :75; prepareFreshV20 calls requireV20, seedV20/seedV20Cases call seedPreparedV20, which commits via commitHistoricalV20 (:659) and requiresV20 again (:1200). Its class Javadoc identifies synthetic V20 history rather than current-runtime compatibility. The four generic verifyHistorical names are shared by V18 and V20 adapters at baseline; deleting V18 does not retire this V20 fixture. Its bytes and both call/definition pairs remain unchanged.

Root instructed that these four matches stay untouched. A proposed, bounded reconciliation for architect/root review after freeze is:

1. Keep the exact original matcher and require a four-element retained-match multiset, each bound to current file hash, statement text and the V20 call graph above.
2. Require zero in every other source path. Additionally require zero for `HistoricalV18|requireV18|historicalV18|HistoricalFault|probeHistoricalAdapter|changedHistoricalCommand|historicalRows|readHistoricalV18|historical-v18` everywhere, including the retained V20 file. Baseline for this discriminator is70, because eight baseline verifyHistorical lines comprise four V18 + four V20 lines.
3. Alternatively open a distinct ownership amendment renaming only V20 helper/call pairs to verifyV20Candidate/verifyV20Verdict; that is a sixth-path change and is deliberately absent from this draft.

Neither option is ratified here. The original broad-zero exit remains unsatisfied pending an explicit ruling. No grep is narrowed silently, and no lane-exit or QA credit is claimed.
