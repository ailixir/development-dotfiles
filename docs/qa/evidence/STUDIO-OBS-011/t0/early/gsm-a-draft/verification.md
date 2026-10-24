# 11-GS-M(a) exact staging and verification — NOT RUN

All commands below are future instructions. No test, compiler, formatter, Docker operation or mutation was executed for this draft. Do not run anything here until root accepts B1/B7, opens the tree, accepts the GS-T three-class gate with literal unchanged-all-backend/src/main at S_011, and explicitly releases that proof barrier. This includes the neutral installer. Root/Aria adopted this additional barrier in v4 after this draft began.

The five-file unified patch is `part-a.patch` against recorded S_011. Do not apply it before red-first. `tests-only.patch` adds the two classes (six named tests); `red-seam-only.patch` changes only `teardowns` mutability and adds the behavior-neutral package-private installer. That installer preserves the injected DiscardPolicy. `red-seam-reference.java.txt` is the exact post-seam service for review. `behavior-after-red.patch` changes all three main files from that neutral state to final draft. `main-only.patch` is the three-file final change from pristine S_011. No test calls a final-only API except the installer supplied by the neutral seam.

Use exact current hashes in `manifest.json`. Source matches are a prerequisite, not permission to bypass the root barriers. No real source/test file is edited by this document. Apply staged units under the existing Gradle lock and keep all source compiling at release; if a compilation error occurs, restore the complete pre-stage file set inside that same hold. Do not count a compilation error, discovery error, fixture/setup error, or schema-validation exception as assertion-red.

For every invocation below, use a fresh label if any corresponding artifact already exists. The labels here have not been used by this draft. Run from repository root. Set the prescribed Node path once:

```sh
export PATH="$HOME/.local/share/fnm/node-versions/v24.20.0/installation/bin:$PATH"
```

Stage the neutral seam and both tests together, in one lock hold. The first collector invocation compiles that entire staged unit and runs the new unit class. The neutral seam is the only main edit before the two red runs; it is itself allowed only after the GS-T unchanged-main proof. Save pre-stage copies/hashes and restore them inside the hold if compilation fails. The unexecuted `run-stage.py` applies exactly those file contents after checking all five prerequisite hashes, invokes the selected collector under the caller's lock, and restores all changed files before lock release if fresh named testcases are absent. No git/index operation occurs. It does not decide assertion-red or green: that requires fresh JUnit/compiler output review. The unified patches remain the human-review artifacts.

```sh
python3 .aiox/sdc/STUDIO-OBSERVED-ORCH/execute-008/with-gradle-lock.py python3 -I docs/qa/evidence/STUDIO-OBS-011/t0/early/gsm-a-draft/run-stage.py red obs011-gsm-red01 --root-proof-barrier-released
```

Expected assertion-reds, not observed: `shedWarnsOncePerIntervalAndTheNextTickKeepsOneDurableAttempt` expects one WARN and receives none; `anIdAlreadyQueuedOrInFlightIsNeverSubmittedTwice` expects one queued item and receives two. The injected executor has one worker and two slots; a blocked worker makes queued duplication observable rather than hiding the second attempt in silent full-queue discard. All test executors are released and terminated in `@AfterEach`.

Before the result main edit, run the disabled HTTP class against the old result behavior plus the neutral teardown-only seam:

```sh
lsof -nP -iTCP -sTCP:LISTEN
python3 .aiox/sdc/STUDIO-OBSERVED-ORCH/execute-008/with-gradle-lock.py python3 .aiox/sdc/STUDIO-OBSERVED-ORCH/execute-011/run-backend-tasked.py obs011-gsm-red02 --test-tasks test -- test --tests com.citi.put.checks.studio.guided.session.GuidedResultPublicationDisabledIT --no-daemon
```

Expected assertion-reds, not observed: the nonterminal test asserts `outcome=PREPARING` before schema validation, so the old bare PublicSession fails an assertion (empty outcome); the terminal test asserts `publication.status=REFUSED`, while the old fallback says PENDING. Its POST setup must first prove the real disabled start succeeds with no publication base. Any setup failure must be fixed test-only and re-run with a fresh label before credit. The manual enabled-default SUCCEEDED/PENDING/HTTP200 case is a regression companion, not an expected red. The HTTP authority case retains 401/403.

After recording both real assertion-red logs and neutral-main hash, stage the exact `behavior-after-red.patch` main contents as one unit under the lock and compile/run a01 inside that same hold:

```sh
python3 .aiox/sdc/STUDIO-OBSERVED-ORCH/execute-008/with-gradle-lock.py python3 -I docs/qa/evidence/STUDIO-OBS-011/t0/early/gsm-a-draft/run-stage.py green obs011-gsm-a01 --root-proof-barrier-released
```

Expected selection: 2 new unit tests + 4 new HTTP tests + the pruner's 3 existing tests. The real pruner file must remain byte-identical (`85847c70…` in manifest). New test count is 6, with 0 named drops. Test discovery/counts are unexecuted. Preserve main hashes before/after. Use no allowed-skips file in lane runs; disclose any skip-policy exit 2. Lane runs are non-evidentiary except final gates; no a01 result substitutes for 11-G.

Mutants are separate `.patch` files and are implemented literally by the unexecuted helper `run-mutation.py`. The helper expects all five final draft hashes, writes/executes/restores within the caller's single lock hold, and records the restored SHA. Run only after a01 green and before another lane changes these files. A mismatch requires rebase/review, not bypassing the hash check.

```sh
python3 .aiox/sdc/STUDIO-OBSERVED-ORCH/execute-008/with-gradle-lock.py python3 -I docs/qa/evidence/STUDIO-OBS-011/t0/early/gsm-a-draft/run-mutation.py warn-every-call obs011-gsm-mut01 --root-proof-barrier-released
python3 .aiox/sdc/STUDIO-OBSERVED-ORCH/execute-008/with-gradle-lock.py python3 -I docs/qa/evidence/STUDIO-OBS-011/t0/early/gsm-a-draft/run-mutation.py warn-never obs011-gsm-mut02 --root-proof-barrier-released
python3 .aiox/sdc/STUDIO-OBSERVED-ORCH/execute-008/with-gradle-lock.py python3 -I docs/qa/evidence/STUDIO-OBS-011/t0/early/gsm-a-draft/run-mutation.py refused-to-pending obs011-gsm-mut03 --root-proof-barrier-released
```

Expected assertion-reds, not observed: WARN every call gives multiple first-interval warnings; WARN never gives zero; REFUSED→PENDING fails the terminal disabled-publication status assertion while HTTP remains 200. A nonzero command exit alone never proves a killed mutant: inspect fresh JUnit failures and class/method names. `run-mutation.py` deliberately records `redVerdict: UNASSESSED_READ_NEW_TEST_ASSERTIONS`. It records listeners before each backend run and restores source in `finally`; restored SHA must equal before SHA. No mutations have run.

Future grep proof, with a positive control:

```sh
rg -n 'DiscardPolicy' docs/qa/evidence/STUDIO-OBS-011/t0/early/gsm-a-draft/red-seam-reference.java.txt
rg -n 'DiscardPolicy' backend/src/main/java/com/citi/put/checks/studio/guided/session/GuidedSessionService.java
rg -n 'ArrayBlockingQueue|ofMinutes\(15\)|TEARDOWNS_QUEUED|teardownRejected' backend/src/main/java/com/citi/put/checks/studio/guided/session/GuidedSessionService.java
```

The first command must find the old policy and the second must find none after application. F-1, admission guards and recordEvidence remain untouched in this part. Formatting/static-analysis and the full 11-G suite are still owed after application; no formatter or test is authorized during the inherited baseline freeze.
