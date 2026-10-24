# FOLD-prep execution receipt

Corrected resume2 stages01+02+03 are applied exactly. All required focused and native prep gates passed; all five approved mutants produced the intended assertion failures and were restored to exact base hashes and green within their individual lock holds. No compilation, setup, infrastructure or skipped-test result was credited as a red.

| Gate | Actual result |
| --- | --- |
| Old JVM clock red-first | 3 intended assertion failures, 0 errors/skips |
| foldp01 client/authority/DB clock/body | 40 passed |
| foldp02 TLS/profiles/worker/client certificate | 113 passed |
| foldp03 scheduling | 34 passed |
| Unchanged StopKey/ContextDeadline | 4 passed |
| m1 mint / m2 judge | Each: 2 intended failures +1 pass, exact restore,3 green |
| m3 claim / m4 budget | Each: 1 intended failure +2 passes, exact restore,3 green |
| m5 absent worker collaborator | 1 intended failure, exact restore,1 green |

Mint/judge assertions failed at PublicationGrantClockIT131/148 (two DB reads expected; one observed). Claim failed at186 (host instant differs from exact DB reading). Budget failed at197 (SystemClock versus DatabaseClock). Worker absence failed at DispatchAuthorizationIT210 (NullPointerException versus the required GuidedSessionException); its restored test exercises all three publication operations. Detailed public assertion evidence and all fresh result hashes are in receipt.json and per-mutant assessments.

All15 collectors had complete fresh outputs, zero native errors/skips, and unchanged source/test inputs/dist during execution. Final source `b1de06061431bc676d15223b03abbdeb14a64984944565461a8aed6e9ef38116`; dist `698a936537f3be1de45436c4459390fee5628b31e6790e1aa2b183cfaf814210`. All20 actual prep files match reviewed candidates; all21 original FOLD_TESTS, all five GS-M files and read-only clock/secret serializer inputs remain unchanged. Only the18 expected changed packet paths differ from the GS-M handback. The operation policy table is equal and exactly one secret writer/registration remains.

No04/05 final patch, formatting, full Replay class, wholecheck, provider operation or lifecycle/release transition was executed. The exact20-file incoming baton is final20-prep-baton.json. Final composition, final-only ClockIT cleanup and remaining integrated/independent QA obligations remain. No active job or held Gradle lock remains.
