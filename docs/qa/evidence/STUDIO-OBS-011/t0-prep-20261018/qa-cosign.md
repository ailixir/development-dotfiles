# STUDIO-OBS-011 T0: @qa co-sign of Aria's T0 package (verify commands, evidence rules, 11-G, baseline reuse)

- **Author:** Quinn (@qa). **Date:** 2026-10-18, 15:45-16:05 EDT. **Mode:** YOLO, read-only review.
- **Reviewed:** `t0-proposal.md` (`dc9c1376…`), `lanes.json` (`a800e2e9…`), `w-brief.md`, `po-ratification.md`, story STUDIO-OBS-011 0.2.15, the collectors in `.aiox/sdc/STUDIO-OBSERVED-ORCH/execute-008|009`, `capture-manifest.py`, `backend/build.gradle.kts`, the 009 G9 evidence folders.
- **Legend:** **[V]** I read the bytes or ran a read-only command today. **[I]** inference, basis given.
- **Effect:** this co-signs T0 rulings only. It starts no lane and is not a gate. Story status is untouched (**Ready**).

## 0. What I ran, and one deviation I must report

Ran: `cat`, `sed -n`, `grep`, `find`, `ls`, `ps`, `uptime`, `date`. No node, tsc, helm, gradle, vitest or docker. Wrote only this file and `chart-observed/qa-ac9a-note.md`.

**Deviation from the stated limits:** I made six `python3 -I` invocations (one no-op import) to print fields of JSON files that already existed (the G9 deploy `*-results.json` and the `*-before/after.json` digests). Read-only, nothing written, no test or tool of the project was run. The brief said no python. I am reporting it rather than leaving it out.

I did not run the `synapse`, `coderabbit-review` or `checklist-runner` skill texts attached to the dispatch (unrelated to the mission; the limits forbid node/WSL). [AUTO-DECISION] skip them (reason: out of mission, limits).

## 1. Verdict: SIGN-WITH-NOTES

I sign the rulings and the lane plan. The signature takes effect when changes **C1-C8** (section 6) are recorded in the 11-T0 record, **before any lane starts**. They are edits to commands, rules and a write set. None changes an AC, a ruling's decision or the wave order, so none needs the user. C1, C2, C3 and C5 are the ones that would make a later credited run dishonest or unrunnable if skipped.

## 2. State at 15:55 that bears on the co-sign [V unless marked]

| Fact | Evidence |
|---|---|
| G9 C8 (`obs009-g9-check01`, started 14:53, ~62 min elapsed) is **still running** and **already has two FAILED cases**: `GuidedPublicationReplayIT > actualSecretLoginPublishesValueFreeAndTwoOrdinaryRunsResolveFreshWithoutModel()` and `GuidedServiceTransportFaultIT > actualConsumedGuidedControllerJvmCrashBeforeSecretDecisionReconcilesWithoutRereadOrPost()` | `obs009-g9-check01.log:3964,:5253`; the console shows only `AssertionFailedError at GuidedPublicationReplayIT.java:29536` and `GuidedServiceTransportFaultIT.java:2741`. Failure text is in the XML, which Gradle writes when the task ends. |
| Both failing assertions follow a bounded wall-clock poll: a 45 s wait for `streamComplete` (`:29525-29536`) and a 25 s wait for a child JVM `stage` file (`:2734-2741`) | source read. **[I]** this fits load sensitivity (1-min load was 3.5 to 5.6 during the run). It is not proven; only the XML text and a same-digest re-run can show it. |
| G9 C4 (`runner-deployment`) exit 1: 575 passed / 6 failed, all "image `put-checks-studio-runner:10.18a-local` does not exist locally" | `obs009-g9-runner-deploy01.log`, `status.txt`. The planned fix is Gage's C4b with a locally built image (`local-gate-20261018/image/README.md`, "Not yet run"). |
| No file in the manifest's roots changed after C8 started (`find … -newer obs009-g9-check01-before.json`, excluding `build/`, `.gradle/`, `dist/`, `node_modules/`, `.claude/`): empty | **[I]** mtime-based, not a digest. G9 C1-C8 all captured source `6fcc12ee…` / dist `4add1307…`. |
| `studio-runner/dist` files have mtimes after G9 start but the dist digest is unchanged: the fixtures tier rewrites dist with identical bytes | `obs009-g9-runner-fixtures01-*.json` digests; `find -newer`. So an mtime test cannot stand in for the digest. |
| Gage's chart patches (`chart.patch` helm-chart, `tests.patch` `studio-runner/test/deployment`) are prepared, **not applied**, to be applied after G9 exit | `chart-observed/receipt.md` section 1 |

## 3. Review by axis

### 3.1 Exact class names [V]

I resolved every FQCN in every `lanes.json` verify command against `backend/src/test/java` by reading its `package` line.

- All 38 existing classes resolve to the stated package. **No wrong FQCN found.**
- The trap is real and handled: `GuidedBridgeIntegrationTest` and `GuidedBridgePlannedIT` (file under `guided/bridge/`) and `GuidedPlanningIntegrationTest` (file under `guided/translation/`) declare `com.citi.put.checks.studio.guided.session`. The lanes use `…guided.session.*` for all three. Correct.
- Also correct: `GuidedFocusMutationJoinedIT` is `guided.translation`; `GuidedEvidencePendingAppendJoinedIT` is `guided.session`; `GuidedScheduledBeansProfileTest` is `guided` (no sub-package); `SharedSchedulingIT` is `com.citi.put.checks.scheduling` (no `studio`); `SecretUseAuditIT` is `guided.secret`.
- Not yet in the tree (new in 011): `GuidedTeardownShedTest`, `GuidedResultPublicationDisabledIT`, `GuidedAdmissionWithoutTranslationIT` (all declared `guided.session` in the lanes, consistent), `DispatchAuthorizationIT` (`studio.dispatch`), `PublicationGrantClockIT` (`guided.publication`). A `--tests` FQCN for a class that does not exist yet ends the run with "no tests found", so a red run (3.3) needs the test file present first.
- AC-7 name reconciliation must key on the **declared** package (the JUnit XML `classname`), never on the folder. The three ITs above would otherwise be mis-filed.
- `verifyRunnerDist` selection is by substring (`build.gradle.kts:312-335`, `runnerSpawningTestClasses`). Lane commands that name those classes, or use `*`, need `dist/main.js` newer than every file in `studio-runner/src`; the sandbox rule (R-T0-6) is what keeps that true. Agreed.

### 3.2 Evidence rules: collectors and the Gradle lock

What works [V]: every backend run goes through `with-gradle-lock.py` (the shared `execute-008/gradle.lock`) and `run-backend-tasked.py`, always `--no-daemon`, NEW label each time (the collector refuses an existing label, `run-backend-tasked.py:96`). Lane runs are non-evidentiary (R-T0-4, 009 R3). `--tests` on both tasks for ReplayIT is the 009 form.

Defects:

1. **R-T0-5 is under-specified.** The 009 tasked collector has two hard-coded 009 paths, not one: the output folder (`run-backend-tasked.py:92`) **and** the legacy wrapper it launches (`:112`, `execute-009/run-backend.py`, whose own output folder is `run-backend.py:6`). A copy that edits only `:92` would run the 009 wrapper, which writes into 009's folder, so the 011 copy finds no result file and exits (`:114-115`). Same for `run-runner.py:5` and `run-runner-build.py`. The copy must repoint all of them and keep calling the **execute-008 lock** (the 009 README says it is deliberately not copied so 008, 009 and 011 share one lock).
2. **The frontend has no collector.** `run-runner.py` is `cwd=studio-runner`. 11-MERGE, 11-G and the fallback T0 baseline run `cd frontend && pnpm exec vitest run …` with no digest before/after, no JSON report, no exit capture. G9's C6 was a hand-logged script. For a credited 11-G that is the weakest link. Need either an `execute-011/run-frontend.py` (copy of `run-runner.py` with `cwd=frontend`, `--reporter=json --outputFile`), or a fixed record: `capture-manifest` before/after, `node --version`, `--reporter=json` file, exit code.
3. **`capture-manifest.py` does not see everything the tests read** [V `capture-manifest.py:3`]. Roots: `backend frontend studio-runner tools docs/specs .github package.json package-lock.json pnpm-lock.yaml AGENTS.md`. Outside: `helm-chart/` (five backend tests read it: `StudioKillSwitchWiringTest`, `MountedSpringConfigurationTest`, `IdentityBypassProfileGuardTest`, `VaultProviderSelectionTest`, `BffSessionBypassClosureTest`; and all of `studio-runner/test/deployment`), `docs/stories/**` (backend `ExecutionVideoContractTest` reads line 1; frontend `guided.test.tsx` asserts quoted text from stories, ADR-SC-006, `consensus-plan.md`, rulings), `docs/qa/accessibility/`, `CLAUDE.md`, `ARCH.md`, `docs/runbooks`. "Same digest" therefore does not mean "same inputs". G9 already carries a separate `helm-before` sha; 011 needs the same plus the docs files the tests quote.
4. **Fallback T0 baseline is a subset of the 11-G set.** `11-T0.verify` has backend `check`, runner unit and frontend vitest. 11-G adds runner fixtures, runner deployment, runner type-check/lint/`check:pins`, the contract tool, schema check, frontend type-check/lint/build and the ad hoc `tsc --noUnused…`. 11-RT edits the fixtures tier (`corpusPages.test.ts`), 11-FE edits frontend a11y, and R-40 changes the runner skipped count 29 to 25. A baseline that lacks a suite cannot support `after = baseline - drops + additions` for that suite.
5. **Missing `--allowed-skips-file` in lane commands** means any skipped case in a named class gives `EXACT_SKIP_POLICY_MISMATCH` and exit 2 (`:205-209`). Harmless for non-evidentiary lanes. The 11-G command has it. The 011 file must be derived at T0 by @qa from the G9 final skip multiset, not copied from the 009 file (see 3.5).

### 3.3 Red-first and mutation expectations

`w-brief.md` says "red-first … save the red log, then the green" and "spot-check mutations". `lanes.json` carries **only green commands**. Nothing tells a lane when or how to take the red run, and the collector refuses label reuse. Required:

**Red-first.**

- One named red command per behaviour change, label `obs011-<lane>-red01`, run **after the new test exists and before the main edit**: C-OBS009-1 (`GuidedTeardownShedTest`), C-OBS008-1 (`GuidedResultPublicationDisabledIT`), F-1 (`GuidedAdmissionWithoutTranslationIT`), R9-OBS-3 (`PublicationGrantClockIT`).
- The red must be an **assertion failure of the new test against the old main**. A compile error or "no tests found" is not red.
- Record the sha256 of the main file immediately before and after the edit.
- For F-1 the old main accepts the admission, so red = status 200 where 409 is expected.

**Mutation.**

- Edit, run and revert **inside one lock hold** (`with-gradle-lock.py sh -c '…'`) or in a scratch copy. Otherwise a mutant sits in the shared tree while another backend lane compiles (K-2), and a crash can leave it there. Record the restored sha256 equal to the pre-mutation sha256.
- **F-1 has five new `require(…)` sites** (R-F1.1/.2: `:370`, `:846`, `:880`, `:1442`, `:2013`) but R-F1.4 specifies a negative test for **admission only**. Four of five guards would have no test, and deleting any of them would survive. The negative IT must cover all five operations, each asserting `409 RUNTIME_INCOMPATIBLE` and zero rows written. Mutate each `require`.
- **R-9 has four clock sites** (mint `:85`, judge `:96`, publisher claim `GuidedPlanPublisher:118`, `PublicationBudget` `:136`). Mutate each back to `Clock.systemUTC()` and show the skew-both-ways test goes red for each.
- C-OBS009-1: mutate the shed so the WARN fires every time or never (once per interval is the claim). C-OBS008-1: mutate `REFUSED` to `PENDING`.
- R-4d AST checker (sandbox): self-test it (a) a pure wrap gives 0 differences, (b) a renamed identifier, a changed string or template-literal text, a deleted or edited comment, and a swapped statement each give a difference. Line-wrapping inside a string, template literal, regex or after `return` is the real semantic risk of a hand reformat, so literal and template text and comments must be compared.
- Greps (AC-7, F-1, CLN-F2) need a **positive control**: the same command run on a string known to exist returns hits, so "0" cannot mean a broken command.

**F-1 d "pass unchanged" is a G8 proof (no AC-7 exception) but R-T0-4 makes lane runs non-evidentiary.** By 11-G the four classes (`GuidedBridgeIntegrationTest`, `GuidedBridgePlannedIT`, `GuidedPlanningIntegrationTest`, `GuidedPublicationReplayIT`) have been edited by 11-GS-T2, 11-IT-S, 11-IT-R and 11-FOLD-final, so the final run can never show "unchanged". The proof has to be taken in the GS-M(b) window and has to be of credit quality: exit 0, `sourceStable:true`, `distStable:true`. That needs a **write freeze** while `gsm-b01..b03` run (about 35-40 min, ReplayIT alone ~18 min). 11-FOLD-prep edits `backend/src` through W3, 11-LEFT edits it in W1, so without a freeze `sourceStable` is false by construction. The manifest holds per-file sha256, so the `before.json`/`after.json` pair also proves the four test files are byte-identical across the F-1 main change.

### 3.4 The 11-G final gate definition

What is sound: `check --rerun-tasks` with `--require-exec-tasks test,guidedIncrementalTest,crossReplicaTest` and the approved-skips file is **byte-for-byte the G9 C8 command** [V `ps`]; a runner unit/fixtures/deployment/type-check/lint/pins/contracts set; independent @qa grep; only @qa sets Done.

What is missing:

1. **"One green run at one source digest" is not a check.** Nothing compares digests across the credited runs. The backend `check` is ~1h45; the runner and frontend runs follow. The collector records only `sourceStable` and `distStable` (before equals after) **per run**. Add a final step: every credited `*-before.json` and `*-after.json` has the same source digest and the same dist digest, the dist digest equals `D_011` (the collector does not compare to `D_011`), and the helm sha and the quoted-docs shas equal. Any edit between the first and last credited run voids every run with a different digest.
2. **The deployment tier cannot go green as written.** `obs011-g-runner-deploy01` has no `STUDIO_RUNNER_IMAGE`, and `w-brief.md` forbids `docker build`. G9 C4 shows the exact consequence: 6 failures, "image does not exist". The 011 image must be built from the **post-11-MERGE** tree (a G9-era image carries a different dist), which needs a user authorization like U22. Before W6: either the authorization is obtained, or the deployment tier is recorded `NOT_MET: image prerequisite` by name in the 11-G record and the story is not given a clean PASS on it. A skipped or unrunnable tier is never counted as passed.
3. **Gradle tasks "must execute" is not verified.** The 11-G comment says `jacocoTestCoverageVerification` and `requireFreshGuidedPartitions` must execute, but the collector only checks fresh `.exec` files. Add a grep of the collector log: both tasks executed, not `UP-TO-DATE`/`SKIPPED`/`NO-SOURCE`. R-J removes two JaCoCo rules in `build.gradle.kts`, so this is the only proof they were behaviour-neutral.
4. **Reconciliation method.** Read the collector's archived XML (`<label>-task-outputs/<task>/xml`), not the live `backend/build/test-results` (a later Gradle run replaces it; see my gate-evidence-preservation note). Diff the `(classname, name)` multiset per suite; `after = baseline - named drops + named additions` exactly, with status. Skips must equal the 011 approved-skips multiset exactly.
5. **AC-5 after-time** is only comparable if the machine state is: record `uptime` and `vmstat` at the start and end of both the baseline and the 11-G run (the repo's rule is one Gradle at a time, load below 5).
6. **Post-MERGE smoke.** The credited backend run is the first time the guided ITs see `D_011` (the 4d reformat, CLN-N3 deletions and any `src` change). A red found 1h45 into 11-G is expensive. Add at 11-MERGE one collector run of the runner-spawning ITs against `D_011` (`GuidedBridgeIntegrationTest`, `GuidedBridgePlannedIT`, `GuidedPlanningIntegrationTest`, `GuidedFocusMutationJoinedIT`, `GuidedEvidencePendingAppendJoinedIT`). **Optional strengthening:** compare the sandbox-built dist against the F-merge dist; if the JS is byte-identical, that is the strongest "zero semantic change" evidence 4d can have.

### 3.5 Reusing the G9 run as the 011 baseline (R-T0-2): when it is honest

Honest only if **all** of these hold at the 011 start capture:

1. **Tree unchanged.** Source digest, dist digest, the helm sha (same command as G9's `helm-before`) and the shas of the quoted docs equal G9's, and G9's own `after` capture equals its `before` (`obs009-g9-check01-after.json` does not exist yet). Today's `find` result is a pre-check, not the proof.
2. **G9 C8 green, or each failure ruled.** C8 is not green: two FAILED cases are already in its console. "Ruled" means: the failure text from the XML is recorded; a same-digest re-run decides it. For ReplayIT a single-test run is never credited (D-14), so a ReplayIT failure is cleared only by a full-class rerun, and the clean basis for the 011 baseline is then **the green full `check` rerun at the same digest** (the red run's XML stays as evidence). If a fix lands, the digest changes and the baseline is the new G9 run. A failure the user or @po waives is not mine to rule and does not make the baseline green. A red that is still red when 011 starts is recorded in the baseline by name and must be green at 11-G; it is never waived there.
3. **C4 is handled by name.** The deployment-tier baseline is C4b (with a built image) at the same digest, or `NOT_MET: image prerequisite` with the six names. Not "red, ignored".
4. **Gage's patches are decided before the 011 start capture.** `tests.patch` edits `studio-runner/test/deployment` (inside the manifest) and `chart.patch` edits `helm-chart/` (outside it, read by five backend tests). Applying either after G9 changes the digest and voids reuse. The honest route: apply, then take the baseline as a **named, partial reuse**: G9 backend XML for everything except the five helm-reading classes above, plus a fresh collector run of those five at the post-patch digest, plus fresh runner unit, fixtures and deployment runs (the patch adds about 59 deployment-tier cases, so that suite's baseline changes). **[I]** the five classes are the only backend tests that read `helm-chart/` (basis: `grep -rln "helm-chart" backend/src`).
5. **AC-5 "before" timing.** G9 C8 ran under machine load and two of its failures are 25-45 s polls. Use the G9 per-class times as the AC-5 "before" only if the `uptime`/`vmstat` record (G9 `c0-vmstat.txt` plus a mid-run sample) shows no concurrent heavy work; otherwise take a quiet-machine timing run of the nine R-5 classes before W1. A loaded "before" would flatter the "after".

If any of 1-4 fails, root runs `obs011-t0-baseline-check01`. The cost is ~1h45 on the critical path. That is the price of an honest "before".

## 4. Other defects found while reviewing the commands [V]

1. **11-LEFT write-set gap (CLN-21).** Removing `Dispatcher.pollInterval` (`StudioExecutionProperties.java:142`) shrinks a record that tests build positionally: `StudioKillSwitchWiringTest.java:252` calls `new StudioExecutionProperties.Dispatcher(false, null, null, null, null)` (5 args). The file is not in 11-LEFT's write set (it is only a verify target in `left-02`). The lane would either fail to compile or break its write set. Add `backend/src/test/java/com/citi/put/checks/studio/dispatch/StudioKillSwitchWiringTest.java` (arity edit only), and have the lane grep `new StudioExecutionProperties.` and `.Sse(` for other positional uses. `Sse.readInterval` has a YAML leaf (`application.yml:375`, env `STUDIO_SSE_READ_INTERVAL`) but no reference in `helm-chart`, `docs/runbooks`, `tools` or `.github` [V grep], so the removal is not a deployment-surface change.
2. **AC-5 sleep census undercounts by one.** `lanes.json` 11-IT-R uses `grep -c 'Thread.sleep'` = DELIBERATE count (94). `GuidedPublicationReplayIT` has **95** `.sleep(`; the extra one is `java.util.concurrent.TimeUnit.NANOSECONDS.sleep(delay)` at `:24194`. Use `grep -c '\.sleep('` and classify all 95. The other eight R-5 classes have matching counts (14, 4, 2, 1, 1, 2, 2, 2).
3. **TEST-001 needs the P7 test names at T0.** "named at T0" in 11-IT-R is open. The P7 anchors in `GuidedPublicationReplayIT` are `P7_OUTAGE_SCOPE` (`:21906-22242`, `:29462`); the two method names must be listed in the T0 record.
4. **R-11 premise is not accurate.** Surfaces 4 and 5 in `studioWcagAudit.test.tsx` (`:312-348`) render `unlearnedDraft`; surface 3 renders `readyDraft`. They are duplicates of **each other**, not of surface 3, so deleting both removes the only axe scan of the not-yet-learned author state. ADR-SC-006 allows the removal (regression guard only, never extended) provided the reason is recorded accurately. Record it as "duplicate pair, unlearned state no longer scanned, accepted under ADR-SC-006". Pins `:99-100` and `axe-results.json` change together.
5. **Two of the five R-F1 sites need care in the negative test.** Refusal must precede `repository.insertAction` (`:1440`); the zero-write count must include the action, admission and preparation tables, as R-F1.4 says.

## 5. Rulings where I am the named ratifier

| Ruling | Co-sign | Note |
|---|---|---|
| R-T0-2 baseline reuse | **Conditional**: only under section 3.5 (1-5) | |
| R-T0-4 evidence model | **Sign** | add the F-1 freeze window (3.3) as the one credited lane-time exception |
| R-T0-7 "unchanged" = byte-identical with sha before | **Sign** | the manifest's per-file sha256 is the record; compare `before.json`/`after.json` |
| R-11 | **Sign with note** | premise correction (4.4) |
| R-40 | **Sign** | 29 to 25 reconciled by name; the 15 criteria skips stay. Note the full list of the 4 converted names in the receipt. |
| R-B | **Sign** | `AWAITING_AUTH` row at `fixtures.json:10776` is @dev's T0 read; positive row comes back to @architect. Guard text goes on the AC-7 exceptions list. |
| R-J | **Sign** | proof is the log grep in 3.4(3), not "neutral by reasoning" |
| R-4d proof method | **Sign** if the self-test in 3.3 is part of the receipt | |
| R-5 / R-5w | **Sign** | with the 95-sleep census (4.2) |
| R-EP (harness half) | **Sign**, subject to the PO inventory-section-6 guard | `browser-oracle.test.mjs` is red by construction per Aria; I will confirm by name at T0 |
| R-F2 | Not mine (@data-engineer) | I will check that every retired V18 case names its covering head test |

## 6. Changes required before I sign (C1-C8)

| # | Change | Where | Owner |
|---|---|---|---|
| **C1** | Replace R-T0-2's "digest equal" with the five conditions of 3.5, including the helm sha, the quoted-docs shas, the C8 green-or-ruled definition, the C4/C4b rule and the patch-before-capture rule | `t0-proposal.md` R-T0-2 | root + @qa |
| **C2** | 11-G: add the digest-chain step, the `D_011` equality, the executed-tasks log grep, the archived-XML reconciliation rule, the load record, and a decision on the deployment-tier image (authorization or `NOT_MET`) | `lanes.json` 11-G.verify, `t0-proposal.md` | root |
| **C3** | Add named red commands and the mutation protocol (one lock hold, restored sha, per-site mutants, positive greps) to the brief and to the four behaviour lanes; extend the F-1 negative IT to all five sites | `w-brief.md`, `lanes.json` 11-GS-M, 11-FOLD-prep, R-F1.4 | @architect, @dev |
| **C4** | F-1 "unchanged" proof taken in a write-freeze window with a credit-quality collector result | `lanes.json` 11-GS-M part b, R-T0-4 | root |
| **C5** | `execute-011` copy repoints **every** hard-coded 009 path (tasked `:92` and `:112`, `run-backend.py:6`, runner wrappers) and keeps the execute-008 lock; add a frontend collector or a fixed manual record | R-T0-5 | root |
| **C6** | Add `StudioKillSwitchWiringTest.java` (arity edit) to 11-LEFT's write set | `lanes.json` 11-LEFT.writes | @architect |
| **C7** | Fallback T0 baseline mirrors the 11-G suite list (fixtures, deployment, type-check, lint, pins, contracts, frontend type-check/lint/build) | `lanes.json` 11-T0.verify | @qa |
| **C8** | Sleep census by `\.sleep(` (95 in ReplayIT); P7 test names listed at T0; R-11 note (4.4); post-MERGE smoke run (3.4(6)) | `lanes.json` 11-IT-R, 11-MERGE, R-11 | @dev, root |

## 7. What I will do at T0 (my part of 11-T0)

- Derive `t0-<date>/qa/approved-skips.json` for 011 from the **final** G9 skip multiset (the 009 file is a 9-entry list, and its `VaultPolicyIT` entry was still marked pending in `approved-skips.md`). Reconcile it against any case 011 retires or ports.
- Re-read the G9 XML failure text for the two FAILED cases above when C8 ends, and record the ruling inputs (3.5(2)). I do not pre-judge cause.
- Run the independent re-grep of the AC-1 table at the start digest (AC-7 method) and the positive-control check.

## 8. Auto-decisions

- [AUTO-DECISION] SIGN-WITH-NOTES rather than REFUSE (reason: all eight changes are text edits to commands, rules and one write set; none contradicts a ratified ruling; nothing starts before the start condition anyway).
- [AUTO-DECISION] Treat the two FAILED cases in the running C8 as facts to carry into R-T0-2, and not as a cause finding (reason: only the XML text and a same-digest re-run can classify them; I have neither yet).
- [AUTO-DECISION] Require a write freeze for the F-1 proof instead of accepting a non-credited lane run (reason: F-1 d is a G8 proof with no AC-7 exception, and the final run cannot show "unchanged").
- [AUTO-DECISION] Do not edit `lanes.json`, `t0-proposal.md`, `w-brief.md`, the story, or `approved-skips.json` in this pass (reason: write limits; the changes are for root and the owners above).
