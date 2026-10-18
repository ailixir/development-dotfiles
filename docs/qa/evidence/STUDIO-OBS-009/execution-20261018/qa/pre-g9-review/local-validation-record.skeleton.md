# STUDIO-OBS-009 D2: @qa local-validation record, SKELETON

- **Status of this file:** a skeleton written by Quinn (@qa) on 2026-10-18 during the G9 hold window. Nothing in it was executed by @qa. Fields marked `TO FILL` are filled from the final G9 logs, not from this file. The machine form is `local-validation-record.skeleton.json` in the same folder.
- **Target:** `docs/qa/evidence/STUDIO-OBS-009/local-gate-20261018/qa-local-validation-record.{md,json}`. Spec: `prep-20261016/qa/t0-qa-20261017.md` section 2.
- **The final record's first lines must say:** this record is not a verdict and not a gate decision. `isVerdict: false`. `storyStatusChange: none`. `doneClaimed: false`. No PASS, CONCERNS, FAIL or WAIVED is used. The 009 QA Results section stays untouched unless @qa later appends a non-verdict pointer line.
- **Legend:** [V] verified by reading the named file when this skeleton was written. [I] inference. `TO FILL` is open.

## 1. Trigger

```
trigger: TO FILL   (MET | NOT_MET)
```

- **MET** only if every REQUIRED row below is VALIDATED, C0 to C10 meet their criteria, and the freeze held (capture-after identical to capture-before file by file, for source, dist and helm). Otherwise **NOT_MET** with the failing rows named.
- External halves are `OWED` with an owner. They never block and never count as passed.
- This is a start trigger for OBS-011 and for OBS-010 T2. It is not a quality verdict. Failures go to @dev through the coordinator.
- **Preliminary reading, from `status.txt` as it stood in the hold window [V]:** C1, C2, C3 exit 0; C4 exit 1; C5 (pins, contracts, codegen) exit 0 x3; C6 exit 0; C8 running; C9 not yet. The only known blocker to MET is C4, decided in section 3. This line is not the record.

## 2. Freeze and identity

| Item | Before (C0) [V] | After (C9) | Identical? |
|---|---|---|---|
| Source digest (`capture-manifest.py`, 1805 files) | `6fcc12eef193338ca3bc79adaa50660d93c245a4462a5f850a7256588d9fc91b` | TO FILL | TO FILL (file by file, not only the digest) |
| `studio-runner/dist` digest (D_F) | `4add1307afe80af5270a63dc809d43bb2d4d4dd51ab32a83330d3cbaf35fc3c3` | TO FILL | TO FILL |
| Helm digest (g9.sh supplement: sha256 over sorted `helm-chart` file hashes) | `8dbe073c706c80b8e560ecc60593ceb550cc93fd6c4ca6486016829899dd04a6` | TO FILL | TO FILL |
| `git rev-parse HEAD` | TO FILL (the tree is dirty, so the digest, not HEAD, is the identity) | | |
| `qa/approved-skips.json` sha256 | TO FILL | | |

Dist rules to record: `dist/main.js` present; `dist/run/guidedMain.js` absent (the C7 line "guidedMain src/dist: 0" covers it [V]); every guided IT recorded a dist digest equal to D_F.

## 3. How C4 counts for the trigger (decision)

**Decision: C4 counts as NOT_MET for the trigger until the image-dependent tests pass at this frozen digest.** It is not counted "MET with owed tests".

**What G9 returned [V `execution/obs009-g9-runner-deploy01-vitest.json`]:** 581 tests, 575 passed, 6 failed, 0 skipped; `sourceStable` and `distStable` true.

**The six failures [V]** all carry the same message: the image `put-checks-studio-runner:10.18a-local` does not exist locally; build it, set `STUDIO_RUNNER_IMAGE`; "this is a failure and not a skip".

| # | File | Test |
|---|---|---|
| 1 | `chart.test.ts` | story 10.18a, the rendering harness itself has the built image, or FAILS (AC-4a part 2) |
| 2 | `chart.test.ts` | AC-4a parts 1-2, SEC-2: no writable mount sits on the image's browser path or HOME |
| 3 | `chart.test.ts` | AC-4a parts 1-2, SEC-2: the disjointness check is capable of failing |
| 4 | `chart.test.ts` | **STUDIO-OBS-009 Q4**: a writable `/tmp`, and neither `TMPDIR` nor `NODE_OPTIONS` declared, in the image under test |
| 5 | `chart.test.ts` | **STUDIO-OBS-009 Q4**: the new writable mounts stay off the browser registry and HOME |
| 6 | `sec2.test.ts` | SEC-2: the shim browser registry attack, run in both directions |

**Reasoning**

1. My own C4 criterion (D2 spec section 2.4) is "0 failed". It is not met.
2. None of the six is a defect. All six are the tier doing what it was built to do. But two of them (4 and 5) are 009's own Q4 assertions about the image under test, and the other four are the SEC-2 browser-path checks. The image-dependent half of the AC-1 and AC-4 chart change is therefore unproven, not merely uninteresting.
3. Counting the tier MET "with owed tests" would reverse the tier's design (a missing image is a failure, never a skip) after I saw the result, and I wrote the criterion. Only the user or @po can change an OBS-011 start condition.
4. The cost of NOT_MET is small and mechanical, and the 575 passing tests (every chart assertion that needs no image) stay credited.

**What flips it**

- **U22 (user):** authorization to use Docker for the D2 image smoke.
- **[I, unknown]** The Dockerfile's base image `mcr.microsoft.com/playwright:v1.63.0-noble` must already be cached, or its pull authorized: `w0/decisions.md` says pulls are not authorized and only cached images are used. I did not run `docker` to check (hold window). To check after G9: `docker image ls mcr.microsoft.com/playwright`.
- Then `docker build -t put-checks-studio-runner:10.18a-local studio-runner/` (`ci/stages.md` stage 7), `STUDIO_RUNNER_IMAGE` set, and re-run C4 alone (74 s in G9) at the same frozen digest.
- The build changes neither source nor dist [I: it writes no repository file], so the freeze is undisturbed. A **delta addendum** (new C4 log, same digests) sets C4 MET. The trigger becomes MET only if every other row also holds. The long gate is not repeated.

**Alternative that needs a human decision, not mine:** if the user or @po decides OBS-011 may start without the image, they record that decision as a file. I then write C4 as `OWED_BY_DECISION`, cite the file, and set the trigger on the remaining rows. Without that file the value is NOT_MET.

## 4. Steps C0 to C10: criterion and the evidence that fills each

Gate script: `scratchpad/g9.sh` (root). Evidence folder `G` = `docs/qa/evidence/STUDIO-OBS-009/local-gate-20261018/`; `X` = `docs/qa/evidence/STUDIO-OBS-009/execution-20261018/`.

| Step | What | Pass criterion | Evidence file(s) | Seen so far [V] | Result |
|---|---|---|---|---|---|
| C0 | capture, helm digest, listeners, `checks-guided`, daemons, `vm_stat` | digests recorded; no loopback-only java/postgres ephemeral listener; no `checks-guided` orphan beyond the protected four (5083, 5095, 13577, 13581); no stale daemon | `G/capture-before.json`, `capture-before.summary`, `helm-before.txt`, `c0-*.txt` | capture taken | TO FILL |
| C1 | runner type-check, lint | exit 0 | `G/c1.log` | exit 0 | TO FILL |
| C2 | runner unit tier | 0 failed; coverage thresholds met; skipped count vs baseline (2606 passed / 29 skipped at EP's last count [V]) | `X/execution/obs009-g9-runner-unit01-*` | exit 0 | TO FILL |
| C3 | runner fixtures tier, real Chromium | 0 failed; by name: `guidedCloseBound` (F1-F4, H), the two changed `browser-profile-safety` cases, `observed-secret-control` `lost-control-body` expecting `RUN_ERROR`; fixture media protected and restored (FocusMutationJoined is a backend IT, so it is a C8 item) | `X/execution/obs009-g9-runner-fixtures01-*` | exit 0 | TO FILL |
| C4 | runner deployment tier | 0 failed | `X/execution/obs009-g9-runner-deploy01-{results,vitest}.json` | 575 / 6, exit 1 | **NOT_MET pending the image (section 3)** |
| C5 | pins, contracts, codegen | exit 0 x3; "NOT ASSERTED" items listed, never counted as pass | `G/c5-pins.log`, `c5-contracts.log`, `c5-codegen.log` | exit 0 x3 | TO FILL |
| C6 | frontend type-check, lint, vitest, build | exit 0, 0 failed | `G/c6-frontend.log` | exit 0 | TO FILL |
| C7 | tripwire greps | P2 0; DEFERRED 0; `guidedMain` 0; `start:guided` 0; `studio-guided-worker` templates 0; `sameIdentity` bodies exactly 1; `SSLContext.getDefault` 0; `@Disabled` (parsed) 6 | `G/c7-greps.txt` | 0, 0, 0, 0, 0, 1, 0, 6: all on target | TO FILL (add the one-off `studio.updateTest(` grep, expected 0; it is not in g9.sh) |
| C8 | backend `check`, three Test tasks, `--rerun-tasks`, exact skip multiset | collector exit 0; 0 failed, 0 errors; skipped multiset equals `qa/approved-skips.json` (9 entries) exactly; `jacocoTestCoverageVerification` and `requireFreshGuidedPartitions` EXECUTED; `guidedIncrementalTest` and `crossReplicaTest` executed; `GuidedPublicationReplayIT` a full class; each required class has at least 1 executed test; guided ITs recorded dist D_F | `G/c8-backend.collector.log`, `X/execution/obs009-g9-check01-*`, `G/c8-test-results/`, `G/c8-jacoco/` | running | TO FILL |
| C9 | freeze check | capture-after identical to capture-before, file by file | `G/capture-after.json`, `capture-after.summary`, `helm-after.txt` | not yet | TO FILL |
| C10 | mutation reproductions in a scratch copy | each mutation red as named (B3 only that one), restored to the live sha, baseline and final green | `X/qa/c10-run/c10-results.{json,txt}`; plan `X/qa/pre-g9-review/c10-plan.md` | not run | TO FILL |

C8 required classes (T0 list; confirm every name against the XML and record the real one): `StudioScheduleApiIT` (16 re-enabled), `SharedSchedulingIT` (2), `ObservedScheduleAuthorityIT`, `StudioRunnerPropertiesProfileTest`, `RunnerTlsClientCertIT`, `GuidedScheduledBeansProfileTest`, `DatabaseCanaryScanIT`, `GuidedBridgeIntegrationTest`, `GuidedBridgePlannedIT`, `GuidedPlanningIntegrationTest`, `GuidedPublicationReplayIT`, `GuidedEvidencePendingAppendIT`, `GuidedEvidencePendingAppendJoinedIT`, `PreReadyRevocationProbeIT`, `PreReadyRevocationJoinedIT`, `ObservedCoRunIT`, `RunnerReportProjectionTest`, `GuidedLifecycleReasonIT`, `GuidedSessionEvidenceTest`, `GuidedSchemaProbeIT`, `VaultPolicyIT`, `GuidedFocusMutationJoinedIT`. [I: three of these were planned names.]

## 5. Required rows (the OBS-011 start list)

Each row ends `VALIDATED`, `NOT_VALIDATED` or `VALIDATED_WITH_DISCLOSURE`, never PASS.

| Row | Covered half | Evidence from | Owed externally | State |
|---|---|---|---|---|
| AC-1 | one process/image/Deployment, one TLS listener, capacity and policy hash as config, unknown key refused, chart env subset, no `studio-guided-worker-*` template, P2 a-d | C1, C2, C3, C4 (the chart tests that need no image), C5, C7; `X/d1/receipt.md`, `d1/launch-contract.md`, `d2/receipt.md`, `p2/`, `c9/receipt.md`, `f-merge/prep-devops/receipt.md` | deployed Deployment; PID-1 a-c on the stack (informational) | TO FILL |
| AC-2 | chart and profile values for key, issuer, truststore; fail-closed negatives; rotation inputs | C2, C8; `d1/receipt.md`, `d2/rotation-and-cert-inputs.md`, `d3/receipt.md` | G-1 in a shared environment | TO FILL |
| AC-3 | runner TLS and client cert, `validate()` profile rule, self-signed-CA IT, coordinator on `StudioRunnerTls` | C7 (`SSLContext.getDefault` 0), C8 `RunnerTlsClientCertIT`; `d3/receipt.md`, `f-merge/prep-dev/receipt.md` | G-2 in 010 | TO FILL |
| AC-4 | dump flags and chart lint, runner Vault-address refusal, DB-wide canary scan, TF-5 b | C2, C4, C8 `DatabaseCanaryScanIT`; `d3/receipt.md`, `de/receipt.md`, `d2/receipt.md` | Vault policy test (U5, ED-02); TF-5 a, c, e | TO FILL |
| AC-5 | profile gates, per-profile context test | C8; `d3/receipt.md` | SIEM sink | TO FILL |
| AC-6 | lift, G-3, the 18 re-enabled unchanged, R7 non-vacuous, 4 ports, tripwire, count reconciliation, R9-OBS-1 | C7, C8, C10 (S3, S4); `s/receipt.md`, `s-w3/receipt.md` | none | TO FILL; **disclose** S's M4 (row locks dropped) is caught by no test |
| AC-11 | co-run legs, ADJ-1, R10c f-h, i, j, k, R1 a-d, D5 a-f, LR a-c | C3, C8, C10 (B1, B2, B3, F1; LR, F2); `f`, `b`, `b/w3`, `r1`, `r2`, `bl`, `i` receipts | live revocation; worker-profile dispatch on pods; R8.2 e; RUN-ORPHAN-01 in-pod check | TO FILL |
| AC-12 f-j | lsof preflight per backend run, `RUNNER_PORT` fix, dist dependency and digest, host-collision and startup-hang classification | C0, C8; `i/receipt.md`, the per-run `lsof-before-*` files; `build.gradle.kts` `verifyRunnerDist` now lists both new joined classes [V] | none | TO FILL |

**Rulings on file for AC-11 (cite with sha256 in the final record):** `w1.5/ruling-part1.md` (D5, D1.0), `w1.5/ruling-part2.md` (R1, ADJ-1 option (a)), `w3/pre-g9-rulings.md` (RUN-ORPHAN-01, SEC-AUDIT-PREREADY-01), `f-merge/pre-rulings.md`, `prep-20261016/t0-rulings/ruling.md`.

**QA co-signs on file:** `qa/pre-g9-review/adj1-security-cosign.md` (SIGN-WITH-NOTES), `qa/pre-g9-review/f-r2-1-oracle-cosign.md` (SIGN-WITH-NOTES). Informational reviews: `ep-review.md`, `rel001-pointer-ruling.md`.

**Wording the final record must use**

1. The AC-11 runner-kill leg is credited for "zero repeats, settled STALE", not for "no survivor".
2. ADJ-1 c is credited on the observed `UNKNOWN_OUTCOME` with the `AUTHORIZATION_REVOKED` label. It never says `NOT_USED`. The joined IT's either-value assertion is named weak.
3. The failed-launch survivor property is proved on doubles plus a source pin, not on a real wedged browser.
4. S-W3's replay collector run exited 2 on `sourceStable:false` only; the credit rests on the G9 run at the frozen digest, not on that run.

## 6. Informational rows (state only, never blocking)

| Row | How to record it |
|---|---|
| AC-1 PID-1 a-c | state; the docker smoke is the same U22 authorization |
| AC-4 Vault rehearsal (A18) | skipped by name, `REHEARSAL_ONLY_NON_CREDITING` (approved-skips entry 8) |
| AC-11 REL-001 pointer | "recurrences 0 by classification; `PRE_START_REFUSAL` lines N in M incremental full runs; 0 in the `test` lane; 0 in 42 co-run generations". Not "0 lines". Ruling: `rel001-pointer-ruling.md` |
| AC-12 D4 15 s edge | count of lines with `elapsedMs >= 15000` and a bootstrap `UNKNOWN_OUTCOME`; expected 0 |
| AC-12 a-d IPC observation | denominator = full-lane runs; the case-7 `performStop-grace` SIGKILL is the known baseline (28 of 28), not a recurrence |
| AC-9 TF-3 | state |
| AC-7 AUTHORED-ECHO-01 | not landed: no `o-ae`, `c9-ae` or `fe9` receipt folder exists [V `ls`]; gates the first real call, not this trigger |
| AC-7 FOCUS-MUTATION-01 | FocusMutationJoined 2/2 at F-merge |

**Never covered by this record:** AC-7 (benchmark), AC-8 (live probe), AC-10, the live halves of AC-4/5/11/12, deployed-stack proofs, TF-5 a/c/e.

## 7. Count reconciliation and skips

- **Skips:** the observed skipped `(task, class, name)` multiset equals `qa/approved-skips.json` exactly (9 entries: 7 retained from 008, plus the `VaultPolicyIT` rehearsal and the `GuidedSchemaProbeIT` external half). The 18 AC-6 deferrals are not on it and must be PASS. A skipped test is never a pass.
- **Counts:** `after = baseline - named drops - named deletions + named ports + named additions`. Baseline: TO FILL (the last credited full-check receipt before 009 W0; fallback 015 attempt04: `test` 2412 total / 2387 passed / 25 skipped, `guidedIncrementalTest` 62, `crossReplicaTest` 2). After: from the C8 collector. The 4 interim 012A ports are dispositioned by name.

## 8. Owed, with owner (never blocking, never passed)

| Item | Owner |
|---|---|
| Docker authorization; C4 re-run | user (U22) |
| Gateway price list, thoughts-token billing | ED-01 gateway owner (TBD) |
| Headroom R under the USD 500 wave authorization | user (U17/U18) |
| MODEL-SIZING ruling (per-call ceiling at or below 2 461, or a v3 limits change; the schema maximum for `maxModelOutputTokensTotal` is 32 000) | @architect + @pm |
| B2, B3 rulings; N-RS1 case or disclosure sentence | @po, @architect |
| Staging application, SSO case, dev Vault secret (D2, E1) | user, app owner, Platform/SRE (U3, ED-04, ED-02) |
| AE-01 landing, U13 acknowledgement | @dev, user |
| RUN-ORPHAN-01 in-pod check | @devops (unrun means "unrun") |
| C-17 masked-video human reviewer | user |

## 9. Carried items to list in the record

`RUN-ORPHAN-01`, `SEC-AUDIT-PREREADY-01`, `RUNNER-LOG-REFUSAL-01`, optional `LEDGER-REVOKED-WRITE-ONCE` (no database trigger on the ledger's `revoked_at`), EP finding F1 (dead compile-era files in `evaluation/`).

## 10. Validity

Bound to the digests in section 2. A later edit to a file owned by a VALIDATED row voids that row. OBS-011's own edits do not void a trigger already given. A delta addendum re-validates changed rows (for example the C4 re-run, AE-01 landing, an external-proof fix). Before any 009 Done review, the addendum must be current.

Skeleton signed: Quinn (@qa), 2026-10-18.
