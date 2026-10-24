# FOLD-prep execution sequence

Preparation only. Root GO has not been received. No product edits or runtime have started. All source and dist remain frozen during each collector. Node24 is selected through PATH; the existing collector supplies cached Java21. Labels are fresh and no full-class Replay or wholecheck is included.

Before application, revalidate all20 product preimages, all10 packet patch hashes, the21 original untouched FOLD_TESTS pins, and root GS-M final baton. Record fresh listeners before each collector. Preserve native raw evidence; inspect only public named assertions.

Apply only patches/01-red-first-clock.patch, then run:

```sh
python3 .aiox/sdc/STUDIO-OBSERVED-ORCH/execute-008/with-gradle-lock.py python3 .aiox/sdc/STUDIO-OBSERVED-ORCH/execute-011/run-backend-tasked.py obs011-recovery-20261020-foldp-red01 --test-tasks test -- test --tests com.citi.put.checks.studio.guided.publication.PublicationGrantClockIT --no-daemon
```

Require fresh all3 cases and intended clock assertions. FORBIDDEN_SCOPE, compile/setup, no-tests, infrastructure and skips do not count. On any such defect preserve staged state and report root; do not apply02/03.

After intended red, apply02+03 in the same locked multi-file unit and run foldp01 before release. Old consumer config/classes/beans remain active. Never apply04 or05 during prep. Continue exact remaining gates sequentially:

```sh
python3 .aiox/sdc/STUDIO-OBSERVED-ORCH/execute-008/with-gradle-lock.py python3 .aiox/sdc/STUDIO-OBSERVED-ORCH/execute-011/run-backend-tasked.py obs011-recovery-20261020-foldp-01-01 --test-tasks test -- test --tests com.citi.put.checks.studio.dispatch.HttpRunnerDispatchClientTest --tests com.citi.put.checks.studio.dispatch.DispatchAuthorizationIT --tests com.citi.put.checks.studio.guided.publication.PublicationGrantClockIT --tests com.citi.put.checks.studio.guided.publication.ObservedGrantClockIT --tests com.citi.put.checks.studio.dispatch.JobBodyLeakTest --no-daemon
```

```sh
python3 .aiox/sdc/STUDIO-OBSERVED-ORCH/execute-008/with-gradle-lock.py python3 .aiox/sdc/STUDIO-OBSERVED-ORCH/execute-011/run-backend-tasked.py obs011-recovery-20261020-foldp-02-01 --test-tasks test -- test --tests com.citi.put.checks.studio.dispatch.StudioRunnerTlsTest --tests com.citi.put.checks.studio.dispatch.StudioRunnerPropertiesProfileTest --tests com.citi.put.checks.studio.guided.GuidedScheduledBeansProfileTest --tests com.citi.put.checks.studio.dispatch.RunnerTlsClientCertIT --no-daemon '#' GuidedScheduledBeansProfileTest = the worker-context gate '(RC-1)'
```

```sh
python3 .aiox/sdc/STUDIO-OBSERVED-ORCH/execute-008/with-gradle-lock.py python3 .aiox/sdc/STUDIO-OBSERVED-ORCH/execute-011/run-backend-tasked.py obs011-recovery-20261020-foldp-03-01 --test-tasks test -- test --tests com.citi.put.checks.studio.scheduling.StudioScheduleApiIT --tests com.citi.put.checks.studio.scheduling.ObservedScheduleAuthorityIT --tests com.citi.put.checks.scheduling.SharedSchedulingIT --no-daemon
```

```sh
python3 .aiox/sdc/STUDIO-OBSERVED-ORCH/execute-008/with-gradle-lock.py python3 .aiox/sdc/STUDIO-OBSERVED-ORCH/execute-011/run-backend-tasked.py obs011-recovery-20261020-foldp-overloads01 --test-tasks test -- test --tests com.citi.put.checks.studio.guided.bridge.GuidedDispatchStopKeyTest --tests com.citi.put.checks.studio.guided.bridge.GuidedDispatchContextDeadlineTest --no-daemon
```

For each mutant below, acquire the existing Gradle lock once, verify the exact base SHA, apply only its patch, verify its exact mutant SHA, run the red label/selector, inspect fresh named assertion evidence while retaining the lock, reverse only that exact patch and verify the restored SHA, then run the same selector under the green label. Preserve exact restore even if a red is invalid; do not credit setup/compile failures or stack mutants.

- `m1-mint`: `backend/src/main/java/com/citi/put/checks/studio/guided/publication/PublicationGrantAuthority.java`; `f2220f238e0663c6cb83a311841946c4704cadcb9b861160be6ad888a15e0a35` → `ced7fae0cf5203780aa9fea8184abb4d0e1413121cd47064dd01037fdcf0e4fd` → exact base; selector `com.citi.put.checks.studio.guided.publication.PublicationGrantClockIT`; labels `obs011-recovery-20261020-foldp-m1-mint-red01` / `obs011-recovery-20261020-foldp-m1-mint-green01`.
- `m2-judge`: `backend/src/main/java/com/citi/put/checks/studio/guided/publication/PublicationGrantAuthority.java`; `f2220f238e0663c6cb83a311841946c4704cadcb9b861160be6ad888a15e0a35` → `7c6ff1a0bb97a2496d47d0abad3c2855c786bd6b1a7921d126e0e816cf47b34b` → exact base; selector `com.citi.put.checks.studio.guided.publication.PublicationGrantClockIT`; labels `obs011-recovery-20261020-foldp-m2-judge-red01` / `obs011-recovery-20261020-foldp-m2-judge-green01`.
- `m3-claim`: `backend/src/main/java/com/citi/put/checks/studio/guided/publication/GuidedPlanPublisher.java`; `dd96080567ebe1f6fbabff02caeed7d6ef038de44019035250e82af780fe1b21` → `423df1f61d05ed8d3ce9b8baab764450ccc09f2c366d6f708a35ed2a159b7884` → exact base; selector `com.citi.put.checks.studio.guided.publication.PublicationGrantClockIT`; labels `obs011-recovery-20261020-foldp-m3-claim-red01` / `obs011-recovery-20261020-foldp-m3-claim-green01`.
- `m4-budget`: `backend/src/main/java/com/citi/put/checks/studio/guided/publication/GuidedPlanPublisher.java`; `dd96080567ebe1f6fbabff02caeed7d6ef038de44019035250e82af780fe1b21` → `57457251f354a361f1d1136db6076684bb807978c8e95f0d1122b25cd352ea02` → exact base; selector `com.citi.put.checks.studio.guided.publication.PublicationGrantClockIT`; labels `obs011-recovery-20261020-foldp-m4-budget-red01` / `obs011-recovery-20261020-foldp-m4-budget-green01`.
- `m5-worker`: `backend/src/main/java/com/citi/put/checks/studio/dispatch/ProvisionalDispatchAuthorization.java`; `014471b9833f6e87bad4f9dfed64523550dba2edfb940a47a1459716ef61829e` → `6bd8e01e65cc3485d2d792bf95c38aa6d03b24deaf9d1d6434f5b141678fcf0a` → exact base; selector `com.citi.put.checks.studio.dispatch.DispatchAuthorizationIT.workerWithoutPublicationCollaboratorRefusesEveryPublicationOperation`; labels `obs011-recovery-20261020-foldp-m5-worker-red01` / `obs011-recovery-20261020-foldp-m5-worker-green01`.

After all gates and valid independent mutant kills, rehash complete20-file prep baton, all21 original FOLD_TESTS and external protected files, actual source/dist before/after collector pins and public assertion locations. Record transport endpoint/credential/connect timeout/HTTP-version equality and the single secret serializer. No prep-exit or lifecycle credit is claimed before actual results.
