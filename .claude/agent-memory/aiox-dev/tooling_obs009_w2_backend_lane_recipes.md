---
name: tooling-obs009-w2-backend-lane-recipes
description: 009 W2 B/BL backend lane traps - ack schema wants decimal revisions, acknowledgeContext needs translation, in-lock multi-file mutation script, per-lane checkstyle noise
metadata:
  type: project
---

From STUDIO-OBS-009 W2 lanes B and BL (2026-10-18).

- **Backend focused Gradle runs are fast when the lock is free** (50 s for 6 classes, 9 min for 33 classes including `GuidedServiceTransportFaultIT` 39 and `GuidedSessionIT` 44). Run the red batch first with the old main and old constructor calls, then change main and the constructor calls together.
- **`ContextAcknowledgement` pins `sourceRevision` and `configurationRevision` to decimal strings** (`^(0|[1-9][0-9]{0,18})$`), and the fixture `secretReference` in `fixtures.json` names `configurationRevision: "config-1"`. A guided fixture that must acknowledge a delivery needs numeric revisions and a copy of the reference with the same `configurationRevision`. The PR-BE `"source-1"` fixture cannot acknowledge (`INVALID_CONTRACT`, then `REVISION_CONFLICT` if only half is fixed).
- **`GuidedSessionService.acknowledgeContext` and `contextDeliveryId` go through `translationTransaction`**, which needs `installTranslation`. A light fixture without it should call `GuidedMaterializationService.acknowledge(repository.lock(id).document(), ack)` inside `repository.transaction` and read the id with `pendingDeliveryId`. A head-3 session: acknowledge v2, then run the same SQL append and `runnerContext` again.
- **In-lock mutation script** (kept in `execution-20261018/b/mutations/mutate_multi.py`): takes a JSON spec of exact-once text replacements over several files, applies them, runs `./gradlew` in `backend/`, copies the fresh XML, and restores every file in `finally` with a sha assert. Run it through `with-gradle-lock.py`, so no other lane's Gradle ever compiles a mutated tree. Mutations in disjoint test classes can share one run.
- **`checkstyleMain` and `spotlessCheck` are project-wide.** Another lane's half-done file (D3's `GuidedSessionConfiguration.java:292`, `factory -> {}`) fails `checkstyleMain` for everyone. Report it as a finding, never edit it.
- **A mock of `SecretAuditLifecycle` works** (the class is `final`; Mockito 5 inline) when a test needs the terminal document the session service hands to `guidedTerminal`.
- **zsh does not word-split** in the Bash tool: for gjf over a file list put the paths in a file and read them in a bash script (`scratchpad/dex-w2-b/fmtcheck.sh`). `gjf.sh -n` lists unclean files; `--replace` fixes them. Check first that the diff is only your text.

**Why:** these cost a red/green round each. **How to apply:** any W2/W3 guided backend lane that needs a pending append, an acknowledgement or a mutation check. Related: [[tooling-gradle-focused-runs]], [[tooling-javac-precheck-outside-lock]], [[tooling-parallel-merge-patches]].
