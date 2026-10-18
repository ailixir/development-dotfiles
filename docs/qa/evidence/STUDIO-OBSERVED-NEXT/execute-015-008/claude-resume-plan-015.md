# Claude Code resume plan for STUDIO-OBS-015 (to an independent QA verdict)

Author: Aria (@architect), read-mostly. Written 2026-10-15 (local) / 2026-10-16 UTC. This plan releases no source, grants no QA credit and changes no lifecycle. Inputs: `RESUME-HANDOFF.md`, the story, `current-gap-plan01/{review.md,next-batches.json,requirement-map.json}`, `validation-ledger.json`, `b1a-callback-seam01/`, `durable-backend-job.py`, `runtime-supervision01/design.md`, feedback06 intent.

## 0. What I checked at resume

| Check | Result | How |
|---|---|---|
| 5 handoff source hashes | **All 5 match** (Translation d8c494…, ReplayIT f27968…, AuthorityIT e62281…, Planning 1b5870…, build.gradle.kts 1cc4ce…) | `shasum -a 256` on each path |
| Supervisor draft | sha 70dbb1e8…, 19,740 bytes, same as at the pause | `shasum`, `wc -c` |
| Docker | Server 27.4.0, context `desktop-linux`, reachable | `docker version` |
| actual06 Testcontainers DB | `a9c1af028bdd` (postgres:15-alpine, created 2026-10-16T01:33:47Z, TC session 690dfd68…) is **Exited (255)**. Five older TC PG containers are also exited. This settles the earlier "unconfirmed" state: none are running. Leave them in place; removing them needs root approval. | `docker ps -a` (read-only) |
| Live test processes | No Gradle wrapper, collector, vitest or supervisor process from this workspace. PID 22246 (inherited Gradle daemon on `~/.jdks` JDK) is live: **never signal it**. | `ps` (read-only) |
| JDK used by the harness | `/opt/homebrew/opt/openjdk@21/.../bin/java` is present | `ls` |
| Media decoder, Helm | `ffmpeg`/`ffprobe` and `helm` are present. `kind` is absent, but the deployment tier does not need a cluster (it runs `helm template` plus docker) | `which`, grep of `test/deployment` |
| Runner base image | `mcr.microsoft.com/playwright:v1.63.0-noble` is cached locally | `docker images` |

**Inferred (from reading the source; not executed):** the JOIN class gets "Core" from an in-JVM `HttpServer` (`CORE_CALLS`) and "Vault" from in-JVM `FakeStudioVaultProvider`/`CountedLoginVault` (ReplayIT:846-875, 1256). PostgreSQL is Testcontainers `postgres:15-alpine`. So **every B1/B2/B3 run needs only Docker locally**. No real Citi Core, COIN or HashiCorp Vault exists here. See section 6.

## 1. Durable supervisor: **DROP** (recommendation)

No AC, ledger subject or gate references `durable-backend-job.py`. It was built only to survive tool-handle loss in the old harness. In Claude Code, `Bash run_in_background` tracks the process, writes its output to a file and notifies on exit. The existing collector `run-backend-tasked.py` already writes the authoritative receipt: exit, source/dist stability, fresh XML/HTML/exec/cohort archive and refusal to reuse a label. If a receipt is missing, that already means interrupted, so it can never become false credit. Prior focused runs were short (actual05: 247 s for 32 tests). If the session dies mid-run, the remedy is a fresh label, not reattachment.

- Keep the draft file and `runtime-supervision01/` unchanged as historical evidence. Root records one line in `execution-state.json`: "UNFINISHED/UNREVIEWED, superseded by harness background execution, not used for any run". Do not finish it, review it or delete it.
- Trade-off: background Bash does not survive the death of the Claude Code process itself. That is accepted, because a lost run is simply re-run under a new label. Old intents `gage015-durable-runtime01` and `aria015-durable-runtime-review01` are retired.
- (Also process scaffolding: `node tools/aiox-local.cjs sdc preflight …` exists and is cheap. Keeping it per dispatch is the coordinator's call, and no AC depends on it.)

## 2. Invariants every lane must respect

1. **Global source freeze during any run.** `run-backend.py` captures the whole-repo source+dist manifest before and after (`capture-manifest.py`). If any file changes anywhere during a run, `sourceStable=false` and the run is RED. So **no agent may edit any tracked source file while a backend or runner run is live**, even in a "disjoint" file. Authors who need to work during a run draft in the scratchpad and apply only after the run is terminal.
2. **One Gradle invocation at a time** in this checkout (shared `backend/build`, daemon, cohort dirs, and the CPU-sensitive JOIN). Several test tasks *can* share one invocation: `--continue test --tests A guidedIncrementalTest --tests B`, with `--test-tasks test,guidedIncrementalTest` (actual05 precedent).
3. Runner `build` and `test:fixtures` rewrite `studio-runner/dist`. They are **never concurrent with a backend JOIN run**, and the resulting dist is frozen before the next JOIN run.
4. Fresh unique label per run (the collector refuses reuse). Never reuse `…attempt06`. Never resend original04 UNKNOWN admissions. Keep the actual05 archive-then-restore recipe for prior `backend/build` outputs (`attempt05-receipt.json#/restoration`, `runtime06-recovery01/*prior-output-restoration.json`).
5. New JOIN methods require **two files**: ReplayIT, plus `build.gradle.kts` lane registration (`joinedIncrementalMethods`/`joinedPrefixSyncMethods`/`joinedDefaultMethods` and the `requireFreshGuidedPartitions` expected set). Otherwise final `check` fails with "JOIN partition omission". Both files have **one writer** (Dex-JOIN).
6. Formatting: run `./gradlew spotlessCheck` in the author's own window only. `spotlessApply` rewrites all of `src/**`, so it must not run while another author is writing.
7. Runner commands use `pnpm run <script>` (the same package.json scripts as the recorded `npm run …`; no install, no lockfile write), per the user's pnpm rule. The runner has `package-lock.json`.

Collector form (repo root, `Bash run_in_background: true`):
`python3 .aiox/sdc/STUDIO-OBSERVED-ORCH/execute-015-008/run-backend-tasked.py <LABEL> --test-tasks <t1[,t2]> --require-exec-tasks <t1[,t2]> -- [--continue] <gradle args>`
`J=com.citi.put.checks.studio.guided.publication`

## 3. Open obligations for 015

Requirement-map baseline (86 subjects): 22 captured-green-needs-regate · 28 implemented-unrun · 7 not-reviewed · 28 source gap · 1 user decision (row 85). IPC 24: 19 regate / 2 unrun / 3 gap (P03, N01 → B3c; P08 → B2b). SQL 55: all regate. Private routes 15: 1 regate / 3 unrun / 11 gap (B3a/B3b).

| ID | Obligation (ledger idx) | Source/test work | Owner | Files | Command(s) | External dep |
|---|---|---|---|---|---|---|
| R1 | Frozen-source run: actual06 objectives under a fresh label **plus** the full 42-low (whole 35-label method incl. UNRUN `append-input` pending-accounting transfer) and the 43-default JOIN | none (test the four repairs at JOIN f279) | root runtime (aiox-dev backend executes) | read-only | `… run-backend-tasked.py backend-join85-frozen-attempt07 --test-tasks test,guidedIncrementalTest --require-exec-tasks test,guidedIncrementalTest -- --continue test --tests $J.GuidedPublicationReplayIT guidedIncrementalTest` | Docker only |
| R1-min (fallback) | Exact actual06 intent: 7 singletons, fresh label | none | same | read-only | the 7 `--tests` selectors from `backend015-prefix-sync-core-feedback06-intent.txt`, label `backend-prefix-sync-core-feedback-attempt07`, `--test-tasks guidedIncrementalTest` | Docker |
| FIX-R1 | Any R1 failure (test setup or assertion). A production defect only if established. | depends on R1 | aiox-dev backend (Dex-JOIN); Dara if the failure is in `support/GuidedPublicationEvidenceFixture`/V21 | ReplayIT (+ fixture/V21 only via Dara) | rerun the failing selectors + regression in the next run | Docker |
| B1a | (16) prefix callbacks keep `REPLAYING_PREFIX`; SOURCE_PLAN/proposal/direct reservation fences | **Design re-review first** (Quinn; no QA-design manifest exists). Then add `incrementalPrefixCallbacksKeepStateAndFenceBothReservations` (low lane) per `b1a-callback-seam01/review.md` | Quinn → Dex-JOIN | ReplayIT, build.gradle.kts | `guidedIncrementalTest --tests $J.GuidedPublicationReplayIT.incrementalPrefixCallbacksKeepStateAndFenceBothReservations` | Docker |
| B1b | (20, 48, 54) next-unconsumed-coordinate recovery, concurrent drift one switch, exact authority matrix, excluded-attempt joins. **Also the explicit OPEN: the exact ADMITTED/done/refresh/recovery matrix** | 4 new methods (names in next-batches B1b) | Aria design → Dex-JOIN | ReplayIT, build.gradle.kts | same pattern, new selectors | Docker |
| B1c | (26, 27, 80, 81, 82) step-2 assertion fail, prefix redirect/navigation/password-policy refusals, fresh post-consent hostile guards, changed context/generation + natural owner-lease expiry | 4 new methods. Lease expiry needs a root-approved **observation** seam (no clock or policy shortening). | Aria design → Dex-JOIN | ReplayIT, build.gradle.kts | same | Docker |
| B1d | (55, 56) EMPTY_PREFIX program/hash pair over every delivery; BOUNDARY/EMPTY_PREFIX SOURCE_PLAN failure result | 2 new methods, no schema change | Dex-JOIN | ReplayIT, build.gradle.kts | same | Docker |
| B2a | (28, 45) incremental secret-prefix Vault fault oracles; version-1 use survives suffix version-2 ACK. **Also the explicit OPENs: combined secret-grant/fresh-producer ACK cut; separate worker-current-access secret parent** (`prefix-sync-access-mapping-decision.json`) | 2 new methods + lawful P3 secret parent/cut (design first) | Aria design → Dex-JOIN | ReplayIT, build.gradle.kts | same | Docker. "Vault" = in-JVM fake (see section 6) |
| B2b | (18, 46, 68, 77; IPC P08) append retry/expired preparation; plain/context canaries in every sink | 2 new methods; keep the lawful append-input transfer, with no illegal prefix-append seed | Dex-JOIN | ReplayIT, build.gradle.kts | same | Docker |
| B3a | (31, 42, 52, 60; private routes) stored private history/source-manifest preimage at real PG | 2 new methods in **AuthorityIT only**; HTTP-only remainder goes back to B3b | Dex-AUTH (separate agent, exclusive file) | AuthorityIT | `test --tests $J.GuidedPublicationAuthorityIT` (24 → 26 methods) | Docker |
| B3b | (43, 61, 63, 72, 73, 75; private routes) base/source/alias/CAS substitutions, older equal-hash base, nonempty-prefix drift-at-1, hidden orphan, concurrent first suffix, later pair deletion | 3 new methods | Dex-JOIN | ReplayIT, build.gradle.kts | same pattern | Docker |
| B3c | (76; IPC P03, N01) partial-drift-step read publishes and replays twice; native0/native1 identities + **actual per-admission media seek** (absent stamp ⇒ no seek) | 2 new methods + test-owned media probe | Dex-JOIN | ReplayIT, build.gradle.kts | same | Docker, local ffmpeg |
| B4/R2 | (57–59, 64–67, 51, 53 …) regate only. **No new source** (superseded flags) | none | root runtime | — | covered by the final `check` | — |
| UNRUN-28 | 28 implemented-unrun subjects (14, 15, 19, 21–25, 29, 30, 32, 34, 36–41, 44, 49, 50, 62, 69–71, 74, 78, 79) | none unless they fail | runtime | — | covered by R1 (JOIN) + final `check` (`StudioAuthoringApiIT` etc.); 34 by `test:fixtures` | Docker |
| NR-7 | (12, 17, 33, 35, 47, 83, 84) not-reviewed fan-in | read-only clause mapping | aiox-qa (Quinn) | none | evidence from final gates; SQL55 below | — |
| SQL55 | 55 migration methods, regate | none (Dara owns any fix) | aiox-data-engineer | V21 + migration IT (Dara) | `cd backend && ./gradlew test --tests com.citi.put.checks.studio.guided.GuidedReplayingPrefixMigrationIT --rerun-tasks` (optional, before final; final `check` still required) | Docker |
| O-1/M12 | test drop/port counts from final XML; M12 grep rerun at HEAD | story Dev Agent Record, File List, checkboxes | Dex | story (Dex sections only) | `grep -rn -i "legacy" backend/src/main/java/com/citi/put/checks/studio studio-runner/src frontend/src` | — |
| ROW85 | (85) positive actual timing tie | **User choice (section 5)** first. Option B adds a design + 1 characterization method. | user → Pax/Aria/Quinn → Dex-JOIN | ReplayIT (+ build.gradle.kts) if B | n/a until decided | — |
| FINAL | full source-frozen gates (section 4, wave 6) | none | root runtime + runner + data | — | see wave 6 | Docker, Helm, network for the image build (see section 6) |
| QA | independent formal 015 gate, then Pax admin close, then Orion root | — | aiox-qa → po → master | story QA Results/Status | — | — |

Projected JOIN inventory after B1–B3c: 43 default + 42 low + 20 new = **105 identities** (B1a 1, B1b 4, B1c 4, B1d 2, B2a 2, B2b 2, B3b 3, B3c 2; lane per design, default low/2048), plus 1 more if row 85 = B. AuthorityIT: 24 → 26.

## 4. Waves

| Wave | Parallel lanes (no Gradle overlap) | Gradle/runtime (serialized) | Exit criterion |
|---|---|---|---|
| **W0** now (≈ minutes) | (a) root: record the supervisor DROP + Docker/container facts; **ask the user the row-85 question**. (b) Quinn: B1a design re-review (`quinn015-b1a-design-review01-intent.txt`, read-only). (c) Aria: read-only designs for B1b, B1c, B1d, B2a (incl. the 2 secret OPENs), B2b, B3b, B3c; these can be several Aria instances, one per batch, each writing only `backend/<batch>-design01/`. | none; source stays frozen | designs + B1a review on file |
| **W1** | design work from W0 continues (read-only only; **no source edits**) | **R1** (85 JOIN at frozen f279), background | receipt written; failures triaged |
| **W2** source window | Dex-JOIN: FIX-R1 + B1a (ReplayIT, build.gradle.kts). Dex-AUTH: B3a (AuthorityIT). Disjoint files, so they run in parallel. Quinn: source review of each as it freezes. Dara: only if R1 implicates fixture/V21. | none | both sources frozen + Quinn source review |
| **W3** | Dex-JOIN may *draft* B1b–B1d in the scratchpad | **R2**: `--continue test --tests $J.GuidedPublicationAuthorityIT guidedIncrementalTest --tests $J.GuidedPublicationReplayIT.incrementalPrefixCallbacksKeepStateAndFenceBothReservations` (+ any R1-failed selectors) | green or triaged |
| **W4** source window | Dex-JOIN applies **B1b+B1c+B1d** (one window, three batches); Quinn reviews | **R3**: their new selectors (+ R1 Core singletons as regression) | — |
| **W5** source windows | Dex-JOIN: **B2a+B2b** → **R4**; then **B3b+B3c** (+ row-85 option-B method if chosen) → **R5**. Each window is followed by its run. | R4, R5 | all source gaps closed |
| **W6** final, source-frozen | Step 1, parallel (read-only, no dist write): `cd studio-runner && pnpm run type-check`, `pnpm run lint`, `pnpm test`; and `node tools/check-studio-observed-contracts.cjs` (repo root). | Step 2, serial: `pnpm run build` → `pnpm run check:pins` → `pnpm run test:fixtures` (globalSetup re-emits dist; record and freeze the dist hash). Step 3: backend `… run-backend-tasked.py backend-final-check-attempt01 --test-tasks test,guidedIncrementalTest,crossReplicaTest --require-exec-tasks test,guidedIncrementalTest -- check --rerun-tasks`. Step 4: `docker build` runner image → `pnpm run check:pins -- --require-image` inside the image → `STUDIO_RUNNER_IMAGE=<tag> pnpm run test:deployment`. | all gates green at one frozen source+dist |
| **W7** | Dex: Dev Agent Record/File List/O-1 counts/M12 · Quinn: formal 015 gate over 86/24/55/105 JOIN/15 routes | — | QA verdict → Pax close → Orion root → 008 release |

Shareable in one Gradle invocation: any mix of `test --tests …` and `guidedIncrementalTest --tests …` selectors (R2–R5). `crossReplicaTest` is only needed in the final `check`. Not shareable or concurrent: two collector runs; any run plus any source edit; a JOIN run plus runner `build`/`test:fixtures`; a JOIN run plus heavy runner vitest (CPU contention has caused JOIN flakes before; see `backend-b4-runner-cpu-exclusions.json`).

Batching trade-off: the gap plan wanted a held handoff per batch (B1a→B1b→…). This plan groups them into 4 source windows (B1a | B1b–d | B2a–b | B3b–c). That gives fewer runs and less orchestration, but a failure costs more triage per window. If a window's run fails broadly, split it back into per-batch runs.

## 5. Row 85: the one question for the user

> Row 85 requires a *real production* run in which two distinct admissions record the exact same timing key (`startMs, action, ordinal, stepId`) and both carry through to video seek. Product safety rules make that impossible to produce lawfully: the replaceable attempt never starts natively, so it has no timestamp. A second native effect would break at-most-once, and faking a stamp is forbidden. Choose one:
> **A. Keep row 85 as frozen.** It stays OPEN, and 015 cannot reach the all-green PASS you asked for unless someone finds a lawful production path. None has been found.
> **B. Approve the reviewed amendment.** The positive tie is shown by a separately labelled, fixture-owned run that uses the real recorder, real clock, real callback/backend/result and real media seek, at lower native-admission authority. All production native0/no-stamp/replacement/video/seek proofs stay. The tie is probabilistic: one fixed batch, no repeat-until-tie. If no tie occurs, row 85 still fails.
> **C. Waive or descope the positive-tie clause only.** This is your call alone. The reviewers excluded it because of your earlier "all planned QA green, no waiver" instruction.

Sources: `po-recording85-clarification01/{clarification.md,scope-decision.json}`, `aria-review/`, `qa-review/`. Under A, the rest of the plan still runs; only the final verdict is affected.

## 6. Genuinely external or user-gated items (cannot be closed locally)

| Item | Why it is external/gated | Proposed handling |
|---|---|---|
| Row 85 | user decision (section 5) | ask in W0 |
| "Real Core / real Vault / private authority" readings | Tests use an in-JVM Core HttpServer and a fake Vault. The gap plan itself says local authenticated HTTP "is not Core/Vault authority". | Quinn must state up front, in W0, whether the ledger tiers ("test Vault", "actual Core") are satisfied by these in-repo fixtures. If Quinn requires real Citi Core/COIN/Vault, that is **external**: escalate to the user, and do not leave it as a silent gap. |
| Runner image build | `docker build` may need npm registry and network access inside the build (base image is cached) | try in W6; if the network is blocked, record image pins/deployment as NOT_ASSERTED and escalate |
| Deployment tier | needs `helm` + docker + the built image (all local; no cluster) | local in W6 |
| Leftover exited TC containers (6) | harmless; deleting them is a destructive cleanup | leave; root may approve `docker rm` later |

Everything else (B1–B3, R1–R5, SQL55, contracts, runner unit/fixtures, final `check`, M12, QA) is **local with Docker only**.
