# STUDIO-OBS-010 T2: Live surface inclusion rulings and the OI-06 / OI-19 deployment rulings (pre-G9)

- **Author:** Aria (@architect). Date **2026-10-18**. Mode YOLO, read-only except this file and `STUDIO-OBS-009/execution-20261018/model-sizing/ruling-draft.md` §10 (append-only).
- **Legend:** **[V]** = I read the cited file:line today, or ran the cited read-only command. **[I]** = inference, basis stated. **@pm** = needs Morgan's acknowledgement before it binds the dated list.
- **Scope:** Alex's pre-G9 open questions 2 (OI-06), 3 (OI-19) and 4 (OI-03, OI-04, OI-05 a, OI-10, OI-17). G9 is still running; nothing here depends on its outcome, and nothing here is a G9 result.
- **Not done:** no test, build, Gradle, docker, helm or node run. No edit under `backend/`, `frontend/`, `studio-runner/`, `tools/`, `docs/specs/`, `.github/`, `helm-chart/`, root package files, AGENTS.md or any story. No git write. Agent memory was not written (the dispatch limits writes to two folders).

**Inputs (sha256 today) [V]:**

| File | sha256 |
|---|---|
| `../live-surface-list.pre-g9.json` | `d0d34e189da8870edbe97c4c7ec6665657c3c04b0e00a16ea0f921cd66b59b52` |
| `../live-surface-list.pre-g9.md` | `ae4794b20bf0a4891c2869b080daab5118add6a90a0e2cc7bff0b3a6a1e4fc11` |
| `../delta-from-skeleton.md` | `78eb1ad3e91b70ae7fb931e78f26eb7a720e258936e3af4133bc385c3986ec02` |
| `../finalize-checklist.md` | `bcc54bccd989dc8f264f59bc8a3ac2c7b74915da32c9e9f998906ce1764285f4` |
| `docs/stories/STUDIO-OBSERVED/STUDIO-OBS-010.story.md` | `aeac3cc66bc537882e463b1a3110ea74808cd71eb307a6718d319ca90af8bbfc` |
| `docs/stories/STUDIO-OBSERVED/STUDIO-OBS-011.story.md` | `ef0eec7f9e28d94d37f38712acaacebcbc8f17f5877cdda018db2aca80dea262` |
| `docs/stories/STUDIO-OBSERVED/STUDIO-OBS-011-cleanup-inventory.md` | `3f0d3a53f113d5bb17855cb60e38d1081d2f1dbccd824e1cec0d56702e91221d` |
| `docs/stories/STUDIO-OBSERVED/STUDIO-OBS-009.story.md` | `29bfbcf4c204c86f0fb1d616b73238042a0b860e04939c0c359974820e93544b` |

HEAD `734ad704f`, dirty tree.

---

## 0. Rulings at a glance

| # | Item | Ruling | Needs |
|---|---|---|---|
| A1 | OI-03: the 18 internal routes not in OpenAPI (RTX-01..18) | **INCLUDE all 18** in a separate category. Protection unit: method + path + direction + caller-auth class. Bodies are protected through `contracts/v3`, not here. No OpenAPI addition is implied. | **@pm** ack |
| A2 | OI-04: `studio.execution.sse.read-interval` (CFB-078) | **EXCLUDE.** It goes to an "excluded with reason" annex, so 011 CLN-21 may delete it. CFB-079 `sse.read-interval-ms` stays protected. | none (architect) |
| A3 | OI-05 a: carve-out so 011 can merge `studio.guided-authoring.runner-origin` (CFC-01) into `studio.runner.base-url` (CFB-098) | **GRANT, conditional** (C1–C6 below). CFB-098 and `STUDIO_RUNNER_BASE_URL` stay protected without exception. | **@pm** accept; @po writes the list text |
| A4 | OI-10: `@ConfigurationProperties` defaults by prefix or key by key | **Prefix level** (CFK-01..18), plus the existing key-by-key yml leaves (CFB) and code-default flags (CFD), plus one mechanical removal rule. No enumeration of record components. | none (architect) |
| A5 | OI-17: `RunnerProcessHarness`, `ObservedCoRunIT`, `verifyRunnerDist` (P09-06..08) | **EXCLUDE** from the Live surface. They go to a "not a surface" annex. 011 is held off them by 011 G1/G12 and the 009 File List, not by this list. | none (architect) |
| B | OI-06: observed flags not chart-renderable | **[V] confirmed, and wider than reported:** the backend trust catalog and policies are not rendered either. **Real blocker** for every deployed Studio run, so for 009 AC-7/AC-12 deployed legs, G-1 and the pilot. **Not** a G9 or dated-list blocker. **009 residue, owner @devops** (chart), with @dev (catalog producer script) and @po (placement). | @po placement; **@pm** names the policy-content owner |
| B-19 | OI-19: UAT controller pin | **By design, not a defect.** It blocks a UAT render (and so any UAT deploy) until supplied. It does not block G9, the dated list or 011. Same item as 009 PO note d. Owner @devops (value), Platform/SRE (certificate and Secrets). | none |
| C | MODEL-SIZING §9.1.5 a–d | **Adopted** into `model-sizing/ruling-draft.md` §10, with precise predicates. §8.3 text supplied there. | already @pm-signed (§9.1) |

---

## A. Inclusion rulings (Alex question 4)

### A1. OI-03: the 18 internal routes not in OpenAPI → INCLUDE

**Facts [V]:**
- The 12 backend routes, RTX-01..12, are on three controllers, each under `@RequestMapping("/internal/v2/studio/guided-sessions/{id}")`: `GuidedInternalController.java:16`, `GuidedPlanningController.java:21`, `GuidedSessionEvidenceInternalController.java:34`. The dual `/internal/v1/…` mount that 011 inventory CLN-16 describes is **gone**: only the v2 mapping remains at `:16`. So no v1 route is on the list, and none needs protecting.
- The 6 runner bridge routes, RTX-13..18, are matched by the regex at `studio-runner/src/guided/transport.ts:101` (`assign|context|prepare|dispatch|observe|stop`), behind `GUIDED_ROUTE_PREFIX` at `studio-runner/src/server/routes.ts:130`. They are dark while guided mode is off.
- No 011 AC or inventory row removes or renames an `/internal/v2/…` route. 011 AC-4 (a) folds the backend **clients** (`GuidedRunnerClient`, `ObservedValidationClient`), not the routes (`STUDIO-OBS-011.story.md:98`).

**Ruling: include all 18**, as their own category, "internal routes, not in OpenAPI".
1. **Why include.** These are wire surfaces between two separately deployed images: API/worker and runner. They are rolled independently, and a version skew between them fails exactly at these paths. "Not in OpenAPI" is a documentation fact, not a liveness fact: RTX-01..12 are live in every API pod today. The list protects existence (Alex's auto-decision, which I endorse). An omitted route is one 011 could delete under a "zero external caller" grep, because the caller is in the other image.
2. **Protection unit.** Method + path template + direction (runner→API or API→runner) + caller-authentication class (guided JWT plus mTLS chain). Request and response **bodies** are protected through the `contracts/v3` entries (CON-01..51), which are already on the list. A route entry does not pin a body shape.
3. **What inclusion does not mean.** It does not ask anyone to add these routes to `docs/specs/studio/openapi.yaml`. That would move the digest and both pins (`StudioContractTest.java:94`, `confinement.test.ts:298`). Documenting them in OpenAPI is a separate contract decision, not proposed here.
4. **Dark routes stay listed** (RTX-13..18), for the same reason as every dark entry.
5. **Trade-off.** Including them adds 18 rows that 011 must check by hand. Excluding them saves that work but leaves the one category whose callers no single-repo grep can see. I take the extra rows.

**@pm:** acknowledge the inclusion, because the checklist names OI-03 "@architect + @pm".

### A2. OI-04: `studio.execution.sse.read-interval` (CFB-078) → EXCLUDE

**Facts [V]:**
- The leaf is declared at `application.yml:375` (`${STUDIO_SSE_READ_INTERVAL:750ms}`). It binds to the `Sse.readInterval` record component at `StudioExecutionProperties.java:197`. Its only reader is `readIntervalOrDefault()` at `:212-213`, and a repo grep of `backend/src/main` finds **no caller** of that method.
- The live behaviour comes from `@Scheduled(fixedDelayString = "${studio.execution.sse.read-interval-ms:750}")` at `SnapshotBroadcaster.java:79`, which reads CFB-079 (`application.yml:377`).
- `helm-chart/`, `frontend/src`, `studio-runner/src` and `docs/runbooks` have no `SSE_READ_INTERVAL` or `read-interval` that is not `-ms` (grep = 0). Tests set only `read-interval-ms` (`StudioOverloadIT.java:72`, `SseCrossReplicaIT.java:54`, `SseStreamingIT.java:64`).
- 011 AC-2 already names this leaf (`STUDIO-OBS-011.story.md:55`), and so does inventory CLN-21 (`STUDIO-OBS-011-cleanup-inventory.md:70`, "bound but never read").

**Ruling: exclude CFB-078.** Record it in an annex, "excluded with reason: bound but never read; removed by 011 CLN-21". Do not delete it silently, because ids are never reused.
- **CFB-079 `studio.execution.sse.read-interval-ms` stays protected.** It is the live key. 011 must not "tidy" the two into one name.
- **Backward compatibility [I]:** an operator who set `STUDIO_SSE_READ_INTERVAL` gets no effect today and none after removal. With Spring's default `ignoreUnknownFields`, a leftover environment variable or relaxed-binding key does not fail startup. Removal is therefore behaviour-neutral, which 011 G8 requires.
- **Trade-off.** Keeping the leaf and re-scoping CLN-21 would protect a key that does nothing and would leave a misleading knob in `application.yml`. There is no benefit.

### A3. OI-05 a: carve-out for merging `runner-origin` into `base-url` → GRANT, conditional

**Facts [V]:**
- The chart already derives both values from one helper, `put-checks.studioRunner.baseUrl` (`_helpers.tpl:113`). It renders `STUDIO_RUNNER_BASE_URL` for the API (`deployment.yaml:267-268`) and the worker (`:482-483`), and sets `studio.guided-authoring.runner-origin` from the same helper, but **only while guided is enabled** (`_helpers.tpl:434`).
- `runner-origin` has no yml placeholder **on purpose**. Its presence switches the `GuidedRunnerClient` bean on, through `@ConditionalOnProperty(name = "studio.guided-authoring.runner-origin")` at `GuidedSessionConfiguration.java:103-104`, `:107` (comment at `application.yml:216-219`).
- `StudioRunnerTls.runnerHopConfigured` treats a non-blank `runner-origin` as one of four signals that the runner hop is configured (`StudioRunnerTls.java:535-540`).
- 011 AC-4 (a) folds `GuidedRunnerClient` into the one runner client with one TLS configuration (`STUDIO-OBS-011.story.md:98`). 011 inbound carry C-OBS009-2 also folds runner-TLS validation into one point.

**Ruling: the carve-out is granted.** CFC-01 is listed with the annotation "merge-permitted: 011 AC-4 (a) may retire this key in favour of CFB-098 under conditions C1–C6 of the 2026-10-18 architect ruling". Because the annotation is written into the list **before** dating, a merge under these conditions is not a removal under 010 D-1.

| # | Condition (all must hold in the 011 change) |
|---|---|
| C1 | `studio.runner.base-url` (CFB-098), its environment variable `STUDIO_RUNNER_BASE_URL`, and the chart helper `put-checks.studioRunner.baseUrl` stay protected, unchanged, and with no carve-out. |
| C2 | **The guided client stays absent unless guided is enabled.** Today, absence of `runner-origin` is what keeps the guided bridge client off on every guided-off deployment. After the merge, `base-url` is present on every runner-enabled deployment, so the guided client must be gated on the guided switch (the backend guided-enabled property the chart renders from `studioRunner.guided.enabled`), never on `base-url` presence. Proof: a test where `base-url` is set and guided is off, and no guided client or guided dispatch exists. Without C2 the merge silently activates a dark surface, which is a behaviour change that 011 G8 forbids. |
| C3 | `runnerHopConfigured` (`StudioRunnerTls.java:535-540`) still sees the hop as configured in every case it does today. With `base-url` present this already holds through `runner.isConfigured()`. State it in the 011 evidence, and do not drop the line without that statement. |
| C4 | Remove the chart line that sets `runner-origin` (`_helpers.tpl:434`) **in the same change**, with `studio-runner/test/deployment/tls-client-cert.test.ts` and its siblings updated by name. A chart that still renders a key the backend no longer reads would be a stale surface. |
| C5 | The tests that set `runner-origin` are re-pointed by name, not deleted: `ObservedProfileDriftTest`, `GuidedPublicationReplayIT`, `GuidedTranslationTest`, `RunnerTlsClientCertIT`, `StudioRunnerPropertiesProfileTest`, `ObservedCoRunIT` (repo grep [V]). The `application.yml:216-219` comment and `guided/session/README.md` are updated. |
| C6 | The client still uses the one `StudioRunnerTls` SSL context. No second TLS configuration and no `SSLContext.getDefault()` (G9 c7 grep = 0 today). |

- **If any condition cannot be met, the carve-out lapses.** CFC-01 stays protected, and the fold keeps reading `runner-origin`. In that case 011 AC-4 (a) can still fold the classes and keep the key.
- **Trade-off.** Protecting the key name blocks a merge whose value is already single-sourced in the chart, and keeps two names for one fact. The carve-out allows the merge, at the cost of the C2 gating proof. C2 is the real risk: a guided client that is accidentally live.
- **@pm** accepts the carve-out. **@po** writes the CFC-01 list annotation (checklist OI-05 a).

### A4. OI-10: `@ConfigurationProperties` defaults → prefix level, with a removal rule

**Ruling: list by prefix.** That means CFK-01..18, plus the 110 key-by-key yml leaves (CFB) and the 7 named code-default flags (CFD), which are already on the list. Do not enumerate record components.

**What a prefix entry protects:**
1. the binding prefix and its properties class;
2. every component that has a yml leaf on the list, or that the chart renders (through env, `springProperties` or `configOverrides`). These are already listed key by key, or will be at finalize;
3. every flag or kill switch, already listed as CFD.

**Removal rule for 011 (mechanical).** 011 may remove a record component under a protected prefix only if all three hold, each with the command recorded (011 G1):
- (a) it is **not** a listed CFB, CFC or CFD key;
- (b) the chart does not render it: `grep -rn '<kebab-key>\|<ENV_NAME>' helm-chart` = 0;
- (c) `backend/src/main` has zero readers apart from its own zero-caller accessor.

This rule admits CLN-21's `Dispatcher.pollInterval` and `Sse.readInterval` (the latter once A2's exclusion is recorded). It refuses anything with a reader or a rendered value.

- **Why not key by key.** It would add roughly 150–250 rows of record components to a list whose purpose is to stop deletion. The deletion risk sits in categories 1–3, which are already key-level. A3's merge and A2's exclusion show that the risky cases are named one by one anyway.
- **D-3 is satisfied.** It requires the configuration keys, including the on-by-default flags and the kill switch. Those are CFB-011, CFB-016, CFB-036 and CFD-01..07.
- **Trade-off.** Prefix level relies on the three-part removal rule being applied honestly. Key-by-key would be mechanical, but heavy and noisy to re-date twice (G9 and 009 Done). I choose prefix level plus the rule.

### A5. OI-17: test/build tooling → EXCLUDE from the Live surface

**Facts [V]:** `RunnerProcessHarness.java` is test support, under `backend/src/test/…/studio/support/`. `ObservedCoRunIT.java` is a test, under `backend/src/test/…/corun/`. `verifyRunnerDist` is a Gradle task (`backend/build.gradle.kts:317`) that `test` and `guidedIncrementalTest` depend on.

**Ruling: exclude P09-06, P09-07 and P09-08.** Record them in a "not a surface" annex, with status `excluded-not-surface`, so ids are not reused.
- **Why.** AC-5's categories are operator and deployment surfaces: routes, contracts, config keys, migrations, chart values and runner keys. None of these three is deployed, configured or called across an image boundary.
- **011 must still not delete them.** That protection comes from 011 G1 (no deletion on the inventory alone), G12, and the 009 File List while 009 is not Done. It does not come from this list. `verifyRunnerDist` is also a dependency of the backend test gate, so removing it would change the gate. That is an @devops/@qa matter under 011 AC-7 baselines.
- **Evaluation harness.** I concur with Alex's auto-decision: `studio-runner/evaluation/**` is not listed. It is guarded by 011 inventory §6 (CLN-52..56) and the "T4 may still use it" rule (`STUDIO-OBS-011-cleanup-inventory.md:158`).

### A6. Adjacent points for finalize (not asked; short)

- **Duplicates:** concur. Keep CFB-101..103 and mark CFC-02..04 `superseded-by`.
- **Story drift [V]:** the 010 story is now `aeac3cc6…`, not the `f2b1dd0c…` Alex hashed (0.3.12 clarification e, AC-4 only). Proposal P-1, an AC-5 learn-limit row, is recorded there and is not applied. The 011 story is now `ef0eec7f…`, not `18014f33…`. Finalize step 5 "Story drift" must re-read both before dating. [I] Neither change alters AC-5's surface categories, but the checklist requires the re-read, not my inference.
- **MODEL-SIZING interplay [I, from `model-sizing/ruling-draft.md` §7]:** after G9, the A-ii change edits `contracts/v3/limits.schema.json` (CON-25). It moves the hashes of the session root and the bundles that `$ref` it (CON-46 `session.schema.json`, CON-44 `runner-context.schema.json` through the regenerated bundles) and the runner dist. That is a 009 change, not a removal. If the list is dated before §7 lands, the 009-Done re-date (checklist §12) records CON-25 as CHANGED. That is expected, and it is no breach.
- **Section B changes a dark set.** RKS-01..05 are dark today because the chart cannot turn them on. After the B fix lands, in a values file that enables them, they become live. They stay listed either way.

---

## B. OI-06: is a chart-deployed runner unable to run observed work? (Alex question 2)

### B1. Verification, file:line [V]

| Step | Evidence |
|---|---|
| Runner keys default false | `studio-runner/src/server/config.ts:177` `OBSERVED_VALIDATION_ENABLED … fallback:false`; `:178` `OBSERVED_REPLAY_ENABLED … fallback:false`; `:179-181` `CATALOG_FILE`, `POLICY_FILE`, `IMAGE_DIGEST` fall back to `''`. Prefix `STUDIO_RUNNER_` (`config.ts:20`) |
| Runner support loader | `studio-runner/src/server/application.ts:161` calls `loadObservedRunnerSupport` with the config values. `:339-349`: if both flags are not `'true'`, it **returns `undefined`** (`:342`). If either is on, it requires a build identity (`:343`, `demand(build,'PROFILE_MISMATCH')`), which needs `CATALOG_FILE` + `IMAGE_DIGEST` (`src/compat/runtime-versions.ts:126-145`): an exact `{build,profile}` file, hash equalities, `digest === build.executableImageDigest` (`:137`), and an installed-browser provenance check (`:118-125`). Any failure throws `PROFILE_MISMATCH`, so the process fails at startup |
| Coordinator gating | `studio-runner/src/server/runCoordinator.ts:1044`: `validateObserved` is defined only when `options.observed?.validationEnabled`. `:1047-1048`: `submitObserved` is always defined, and returns `{status:503, code:'OBSERVED_REPLAY_DISABLED'}` when `!support?.replayEnabled` |
| Route answers | `studio-runner/src/server/routes.ts:213`: `/v2/validate-observed` answers **503 `OBSERVED_VALIDATION_DISABLED`** when the coordinator has no `validateObserved`. `:218-219`: `/v2/runs` relays `submitObserved`'s decision, so it answers **503 `OBSERVED_REPLAY_DISABLED`**. **Anchor correction:** for `/v2/runs`, the 503 is produced at `runCoordinator.ts:1048`. The `routes.ts:218` guard never fires, because `submitObserved` always exists. |
| Chart cannot set them | The closed list `put-checks.studioRunner.acceptedEnvKeys` (`helm-chart/put-checks/templates/_helpers.tpl:162`) has 48 names and no `OBSERVED_*`. `put-checks.studioRunner.env` **fails the render** for any `runnerEnv` key that is not on that list (`_helpers.tpl:191-192`). The runner Deployment has **no `envFrom`**, by design (`studio-runner-deployment.yaml:218-220`). `grep -rn OBSERVED helm-chart` = **0**. |
| Backend uses only these two endpoints | `StudioRunnerProperties.java:32` `RUNS_PATH = "/v2/runs"`; `ObservedValidationClient.java:46` `/v2/validate-observed`. No backend code names the two `*_DISABLED` codes (grep = 0), so the backend handles them generically [I]. |

**Alex's inference is correct, with one anchor fixed.** On a chart-deployed runner, `POST /v2/validate-observed` answers 503 `OBSERVED_VALIDATION_DISABLED` (`routes.ts:213`), and `POST /v2/runs` answers 503 `OBSERVED_REPLAY_DISABLED` (`runCoordinator.ts:1048`, relayed at `routes.ts:219`). [V by code reading. Not run.]

### B2. It is wider than reported: the backend trust inputs are not rendered either [V]

- `application.yml:269-270`: `studio.observed-replay.catalog-json: '${STUDIO_OBSERVED_CATALOG_JSON:[]}'` and `policies-json: '${STUDIO_OBSERVED_POLICIES_JSON:[]}'`. Both are empty by default (`ObservedReplayProperties.java:16-17`).
- `ObservedReplayPins.java:33-35`: `selected()` requires a non-empty catalog and otherwise answers **409 `RUNTIME_INCOMPATIBLE`**. `:39-47` `supported()` and `:67-79` `policy()` also answer 409 when nothing matches. Their callers include publication (`GuidedPlanPublisher.java:203`, `:371`, `:457`), replay authorization (`ObservedReplayAuthorizer.java:74-75`, `ObservedReplayAuthorization.java:151-152`, `:305`, `:312`), the guided production session (`GuidedProductionSessionAccess.java:70`), governed policy (`ObservationPolicyService.java:191`, `:235`) and capabilities (`StudioCapabilitiesService.java:125`).
- `grep -rn "catalog\|observed-replay" helm-chart` finds no rendering. The backend, unlike the runner, has two open escape hatches: `backend.env` / `worker.env` (`deployment.yaml:275-278`, a free map) and `configOverrides` (`springProperties`, `_helpers.tpl:417-420`). So a backend **can** be configured through values today, but not first-class, not single-sourced with the runner, and with no guard.
- **Consequence [I, from the code paths above]:** with the shipped chart, a deployed stack cannot publish a learned plan, cannot authorize a replay and cannot run any Studio test. Under the single path every Studio run is an observed `/v2/runs` run. The guided policy lookup also refuses.

### B3. Is it a real blocker?

| Gate | Blocked? | Why |
|---|---|---|
| 009 G9 (local) | **No** | Local legs set the keys directly (`ObservedCoRunIT.java:2091-2095`; the fixtures tier). The chart is only rendered and tested, not deployed. |
| 010 dated Live surface list | **No** | The list protects existence. RKS-01..05 stay listed as dark. |
| 011 start | **No** | 011's start condition is the G9 record plus the dated list. |
| 009 AC-7 (D-C benchmark, "on the deployed stack"), AC-12 deployed E2E, G-1 deployed proof | **Yes** | No observed run can complete on a chart-deployed stack. AC-1's sentence ("one Helm Deployment serve `/v2/runs`, `/v2/validate-observed` …", `STUDIO-OBS-009.story.md:28`) is met as routing but not as a usable deployment. |
| 010 pilot (T0/T1), release readiness | **Yes**, transitively | The pilot is gated on AC-7 passed. |

**Real blocker: yes.** It blocks every deployed observed run, and with that 009 Done and the pilot. It is not a G9 blocker.

### B4. Where the fix belongs, and who owns it

**Ruling: a 009 residue**, required before any 009 deployed-stack leg (U4 bring-up, T4, AC-12 deployed). It is not 011 and not a GA item.
- **Not 011:** 011 is removal and behaviour-neutral (AC-7, G8). Adding deployment configuration is neither. It would also make 009's deployed gates wait on a cleanup story.
- **Not GA:** the D-C gate runs on the deployed stack **before** the pilot, so a GA placement is too late by construction.
- **009:** 009 owns the one runner Deployment (AC-1), the chart closed list (D2) and the deployed stack (U4, AC-7). The defect is a gap in what 009's D2 lane rendered.

**Owners:**
- **@devops (Gage) owns the chart change** (B5): the D2 successor and chart owner.
- **@dev owns one small runner script** that prints the image's own `{profile, build}` catalog entry (B5 item 7). That derivation exists today only inline in a test (`ObservedCoRunIT.java:290-310`), and `studio-runner/ci/stages.md` and `scripts/` have no catalog producer (grep for `catalog|profileHash|digest` found only the fixture tool `upgrade-observed-fixtures.mjs`) [V].
- **@po places it** in 009 as a carried residue against AC-1 / U4, append-only. It must not read as an AC pass.
- **@pm names the owner of the policy content**, meaning which applications and origins are trusted per environment. My default is the pilot application owner with Security & Compliance, applied by @devops.

**Timing.** After G9 exits, before the U4 deployed stack is brought up. The chart edit moves the helm digest, so the 010 list is re-measured for the chart categories at the 009-Done re-date. That is expected.

### B5. The exact chart change for @devops (apply after G9)

**One source of truth for both images:** a top-level `studioObserved` block, because the backend and the runner must hold the **same** catalog entry and policies. This mirrors how `guided.token.publicKey` already feeds both the runner file and the backend property.

1. **`values.yaml`: new block, off by default** (every shipped file stays off unless set below):
   ```yaml
   studioObserved:
     # Runner STUDIO_RUNNER_OBSERVED_{VALIDATION,REPLAY}_ENABLED and backend
     # studio.observed-replay.{catalog,policies}-json. Under the single path, a runner with
     # both off answers 503 to every Studio run (routes.ts:213, runCoordinator.ts:1048).
     validationEnabled: false
     replayEnabled: false
     # The runner image's OWN {profile, build} entry, produced by CI from the pushed image
     # (build.executableImageDigest = the 64-hex manifest digest, no "sha256:" prefix).
     # No default: this repository cannot know it. Supply per release with -f <generated file>.
     catalog: {}
     # Older builds the BACKEND may still accept (retained artifacts); the runner never sees these.
     additionalBackendCatalog: []
     # TrustedPolicy list, per environment (content owner: see B4).
     policies: []
     mountPath: /etc/studio-observed
   ```
2. **`_helpers.tpl` closed list** (`acceptedEnvKeys`, `:162`): append `STUDIO_RUNNER_OBSERVED_VALIDATION_ENABLED STUDIO_RUNNER_OBSERVED_REPLAY_ENABLED STUDIO_RUNNER_OBSERVED_CATALOG_FILE STUDIO_RUNNER_OBSERVED_POLICY_FILE STUDIO_RUNNER_OBSERVED_IMAGE_DIGEST`, which takes it from 48 to 53. Update the comment ("fifty-seven accepted, fifty-three rendered at most").
3. **`_helpers.tpl` `put-checks.studioRunner.env`:** make the five keys chart-managed. Add `(hasPrefix "STUDIO_RUNNER_OBSERVED_" $key)` to the existing chart-managed `fail` at `:183-184`, with the message "… is managed by the chart; use studioObserved.* values instead". There is no `runnerEnv` path for them, which matches the TLS and guided rule.
4. **`studio-runner-deployment.yaml` env** (after the guided block, before `include "put-checks.studioRunner.env"`):
   - Render **both flags in both directions**, `"true"` or `"false"`, as `GUIDED_ENABLED` is. The runner accepts only `'true'`/`'false'`/unset (`application.ts:341`).
   - **Only while either flag is on**, render `STUDIO_RUNNER_OBSERVED_CATALOG_FILE` = `<mountPath>/catalog.json`, `STUDIO_RUNNER_OBSERVED_POLICY_FILE` = `<mountPath>/policies.json`, and `STUDIO_RUNNER_OBSERVED_IMAGE_DIGEST` = `studioObserved.catalog.build.executableImageDigest`. That is derived, with no second value. "Only while on" mirrors the no-half-configuration rule, and `launcher.ts:410-412` forwards these two keys to the child.
5. **Runner image pinned by digest while observed is on:** `image: "<repository>@sha256:<catalog.build.executableImageDigest>"`. Without this, the runner's `digest === build.executableImageDigest` check (`runtime-versions.ts:137`) compares two values that come from the same values file, and binds nothing to the image that is actually pulled. With a tag, a re-pushed tag would run under a catalog that names another image. The tag form stays when both flags are off.
6. **ConfigMap** `<fullname>-studio-observed-trust`, rendered when either flag is on, with data `catalog.json` (`toJson .Values.studioObserved.catalog`) and `policies.json` (`toJson .Values.studioObserved.policies`). Mount it read-only at `mountPath` in the runner, with `defaultMode` the same `$fileMode` as the guided controller key. It holds public hashes and trust policy, not secrets, so a ConfigMap is right. It does not touch the `shareProcessNamespace` Secret coupling.
7. **Backend, through `put-checks.backend.springProperties`** (`_helpers.tpl:417+`, for both api and worker roles). When either flag is on, set:
   - `studio.observed-replay.catalog-json` = `toJson (prepend additionalBackendCatalog catalog)` (the runner's own entry first, so `selected()` picks it);
   - `studio.observed-replay.policies-json` = `toJson policies`.
   That gives one source for both images.
8. **Render guards** (a new `put-checks.studioObserved.guard`, called from the runner Deployment and the API Deployment, like `guidedGuard`). Each is a `fail` naming the key:
   - G-O1: either flag on ⇒ `studioRunner.enabled` is true.
   - G-O2: either flag on ⇒ `catalog` has exactly the keys `build` and `profile`. `build` has the five `BuildIdentity` keys (`profileHash`, `schemaBundleHash`, `referenceBundleHash`, `executableImageDigest`, `chromiumBuild`). `executableImageDigest`, `profileHash`, `schemaBundleHash` and `referenceBundleHash` match `^[a-f0-9]{64}$` (`observedSchemas.json:7725-7758`).
   - G-O3: either flag on ⇒ `policies` is non-empty, with at most **16** entries and `toJson` at most **65,536** bytes. These are the backend bounds (`ObservedReplayPins.java:24-29`), which are tighter than the runner's 32 entries / 2 MiB (`application.ts:344-345`). `1 + len(additionalBackendCatalog)` is at most 16, and the catalog JSON is at most 65,536 bytes.
   - G-O4: either flag on ⇒ `backend.configOverrides` / `worker.configOverrides` / `backend.env` / `worker.env` set none of `studio.observed-replay.catalog-json`, `studio.observed-replay.policies-json`, `STUDIO_OBSERVED_CATALOG_JSON`, `STUDIO_OBSERVED_POLICIES_JSON`. That keeps one source, so the backend and runner cannot drift.
9. **`values-uat.yaml`:** `studioObserved.validationEnabled: true` and `replayEnabled: true`. `catalog` and `policies` are **not** committed. They come at deploy time: the per-build catalog file that CI generates (`-f observed-catalog.<digest>.yaml`) and the UAT policy file from the content owner. Like the controller pin (B-19), a UAT render then fails with a named message until both are supplied. That is intended. `values-dev.yaml` and `values-prod.yaml`: unchanged (runner disabled), so the defaults apply.
10. **Runner catalog producer (@dev, a 009 residue).** Add a runner script, e.g. `studio-runner/scripts/print-observed-catalog.mjs`. It prints `{profile, build}` from the built image using the derivation `ObservedCoRunIT.java:290-310` inlines today, takes the manifest digest as an argument, and validates the result with the same `BuildIdentity` schema. Then @devops adds the CI step after the image push that runs it **inside the pushed image** and emits the values file for item 9.
11. **Backend/runner co-rollout:** unchanged from the MODEL-SIZING note. The catalog entry is image-specific, so a runner image change **always** comes with a new catalog values file.

**Verification, to name and run after the change (not run here):** `studio-runner/test/deployment/chart.test.ts`, extended with three cases:
- (i) default values render `OBSERVED_*_ENABLED "false"` and no file or digest keys;
- (ii) observed on with a fixture catalog and policies renders the five keys, the digest image reference, the ConfigMap and the matching backend `catalog-json`;
- (iii) each of G-O1..G-O4 fails with its message, and a `runnerEnv` `STUDIO_RUNNER_OBSERVED_*` override fails.

Plus `backend-env.test.ts` for the API and worker properties. A deployed check (U4) that `/v2/validate-observed` does not answer 503 is @devops's first smoke test.

**Security:** catalog and policies are integrity-relevant, not secret. Whoever can edit them decides which origins replay may touch. Treat the policy file as reviewed configuration, under the same change control as `values-uat.yaml`, never as runtime input. This matches the runbook: "Paths and registry entries come from deployment, never jobs or artifacts" (`docs/runbooks/studio-guided-authoring.md:11`).

**Trade-off of the shape.** A single top-level block plus derived digest plus digest-pinned image costs one CI step and a per-release values file. The alternative, adding the five keys to the closed list as free `runnerEnv` values and setting the backend through `configOverrides`, is a smaller diff. But it creates two hand-maintained copies of the catalog, which drift silently (a 409 `RUNTIME_INCOMPATIBLE` at publication). It also leaves the image digest self-asserted. I rule for the single source.

### B6. OI-19: no values file supplies `controllerCertificateFingerprint256` (Alex question 3)

**[V]:** `values.yaml:580` has `controllerCertificateFingerprint256: ""`. `tlsGuard` (`_helpers.tpl:276-288`) uses `required`, then a format regex, whenever `studioRunner.enabled` is true. `values-uat.yaml:156` enables the runner, and `:169-172` documents that the pin is deliberately absent and must be passed with `--set-string`. The chart tests pin this behaviour (`chart.test.ts:1759`, missing pin ⇒ error naming the key; `:1767` bad forms). `values-dev.yaml:121` and `values-prod.yaml:172` disable the runner, so only UAT is affected.

**Ruling.**
- **By design, not a defect.** The pin is the SHA-256 of each environment's backend client certificate, which the repository cannot know. A render-time fail with a named key is better than a pod that exits in CrashLoopBackOff.
- **Same item as 009 PO note d** (0.3.23, D2 finding F4): `checks-studio-runner-tls-uat`, `checks-studio-backend-runner-tls-uat` and the pin are needed before release.
- **Blocks:** any UAT render and so any UAT deploy, until supplied. If UAT is the U4 deployed stack, that includes 009's deployed legs, which B already blocks.
- **Does not block:** G9, the dated Live surface list, 011, or local evidence.
- **Owners:** Platform/SRE issues the backend client certificate and the two Secrets. @devops computes the fingerprint (Node form, 32 upper-case hex pairs joined by `:`) and passes it with `--set-string` per deploy, recording it in the AC-4 release record row (010 AC-4, OI-19).
- **No chart change.** Do not add a default and do not commit the value. With B5 item 9, UAT then needs two deploy-time inputs (the pin and the catalog and policy files). @devops should document both in one UAT deploy note.

---

## C. MODEL-SIZING adoption

Done as `docs/qa/evidence/STUDIO-OBS-009/execution-20261018/model-sizing/ruling-draft.md` **§10 "Architect adoption"**, append-only. sha256 before the append: `3867ba928d67e2f799bc8a9eb479f4653ab386955a57a610f12b4a1209f3c78f`.
- Amendments a–d are adopted. a is made precise to the admission predicate at `GuidedSessionService.java:251-268`. b gets the rerun rule. c1 uses an observable truncation proxy, because the gateway collapses non-`STOP` into `INVALID_RESPONSE` and sums thoughts into output (`GenAiGuidedLlmGatewayClient.java:82-84`, `:197-202`). d2 is defined as a derived figure.
- §10 also corrects my own §7 T4 duty ("thoughts separated").
- §10 supplies the consensus-plan §8.3 text, to be applied after G9 in the §7 unit.

---

## Autonomous decisions

- [AUTO-DECISION] Should the synapse-diagnostics and architect-first skill texts attached to the dispatch be run? → No (reason: the dispatch forbids tests and builds and limits writes to two folders; the diagnostics are unrelated to the three jobs).
- [AUTO-DECISION] Should B's backend gap (catalog-json / policies-json) be in scope although only runner flags were asked? → Yes (reason: fixing the runner alone still leaves every publication and replay at 409, so a runner-only chart change would pass review and still fail the pilot).
- [AUTO-DECISION] A6 adjacent points → added briefly, not ruled at length (reason: the finalize checklist needs them; they need no decision beyond concurrence).
- [AUTO-DECISION] Agent memory → not written (reason: the dispatch restricts writes to the two named folders).

## Items needing @pm

1. A1: acknowledge including RTX-01..18.
2. A3: accept the `runner-origin` carve-out under C1–C6. @po writes the CFC-01 annotation.
3. B4: name the per-environment owner of the `studioObserved.policies` content. My default is the pilot application owner with Security & Compliance, applied by @devops.
