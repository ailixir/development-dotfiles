# Final case reconciliation — preparation only

Quinn / aiox-qa, 2026-10-20. Exact expected identity maps are prepared from the accepted2774 backend catalog, existing637 FOLD projection, sealed final candidates and public baseline/case metadata. **No final runtime result or lifecycle credit is supplied.** Only this evidence directory was written; no test, new census/scanner/framework, provider/process/Git operation or actual source change was performed.

| Final candidate suite | Expected total | Expected PASS | Exact retained SKIP |
|---|---:|---:|---:|
| Backend |2792|2783|9|
| Runner unit |2670|2645|25|
| Runner fixtures |307|298|9|
| Runner deployment |722|722|0|
| Frontend, existing Node23 baseline |1388|1388|0|

Backend tasks are **test2728, guidedIncrementalTest62, crossReplicaTest2**. The exact equation is2774 −7 old authority-class identities +7 relocated identities +7 FOLD additions +11 GS-M additions =2792. The7 relocations retain the same methods once under DispatchAuthorizationIT and remove the old GuidedPublicationAuthorizationIT class; they add no net coverage. FOLD's7 additions are3 client,3 ClockIT and1 worker refusal. GS-M adds9 ordinary GuidedResultPublicationDisabledIT cases and2 GuidedTeardownShedTest cases, absent from the fresh baseline's captured source list. Every addition is plain @Test; global parameterized methods101/invocations719 remain unchanged, and plain methods become2073. Deferred F1/F2 implementations retire no cases here.

`backend-expected-identities.json` contains all2792 expected rows/statuses. **Use a multiset/Counter.** The accepted2774 rows contain2750 distinct task/class/display keys;20 repeated keys account for24 additional invocations. Final2792 rows contain2768 distinct keys. The scoped637 projection has622 distinct keys. No deduplication is permitted. `global-parameterized-provenance.json` carries the existing accepted method/provider/display-name provenance without a new source scan. All35 Replay variants and46/62 partitions remain unchanged.

`runner-frontend-expected-identities.json` and `named-delta-map.json` bind the complete runner expectations and all exact named changes:

- Unit: fresh2643PASS/29SKIP, plus2 exact009 controls, minus4 named pointer calls now preserved as comments. All25 genuine skips remain:15 in `test/deferred.test.ts`,8 in `test/run/canary.test.ts`,1 in `test/run/sandbox.test.ts`,1 in `test/server/drain.test.ts`.
- FOLD changes exactly one displayed unit title in `test/guided/runtime.test.ts`: GuidedRunnerClient.transportDeadline → HttpRunnerDispatchClient.transportDeadline. The full suite-qualified before/after names are bound as one rename with zero count delta. The guidedCloseBound port changes only a comment. This corrects the older plan sentence; literal title equality is not required for that one approved mapping.
- Fixtures add exactly2 named009 controls and retain all9 exact skipped identities. Other original file/name/status identities remain.
- Deployment retains721 fixed names plus one SEC-2 prerequisite title derived from RUNNER_IMAGE. Its exact replacement must still be bound to the final configured image reference and measured image receipt. This pending one-to-one mapping is not an arbitrary-title allowance or an added case.
- Frontend retains the current1388 identity/status multiset. CLN07 removes an interface, and RCO changes only an assertion literal; no test title/case changes. Existing WCAG regression remains unchanged.

`fold-mutation-carry.json` preserves the accepted five intended kills/restored greens from receipt6de8cc16. m1/m2/m5 retain exact final main target hashes. m3/m4's publisher changes from prepdd960805 to final4cdc1208 through the accepted type/client/constructor fold; claim-clock and validation-budget-clock logic remain. ClockIT6bcac2c9 →1bce395f removes only the inactive legacy injection/fallback, preserving all3 assertion bodies and the active authority path. Carry these existing results with those qualifications; no mutant was executed on final bytes and no new mutant/rerun programme is requested.

`input-bindings.json` seals the public inputs; `manifest.json` seals this preparation. Root must bind actual final source/report hashes and compare complete task-qualified identities, multiplicities, statuses and exact skip sets using the existing proof-reader rules after integration. Current B3's still-present old authority class is not counted twice in this final projection. Historical failed runs remain failed; expected PASS entries are requirements for future acceptance, not observed results.
