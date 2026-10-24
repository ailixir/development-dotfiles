# GS-M(a) resume2 exact future verification — NOT RUN

This is an unapplied, uncompiled off-tree correction under Aria's GSM-P5 ruling. Do not execute these commands during the baseline freeze. Root first accepts actual B1/B7 outcomes, opens the tree, and accepts the complete **five-class v4 GS-T** gate while every backend/src/main byte is still literal S_011, then explicitly releases the main proof barrier. Even the neutral seam waits for that proof. Each application/run/restore unit below holds execute-008's shared Gradle lock; use Node24 for backend/runner as prescribed in the inherited handoff. No source, config, dist, quoted baseline or git/index write has occurred in preparation.

The package has five complete repo-shaped files. `part-a.patch` is the whole S_011→final change; `main-only.patch` contains three main files; `tests-only.patch` adds two test files. `red-seam-only.patch` and `red-seam-reference.java.txt` are the unchanged original behavior-neutral executor seam. `behavior-after-red.patch` changes the three main files from that neutral state to final. `actual-base-correction.patch` binds the original buggy off-tree draft to the corrected final service only; `resume2-tests.patch` binds the original result test to the expanded final test. Both original draft and current real sources are SHA-bound in the manifest and remain unchanged.

Before any authorized application, inspect `artifact-hashes.sha256`, `manifest.json`, `static-verification.json` and the actual runtime barriers. A hash mismatch requires rebase/review and complete regeneration. Never bypass it. `run-stage.py` and `run-mutation.py` verify every artifact SHA (including all patches), every five-file source prerequisite, symlink confinement, the read-only pruner pin, a fresh evidence label, the execute-008 wrapper parent and held lock. They do not establish root authorization by themselves: the explicit flag records the caller's already granted root release. Helpers have not run. Static Python AST parsing is solely syntax inspection, not helper execution or compilation.

Run from repository root; substitute a fresh obs011- label whenever any matching artifact exists. Set the prescribed Node24 PATH using the inherited handoff. Each stage collects listener evidence before invoking the existing collector, which still performs its own normal compilation and test discovery.

```sh
python3 .aiox/sdc/STUDIO-OBSERVED-ORCH/execute-008/with-gradle-lock.py python3 -B -I docs/qa/evidence/STUDIO-OBS-011/t0/early/gsm-a-draft/resume2/run-stage.py red obs011-gsm-r2-red01 --root-proof-barrier-released
python3 .aiox/sdc/STUDIO-OBSERVED-ORCH/execute-008/with-gradle-lock.py python3 -B -I docs/qa/evidence/STUDIO-OBS-011/t0/early/gsm-a-draft/resume2/run-stage.py result-red obs011-gsm-r2-red02 --root-proof-barrier-released
```

`red` stages exactly the unchanged neutral teardown seam + both complete test files and runs the two teardown tests. `result-red` performs no source mutation and requires that exact neutral/test state, then runs the nine result tests. Both classes must compile against old production APIs: no result test invokes the final-only policy installer or shared builder. The original red01 should fail WARN-count/queue-duplication assertions. The original red02 should fail nonterminal outcome and disabled-no-base terminal publication-status assertions. Real disabled start/base absence must first succeed. New retained-base tests are regression companions at this stage; the dedicated actual-base mutant later supplies direct defect red. Compiler, fixture/setup, schema-validation and discovery failures never earn assertion-red credit.

After reviewing both actual assertion-red logs, apply the three main files as one complete unit and run a01 inside the same lock hold:

```sh
python3 .aiox/sdc/STUDIO-OBSERVED-ORCH/execute-008/with-gradle-lock.py python3 -B -I docs/qa/evidence/STUDIO-OBS-011/t0/early/gsm-a-draft/resume2/run-stage.py green obs011-gsm-r2-a01 --root-proof-barrier-released
```

Expected a01: **2 teardown + 9 result + 3 unchanged pruner = 14 methods**, zero named drops. The original six new tests are preserved and five matrix tests are added. The selected pruner's FAILED/LOGIN_REQUIRED and retained-published byte pins stay unchanged. Original helper discovery was faulty because JUnit names carry trailing `()`; resume2 strips only that suffix and checks every expected selected method. Missing/partial discovery restores the entire staged unit before lock release. A fresh testcase by itself does not prove assertions ran, and discovered setup failures are still findings. Helpers record unassessed receipts, never QA verdicts.

Required matrix evidence:

| Subject | Direct result | HTTP / lookup proof |
|---|---|---|
| disabled / actually absent / PREPARING and FINALIZING | same full v3 fallback PENDING | 202; explicit real repository absence |
| disabled / actually absent / SUCCEEDED | REFUSED/null/NOT_PUBLISHED | 200; real disabled start/no base |
| disabled / actual retained base / SUCCEEDED/no receipt | byte-equal to enabled/manual original fallback PENDING/null/NOT_PUBLISHED | real bases.capture and absent receipt; existing base projector PENDING/202 |
| manual enabled default / absent / SUCCEEDED | PENDING/null/NOT_PUBLISHED | existing fallback 200, zero presence-query calls |
| disabled / retained valid receipt | original direct PENDING/null/NOT_PUBLISHED | PUBLISHED/200 with original receipt, READY then HEAD_CHANGED overlays; exactly original two base reads |
| denied / unauthenticated with and without base | FORBIDDEN_SCOPE before any base query | original 401/403; retained receipt requires fresh cookie |
| disabled SUCCEEDED base-query failure | original query exception propagates | must never infer absence from repository failure |
| receipt defaults / live outcomes | no exception-branch extra lookup | one original HTTP base lookup without receipt; PREPARING/FINALIZING direct zero |

The real valid receipt fixture uses production relational publication writers with its documented synthetic action evidence. It proves result/receipt semantics only, not live browser/model execution. The no-receipt SUCCEEDED fixture changes durable state/progress solely for projection tests, never claiming completed native execution.

After a01 passes, run each mutant separately before another lane changes the five files. Each helper verifies hashes, changes one unique reviewed anchor, selects the full corresponding class and restores the original service in `finally` inside one lock hold. The restored SHA must equal the pre-mutation SHA.

```sh
python3 .aiox/sdc/STUDIO-OBSERVED-ORCH/execute-008/with-gradle-lock.py python3 -B -I docs/qa/evidence/STUDIO-OBS-011/t0/early/gsm-a-draft/resume2/run-mutation.py warn-every-call obs011-gsm-r2-mut01 --root-proof-barrier-released
python3 .aiox/sdc/STUDIO-OBSERVED-ORCH/execute-008/with-gradle-lock.py python3 -B -I docs/qa/evidence/STUDIO-OBS-011/t0/early/gsm-a-draft/resume2/run-mutation.py warn-never obs011-gsm-r2-mut02 --root-proof-barrier-released
python3 .aiox/sdc/STUDIO-OBSERVED-ORCH/execute-008/with-gradle-lock.py python3 -B -I docs/qa/evidence/STUDIO-OBS-011/t0/early/gsm-a-draft/resume2/run-mutation.py refused-to-pending obs011-gsm-r2-mut03 --root-proof-barrier-released
python3 .aiox/sdc/STUDIO-OBSERVED-ORCH/execute-008/with-gradle-lock.py python3 -B -I docs/qa/evidence/STUDIO-OBS-011/t0/early/gsm-a-draft/resume2/run-mutation.py actual-base-removed obs011-gsm-r2-mut04 --root-proof-barrier-released
```

Expected unobserved kills: original WARN-every/WARN-never count assertions; original disabled-no-base terminal REFUSED assertion; **GSM-P5 direct retained-base/no-receipt byte equality expects PENDING but mutant returns REFUSED** (also retained-receipt direct assertion). The fourth patch removes only `&& !publicationPolicy.baseExists().test(id)` from the disabled SUCCEEDED exception and recreates the reviewed buggy behavior. Confirm named assertion failures and complete discovery from fresh JUnit; a nonzero exit is insufficient. Preserve the original two old-production reds and all four mutation receipts/logs.

No allowed-skips file is used by these lane commands; any skip-policy exit must be disclosed. Lane evidence does not replace final 11-G. Real Java/API/Spring/SpyBean wiring, valid source/receipt fixture setup, schema/default/member-order preservation, logger/queue behavior, all red→green/mutation executions, formatting/static analysis, complete final gates and independent QA remain owed. Budget ceiling is declared USD500; actual spend is unavailable. No QA/lifecycle verdict is issued by this draft.
