# GS-T off-tree draft receipt

Dex / aiox-dev, 2026-10-18. **Complete three-file draft; compile and runtime proof pending.** This is not a QA verdict or permission to apply while the baseline freeze holds.

Draft files preserve exact repository paths below `repo/backend/src/test/java/com/citi/put/checks/studio/guided/session/`:

- `GuidedSessionIT.java`
- `GuidedServiceTransportFaultIT.java`
- `GuidedLifecycleReasonIT.java`

`design.md` was written before Java drafting and records the final S1/S2 rulings. `draft_migration.py` reproduces the complete draft from the unchanged real sources. `gs-t-draft.patch` is the unified three-file patch; `draft-manifest.json` binds before/after SHA256 values.

Verified by lightweight source inspection and Python only:

- All 80 ordered source test-method names remain: SessionIT 44 ordinary tests, TransportFaultIT 30 ordinary tests plus one parameterized method, LifecycleReasonIT 5 ordinary tests. `static-review.json` reconciles each method and preserves every original assertion expression. It does not claim the 9 parameterized Mode invocations passed.
- All positive admissions now receive the real planner-issued association's key and proposal. The rollback subject obtains that association before opening its admission transaction. Its original rollback/no-charge assertion remains.
- Production resolve/classify/start initialization/sources/completeness remain real. Mutable source/authorization/current/native-observer controls only narrow accepted real access checks. No return-true completeness override remains.
- The five historical TransportFault direct translation-state/manifest initialization blocks are removed. No test calls store acceptPlan/reserveObligation/attachAdmission or directly writes those authority tables. Ordinary `ui_tests` source fixture writes remain allowed. The original duplicate-row negative probe remains unchanged.
- S1's state-only observation window follows a genuine initialBlank bootstrap and metadata ACK; its exact preconditions and unchanged progress are asserted. The original service/owning-worker observation creates the app evidence. TransportFault uses its original authenticated relay/callback path and retains native consumed/read/post/cleanup/canary oracles.
- The S2 request-field port has two independent valid-start positive controls, then retains the original shared-key race and assertion.
- The read-only `git apply --check` exits 0. All three real test files and GuidedSessionService still match S_011. B1's label/wrapper/daemon identity was live at the final observation. Exact results and hashes are in `final-evidence.json`.

Required next proof, after root opens the tree and grants the staged unit:

1. Review these source drafts under Aria's S1/S2 and the frozen-main proof barrier. Apply the exact three-file patch inside the shared lock and compile as one unit; formatting remains unrun and belongs inside that hold.
2. Run a fresh-label GS-T collector with the exact v4 class set: SessionIT, TransportFaultIT, LifecycleReasonIT, unchanged EvidencePendingAppendIT and CommittedRefreshStateTest. Use execute-011 with execute-008's lock, listener check and `--no-daemon`.
3. Reconcile expanded invocation names/counts against B1; retain all Mode variants. Inspect the real planner guard and real completeness verdict at the second-step SessionIT case, the low-budget no-planner controls, and both independently valid idempotency-start controls.
4. Prove the TransportFault three-second expiry mode still reaches its original consume/read/post boundary within its unchanged deadline. No timing limit may be enlarged to accommodate fixture preparation. Recheck private-route/held-row/source-observer ownership, bootstrap callback/ACK and isolated-controller cleanup paths by name.

Residuals are runtime proof obligations, not known passing results: Java compilation/checkstyle/formatting have not run; planner bootstrap/worker callbacks, numeric source identity, real completeness, model reservation behavior and added setup time need execution against unchanged main. Any failure remains a named finding; no case or assertion may be removed or weakened.

Not performed: any real backend/frontend/runner source write, main edit, test/build/formatter, Docker operation, external provider/model call, process signal, git write or story lifecycle change. Only this task's evidence folder was written. The T0-DEV review was completed separately at `../T0-DEV/check.md` and `check.json`.
