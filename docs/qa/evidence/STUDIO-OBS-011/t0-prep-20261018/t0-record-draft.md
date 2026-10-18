# STUDIO-OBS-011 11-T0 record: DRAFT for root to sign at the start digest

- **Prepared by:** Aria (@architect), 2026-10-18, YOLO, docs only.
- **Status:** DRAFT. It binds once root fills every `<…>` placeholder, takes the signed copy to `docs/qa/evidence/STUDIO-OBS-011/t0-<date>/t0-record.md`, and signs §13.
- **Companions:**
  - `lanes.v2.json` (lanes, schedule, critical path);
  - `w-brief.v2.md` (lane rules);
  - `t0-proposal.md` (original rulings; amended here in §5).
- **Inputs folded:**
  - `qa-cosign.md` C1–C8;
  - `dev-cosign.md` RC-1–RC-10 and N-1–N-7;
  - `devops-cosign.md` D-1–D-6, X-1–X-10, landing order, commit grouping;
  - `po-ratification.md` RD-1–RD-4 and P-1–P-12;
  - user decisions in `docs/qa/evidence/STUDIO-OBS-009/execution-20261018/w0/decisions.md`: R4 local commits, no push; 011 Docker on U22 terms.
- **Legend:**
  - **[V]** Aria read the bytes or ran grep/find/cat today (2026-10-18, before G9 exit).
  - **[I]** inference.
  - **[A]** taken from a co-signer without re-checking.
  - **`<…>`** filled at T0.
- **Not run by Aria:** no node, python, gradle, vitest, helm, docker or jq. The JSON of `lanes.v2.json` was checked only by grep bracket counts (balanced: `{}` 59/59, `[]` 168/168; no invalid escapes). It was not parsed. @dev parses it at T0.

---

## 1. Pre-start order (root decision, 2026-10-18). All must be ticked before §2

| # | Step | Evidence (root fills) |
|---|---|---|
| 1 | G9 ruled | `<G9 ruling path>`, verdict `<…>`. The two FAILED cases known at 15:55 [A Quinn]: `GuidedPublicationReplayIT.actualSecretLoginPublishesValueFreeAndTwoOrdinaryRunsResolveFreshWithoutModel`, `GuidedServiceTransportFaultIT.actualConsumedGuidedControllerJvmCrashBeforeSecretDecisionReconcilesWithoutRereadOrPost`; their ruling: `<…>` |
| 2 | `g9-image.sh` run against the unchanged G9 tree (X-1) | `local-gate-20261018/image/summary.json` verdict `<…>`; `C4b-runner-deployment exit=<n>`; `D2-smoke exit=<n>`. **Note [V]:** the script exists only in a session scratchpad (`/private/tmp/claude-501/…/scratchpad/g9-image.sh`, 20,953 bytes, 15:25). Root copies it into `local-gate-20261018/image/` first and records its sha256: `<sha>` |
| 3 | 009 residue landed: model-sizing, catalog-entry, chart (+ untracked `templates/api-guided-tls-networkpolicy.yaml`), tests, consensus 8.3; `git apply --check` before each; one dist rebuild; deployment tier first green (X-3); runbook §14 UAT deploy note (X-6) | patch shas `<…>`; `D_009r = <dist digest>`; deployment run `<label>` exit `<n>`; image used `<tag>` (see OI-1) |
| 4 | 010 Live surface list re-dated over the post-residue tree (X-4) | `<path>`, sha `<…>`, date `<…>` |
| 5 | R4 local checkpoint commits by @devops: 7 categories, staged by path, no push; `dispatch-governance.js` not staged | commit list `<sha subject>` × `<n>`; `R4_HEAD = <sha>`; `git status --short` after: `<remaining entries and why>` |
| 5a | execute-011 collectors made (C5): `run-backend-tasked.py` `:92` **and** `:112`, `run-backend.py:6`, `run-runner.py:5`, `run-runner-build.py` repointed; execute-008 lock kept; `run-frontend.py` made or the manual frontend record adopted | `.aiox/sdc/STUDIO-OBSERVED-ORCH/execute-011/` file shas `<…>`; output path announced: `docs/qa/evidence/STUDIO-OBS-011/execution-<date>/execution` |

## 2. Start digest set S_011 (R-T0-1, C1)

| Item | Value |
|---|---|
| HEAD | `<R4_HEAD>` |
| capture-manifest source digest | `<…>` (`<n>` files) |
| dist digest | `<…>` (must equal `D_009r`) |
| helm sha (same command as G9 `helm-before`) | `<…>` (G9 value `8dbe073c…` [V `status.txt`]; expected to differ after the chart patch) |
| quoted-docs shas: every `COPY_SOURCE_FILES` path [V list at `guidedNarratives.ts:46-62`], stories read by tests, `docs/qa/accessibility/*`, `CLAUDE.md`, `ARCH.md`, `docs/runbooks/*` | `<table file path>` |
| runner image for B4 | `<tag>`, built from studio-runner digest `<…>` (T0-IMG) |
| capture time, `uptime`, `vm_stat` | `<…>` |

From here on, any tree edit before W1 voids S_011 and the baselines.

## 3. Fresh baselines (R-T0-2 v2, C7). G9 is not reused

All run sequentially with nothing else running. The B1 per-class times are the AC-5 "before".

| Id | Label | Digest before = after = S_011? | Exit | Counts (tests / skipped / failed) | Reds by name |
|---|---|---|---|---|---|
| B1 backend `check` (`test,guidedIncrementalTest,crossReplicaTest`, `--rerun-tasks`) | `obs011-t0-baseline-check01` | `<y/n>` | `<n>` | `<…>` | `<…>` |
| B2 runner unit | `obs011-t0-runner-unit01` | | | `<…>` (skipped expected 29 pre-R-40 [A]) | |
| B3 runner fixtures | `obs011-t0-runner-fixtures01` | | | | |
| B4 runner deployment | `obs011-t0-runner-deploy01` or `NOT_MET: image prerequisite` + names | | | | |
| B5 runner type-check, lint, `check:pins` | manual record | | | | |
| B6 contracts + codegen check | manual record | | | | |
| B7 frontend vitest (json), type-check, lint, build, ad hoc `tsc --noUnused…` | `obs011-t0-frontend01` or manual record (node `<version>`) | | | | |

- **Reds:** a red in B1–B7 is recorded by name. It must be green at 11-G and is never waived there. If it is in a lane-owned test file, that lane owns its stabilisation if the cause is in the test (brief, hard rules).
- **Approved skips (@qa):** `t0-<date>/qa/approved-skips.json` is derived from the B1 skip multiset and reviewed against 009's ruled list: `<sha>`.

## 4. T0 checks

| Id | Check | Result |
|---|---|---|
| T0-AW | Awaitility on `testCompileClasspath`, offline. **Pre-check [V]:** `spring-boot-starter-test-3.3.5.pom:86-91` declares `org.awaitility:awaitility:4.2.2` scope compile; jar and pom are in `~/.gradle/caches/modules-2/files-2.1/org.awaitility/awaitility/4.2.2/`; `build.gradle.kts:85` declares `spring-boot-starter-test` (Boot plugin 3.3.5 at `:7`); no repo test imports `org.awaitility` today. **Not verified:** actual resolution | `<line from dependencies --offline>` → branch `<A|B>` |
| T0-JC | `dispatch` package LINE ratio / bundle ratio from the B1 jacoco XML | `<…>` / `<…>` → `obs011-foldf-cov01` `<needed / not needed>` |
| T0-SL | `grep -c '\.sleep('` for the nine R-5 classes. Pre-residue [V]: ReplayIT 95 (94 `Thread.sleep`) | `<per file>` |
| T0-P7 | P7 tests [V]: `actualPoolDefiniteRefusalThenFreshSecretAttemptResolvesRotatedValue` (`@Order(27)`) and `actualScopedVaultOutageThenFreshSecretAttemptResolvesRotatedValue` (`@Order(28)`), both through `p7CapturedFaultAndRetry`, sharing static `P7_OUTAGE_SCOPE` | re-confirmed `<y/n>` |
| T0-FQ | declared package of every FQCN in `lanes.v2.json` | `<all equal / list>` |
| T0-RB | `fixtures.json` `AWAITING_AUTH` row: negative row [A Dex] → guard text, keep | re-read at `<line>` |
| T0-IMG | B4 image matches the start studio-runner tree | `<…>` |
| T0-SB | runner and frontend sandbox input lists | `<path to lists>` |
| T0-EP | written confirmation from the 009 T4 harness owner that T4 uses neither `browser-oracle.test.mjs` nor `example-manifest.json` (P-10) | `<owner, date, text>` or "none → both carried" |
| Live surface | R-T0-3 intersection of every `lanes.v2.json` write set with the re-dated list | `<0 / items stopped by name>` |
| reverify | `lanes.json` v1 `t0.reverifyCommands` per row | `<path>` |

## 5. Amended rulings and conflict rulings

### 5.1 Amended rulings (they replace the `t0-proposal.md` text of the same id)

- **R-T0-2 v2: baselines.** Always fresh at S_011 (§3), by root's ordering decision. Quinn's five reuse conditions become start-capture completeness rules:
  - helm sha and quoted-docs shas are in S_011;
  - reds are recorded by name;
  - the deployment tier runs with an image or is `NOT_MET` by name;
  - patches are applied before the capture;
  - the load is recorded.
- **R-T0-4 v2: evidence.** As v1, plus the F-1 freeze window runs `obs011-gsm-b01..b03` are credited (C4).
- **R-T0-5 v2: collectors.** The execute-011 copies are mandatory (RD-4), with every hard-coded 009 path repointed (C5).
- **R-T0-6 v2: sandboxes.** The runner sandbox adds `helm-chart/` and the referenced evidence subpaths. The frontend sandbox is repo-shaped. Copies only (RC-6).
- **R-F1 v2: F-1 shape** (RC-4 + C3 + R-F1).
  - **One private helper `requireTranslation(id)`.** It is the only place `translation != null &&` remains. The three existing guards (`:177`, `:191`, `:405`, pre-start anchors) are converted to it.
  - **New calls, one per operation.** Each is the **first statement of the operation's transaction lambda, before any validation or SPI call** (for admission: before `bindings.validateAction`, `preparations.authorize` and `access.authorizeAction`). The operations [V, pre-start lines]:
    - `sideEffectConfirmation` (former `:370`);
    - `clarify` (one call covering former `:846` and `:880`, both inside `clarify` at `:791`);
    - `admitChecked` (former `:1442`);
    - `bootstrap` (former `:2013`).
  - **Grep targets:** `requireTranslation(` call sites = 7, plus 1 declaration; `translation != null` = 1. Positive control: 0 at the start digest.
  - **Negative IT** `GuidedAdmissionWithoutTranslationIT` has 5 cases, one per former site, covering all four operations. Each asserts `409 RUNTIME_INCOMPATIBLE` and zero new rows in the action, admission and preparation tables. The admission case also asserts that `authorizeAction` was never invoked.
  - **Row-count rationale corrected:** every site runs inside `repository.transaction`, so a refusal rolls back any write wherever it sits [A Dex, `GuidedSessionRepository.java:34`]. Placement matters for side effects that run before the writes, not for the row counts.
  - **R-F1.3 is unchanged:** the `instanceof` arms stay.
- **R-4a v2: one runner client** (RC-2).
  1. Per-operation endpoint, credential, connect timeout and HTTP version are preserved. "One transport" means one TLS material and one client class, which may hold one `HttpClient` per distinct setting. The before/after transport table is a lane proof.
  2. Guided operations stay gated by `runner-origin`. The `unavailableGuidedRunnerClient` 409 behaviour is preserved.
  3. `maxValidationBytes` and `validationTimeoutMs` are passed per call; `GuidedPublicationProperties` is never injected into a worker bean.
  4. The existing 3-arg and 4-arg public constructors stay, so `JobBodyLeakTest`, `StudioRunnerPropertiesProfileTest`, `HttpRunnerDispatchClientTest` and `RunnerTlsClientCertIT` callers are untouched.
  5. `observeRequestBytes` stays package-private in `dispatch`. The `guided.bridge` tests reach it through a new test-side `dispatch/DispatchTestAccess.java` (FOLD-final), so main visibility does not widen. `definiteContextRefusal`, `closedContextRefusal` and `CONTEXT_REFUSED` stay public (main callers in other packages).
  6. `JobBodyLeakTest` is in `foldp-01` and `foldf-01`.
- **R-4b v2: one authorization seam** (RC-1).
  - `DispatchAuthorization` gains all three publication methods: `fresh`, `authorizePublication` and `authorizeReceiptRead`.
  - `ProvisionalDispatchAuthorization` stays an unconditional `@Component`. It delegates the three methods to a `PublicationGrantAuthority` collaborator (new, in `guided.publication`, registered by `GuidedPublicationConfiguration` under `!worker`), obtained through `ObjectProvider`/setter injection in the CLN-18 style.
  - When the collaborator is absent (worker profile), the three methods refuse `RUNTIME_INCOMPATIBLE` 409: fail closed.
  - **Recorded trade-off:** this adds a type dependency `dispatch → guided.publication` (a package cycle; no ArchUnit rule exists [A Dex]). It is accepted because AC-4 b asks for one seam, and breaking the cycle would mean moving `PublicationContracts.Grant`, which is new scope. Not opened as a follow-up.
  - **Worker gate:** `GuidedScheduledBeansProfileTest`, in `foldp-02` and `foldf-01`. The ReplayIT worker assertion (pre-start `:32463`) is on the proof list.
- **R-5w v2: wait library** (RC-5; the user's instruction).
  - The v1 reason ("no Awaitility, a build change would be needed") is withdrawn: no build change is needed either way [V pom; resolution [I] until T0-AW].
  - **Branch A (T0-AW pass):** Awaitility directly, no `Await.java`, no `build.gradle.kts` edit.
  - **Branch B (fail):** `Await.java` is landed by **11-LEFT** on W1 day 1, as an ADAPT of the existing loop.
  - **Effect:** the wait library leaves 11-IT-R entirely. 11-IT-S and 11-GS-T2 no longer wait on IT-R.
- **R-EP v2: compile-era evaluation layer** (RC-8 + P-10).
  - **11-RT deletes only** `browser-oracle.test.mjs` and `example-manifest.json`, and only with the T0-EP confirmation. It edits only the `evaluation/README.md:45` sentence.
  - **Carried forward** (owner @dev, with @qa for the corpus; reason: the 009 harness is live, since model-sizing edits `cli.mjs` and the README, and the P-10 guard applies):
    - `oracle.mjs`, `oracle.test.mjs`, `report.mjs`, `report.d.mts`, `test/evaluation/report.test.ts`;
    - the `cli.mjs` command removal.
  - `fixture-server.mjs` stays.
  - **AC-7 known exception:** the `cli.mjs:29` comment.
  - `evaluate.d.mts:2` needs no edit: its `report.d.mts` precedent still exists [V].
  - **11-DOC:** fixes only the "complete API lifecycle" clause at `studio-inference-rollout.md:137` [V].
- **R-5 v2.** The census uses `\.sleep(`: ReplayIT has 95 [V]. TEST-001 names are in §4 T0-P7.
- **R-11 v2.** The reason is "duplicate pair; the unlearned state is no longer scanned; accepted under ADR-SC-006" (Quinn 4.4).
- **R-21, R-B, R-F2, R-J, R-9, R-09-2, R-09-4, R-08-1e, R-08-3, R-C5, R-CO, R-AI, R-10, R-3:** unchanged. Their mutation, red and verify additions are in `lanes.v2.json`.

### 5.2 Conflict rulings between co-signers

| # | Conflict | Ruling | Why |
|---|---|---|---|
| K-1 | Baseline reuse: Aria R-T0-2 (reuse on equal digest) vs Quinn C1 (five conditions) vs Gage X-2 / Dex RC-7 (residue first voids reuse) | **Fresh baselines; no reuse** (root order). Quinn's conditions become capture completeness rules (§5.1). | The residue changes source, dist and helm digests, so reuse is impossible. Cost: about 3.5–4 h of W0 [I]. |
| K-2 | Wait library: Aria (in-repo, no Awaitility) vs Dex (Awaitility present) | **Branch on T0-AW**, with branch A preferred. | Dex's premise holds at pom and cache level [V]. Resolution is unverified, hence the check. |
| K-3 | Who lands `Await.java` in branch B: v1 11-IT-R vs Dex 11-GS-T | **11-LEFT, W1 day 1** | GS-T is on the critical path. LEFT has float and already owns `support/` test files. Departs from Dex's suggestion; same effect (the helper lands in W1). |
| K-4 | F-1: Aria R-F1.1/.4/.5 vs Dex RC-4 (placement, helper, site count) vs Quinn C3 (all five sites tested and mutated) | **R-F1 v2** (§5.1) | Merges all three: Dex's placement and helper, Quinn's per-site negative cases and mutants. |
| K-5 | Dist: Aria "single rebuild" vs Dex RC-6 (the fixtures tier re-emits) vs Gage D-2 | **One clean build at 11-MERGE; every later emit keeps `D_011`**; the R-4d emit compare is in RT | Enforceable as written. |
| K-6 | Deployment tier at 11-G: v1 brief "no docker" vs Quinn C2 vs Gage D-1 | **D-1 in 11-MERGE** under the user's 011 Docker decision; 11-G G4 uses that tag | The user authorized it on 2026-10-18. |
| K-7 | CLN-58 owner: Aria 11-FE vs Pax P-8 | **11-MERGE (root)** | Pax's placement; FE works in a sandbox. |
| K-8 | RC-9 runner mentions of `GuidedRunnerClient` (Dex: pick one) | `guidedBrowser.ts:26` comment rewritten by 11-RT to name `HttpRunnerDispatchClient`, as one listed, expected AST comment difference. `test/guided/runtime.test.ts:36` (test title) and `test/fixtures-tier/guidedCloseBound.test.ts:43` (comment) are **AC-7 known exceptions**. | A src comment should not name a deleted class. Renaming a test title is a name change, which 011 forbids. The fixtures file is in no write set. |
| K-9 | CLN-21 record components: Dex "add the test file, or keep the components" vs Quinn C6 | **Add `StudioKillSwitchWiringTest` to 11-LEFT** (arity edit), plus a positional-construction grep | Both preferred it. |
| K-10 | `gsm-a01` runs `GuidedSessionIT` while GS-T edits it (Dex N-2) | **Dropped from a01**; `GuidedObservationPrunerIT` added (N-5) | Avoids red noise; covers the fallback path. |
| K-11 | 11-DOC "staging prohibited" vs Gage D-4 (stage the six copy-table sources by name) | **No conflict.** Lanes never stage anything; D-4 binds @devops's commits. | |
| K-12 | Gage landing step 10 (`git push -f origin main`) | **Out of scope; not authorized.** The user's R4 decision is local commits, no push. | User decision. |
| K-13 | Quinn post-MERGE smoke vs critical path | **Accepted** (`obs011-merge-smoke01`, about 10–12 min at 008 timings [I]) | Finding a red 1 h 45 min into 11-G costs more. |
| K-14 | RC-10 JaCoCo early run | **Conditional on T0-JC** (`dispatch` LINE < 0.80 → `obs011-foldf-cov01`) | Pays the extra run only when the headroom is thin. |
| K-15 | Quinn C4 freeze vs parallel backend lanes | **Accepted**: about 40 min, root-announced; lanes read and plan meanwhile | F-1 d is a G8 proof with no AC-7 exception. |
| K-16 | 11-IT-R XL (Dex) vs the critical path | **Timeboxed, split into read-only prep (W1–W2) and apply (W3, ≤ 2 d, ≤ 6 full-class runs)**; TEST-001 first; POLL remainder carried by name | User instruction; caps the critical-path segment. |

## 6. @qa C1–C8: where each is resolved

| # | Change | Resolved in |
|---|---|---|
| C1 | Reuse conditions | §5.1 R-T0-2 v2 and K-1 (fresh baselines; conditions become capture rules); §2 rows helm and quoted docs |
| C2 | 11-G digest chain, `D_011` equality, executed-tasks grep, archived-XML reconciliation, load record, deployment image | `lanes.v2.json` 11-G G1a, G4, G8, G9 and the `uptime`/`vm_stat` lines; 11-MERGE D-1; K-6 |
| C3 | Red commands, mutation protocol, F-1 five-site coverage, AST self-test, positive greps | `w-brief.v2.md` "Red-first and mutation protocol"; `lanes.v2.json` `commandConventions.RED_FORM`/`MUTANT_FORM`, 11-GS-M `red`/`mutants`, 11-FOLD-prep `red`/`mutants`, 11-RT AST self-test; §5.1 R-F1 v2 |
| C4 | F-1 proof in a write-freeze window, credit quality | `lanes.v2.json` 11-GS-M part b FREEZE WINDOW; `w-brief.v2.md` evidence model; R-T0-4 v2; K-15 |
| C5 | execute-011 repoints every hard-coded path, keeps the 008 lock; frontend collector | §1 step 5a; `lanes.v2.json` `commandConventions` (BK, RR, RB, RFE, rules) |
| C6 | `StudioKillSwitchWiringTest` in 11-LEFT | `lanes.v2.json` 11-LEFT writes + positional grep; K-9 |
| C7 | T0 baseline mirrors the 11-G suite list | §3 B1–B7; `lanes.v2.json` 11-T0 verify |
| C8 | `\.sleep(` census; P7 names; R-11 note; post-MERGE smoke | §4 T0-SL, T0-P7; §5.1 R-5 v2, R-11 v2; `lanes.v2.json` 11-IT-R verify, 11-MERGE smoke; K-13 |

Quinn 4.5 (refusal before `insertAction`; zero-row tables) is in R-F1 v2.

## 7. @dev RC-1–RC-10 (and N-items): where each is resolved

| # | Change | Resolved in |
|---|---|---|
| RC-1 | Worker-profile wiring for the authorization fold; three methods; worker gate | §5.1 R-4b v2; `lanes.v2.json` 11-FOLD-prep writes (`PublicationGrantAuthority`), verify `foldp-02`, `foldf-01`, worker mutant |
| RC-2 | Three transports; timeouts, HTTP version, gating, per-call limits, constructors, visibility, `JobBodyLeakTest` | §5.1 R-4a v2 (1–6); 11-FOLD-prep transport table, prohibited list; 11-FOLD-final `DispatchTestAccess.java` |
| RC-3 | `StudioKillSwitchWiringTest`; `GuidedLifecycleReasonIT`; the still-green pair; production-access migration; GS-T size L; fixture importers | 11-LEFT writes and left-01; 11-GS-T writes, acs, `gst-01`, size; K-9 |
| RC-4 | F-1 placement, transaction rollback, `clarify` single site, helper grep, `recordEvidence` safe | §5.1 R-F1 v2; K-4; 11-GS-M verify and mutants |
| RC-5 | Awaitility present; IDS of the private await copies; helper placement; AC-5 expectation | §5.1 R-5w v2; §4 T0-AW; K-2, K-3; `w-brief.v2.md` "Wait library" (no bonus refactor of copies outside the write sets) |
| RC-6 | Sandbox layouts; dist rule wording; R-4d emit compare | §5.1 R-T0-6 v2; K-5; 11-RT and 11-FE `sandbox`; 11-RT emit compare; T0-SB |
| RC-7 | 009 residue ordering voids reuse | `lanes.v2.json` `preStartOrder` (root order); K-1; §1 steps 2–5 |
| RC-8 | R-EP collides with live 009 harness work | §5.1 R-EP v2; 11-RT `carriedForwardByRC8`; 11-DOC rollout `:137` fix |
| RC-9 | Runner names `GuidedRunnerClient` in three places | K-8; 11-RT writes (`guidedBrowser.ts` comment) and verify (one expected AST difference) |
| RC-10 | JaCoCo `dispatch` headroom | §4 T0-JC; K-14; 11-FOLD-final `obs011-foldf-cov01` |
| N-1 | Staged units under the lock | `w-brief.v2.md` command conventions; `lanes.v2.json` rules |
| N-2 | a01 noise | K-10 |
| N-3 | C-OBS009-1 seam | 11-GS-M acs (part a) |
| N-4 | C-OBS009-2 safe | no change needed (R-09-2 stands) |
| N-5 | Fallback body pin | 11-GS-M acs + `GuidedObservationPrunerIT` in a01 |
| N-6 | AC-1 deltas (client tests do not exist; P7 names; `poll-interval` key) | 11-FOLD-final acs; §4 T0-P7; for @po to record |
| N-7 | Live surface | §4 Live surface row |
| §3 collisions | 30 patch files vs 011 write sets | resolved by order (RC-7); `w-brief.v2.md` "What is already in the tree" |

## 8. @devops items

| Item | Resolved in |
|---|---|
| Landing order (steps 0–10) | `lanes.v2.json` `preStartOrder` (root order adopts steps 1–7; step 10 push: K-12) |
| Commit grouping C-1–C-7 | §1 step 5 (user R4 decision: the same 7 categories) |
| D-1 local image + `check:pins --require-image` | 11-MERGE writes and verify; 11-G G4, G5; K-6 |
| D-2 dist not committed | `w-brief.v2.md` "Runner dist" |
| D-3 catalog regenerated on the next real image | release note (not a 011 lane); carried to @devops |
| D-4 six copy-table sources staged by name | @devops commits; K-11 |
| D-5 stray files | @devops commits; CLN-58 at 11-MERGE |
| D-6 R-4d proof script under evidence | 11-RT writes (`rt/**`) |
| X-1 `g9-image.sh` before the patches | `preStartOrder` step 2 |
| X-2 reuse void | K-1 |
| X-3 new deployment tests first-green in 009 | `preStartOrder` step 3 |
| X-4 Live surface re-date | `preStartOrder` step 4; §4 |
| X-5 `application.yml` observed-replay block | 11-LEFT verify (block byte-unchanged) |
| X-6 runbook §14 before 11-DOC | 11-DOC `startsWhen` and prohibited (§14) |
| X-7 catalog producer | lands with catalog-entry in step 3 |
| X-8 sandbox copy after the tests patch | sandboxes are seeded from S_011 (post-residue) |
| X-9 CLN-44 count | 11-DOC inventory addendum |
| X-10 dirty base files | R4 commits before W1; brief "What is already in the tree" |
| CLN-10 co-sign | accepted (R-10 unchanged) |

## 9. @po items carried into v2

- **RD-1:** 11-GT and the split stay dropped.
- **RD-2:** R-4d hand reformat with an AST proof.
- **RD-3:** 11-RO and 11-RO-BE removed from `lanes.v2.json`.
- **RD-4:** execute-011 collectors.
- **P-1–P-12:** stand as ratified. The amendments touching them are listed below.
  - P-2: line anchors bind only at S_011 (§10).
  - P-6: CLN-20 is edited by 11-LEFT after the R4 commit.
  - P-7: the class-name deltas.
  - P-8: CLN-57 goes to 11-LEFT and CLN-58 to 11-MERGE.
  - P-10: becomes T0-EP plus R-EP v2.
  - P-11: R-08-3 is unchanged.
- **New AC-1 deltas for @po to record:**
  - `GuidedRunnerClientTest` and `ObservedValidationClientTest` do not exist, so "ported by name" means the 8 bridge plus 4 publication tests among the 21;
  - the P7 names (§4).

## 10. Re-anchored line numbers (root / @dev fill at S_011)

| Anchor (pre-start) | File | At S_011 |
|---|---|---|
| F-1 guards `:177`, `:191`, `:405`; sites `:370`, `:846`/`:880` (in `clarify` `:791`), `:1442` (`insertAction` `:1440`), `:2013`; `instanceof` `:660-663`, `:735-740` | `GuidedSessionService.java` (sha `cad1efa3…` pre-start [V]) | `<…>` |
| C-OBS009-1 `:32`, `:39`, `:2757`, `:2794-2808` | same | `<…>` |
| C-OBS008-1 `:759-763`, `result` `:2881-2937` | same; controller `:59-75`; projector `:128` | `<…>` |
| R-9 mint `:85`, judge `:96`; config `:50`, `:101`; publisher `:118`, `:136` | publication package | `<…>` |
| CLN-21 `:141-142`, `:160`, `:195-197`, `:212`; `application.yml:375`; `StudioKillSwitchWiringTest:252` [V] | | `<…>` |
| R-J JaCoCo rules `:484`, `:539` | `build.gradle.kts` | `<…>` |
| `verifyRunnerDist` `:295-341`; `guidedIncrementalTest` `:278-291` | `build.gradle.kts` | `<…>` |
| ReplayIT P7 `:21893-21909`, `P7_OUTAGE_SCOPE` `:21906`, `:29462`; worker assertion `:32463`; C5 strings `:1413`, `:30044`, `:31468`; `recordEvidence` labels `:29726`, `:30232`, `:30353` | `GuidedPublicationReplayIT.java` (moved by model-sizing) | `<…>` |
| `GuidedSessionIT` `recordEvidence` `:593-596` | | `<…>` |
| CLN-51 ranges | `CLAUDE.md`, `AGENTS.md`, `ARCH.md` | `<…>` |
| CLN-49 `:133`; evaluation sentence `:137` [V] | `studio-inference-rollout.md` | `<…>` |
| `evaluation/README.md:45`; `cli.mjs:29` [V] | post-model-sizing | `<…>` |
| `guidedBrowser.ts:26`; `runtime.test.ts:36`; `guidedCloseBound.test.ts:43` [A] | runner | `<…>` |
| `fixtures.json` `AWAITING_AUTH` `:10776`; `result.schema.json:176` | contracts v3 (moved by model-sizing?) | `<…>` |
| `COPY_SOURCE_FILES` `:46-62` [V] | `guidedNarratives.ts` | `<…>` |
| R-11 surfaces `:312-348`, pins `:99-100` | `studioWcagAudit.test.tsx` | `<…>` |

## 11. Live surface intersection (R-T0-3)

- **Re-dated list:** `<path, sha>`.
- **Intersection:** `<0 | items stopped by name>`.
- **Pre-ruled exclusion:** `studio.execution.sse.read-interval` (OI-04 (a)).
- **Not merged:** `runner-origin` (OI-05 (b)).

## 12. Open items

| # | Item | Owner | Blocking? |
|---|---|---|---|
| OI-1 | **Image after the 009 residue.** catalog-entry edits `studio-runner/Dockerfile` [V patch header]. model-sizing edits `src/guided/schemas.json`, so the dist changes [V]. The G9 image therefore no longer matches the tree, yet Gage's step 3 runs the post-residue deployment tier "against the G9 image tag". U22 covers one 009 build for G9. The 011 authorization covers 11-MERGE/11-G only. **Recommendation:** treat one more fresh-tag 009 build after the residue as covered by U22 terms; it doubles as the B4 image. If refused, the post-residue run marks the image-dependent cases (`test/deployment/image.ts` users, `sec2`) "image predates residue", and B4 is `NOT_MET` by name. | root / user | Blocks a clean B4 only. Not W1. |
| OI-2 | `g9-image.sh` lives only in a session scratchpad under `/private/tmp`. | root (copy before running) | No |
| OI-3 | R-F2 co-sign (@data-engineer); R-CO approval (@ux-design-expert); T0-EP confirmation. | named | Each item carries if absent; none blocks W1 |
| OI-4 | `GuidedAdmissionWithoutTranslationIT` now covers four operations; the name is kept so the co-signed FQCN lists stay valid. | @dev may propose a rename at T0 | No |

## 13. Signature

- **Root:** `<name>`, `<date time>`. Pre-start order §1 ticked; S_011 §2 recorded; baselines §3 named; T0 checks §4 recorded; rulings §5 adopted; Live surface §11 = `<…>`. W1 may start.
- **@qa (approved-skips, baseline reconciliation):** `<…>`
- **@dev (T0 checks, re-anchors, JSON parse of `lanes.v2.json`):** `<…>`
