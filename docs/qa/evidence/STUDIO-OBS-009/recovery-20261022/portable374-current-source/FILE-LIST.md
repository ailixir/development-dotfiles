# Current source addendum — portable374 correction

22 October2026. This dated addendum records the seven current source hashes after the source/style/test-portability correction accepted by independent375. The earlier357 consolidated File List and371/362 snapshots remain historical and unchanged. Four production files have nonsemantic formatting/import/braces changes; fifteen ordinary JUnit controls are portable across working directories, while two source-history proofs remain in the explicitly pinned offline runner. No test skips, build exclusions or product budget changes were introduced.

| Kind | Current path | SHA256 |
|---|---|---|
| production | `backend/src/main/java/com/citi/put/checks/studio/guided/translation/GuidedTranslationService.java` | `6b98f214cdaba99c1e42ff759dfea2cfdf09f79325e51a846a292a0082bde7f2` |
| production | `backend/src/main/java/com/citi/put/checks/studio/guided/session/GuidedSessionService.java` | `702557b970eb14fce0f6a5163f158ba5f76d15c1fae3116c8f596ce943b388a5` |
| production | `backend/src/main/java/com/citi/put/checks/studio/guided/translation/GuidedTranslationStore.java` | `7a521505f14c8fe505a8c05d62eb3f2d7745cb5768c3a5c6a22329158e4e53a5` |
| production | `backend/src/main/java/com/citi/put/checks/studio/guided/diagnostics/GuidedGuardProvenance.java` | `114570c4420e6f5f1ecea4dd9bbb089b5a1f4d0287255e4a92c104f14bab64b0` |
| tests | `backend/src/test/java/com/citi/put/checks/studio/guided/diagnostics/GuidedGuardProvenanceTest.java` | `b77be265c8282d502cfdc58c5f86dd851af057410f11210875620a9b1724960d` |
| tests | `backend/src/test/java/com/citi/put/checks/studio/guided/translation/GuidedGuardSiteParityTest.java` | `1d2da677208516e1c0d3e0f2d9aed3a858eb448c70d182aa45d3f698aaedb90e` |
| recoveryProofs | `.aiox/sdc/STUDIO-OBSERVED-ORCH/recovery-20261020/real-stack71/portable374-implementation/recovery-proofs/HistoricalGuardProof374.java` | `52fab0141c379041831c632a2e8e75ba08db94bcfa80da54496a36be2ea94714` |

Evidence: `.aiox/sdc/STUDIO-OBSERVED-ORCH/recovery-20261020/real-stack71/portable375-review/receipt.json`, SHA256`0a291c17c3e839797181e5fde43ab9d420de4b8e8912df79813da53616eb7c4c`. Fifteen unique normal tests passed from backend and neutral CWD (30 executions); two historical proof methods, four boundary controls and seven style targets passed. Exact trace counts are42paired comparisons plus two separate passive-catch controls under377’s correction. The accepted future production MAIN is normal-debug `portable376-main`, with38linked classes and debug metadata retained. No broad Gradle/runtime/provider or story acceptance is claimed.
