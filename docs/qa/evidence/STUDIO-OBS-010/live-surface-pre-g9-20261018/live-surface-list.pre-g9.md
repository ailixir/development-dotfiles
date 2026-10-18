# STUDIO-OBS-010 T2 — dated "Live surface" list — PRE-G9 DRAFT (2026-10-18)

> **PRE-G9 DRAFT — NOT FINAL. NOT THE DATED LIST.** Measured on 2026-10-18 against a tree that is byte-identical to the STUDIO-OBS-009 G9 `capture-before` (source digest `6fcc12ee…9fc91b`, 1805 files; helm-before `8dbe073c…dd04a6`, 22 files). G9 had **not** exited and no @qa local-validation record existed. This draft protects nothing and does **not** satisfy the STUDIO-OBS-011 start condition. It becomes the dated list only after the steps in `finalize-checklist.md`: re-date at G9 exit, @architect cross-check, @pm acceptance. STUDIO-OBS-010 stays **Ready**.

- **Author:** Alex (@analyst). **Mode:** YOLO, read-only. **Writes:** this folder only. **Machine twin:** `live-surface-list.pre-g9.json` (all 712 entries, every field). **Delta:** `delta-from-skeleton.md`. **Finalize:** `finalize-checklist.md`.
- **Tree:** HEAD `734ad704f`, dirty. Re-hashed all 1805 files listed in `local-gate-20261018/capture-before.json`: 1805 equal, 0 differ, 0 missing [V]. Re-hashed the 22 helm files: equal to `helm-before.txt` [V]. dist digest at G9 capture-before: `4add1307…` (= D_F).
- **OpenAPI:** sha256 `bbf37fd1f96c0da33bbca6db4c04c94222a44429a4b6f0e33c92dfc59fca02c4` — equals the dispatch digest `bbf37fd1…fca02c4` [V]. 36 paths, **44 operations** (36 public under `/api/v1/studio`, 8 internal).
- **G9 state when measured (~14:55 EDT):** C1 0, C2 0, C3 0, C4 runner-deployment 1, C5 pins/contracts/codegen 0, C6 frontend 0; C8 backend collector started (gradle lock acquired); no capture-after, no qa-local-validation-record (read 2026-10-18 ~14:55 EDT). c7 greps: P2 retired names 0; DEFERRED STUDIO-OBS-009 0; guidedMain src/dist 0; start:guided 0; studio-guided-worker templates 0; sameIdentity bodies 1; SSLContext.getDefault 0; @Disabled 6.
- **Legend:** [V] verified today by reading the anchor or by the recorded command. [I] inference, basis stated. Status: **live** / **dark** / **removed** (plus absent, holds, to-write); definitions in §1.

**Inputs read (sha256):**

| File | sha256 |
|---|---|
| `docs/stories/STUDIO-OBSERVED/STUDIO-OBS-010.story.md` | `f2b1dd0c754120d9eca6cae341b24587fd92338c24f52937eb98461de373bb76` |
| `docs/stories/STUDIO-OBSERVED/STUDIO-OBS-009.story.md` | `ebc4e9d5d7314ed46055ae9e31a78fc4f36184ff6b4918c2af724430a1a7c429` |
| `docs/stories/STUDIO-OBSERVED/STUDIO-OBS-011.story.md` | `18014f338597c4ddfab0e0ec39582228b1813017775d82cafbf7f1b76917f50f` |
| `docs/qa/evidence/STUDIO-OBS-009/execution-20261018/w3/pre-g9-rulings.md` | `d501f1abb865f1233026ef4811278551597ea3bd69ce3f83482ff51ad8a7c08b` |
| `docs/qa/evidence/STUDIO-OBS-009/execution-20261018/c9/receipt.md` | `9b1c492258ab0dfd09ef5bf6ac553de9b3aa60f14b07fc02f45282f76bd98e4b` |
| `docs/qa/evidence/STUDIO-OBS-009/execution-20261018/s-w3/receipt.md` | `d0501baf7032dafd3b0e31273fb14975cd0d0d68ac21146c6b919ad8000a10e8` |
| `docs/qa/evidence/STUDIO-OBS-009/execution-20261018/b/w3/receipt.md` | `95526656447359aa1271c459cb9e4fcd3331657d8fbd08b7d157f76b33544525` |
| `docs/qa/evidence/STUDIO-OBS-009/execution-20261018/f/receipt.md` | `6c9d3c8306e90e717adcc879d446e1e2acbed43c5640d4735cb83cc91fecea38` |
| `docs/qa/evidence/STUDIO-OBS-009/execution-20261018/ep/receipt.md` | `d49aad3c40402620155b661a0accf599871351c39d8390458787a7680db8649e` |
| `docs/runbooks/studio-guided-authoring.md` | `9727657a78268acda3e95d634da1eeeeaff36680b4691ab3f0f3d5fcb6d00855` |
| skeleton `live-surface-draft-20261017/live-surface-skeleton.json` | (604 entries; ids carried) |
| `docs/qa/evidence/STUDIO-OBS-009/local-gate-20261018/capture-before.json`, `helm-before.txt`, `status.txt`, `c7-greps.txt` | read, not hashed (live G9 folder) |

## 1. Status and delta vocabulary

| Status | Meaning |
|---|---|
| **live** | present in the tree and in effect under shipped defaults of its layer (code default for backend/runner keys and routes; for chart values/templates: consumed on the default (guided-off) render path of a runner-enabled values file — values-uat sets studioRunner.enabled true) |
| **dark** | present in the tree but in effect under no shipped default: behind a switch that is off by default and that no shipped values file turns on (STUDIO_RUNNER_GUIDED_ENABLED / studioRunner.guided.enabled, studioAuditSiem.enabled, runner OBSERVED_* flags), or set by the chart only on such a path. Dark entries are still protected (the list protects existence, not activation) |
| **removed** | on the 2026-10-17 skeleton, gone from the tree now (removed by a 009 lane); proposed to leave the list, @po confirms |
| **absent** | planned entry that did not land (by design) |
| **holds** | negative entry ("must not exist / must refuse") verified to hold |
| **to-write** | AC-5 runbook row still to write (T2) |

| Delta vs 2026-10-17 skeleton | Meaning |
|---|---|
| SAME | same name, value/hash and anchor line |
| MOVED | same name and value; anchor line moved |
| CHANGED | value, hash, response set or transport changed |
| BEHAVIOUR | name and value unchanged; semantics/transport/profile/guard changed by 009 |
| ADJACENT | unchanged; 009 added surfaces next to it |
| GONE | absent from the tree |
| NEW | not on the skeleton; present now |
| LANDED | planned 009 surface now present |
| NOT-LANDED | planned 009 surface absent |
| BECAME-TRUE | negative entry became true |

## 2. Counts

| Category | Entries | live | dark | removed | absent | holds | to-write | NEW | CHANGED/BEHAVIOUR | GONE |
|---|---|---|---|---|---|---|---|---|---|---|
| route-public | 36 | 36 |  |  |  |  |  |  | 1 |  |
| route-internal-openapi | 8 | 8 |  |  |  |  |  |  | 5 |  |
| route-internal-not-in-openapi | 18 | 12 | 6 |  |  |  |  |  | 8 |  |
| contract-openapi | 5 | 5 |  |  |  |  |  |  | 3 |  |
| contracts-v3 | 51 | 51 |  |  |  |  |  |  |  |  |
| migration | 22 | 22 |  |  |  |  |  |  |  |  |
| config-backend-yml | 110 | 105 | 5 |  |  |  |  | 10 | 1 |  |
| config-backend-profile | 15 | 15 |  |  |  |  |  | 3 |  |  |
| config-backend-code-only | 13 | 9 | 4 |  |  |  |  |  | 4 |  |
| config-backend-code-default | 7 | 7 |  |  |  |  |  |  | 1 |  |
| config-backend-properties-class | 18 | 18 |  |  |  |  |  | 1 | 1 |  |
| config-runner-key | 58 | 46 | 12 |  |  |  |  | 12 | 3 |  |
| config-runner-guided-mounted | 14 |  |  | 14 |  |  |  |  |  | 14 |
| config-runner-process | 8 | 6 |  | 2 |  |  |  |  | 2 | 2 |
| chart-value | 168 | 140 | 28 |  |  |  |  | 45 | 12 |  |
| chart-value-env | 92 | 71 | 21 |  |  |  |  | 30 | 9 |  |
| chart-template | 10 | 9 | 1 |  |  |  |  | 1 | 6 |  |
| chart-env-other | 9 | 5 | 4 |  |  |  |  | 6 |  |  |
| schedule | 8 | 8 |  |  |  |  |  |  | 2 |  |
| runbook-section | 6 | 6 |  |  |  |  |  |  |  |  |
| runbook-row-to-write | 18 |  |  |  |  |  | 18 |  |  |  |
| planned-by-009 | 13 | 10 | 2 |  | 1 |  |  |  |  |  |
| negative | 5 |  |  |  |  | 5 |  |  |  |  |
| **Total** | **712** | **589** | **83** | **16** | **1** | **5** | **18** | **108** | **58** | **16** |

By delta: SAME 167, CHANGED 36, MOVED 344, BEHAVIOUR 22, GONE 16, ADJACENT 5, LANDED 12, NOT-LANDED 1, BECAME-TRUE 1, NEW 108. Entries touched by a 009 lane (change009 set): 217.

Measured facts [V]: OpenAPI 44 operations; contracts/v3 51 JSON files; Flyway 22 files V1–V22 (no V23; `backend/db/cutover` absent); application.yml 110 `studio.*` leaves (was 100); runner `KEY_SPECS`/`ACCEPTED_KEYS` 57 keys (was 45); chart closed runner env list 48 names (was 36); values.yaml Studio leaves 168 (was 123).

## 3. AC-5 named surfaces — where they are (pre-G9)

| AC-5 / D-3 item | Entries | Anchor | Note |
|---|---|---|---|
| Public routes `/api/v1/studio/**` incl. guided-sessions and video | RTP-15 (live), RTP-16 (live), RTP-23 (live) | `docs/specs/studio/openapi.yaml:1200`<br>`docs/specs/studio/openapi.yaml:1296`<br>`docs/specs/studio/openapi.yaml:1900` | 36 public operations RTP-01..36; guided runner side dark in shipped values |
| OpenAPI operation enumeration with its count | OAS-00 (live) | `docs/specs/studio/openapi.yaml:1` | 44 operations; pins StudioContractTest.java:94, :345-346; confinement.test.ts:298 |
| `ExecutionSnapshot.replayFailure`, `ReplayFailure`, capability op (008 A1/P1) | OAS-03 (live), OAS-04 (live), RTP-10 (live) | `docs/specs/studio/openapi.yaml:4327`<br>`docs/specs/studio/openapi.yaml:4330`<br>`docs/specs/studio/openapi.yaml:935` |  |
| `/guided-policies/**` (014) | RTP-24 (live), RTP-25 (live), RTP-26 (live), RTP-27 (live), RTP-28 (live) | `docs/specs/studio/openapi.yaml:1982`<br>`docs/specs/studio/openapi.yaml:2018`<br>`docs/specs/studio/openapi.yaml:2148`<br>`docs/specs/studio/openapi.yaml:2174`<br>`docs/specs/studio/openapi.yaml:2222` |  |
| `contracts/v3` file list incl. `timing-order-vectors.json` (015) | CON-49 (live) | `docs/specs/studio-observed-authoring/contracts/v3/timing-order-vectors.json` | 51 files CON-01..51, all hashes unchanged since 2026-10-17 |
| On-by-default flags | CFB-011 (live), CFB-016 (live) | `backend/src/main/resources/application.yml:258`<br>`backend/src/main/resources/application.yml:264` | publication and observed replay, default true |
| `studio.execution.enabled` kill switch | CFB-036 (live) | `backend/src/main/resources/application.yml:303` | chart: deployment.yaml:214 (API), :519 (worker) STUDIO_EXECUTION_ENABLED |
| Runner ceilings `STUDIO_RUNNER_MAX_STEP_TIMEOUT_MS` / `_MAX_TOTAL_RUNTIME_MS` "120000" | RKS-41 (live), RKS-40 (live) | `studio-runner/src/server/config.ts:380`<br>`studio-runner/src/server/config.ts:368` | chart values.yaml:747 and :749 (runnerEnv) — the 2026-10-16 anchor :577-579 moved [V] |
| `KEY_SPECS` / `ACCEPTED_KEYS` | RKS-00 (live) | `studio-runner/src/server/config.ts:176-444` | 57 keys |
| Migrations V1–V18 re-baseline + forward-only V19…head | MIG-01 (live), MIG-22 (live) | `backend/src/main/resources/db/migration/V1__init.sql`<br>`backend/src/main/resources/db/migration/V22__execution_replay_failure.sql` | head V22; V23 not landed (P09-13) |
| Chart values | CHV-009 (live), CHV-022 (live) | `helm-chart/put-checks/values.yaml:388`<br>`helm-chart/put-checks/values.yaml:448` | all chart-value/chart-value-env entries |

## 4. The list (every entry)

Columns: **Id** · **Surface** · **Value** (current, truncated) · **Anchor** (file:line now) · **Status** · **Delta** vs skeleton · **009 change** (lane: what) · **Tag**. Notes, owner, liveEvidence {tree, local, deployed}, skeleton anchor and inclusion are in the JSON.

### 4.1 Public routes `/api/v1/studio/**` (36)

| Id | Surface | Value | Anchor | Status | Delta | 009 change | Tag |
|---|---|---|---|---|---|---|---|
| RTP-01 | GET /api/v1/studio/tests |  | `docs/specs/studio/openapi.yaml:283`<br>`…/checks/studio/StudioController.java:51` | **live** | SAME |  | V |
| RTP-02 | POST /api/v1/studio/tests |  | `docs/specs/studio/openapi.yaml:351`<br>`…/checks/studio/StudioController.java:66` | **live** | SAME |  | V |
| RTP-03 | GET /api/v1/studio/tests/{id} |  | `docs/specs/studio/openapi.yaml:438`<br>`…/checks/studio/StudioController.java:75` | **live** | SAME |  | V |
| RTP-04 | PUT /api/v1/studio/tests/{id} |  | `docs/specs/studio/openapi.yaml:535`<br>`…/checks/studio/StudioController.java:80` | **live** | SAME |  | V |
| RTP-05 | DELETE /api/v1/studio/tests/{id} |  | `docs/specs/studio/openapi.yaml:623`<br>`…/checks/studio/StudioController.java:94` | **live** | SAME |  | V |
| RTP-06 | POST /api/v1/studio/tests/{id}/execute |  | `docs/specs/studio/openapi.yaml:641`<br>`…/checks/studio/StudioController.java:112` | **live** | SAME |  | V |
| RTP-07 | POST /api/v1/studio/tests/{id}/validate-variables |  | `docs/specs/studio/openapi.yaml:753`<br>`…/checks/studio/StudioController.java:177` | **live** | SAME |  | V |
| RTP-08 | GET /api/v1/studio/tests/{id}/secrets |  | `docs/specs/studio/openapi.yaml:811`<br>`…/checks/studio/secrets/StudioSecretsController.java:36` | **live** | SAME |  | V |
| RTP-09 | POST /api/v1/studio/tests/{id}/secrets |  | `docs/specs/studio/openapi.yaml:847`<br>`…/checks/studio/secrets/StudioSecretsController.java:42` | **live** | SAME |  | V |
| RTP-10 | GET /api/v1/studio/tests/{id}/capabilities |  | `docs/specs/studio/openapi.yaml:935`<br>`…/checks/studio/secrets/StudioSecretsCapabilityController.java:33` | **live** | SAME |  | V |
| RTP-11 | GET /api/v1/studio/executions |  | `docs/specs/studio/openapi.yaml:1000`<br>`…/checks/studio/StudioController.java:155` | **live** | SAME |  | V |
| RTP-12 | GET /api/v1/studio/executions/{id} |  | `docs/specs/studio/openapi.yaml:1061`<br>`…/checks/studio/StudioController.java:131` | **live** | SAME |  | V |
| RTP-13 | POST /api/v1/studio/executions/{id}/cancel |  | `docs/specs/studio/openapi.yaml:1118`<br>`…/checks/studio/StudioController.java:144` | **live** | SAME |  | V |
| RTP-14 | GET /api/v1/studio/executions/{id}/events |  | `docs/specs/studio/openapi.yaml:1166`<br>`…/checks/studio/sse/ExecutionEventsController.java:70` | **live** | SAME |  | V |
| RTP-15 | GET /api/v1/studio/executions/{id}/video |  | `docs/specs/studio/openapi.yaml:1200`<br>`…/checks/studio/ExecutionVideoController.java:55` | **live** | SAME |  | V |
| RTP-16 | POST /api/v1/studio/guided-sessions |  | `docs/specs/studio/openapi.yaml:1296`<br>`…/checks/studio/guided/session/GuidedSessionController.java:35` | **live** | CHANGED | C9: response set gains 422 INVALID_CONTRACT (AUTHORING_REFERENCE_AMBIGUOUS / unreadable stored source); path and operationId unchanged | V |
| RTP-17 | GET /api/v1/studio/guided-sessions/{id} |  | `docs/specs/studio/openapi.yaml:1499`<br>`…/checks/studio/guided/session/GuidedSessionController.java:45` | **live** | MOVED |  | V |
| RTP-18 | GET /api/v1/studio/guided-sessions/{id}/result |  | `docs/specs/studio/openapi.yaml:1547`<br>`…/checks/studio/guided/session/GuidedSessionController.java:59` | **live** | MOVED |  | V |
| RTP-19 | GET /api/v1/studio/guided-sessions/{id}/clarification |  | `docs/specs/studio/openapi.yaml:1717`<br>`…/checks/studio/guided/session/GuidedSessionController.java:77` | **live** | MOVED |  | V |
| RTP-20 | POST /api/v1/studio/guided-sessions/{id}/clarify |  | `docs/specs/studio/openapi.yaml:1759`<br>`…/checks/studio/guided/session/GuidedSessionController.java:83` | **live** | MOVED |  | V |
| RTP-21 | POST /api/v1/studio/guided-sessions/{id}/cancel |  | `docs/specs/studio/openapi.yaml:1810`<br>`…/checks/studio/guided/session/GuidedSessionController.java:93` | **live** | MOVED |  | V |
| RTP-22 | POST /api/v1/studio/guided-sessions/{id}/finalize |  | `docs/specs/studio/openapi.yaml:1856`<br>`…/checks/studio/guided/publication/GuidedPublicationController.java:28` | **live** | MOVED |  | V |
| RTP-23 | GET /api/v1/studio/guided-sessions/{id}/video |  | `docs/specs/studio/openapi.yaml:1900`<br>`…/checks/studio/guided/evidence/GuidedSessionVideoController.java:75` | **live** | MOVED |  | V |
| RTP-24 | GET /api/v1/studio/guided-policies |  | `docs/specs/studio/openapi.yaml:1982`<br>`…/checks/studio/guided/policy/ObservationPolicyController.java:42` | **live** | MOVED |  | V |
| RTP-25 | POST /api/v1/studio/guided-policies |  | `docs/specs/studio/openapi.yaml:2018`<br>`…/checks/studio/guided/policy/ObservationPolicyController.java:54` | **live** | MOVED |  | V |
| RTP-26 | GET /api/v1/studio/guided-policies/{id} |  | `docs/specs/studio/openapi.yaml:2148`<br>`…/checks/studio/guided/policy/ObservationPolicyController.java:60` | **live** | MOVED |  | V |
| RTP-27 | POST /api/v1/studio/guided-policies/{id}/versions |  | `docs/specs/studio/openapi.yaml:2174`<br>`…/checks/studio/guided/policy/ObservationPolicyController.java:65` | **live** | MOVED |  | V |
| RTP-28 | POST /api/v1/studio/guided-policies/{id}/versions/{version}/approval |  | `docs/specs/studio/openapi.yaml:2222`<br>`…/checks/studio/guided/policy/ObservationPolicyController.java:74` | **live** | MOVED |  | V |
| RTP-29 | GET /api/v1/studio/tests/{id}/schedule/capabilities |  | `docs/specs/studio/openapi.yaml:2614`<br>`…/checks/studio/scheduling/StudioScheduleController.java:32` | **live** | MOVED |  | V |
| RTP-30 | GET /api/v1/studio/tests/{id}/schedule |  | `docs/specs/studio/openapi.yaml:2641`<br>`…/checks/studio/scheduling/StudioScheduleController.java:37` | **live** | MOVED |  | V |
| RTP-31 | PUT /api/v1/studio/tests/{id}/schedule |  | `docs/specs/studio/openapi.yaml:2708`<br>`…/checks/studio/scheduling/StudioScheduleController.java:55` | **live** | MOVED |  | V |
| RTP-32 | POST /api/v1/studio/tests/{id}/schedule |  | `docs/specs/studio/openapi.yaml:2664`<br>`…/checks/studio/scheduling/StudioScheduleController.java:48` | **live** | MOVED |  | V |
| RTP-33 | DELETE /api/v1/studio/tests/{id}/schedule |  | `docs/specs/studio/openapi.yaml:2753`<br>`…/checks/studio/scheduling/StudioScheduleController.java:67` | **live** | MOVED |  | V |
| RTP-34 | PATCH /api/v1/studio/tests/{id}/schedule/enabled |  | `docs/specs/studio/openapi.yaml:2798`<br>`…/checks/studio/scheduling/StudioScheduleController.java:61` | **live** | MOVED |  | V |
| RTP-35 | POST /api/v1/studio/schedules/preview |  | `docs/specs/studio/openapi.yaml:2848`<br>`…/checks/studio/scheduling/StudioScheduleController.java:74` | **live** | MOVED |  | V |
| RTP-36 | GET /api/v1/studio/tests/{id}/schedule/occurrences |  | `docs/specs/studio/openapi.yaml:2877`<br>`…/checks/studio/scheduling/StudioScheduleController.java:80` | **live** | MOVED |  | V |

### 4.2 Internal routes declared in OpenAPI (8)

| Id | Surface | Value | Anchor | Status | Delta | 009 change | Tag |
|---|---|---|---|---|---|---|---|
| RTI-01 | POST /v2/validate-observed (runner; server https://runner.example.invalid) |  | `docs/specs/studio/openapi.yaml:144`<br>`studio-runner/src/server/routes.ts:206` | **live** | CHANGED | D1: path unchanged; now served only on the one node:https listener (server.ts:21) with a client-certificate pin before the bearer (routes.ts:163); /healt… | V |
| RTI-02 | POST /v2/runs (runner; server https://runner.example.invalid) |  | `docs/specs/studio/openapi.yaml:181`<br>`studio-runner/src/server/routes.ts:206` | **live** | CHANGED | D1: path unchanged; now served only on the one node:https listener (server.ts:21) with a client-certificate pin before the bearer (routes.ts:163); /healt… | V |
| RTI-03 | POST /internal/studio/executions/{id}/observed-admission (api-callback; server https://co… |  | `docs/specs/studio/openapi.yaml:225`<br>`…/checks/studio/internal/StudioInternalController.java:69` | **live** | SAME |  | V |
| RTI-04 | DELETE /v2/runs/{id} (runner; server {runnerBaseUrl}) |  | `docs/specs/studio/openapi.yaml:2284`<br>`studio-runner/src/server/routes.ts:127,226` | **live** | CHANGED | D1: path unchanged; now served only on the one node:https listener (server.ts:21) with a client-certificate pin before the bearer (routes.ts:163); /healt… | V |
| RTI-05 | GET /internal/studio/executions/{id}/control (api-callback; server {apiInternalBaseUrl}) |  | `docs/specs/studio/openapi.yaml:2344`<br>`…/checks/studio/internal/StudioInternalController.java:64` | **live** | MOVED |  | V |
| RTI-06 | POST /internal/studio/executions/{id}/progress (api-callback; server {apiInternalBaseUrl}) |  | `docs/specs/studio/openapi.yaml:2395`<br>`…/checks/studio/internal/StudioInternalController.java:91` | **live** | MOVED |  | V |
| RTI-07 | GET /health (runner; server {runnerBaseUrl}) |  | `docs/specs/studio/openapi.yaml:2550`<br>`studio-runner/src/server/routes.ts:188` | **live** | CHANGED | D1: path unchanged; now served only on the one node:https listener (server.ts:21) with a client-certificate pin before the bearer (routes.ts:163); /healt… | V |
| RTI-08 | GET /ready (runner; server {runnerBaseUrl}) |  | `docs/specs/studio/openapi.yaml:2582`<br>`studio-runner/src/server/routes.ts:194` | **live** | CHANGED | D1: path unchanged; now served only on the one node:https listener (server.ts:21) with a client-certificate pin before the bearer (routes.ts:163); /healt… | V |

### 4.3 Internal routes not in OpenAPI (scope open, OI-03) (18)

| Id | Surface | Value | Anchor | Status | Delta | 009 change | Tag |
|---|---|---|---|---|---|---|---|
| RTX-01 | POST /internal/v2/studio/guided-sessions/{id}/claim (backend; runner->API bridge callback) |  | `…/checks/studio/guided/session/GuidedInternalController.java:31` | **live**<br><sub>scope-open (OI-03)</sub> | SAME |  | V |
| RTX-02 | POST /internal/v2/studio/guided-sessions/{id}/observations (backend; runner->API bridge c… |  | `…/checks/studio/guided/session/GuidedInternalController.java:42` | **live**<br><sub>scope-open (OI-03)</sub> | SAME |  | V |
| RTX-03 | POST /internal/v2/studio/guided-sessions/{id}/admissions (backend; runner->API bridge cal… |  | `…/checks/studio/guided/session/GuidedInternalController.java:54` | **live**<br><sub>scope-open (OI-03)</sub> | SAME |  | V |
| RTX-04 | POST /internal/v2/studio/guided-sessions/{id}/advance (backend; runner->API bridge callba… |  | `…/checks/studio/guided/session/GuidedInternalController.java:68` | **live**<br><sub>scope-open (OI-03)</sub> | SAME |  | V |
| RTX-05 | POST /internal/v2/studio/guided-sessions/{id}/outcomes (backend; runner->API bridge callb… |  | `…/checks/studio/guided/session/GuidedInternalController.java:82` | **live**<br><sub>scope-open (OI-03)</sub> | SAME |  | V |
| RTX-06 | POST /internal/v2/studio/guided-sessions/{id}/bootstrap-evidence (backend; runner->API br… |  | `…/checks/studio/guided/session/GuidedInternalController.java:94` | **live**<br><sub>scope-open (OI-03)</sub> | SAME |  | V |
| RTX-07 | POST /internal/v2/studio/guided-sessions/{id}/lifecycle (backend; runner->API bridge call… |  | `…/checks/studio/guided/session/GuidedInternalController.java:106` | **live**<br><sub>scope-open (OI-03)</sub> | BEHAVIOUR | BL: SEMANTIC: context lifecycle honours the runner stop reason (EXPIRED -> EXPIRED); path unchanged | V |
| RTX-08 | POST /internal/v2/studio/guided-sessions/{id}/recording-evidence (backend; runner->API br… |  | `…/checks/studio/guided/evidence/GuidedSessionEvidenceInternalController.java:50 (ROUTE GuidedSessionEvidenceS…` | **live**<br><sub>scope-open (OI-03)</sub> | BEHAVIOUR | B: SEMANTIC: accepted context revision is membership in {n, n-1} while a delivery is pending (R1); path unchanged | V |
| RTX-09 | POST /internal/v2/studio/guided-sessions/{id}/plans (backend; runner->API bridge callback) |  | `…/checks/studio/guided/translation/GuidedPlanningController.java:29` | **live**<br><sub>scope-open (OI-03)</sub> | SAME |  | V |
| RTX-10 | POST /internal/v2/studio/guided-sessions/{id}/proposals (backend; runner->API bridge call… |  | `…/checks/studio/guided/translation/GuidedPlanningController.java:41` | **live**<br><sub>scope-open (OI-03)</sub> | SAME |  | V |
| RTX-11 | POST /internal/v2/studio/guided-sessions/{id}/dependency-admissions (backend; runner->API… |  | `…/checks/studio/guided/translation/GuidedPlanningController.java:53` | **live**<br><sub>scope-open (OI-03)</sub> | SAME |  | V |
| RTX-12 | POST /internal/v2/studio/guided-sessions/{id}/planning-context (backend; runner->API brid… |  | `…/checks/studio/guided/translation/GuidedPlanningController.java:65` | **live**<br><sub>scope-open (OI-03)</sub> | SAME |  | V |
| RTX-13 | POST /internal/v2/studio/guided-sessions/{id}/assign (runner guided bridge; API->runner) |  | `studio-runner/src/guided/transport.ts:101`<br>`studio-runner/src/server/routes.ts:130` | **dark**<br><sub>scope-open (OI-03)</sub> | CHANGED | D1: HOST: served by the one folded runner process (guidedMain.ts deleted) through routes.ts GUIDED_ROUTE_PREFIX; not routed at all (404 NOT_FOUND after t… | V |
| RTX-14 | POST /internal/v2/studio/guided-sessions/{id}/context (runner guided bridge; API->runner) |  | `studio-runner/src/guided/transport.ts:101`<br>`studio-runner/src/server/routes.ts:130` | **dark**<br><sub>scope-open (OI-03)</sub> | CHANGED | D1: HOST: served by the one folded runner process (guidedMain.ts deleted) through routes.ts GUIDED_ROUTE_PREFIX; not routed at all (404 NOT_FOUND after t… | V |
| RTX-15 | POST /internal/v2/studio/guided-sessions/{id}/prepare (runner guided bridge; API->runner) |  | `studio-runner/src/guided/transport.ts:101`<br>`studio-runner/src/server/routes.ts:130` | **dark**<br><sub>scope-open (OI-03)</sub> | CHANGED | D1: HOST: served by the one folded runner process (guidedMain.ts deleted) through routes.ts GUIDED_ROUTE_PREFIX; not routed at all (404 NOT_FOUND after t… | V |
| RTX-16 | POST /internal/v2/studio/guided-sessions/{id}/dispatch (runner guided bridge; API->runner) |  | `studio-runner/src/guided/transport.ts:101`<br>`studio-runner/src/server/routes.ts:130` | **dark**<br><sub>scope-open (OI-03)</sub> | CHANGED | D1: HOST: served by the one folded runner process (guidedMain.ts deleted) through routes.ts GUIDED_ROUTE_PREFIX; not routed at all (404 NOT_FOUND after t… | V |
| RTX-17 | POST /internal/v2/studio/guided-sessions/{id}/observe (runner guided bridge; API->runner) |  | `studio-runner/src/guided/transport.ts:101`<br>`studio-runner/src/server/routes.ts:130` | **dark**<br><sub>scope-open (OI-03)</sub> | CHANGED | D1: HOST: served by the one folded runner process (guidedMain.ts deleted) through routes.ts GUIDED_ROUTE_PREFIX; not routed at all (404 NOT_FOUND after t… | V |
| RTX-18 | POST /internal/v2/studio/guided-sessions/{id}/stop (runner guided bridge; API->runner) |  | `studio-runner/src/guided/transport.ts:101`<br>`studio-runner/src/server/routes.ts:130` | **dark**<br><sub>scope-open (OI-03)</sub> | CHANGED | D1: HOST: served by the one folded runner process (guidedMain.ts deleted) through routes.ts GUIDED_ROUTE_PREFIX; not routed at all (404 NOT_FOUND after t… | V |

### 4.4 OpenAPI document and named components (5)

| Id | Surface | Value | Anchor | Status | Delta | 009 change | Tag |
|---|---|---|---|---|---|---|---|
| OAS-00 | docs/specs/studio/openapi.yaml (36 paths, 44 operations: 36 public + 8 internal) | sha256 bbf37fd1f96c0da33bbca6db4c04c94222a44429a4b6f0e33c92dfc59fca02… | `docs/specs/studio/openapi.yaml:1`<br>`backend/src/test/java/com/citi/put/checks/studio/StudioContractTest.java:94 (BASE_SHA256), :345-346 (hasSize …`<br>`studio-runner/test/run/confinement.test.ts:298 (BASE_SHA256)` | **live** | CHANGED | C9: digest b5ecdcad…ae29244 -> bbf37fd1…fca02c4; RuntimeVersions/ReportedRuntimeVersions descriptions (A7), 2 report + 9 public runtime examples, startGu… | V |
| OAS-01 | components.schemas.RuntimeVersions |  | `docs/specs/studio/openapi.yaml:4185` | **live** | CHANGED | C9: description text only: field names kept, meanings re-pointed to observed identities | V |
| OAS-02 | components.schemas.ReportedRuntimeVersions |  | `docs/specs/studio/openapi.yaml:4610` | **live** | CHANGED | C9: description text only: field names kept, meanings re-pointed to observed identities | V |
| OAS-03 | components.schemas.ExecutionSnapshot.replayFailure |  | `docs/specs/studio/openapi.yaml:4327` | **live** | MOVED |  | V |
| OAS-04 | components.schemas.ReplayFailure |  | `docs/specs/studio/openapi.yaml:4330` | **live** | MOVED |  | V |

### 4.5 `contracts/v3` documents (51)

| Id | Surface | Value | Anchor | Status | Delta | 009 change | Tag |
|---|---|---|---|---|---|---|---|
| CON-01 | contracts/v3/action-timing.schema.json |  | `docs/specs/studio-observed-authoring/contracts/v3/action-timing.schema.json` | **live** | SAME |  | V |
| CON-02 | contracts/v3/action.schema.json |  | `docs/specs/studio-observed-authoring/contracts/v3/action.schema.json` | **live** | SAME |  | V |
| CON-03 | contracts/v3/allocation.schema.json |  | `docs/specs/studio-observed-authoring/contracts/v3/allocation.schema.json` | **live** | SAME |  | V |
| CON-04 | contracts/v3/assignment-lifecycle.schema.json |  | `docs/specs/studio-observed-authoring/contracts/v3/assignment-lifecycle.schema.json` | **live** | SAME |  | V |
| CON-05 | contracts/v3/assignment-receipt.schema.json |  | `docs/specs/studio-observed-authoring/contracts/v3/assignment-receipt.schema.json` | **live** | SAME |  | V |
| CON-06 | contracts/v3/assignment-stop.schema.json |  | `docs/specs/studio-observed-authoring/contracts/v3/assignment-stop.schema.json` | **live** | SAME |  | V |
| CON-07 | contracts/v3/assignment.schema.json |  | `docs/specs/studio-observed-authoring/contracts/v3/assignment.schema.json` | **live** | SAME |  | V |
| CON-08 | contracts/v3/authored-inputs.schema.json |  | `docs/specs/studio-observed-authoring/contracts/v3/authored-inputs.schema.json` | **live** | SAME |  | V |
| CON-09 | contracts/v3/authoring-snapshot.schema.json |  | `docs/specs/studio-observed-authoring/contracts/v3/authoring-snapshot.schema.json` | **live** | SAME |  | V |
| CON-10 | contracts/v3/availability.schema.json |  | `docs/specs/studio-observed-authoring/contracts/v3/availability.schema.json` | **live** | SAME |  | V |
| CON-11 | contracts/v3/binding.schema.json |  | `docs/specs/studio-observed-authoring/contracts/v3/binding.schema.json` | **live** | SAME |  | V |
| CON-12 | contracts/v3/bridge.schema.json |  | `docs/specs/studio-observed-authoring/contracts/v3/bridge.schema.json` | **live** | SAME |  | V |
| CON-13 | contracts/v3/clarification.schema.json |  | `docs/specs/studio-observed-authoring/contracts/v3/clarification.schema.json` | **live** | SAME |  | V |
| CON-14 | contracts/v3/commands.schema.json |  | `docs/specs/studio-observed-authoring/contracts/v3/commands.schema.json` | **live** | SAME |  | V |
| CON-15 | contracts/v3/consumer-edge.schema.json |  | `docs/specs/studio-observed-authoring/contracts/v3/consumer-edge.schema.json` | **live** | SAME |  | V |
| CON-16 | contracts/v3/current-synthetic-worlds.json |  | `docs/specs/studio-observed-authoring/contracts/v3/current-synthetic-worlds.json` | **live** | SAME |  | V |
| CON-17 | contracts/v3/error.schema.json |  | `docs/specs/studio-observed-authoring/contracts/v3/error.schema.json` | **live** | SAME |  | V |
| CON-18 | contracts/v3/execution-evidence.schema.json |  | `docs/specs/studio-observed-authoring/contracts/v3/execution-evidence.schema.json` | **live** | SAME |  | V |
| CON-19 | contracts/v3/fixtures.json |  | `docs/specs/studio-observed-authoring/contracts/v3/fixtures.json` | **live** | SAME |  | V |
| CON-20 | contracts/v3/guided-model-response.schema.json |  | `docs/specs/studio-observed-authoring/contracts/v3/guided-model-response.schema.json` | **live** | SAME |  | V |
| CON-21 | contracts/v3/guided-planning-commands.schema.json |  | `docs/specs/studio-observed-authoring/contracts/v3/guided-planning-commands.schema.json` | **live** | SAME |  | V |
| CON-22 | contracts/v3/guided-policy.schema.json |  | `docs/specs/studio-observed-authoring/contracts/v3/guided-policy.schema.json` | **live** | SAME |  | V |
| CON-23 | contracts/v3/learned-plan.schema.json |  | `docs/specs/studio-observed-authoring/contracts/v3/learned-plan.schema.json` | **live** | SAME |  | V |
| CON-24 | contracts/v3/ledger.schema.json |  | `docs/specs/studio-observed-authoring/contracts/v3/ledger.schema.json` | **live** | SAME |  | V |
| CON-25 | contracts/v3/limits.schema.json |  | `docs/specs/studio-observed-authoring/contracts/v3/limits.schema.json` | **live** | SAME |  | V |
| CON-26 | contracts/v3/observation-refresh.schema.json |  | `docs/specs/studio-observed-authoring/contracts/v3/observation-refresh.schema.json` | **live** | SAME |  | V |
| CON-27 | contracts/v3/observation.schema.json |  | `docs/specs/studio-observed-authoring/contracts/v3/observation.schema.json` | **live** | SAME |  | V |
| CON-28 | contracts/v3/planning-context.schema.json |  | `docs/specs/studio-observed-authoring/contracts/v3/planning-context.schema.json` | **live** | SAME |  | V |
| CON-29 | contracts/v3/planning-fixtures.json |  | `docs/specs/studio-observed-authoring/contracts/v3/planning-fixtures.json` | **live** | SAME |  | V |
| CON-30 | contracts/v3/producer.schema.json |  | `docs/specs/studio-observed-authoring/contracts/v3/producer.schema.json` | **live** | SAME |  | V |
| CON-31 | contracts/v3/public-ui-projections.schema.json |  | `docs/specs/studio-observed-authoring/contracts/v3/public-ui-projections.schema.json` | **live** | SAME |  | V |
| CON-32 | contracts/v3/publication-canonical-vectors.json |  | `docs/specs/studio-observed-authoring/contracts/v3/publication-canonical-vectors.json` | **live** | SAME |  | V |
| CON-33 | contracts/v3/publication-fixtures.json |  | `docs/specs/studio-observed-authoring/contracts/v3/publication-fixtures.json` | **live** | SAME |  | V |
| CON-34 | contracts/v3/publication.schema.json |  | `docs/specs/studio-observed-authoring/contracts/v3/publication.schema.json` | **live** | SAME |  | V |
| CON-35 | contracts/v3/replay-artifact.schema.json |  | `docs/specs/studio-observed-authoring/contracts/v3/replay-artifact.schema.json` | **live** | SAME |  | V |
| CON-36 | contracts/v3/replay-ipc.schema.json |  | `docs/specs/studio-observed-authoring/contracts/v3/replay-ipc.schema.json` | **live** | SAME |  | V |
| CON-37 | contracts/v3/replay-job.schema.json |  | `docs/specs/studio-observed-authoring/contracts/v3/replay-job.schema.json` | **live** | SAME |  | V |
| CON-38 | contracts/v3/replay-operation.schema.json |  | `docs/specs/studio-observed-authoring/contracts/v3/replay-operation.schema.json` | **live** | SAME |  | V |
| CON-39 | contracts/v3/replay-policy.schema.json |  | `docs/specs/studio-observed-authoring/contracts/v3/replay-policy.schema.json` | **live** | SAME |  | V |
| CON-40 | contracts/v3/replay-profile.schema.json |  | `docs/specs/studio-observed-authoring/contracts/v3/replay-profile.schema.json` | **live** | SAME |  | V |
| CON-41 | contracts/v3/replay-validation.schema.json |  | `docs/specs/studio-observed-authoring/contracts/v3/replay-validation.schema.json` | **live** | SAME |  | V |
| CON-42 | contracts/v3/result.schema.json |  | `docs/specs/studio-observed-authoring/contracts/v3/result.schema.json` | **live** | SAME |  | V |
| CON-43 | contracts/v3/revision.schema.json |  | `docs/specs/studio-observed-authoring/contracts/v3/revision.schema.json` | **live** | SAME |  | V |
| CON-44 | contracts/v3/runner-context.schema.json |  | `docs/specs/studio-observed-authoring/contracts/v3/runner-context.schema.json` | **live** | SAME |  | V |
| CON-45 | contracts/v3/session-view.schema.json |  | `docs/specs/studio-observed-authoring/contracts/v3/session-view.schema.json` | **live** | SAME |  | V |
| CON-46 | contracts/v3/session.schema.json |  | `docs/specs/studio-observed-authoring/contracts/v3/session.schema.json` | **live** | SAME |  | V |
| CON-47 | contracts/v3/source-reference.schema.json |  | `docs/specs/studio-observed-authoring/contracts/v3/source-reference.schema.json` | **live** | SAME |  | V |
| CON-48 | contracts/v3/source-selection.schema.json |  | `docs/specs/studio-observed-authoring/contracts/v3/source-selection.schema.json` | **live** | SAME |  | V |
| CON-49 | contracts/v3/timing-order-vectors.json |  | `docs/specs/studio-observed-authoring/contracts/v3/timing-order-vectors.json` | **live** | SAME |  | V |
| CON-50 | contracts/v3/versions.schema.json |  | `docs/specs/studio-observed-authoring/contracts/v3/versions.schema.json` | **live** | SAME |  | V |
| CON-51 | contracts/v3/wire-parity.fixtures.json |  | `docs/specs/studio-observed-authoring/contracts/v3/wire-parity.fixtures.json` | **live** | SAME |  | V |

### 4.6 Migrations (22)

| Id | Surface | Value | Anchor | Status | Delta | 009 change | Tag |
|---|---|---|---|---|---|---|---|
| MIG-01 | Flyway V1__init.sql |  | `backend/src/main/resources/db/migration/V1__init.sql` | **live** | SAME |  | V |
| MIG-02 | Flyway V2__schedule_next_execution.sql |  | `backend/src/main/resources/db/migration/V2__schedule_next_execution.sql` | **live** | SAME |  | V |
| MIG-03 | Flyway V3__check_templates_seed.sql |  | `backend/src/main/resources/db/migration/V3__check_templates_seed.sql` | **live** | SAME |  | V |
| MIG-04 | Flyway V4__secrets_encrypted_value.sql |  | `backend/src/main/resources/db/migration/V4__secrets_encrypted_value.sql` | **live** | SAME |  | V |
| MIG-05 | Flyway V5__story_3_schema_additions.sql |  | `backend/src/main/resources/db/migration/V5__story_3_schema_additions.sql` | **live** | SAME |  | V |
| MIG-06 | Flyway V6__report_next_delivery.sql |  | `backend/src/main/resources/db/migration/V6__report_next_delivery.sql` | **live** | SAME |  | V |
| MIG-07 | Flyway V7__partition_remaining_tables_and_defaults.sql |  | `backend/src/main/resources/db/migration/V7__partition_remaining_tables_and_defaults.sql` | **live** | SAME |  | V |
| MIG-08 | Flyway V8__failed_dispatches_and_report_failures.sql |  | `backend/src/main/resources/db/migration/V8__failed_dispatches_and_report_failures.sql` | **live** | SAME |  | V |
| MIG-09 | Flyway V9__schedules_check_type_column.sql |  | `backend/src/main/resources/db/migration/V9__schedules_check_type_column.sql` | **live** | SAME |  | V |
| MIG-10 | Flyway V10__uppercase_status_standardization.sql |  | `backend/src/main/resources/db/migration/V10__uppercase_status_standardization.sql` | **live** | SAME |  | V |
| MIG-11 | Flyway V11__check_acknowledge_assign.sql |  | `backend/src/main/resources/db/migration/V11__check_acknowledge_assign.sql` | **live** | SAME |  | V |
| MIG-12 | Flyway V12__tests_revisions.sql |  | `backend/src/main/resources/db/migration/V12__tests_revisions.sql` | **live** | SAME |  | V |
| MIG-13 | Flyway V13__executions_ledger.sql |  | `backend/src/main/resources/db/migration/V13__executions_ledger.sql` | **live** | SAME |  | V |
| MIG-14 | Flyway V14__guided_sessions.sql |  | `backend/src/main/resources/db/migration/V14__guided_sessions.sql` | **live** | SAME |  | V |
| MIG-15 | Flyway V15__publication.sql |  | `backend/src/main/resources/db/migration/V15__publication.sql` | **live** | SAME |  | V |
| MIG-16 | Flyway V16__scheduling.sql |  | `backend/src/main/resources/db/migration/V16__scheduling.sql` | **live** | SAME |  | V |
| MIG-17 | Flyway V17__secret_use_audit.sql |  | `backend/src/main/resources/db/migration/V17__secret_use_audit.sql` | **live** | SAME |  | V |
| MIG-18 | Flyway V18__drop_plaintext_secrets.sql |  | `backend/src/main/resources/db/migration/V18__drop_plaintext_secrets.sql` | **live** | SAME |  | V |
| MIG-19 | Flyway V19__guided_governance.sql |  | `backend/src/main/resources/db/migration/V19__guided_governance.sql` | **live** | SAME |  | V |
| MIG-20 | Flyway V20__guided_session_recording.sql |  | `backend/src/main/resources/db/migration/V20__guided_session_recording.sql` | **live** | SAME |  | V |
| MIG-21 | Flyway V21__guided_session_replaying_prefix.sql |  | `backend/src/main/resources/db/migration/V21__guided_session_replaying_prefix.sql` | **live** | SAME |  | V |
| MIG-22 | Flyway V22__execution_replay_failure.sql |  | `backend/src/main/resources/db/migration/V22__execution_replay_failure.sql` | **live** | SAME |  | V |

### 4.7 Backend `application.yml` `studio.*` leaves (110)

| Id | Surface | Value | Anchor | Status | Delta | 009 change | Tag |
|---|---|---|---|---|---|---|---|
| CFB-001 | studio.guided-authoring.controller-token-file | ${STUDIO_GUIDED_RUNNER_CONTROLLER_TOKEN_FILE:} | `backend/src/main/resources/application.yml:200` | **dark** | SAME |  | V |
| CFB-002 | studio.guided-authoring.translation.controller-token-file | ${STUDIO_GUIDED_CONTROLLER_TOKEN_FILE:${studio.guided-authoring.contr… | `backend/src/main/resources/application.yml:221` | **dark** | MOVED |  | V |
| CFB-003 | studio.guided-authoring.retention.observation-window | ${STUDIO_GUIDED_OBSERVATION_RETENTION:30d} | `backend/src/main/resources/application.yml:227` | **live** | MOVED |  | V |
| CFB-004 | studio.guided-authoring.retention.pruner-delay-ms | 3600000 | `backend/src/main/resources/application.yml:228` | **live** | MOVED |  | V |
| CFB-005 | studio.guided-authoring.retention.batch-size | 100 | `backend/src/main/resources/application.yml:229` | **live** | MOVED |  | V |
| CFB-006 | studio.guided-authoring.csi-budget.max-concurrent-sessions | ${STUDIO_GUIDED_CSI_MAX_CONCURRENT:3} | `backend/src/main/resources/application.yml:233` | **live** | MOVED |  | V |
| CFB-007 | studio.guided-authoring.csi-budget.daily-model-input-tokens | ${STUDIO_GUIDED_CSI_DAILY_INPUT_TOKENS:5242880} | `backend/src/main/resources/application.yml:234` | **live** | MOVED |  | V |
| CFB-008 | studio.guided-authoring.csi-budget.daily-model-output-tokens | ${STUDIO_GUIDED_CSI_DAILY_OUTPUT_TOKENS:640000} | `backend/src/main/resources/application.yml:235` | **live** | MOVED |  | V |
| CFB-009 | studio.guided-authoring.policy.approver-groups | [] | `backend/src/main/resources/application.yml:239` | **live** | MOVED |  | V |
| CFB-010 | studio.guided-authoring.policy.default-destructive-vocabulary | ["delete","remove","erase","destroy","purge","pay","transfer","send m… | `backend/src/main/resources/application.yml:240` | **live** | MOVED |  | V |
| CFB-011 | studio.guided.publication.enabled | ${STUDIO_OBSERVED_PUBLICATION_ENABLED:true} | `backend/src/main/resources/application.yml:258` | **live** | MOVED |  | V |
| CFB-012 | studio.guided.publication.max-validation-attempts | 3 | `backend/src/main/resources/application.yml:259` | **live** | MOVED |  | V |
| CFB-013 | studio.guided.publication.validation-timeout-ms | 15000 | `backend/src/main/resources/application.yml:260` | **live** | MOVED |  | V |
| CFB-014 | studio.guided.publication.authorization-ttl-ms | 5000 | `backend/src/main/resources/application.yml:261` | **live** | MOVED |  | V |
| CFB-015 | studio.guided.publication.max-validation-bytes | 8388608 | `backend/src/main/resources/application.yml:262` | **live** | MOVED |  | V |
| CFB-016 | studio.observed-replay.enabled | ${STUDIO_OBSERVED_REPLAY_ENABLED:true} | `backend/src/main/resources/application.yml:264` | **live** | MOVED |  | V |
| CFB-017 | studio.observed-replay.authorization-ttl-ms | 30000 | `backend/src/main/resources/application.yml:265` | **live** | MOVED |  | V |
| CFB-018 | studio.observed-replay.max-artifact-bytes | 1048576 | `backend/src/main/resources/application.yml:266` | **live** | MOVED |  | V |
| CFB-019 | studio.observed-replay.max-job-bytes | 4194304 | `backend/src/main/resources/application.yml:267` | **live** | MOVED |  | V |
| CFB-020 | studio.observed-replay.max-execute-frame-bytes | 2097152 | `backend/src/main/resources/application.yml:268` | **live** | MOVED |  | V |
| CFB-021 | studio.observed-replay.catalog-json | ${STUDIO_OBSERVED_CATALOG_JSON:[]} | `backend/src/main/resources/application.yml:269` | **live** | MOVED |  | V |
| CFB-022 | studio.observed-replay.policies-json | ${STUDIO_OBSERVED_POLICIES_JSON:[]} | `backend/src/main/resources/application.yml:270` | **live** | MOVED |  | V |
| CFB-023 | studio.observed-replay.recording-width | ${STUDIO_OBSERVED_RECORDING_WIDTH:1280} | `backend/src/main/resources/application.yml:271` | **live** | MOVED |  | V |
| CFB-024 | studio.observed-replay.recording-height | ${STUDIO_OBSERVED_RECORDING_HEIGHT:720} | `backend/src/main/resources/application.yml:272` | **live** | MOVED |  | V |
| CFB-025 | studio.authoring.max-steps | ${STUDIO_AUTHORING_MAX_STEPS:100} | `backend/src/main/resources/application.yml:275` | **live** | MOVED |  | V |
| CFB-026 | studio.secrets.vault.provider | ${STUDIO_VAULT_PROVIDER:none} | `backend/src/main/resources/application.yml:288` | **live** | MOVED |  | V |
| CFB-027 | studio.secrets.vault.hashicorp.address | ${STUDIO_VAULT_ADDRESS:} | `backend/src/main/resources/application.yml:290` | **live** | MOVED |  | V |
| CFB-028 | studio.secrets.vault.hashicorp.namespace | ${STUDIO_VAULT_NAMESPACE:} | `backend/src/main/resources/application.yml:291` | **live** | MOVED |  | V |
| CFB-029 | studio.secrets.vault.hashicorp.mount | ${STUDIO_VAULT_MOUNT:secret} | `backend/src/main/resources/application.yml:292` | **live** | MOVED |  | V |
| CFB-030 | studio.secrets.vault.hashicorp.path-template | ${STUDIO_VAULT_PATH_TEMPLATE:} | `backend/src/main/resources/application.yml:293` | **live** | MOVED |  | V |
| CFB-031 | studio.secrets.vault.hashicorp.value-key | ${STUDIO_VAULT_VALUE_KEY:value} | `backend/src/main/resources/application.yml:294` | **live** | MOVED |  | V |
| CFB-032 | studio.secrets.vault.hashicorp.token-file | ${STUDIO_VAULT_TOKEN_FILE:} | `backend/src/main/resources/application.yml:295` | **live** | MOVED |  | V |
| CFB-033 | studio.secrets.vault.hashicorp.connect-timeout | ${STUDIO_VAULT_CONNECT_TIMEOUT:2s} | `backend/src/main/resources/application.yml:296` | **live** | MOVED |  | V |
| CFB-034 | studio.secrets.vault.hashicorp.request-timeout | ${STUDIO_VAULT_REQUEST_TIMEOUT:5s} | `backend/src/main/resources/application.yml:297` | **live** | MOVED |  | V |
| CFB-035 | studio.secrets.vault.hashicorp.max-response-bytes | ${STUDIO_VAULT_MAX_RESPONSE_BYTES:65536} | `backend/src/main/resources/application.yml:298` | **live** | MOVED |  | V |
| CFB-036 | studio.execution.enabled | ${STUDIO_EXECUTION_ENABLED:true} | `backend/src/main/resources/application.yml:303` | **live** | MOVED |  | V |
| CFB-037 | studio.execution.pending-sla | ${STUDIO_PENDING_SLA:600s} | `backend/src/main/resources/application.yml:305` | **live** | MOVED |  | V |
| CFB-038 | studio.execution.start-deadline | ${STUDIO_START_DEADLINE:30s} | `backend/src/main/resources/application.yml:306` | **live** | MOVED |  | V |
| CFB-039 | studio.execution.run-deadline | ${STUDIO_RUN_DEADLINE:600s} | `backend/src/main/resources/application.yml:307` | **live** | MOVED |  | V |
| CFB-040 | studio.execution.total-runtime | ${STUDIO_TOTAL_RUNTIME:120s} | `backend/src/main/resources/application.yml:313` | **live** | MOVED |  | V |
| CFB-041 | studio.execution.admission-timeout | ${STUDIO_ADMISSION_TIMEOUT:10s} | `backend/src/main/resources/application.yml:314` | **live** | MOVED |  | V |
| CFB-042 | studio.execution.evidence-retention | ${STUDIO_EVIDENCE_RETENTION:30d} | `backend/src/main/resources/application.yml:315` | **live** | MOVED |  | V |
| CFB-043 | studio.execution.callback-base-url | ${STUDIO_CALLBACK_BASE_URL:http://put-checks-api:8080} | `backend/src/main/resources/application.yml:317` | **live** | MOVED |  | V |
| CFB-044 | studio.execution.video-store.bucket | ${STUDIO_EVIDENCE_BUCKET:put-checks-studio-evidence} | `backend/src/main/resources/application.yml:322` | **live** | MOVED |  | V |
| CFB-045 | studio.execution.video-store.endpoint | ${STUDIO_EVIDENCE_ENDPOINT:} | `backend/src/main/resources/application.yml:323` | **live** | MOVED |  | V |
| CFB-046 | studio.execution.video-store.provider | ${STUDIO_EVIDENCE_PROVIDER:none} | `backend/src/main/resources/application.yml:326` | **live** | MOVED |  | V |
| CFB-047 | studio.execution.video-store.directory | ${STUDIO_EVIDENCE_DIRECTORY:/tmp/studio-runner-objects} | `backend/src/main/resources/application.yml:327` | **live** | MOVED |  | V |
| CFB-048 | studio.execution.video-store.region | ${STUDIO_EVIDENCE_REGION:us-east-1} | `backend/src/main/resources/application.yml:328` | **live** | MOVED |  | V |
| CFB-049 | studio.execution.video-store.path-style-access | ${STUDIO_EVIDENCE_PATH_STYLE_ACCESS:true} | `backend/src/main/resources/application.yml:329` | **live** | MOVED |  | V |
| CFB-050 | studio.execution.video-store.access-key-id-file | ${STUDIO_EVIDENCE_ACCESS_KEY_ID_FILE:} | `backend/src/main/resources/application.yml:330` | **live** | MOVED |  | V |
| CFB-051 | studio.execution.video-store.secret-access-key-file | ${STUDIO_EVIDENCE_SECRET_ACCESS_KEY_FILE:} | `backend/src/main/resources/application.yml:331` | **live** | MOVED |  | V |
| CFB-052 | studio.execution.video-store.max-manifest-bytes | ${STUDIO_EVIDENCE_MAX_MANIFEST_BYTES:524288} | `backend/src/main/resources/application.yml:332` | **live** | MOVED |  | V |
| CFB-053 | studio.execution.video-store.connect-timeout | ${STUDIO_EVIDENCE_CONNECT_TIMEOUT:2s} | `backend/src/main/resources/application.yml:333` | **live** | MOVED |  | V |
| CFB-054 | studio.execution.video-store.request-timeout | ${STUDIO_EVIDENCE_REQUEST_TIMEOUT:10s} | `backend/src/main/resources/application.yml:334` | **live** | MOVED |  | V |
| CFB-055 | studio.execution.quotas.per-csi | ${STUDIO_QUOTA_PER_CSI:20} | `backend/src/main/resources/application.yml:336` | **live** | MOVED |  | V |
| CFB-056 | studio.execution.quotas.global | ${STUDIO_QUOTA_GLOBAL:200} | `backend/src/main/resources/application.yml:337` | **live** | MOVED |  | V |
| CFB-057 | studio.execution.quotas.max-steps-per-test | ${STUDIO_MAX_STEPS:200} | `backend/src/main/resources/application.yml:338` | **live** | MOVED |  | V |
| CFB-058 | studio.execution.recovery.poll-interval-ms | ${STUDIO_RECOVERY_POLL_MS:5000} | `backend/src/main/resources/application.yml:341` | **live** | MOVED |  | V |
| CFB-059 | studio.execution.cancel.control-poll-interval | 2s | `backend/src/main/resources/application.yml:351` | **live** | MOVED |  | V |
| CFB-060 | studio.execution.cancel.report-timeout | ${STUDIO_RUNNER_ADMISSION_TIMEOUT_MS:10000} | `backend/src/main/resources/application.yml:352` | **live** | MOVED |  | V |
| CFB-061 | studio.execution.cancel.stop-grace | ${STUDIO_RUNNER_BROWSER_STOP_TIMEOUT_MS:5000} | `backend/src/main/resources/application.yml:353` | **live** | MOVED |  | V |
| CFB-062 | studio.execution.cancel.evidence-window | ${STUDIO_RUNNER_OBJECT_STORE_WINDOW_MS:15000} | `backend/src/main/resources/application.yml:354` | **live** | MOVED |  | V |
| CFB-063 | studio.execution.cancel.delivery-window | ${STUDIO_RUNNER_TERMINAL_DELIVERY_WINDOW_MS:30000} | `backend/src/main/resources/application.yml:355` | **live** | MOVED |  | V |
| CFB-064 | studio.execution.cancel.slack | ${STUDIO_CANCEL_MARGIN_SLACK:10s} | `backend/src/main/resources/application.yml:356` | **live** | MOVED |  | V |
| CFB-065 | studio.execution.cancel.margin | ${STUDIO_CANCEL_MARGIN:} | `backend/src/main/resources/application.yml:357` | **live** | MOVED |  | V |
| CFB-066 | studio.execution.dispatcher.enabled | ${STUDIO_DISPATCHER_ENABLED:false} | `backend/src/main/resources/application.yml:359` | **live** | MOVED |  | V |
| CFB-067 | studio.execution.dispatcher.threads | ${STUDIO_DISPATCHER_THREADS:4} | `backend/src/main/resources/application.yml:360` | **live** | MOVED |  | V |
| CFB-068 | studio.execution.dispatcher.batch-size | ${STUDIO_DISPATCHER_BATCH:20} | `backend/src/main/resources/application.yml:361` | **live** | MOVED |  | V |
| CFB-069 | studio.execution.dispatcher.lease | ${STUDIO_DISPATCHER_LEASE:60s} | `backend/src/main/resources/application.yml:362` | **live** | MOVED |  | V |
| CFB-070 | studio.execution.dispatcher.poll-interval-ms | ${STUDIO_DISPATCHER_POLL_MS:2000} | `backend/src/main/resources/application.yml:363` | **live** | MOVED |  | V |
| CFB-071 | studio.execution.callback.max-body-bytes | ${STUDIO_CALLBACK_MAX_BODY:262144} | `backend/src/main/resources/application.yml:365` | **live** | MOVED |  | V |
| CFB-072 | studio.execution.callback.max-steps | ${STUDIO_CALLBACK_MAX_STEPS:500} | `backend/src/main/resources/application.yml:366` | **live** | MOVED |  | V |
| CFB-073 | studio.execution.callback.max-log-entries | ${STUDIO_CALLBACK_MAX_LOGS:500} | `backend/src/main/resources/application.yml:367` | **live** | MOVED |  | V |
| CFB-074 | studio.execution.callback.max-log-entry-chars | ${STUDIO_CALLBACK_MAX_LOG_CHARS:2000} | `backend/src/main/resources/application.yml:368` | **live** | MOVED |  | V |
| CFB-075 | studio.execution.callback.service-token | ${STUDIO_CALLBACK_SERVICE_TOKEN:} | `backend/src/main/resources/application.yml:371` | **live** | MOVED |  | V |
| CFB-076 | studio.execution.sse.heartbeat | ${STUDIO_SSE_HEARTBEAT:15s} | `backend/src/main/resources/application.yml:373` | **live** | MOVED |  | V |
| CFB-077 | studio.execution.sse.lifetime | ${STUDIO_SSE_LIFETIME:60s} | `backend/src/main/resources/application.yml:374` | **live** | MOVED |  | V |
| CFB-078 | studio.execution.sse.read-interval | ${STUDIO_SSE_READ_INTERVAL:750ms} | `backend/src/main/resources/application.yml:375` | **live**<br><sub>exclude-candidate (OI-04, 011 CLN-21)</sub> | MOVED |  | V |
| CFB-079 | studio.execution.sse.read-interval-ms | ${STUDIO_SSE_READ_INTERVAL_MS:750} | `backend/src/main/resources/application.yml:377` | **live** | MOVED |  | V |
| CFB-080 | studio.execution.sse.authorization-refresh | ${STUDIO_SSE_AUTH_REFRESH:30s} | `backend/src/main/resources/application.yml:378` | **live** | MOVED |  | V |
| CFB-081 | studio.execution.sse.max-streams-per-user | ${STUDIO_SSE_MAX_PER_USER:5} | `backend/src/main/resources/application.yml:379` | **live** | MOVED |  | V |
| CFB-082 | studio.execution.sse.max-streams-per-pod | ${STUDIO_SSE_MAX_PER_POD:200} | `backend/src/main/resources/application.yml:380` | **live** | MOVED |  | V |
| CFB-083 | studio.execution.sse.max-watched-executions | ${STUDIO_SSE_MAX_WATCHED:200} | `backend/src/main/resources/application.yml:381` | **live** | MOVED |  | V |
| CFB-084 | studio.execution.sse.sender-threads | ${STUDIO_SSE_SENDER_THREADS:4} | `backend/src/main/resources/application.yml:382` | **live** | MOVED |  | V |
| CFB-085 | studio.gateway.provider | ${STUDIO_GATEWAY_PROVIDER:disabled} | `backend/src/main/resources/application.yml:386` | **live** | MOVED |  | V |
| CFB-086 | studio.gateway.endpoint | ${STUDIO_GATEWAY_ENDPOINT:} | `backend/src/main/resources/application.yml:387` | **live** | MOVED |  | V |
| CFB-087 | studio.gateway.project | ${STUDIO_GATEWAY_PROJECT:} | `backend/src/main/resources/application.yml:388` | **live** | MOVED |  | V |
| CFB-088 | studio.gateway.location | ${STUDIO_GATEWAY_LOCATION:} | `backend/src/main/resources/application.yml:389` | **live** | MOVED |  | V |
| CFB-089 | studio.gateway.model | ${STUDIO_GATEWAY_MODEL:gemini-3.8-flash} | `backend/src/main/resources/application.yml:390` | **live** | MOVED |  | V |
| CFB-090 | studio.gateway.credentials.mode | ${STUDIO_GATEWAY_CREDENTIALS_MODE:application-default} | `backend/src/main/resources/application.yml:392` | **live** | MOVED |  | V |
| CFB-091 | studio.gateway.credentials.service-account-key-file | ${STUDIO_GATEWAY_CREDENTIALS_KEY_FILE:} | `backend/src/main/resources/application.yml:393` | **live** | MOVED |  | V |
| CFB-092 | studio.gateway.request-timeout | ${STUDIO_GATEWAY_REQUEST_TIMEOUT:150s} | `backend/src/main/resources/application.yml:394` | **live** | MOVED |  | V |
| CFB-093 | studio.gateway.max-concurrency | ${STUDIO_GATEWAY_MAX_CONCURRENCY:4} | `backend/src/main/resources/application.yml:395` | **live** | MOVED |  | V |
| CFB-094 | studio.gateway.max-input-bytes | ${STUDIO_GATEWAY_MAX_INPUT_BYTES:262144} | `backend/src/main/resources/application.yml:396` | **live** | MOVED |  | V |
| CFB-095 | studio.gateway.max-output-bytes | ${STUDIO_GATEWAY_MAX_OUTPUT_BYTES:262144} | `backend/src/main/resources/application.yml:397` | **live** | MOVED |  | V |
| CFB-096 | studio.gateway.max-output-tokens | ${STUDIO_GATEWAY_MAX_OUTPUT_TOKENS:32768} | `backend/src/main/resources/application.yml:398` | **live** | MOVED |  | V |
| CFB-097 | studio.gateway.thinking-level | ${STUDIO_GATEWAY_THINKING_LEVEL:LOW} | `backend/src/main/resources/application.yml:402` | **live** | MOVED |  | V |
| CFB-098 | studio.runner.base-url | ${STUDIO_RUNNER_BASE_URL:} | `backend/src/main/resources/application.yml:417` | **live** | BEHAVIOUR | D3: value unchanged (${STUDIO_RUNNER_BASE_URL:}); StudioRunnerProperties.validate() now refuses http:// outside local/test and the chart renders an https… | V |
| CFB-099 | studio.runner.service-identity-token | ${STUDIO_RUNNER_SERVICE_TOKEN:} | `backend/src/main/resources/application.yml:418` | **live** | MOVED |  | V |
| CFB-100 | studio.runner.connect-timeout | ${STUDIO_RUNNER_CONNECT_TIMEOUT:2s} | `backend/src/main/resources/application.yml:419` | **live** | MOVED |  | V |
| CFB-101 | studio.guided-authoring.mtls-required | ${STUDIO_GUIDED_MTLS_REQUIRED:false} | `backend/src/main/resources/application.yml:208` | **live** | NEW | D3: NEW yml declaration of a guided mTLS chain key (was code-only @Value) | V |
| CFB-102 | studio.guided-authoring.service-public-key | ${STUDIO_GUIDED_SERVICE_PUBLIC_KEY:} | `backend/src/main/resources/application.yml:209` | **dark** | NEW | D3: NEW yml declaration of a guided mTLS chain key (was code-only @Value) | V |
| CFB-103 | studio.guided-authoring.service-issuer | ${STUDIO_GUIDED_SERVICE_ISSUER:} | `backend/src/main/resources/application.yml:210` | **dark** | NEW | D3: NEW yml declaration of a guided mTLS chain key (was code-only @Value) | V |
| CFB-104 | studio.guided-authoring.connector.port | ${STUDIO_GUIDED_CONNECTOR_PORT:0} | `backend/src/main/resources/application.yml:215` | **dark** | NEW | D3: NEW yml declaration of a guided mTLS chain key (was code-only @Value) | V |
| CFB-105 | studio.runner.tls.key-store | ${STUDIO_RUNNER_TLS_KEY_STORE:} | `backend/src/main/resources/application.yml:421` | **live** | NEW | D3: NEW: backend runner TLS identity (StudioRunnerTls.Settings) | V |
| CFB-106 | studio.runner.tls.key-store-password-file | ${STUDIO_RUNNER_TLS_KEY_STORE_PASSWORD_FILE:} | `backend/src/main/resources/application.yml:422` | **live** | NEW | D3: NEW: backend runner TLS identity (StudioRunnerTls.Settings) | V |
| CFB-107 | studio.runner.tls.key-store-type | ${STUDIO_RUNNER_TLS_KEY_STORE_TYPE:PKCS12} | `backend/src/main/resources/application.yml:423` | **live** | NEW | D3: NEW: backend runner TLS identity (StudioRunnerTls.Settings) | V |
| CFB-108 | studio.runner.tls.trust-store | ${STUDIO_RUNNER_TLS_TRUST_STORE:} | `backend/src/main/resources/application.yml:424` | **live** | NEW | D3: NEW: backend runner TLS identity (StudioRunnerTls.Settings) | V |
| CFB-109 | studio.runner.tls.trust-store-password-file | ${STUDIO_RUNNER_TLS_TRUST_STORE_PASSWORD_FILE:} | `backend/src/main/resources/application.yml:425` | **live** | NEW | D3: NEW: backend runner TLS identity (StudioRunnerTls.Settings) | V |
| CFB-110 | studio.runner.tls.trust-store-type | ${STUDIO_RUNNER_TLS_TRUST_STORE_TYPE:PKCS12} | `backend/src/main/resources/application.yml:426` | **live** | NEW | D3: NEW: backend runner TLS identity (StudioRunnerTls.Settings) | V |

### 4.8 Backend profile overrides (15)

| Id | Surface | Value | Anchor | Status | Delta | 009 change | Tag |
|---|---|---|---|---|---|---|---|
| CFP-01 | studio.execution.dispatcher.enabled [profile worker] | true | `backend/src/main/resources/application-worker.yml:23` | **live** | SAME |  | V |
| CFP-02 | studio.secrets.vault.provider [profile dev] | ${STUDIO_VAULT_PROVIDER:none} | `backend/src/main/resources/application-dev.yml:31` | **live** | SAME |  | V |
| CFP-03 | studio.execution.dispatcher.enabled [profile local] | ${STUDIO_DISPATCHER_ENABLED:true} | `backend/src/main/resources/application-local.yml:75` | **live** | MOVED |  | V |
| CFP-04 | studio.execution.video-store.provider [profile local] | ${STUDIO_EVIDENCE_PROVIDER:local} | `backend/src/main/resources/application-local.yml:78` | **live** | MOVED |  | V |
| CFP-05 | studio.secrets.vault.provider [profile local] | ${STUDIO_VAULT_PROVIDER:none} | `backend/src/main/resources/application-local.yml:86` | **live** | MOVED |  | V |
| CFP-06 | studio.gateway.provider [profile local] | ${STUDIO_GATEWAY_PROVIDER:disabled} | `backend/src/main/resources/application-local.yml:91` | **live** | MOVED |  | V |
| CFP-07 | studio.gateway.credentials.mode [profile local] | ${STUDIO_GATEWAY_CREDENTIALS_MODE:application-default} | `backend/src/main/resources/application-local.yml:93` | **live** | MOVED |  | V |
| CFP-08 | studio.gateway.provider [profile staging] | ${STUDIO_GATEWAY_PROVIDER:disabled} | `backend/src/main/resources/application-staging.yml:16` | **live** | SAME |  | V |
| CFP-09 | studio.gateway.model [profile staging] | ${STUDIO_GATEWAY_MODEL:gemini-3.8-flash} | `backend/src/main/resources/application-staging.yml:17` | **live** | SAME |  | V |
| CFP-10 | studio.gateway.credentials.mode [profile staging] | ${STUDIO_GATEWAY_CREDENTIALS_MODE:application-default} | `backend/src/main/resources/application-staging.yml:19` | **live** | SAME |  | V |
| CFP-11 | studio.gateway.provider [profile test] | disabled | `backend/src/main/resources/application-test.yml:37` | **live** | MOVED |  | V |
| CFP-12 | studio.secrets.vault.provider [profile test] | none | `backend/src/main/resources/application-test.yml:40` | **live** | MOVED |  | V |
| CFP-13 | studio.guided-authoring.mtls-required [profile dev] | true | `backend/src/main/resources/application-dev.yml:34` | **live** | NEW | D3: NEW: prod/staging/dev set mtls-required true | V |
| CFP-14 | studio.guided-authoring.mtls-required [profile prod] | true | `backend/src/main/resources/application-prod.yml:24` | **live** | NEW | D3: NEW: prod/staging/dev set mtls-required true | V |
| CFP-15 | studio.guided-authoring.mtls-required [profile staging] | true | `backend/src/main/resources/application-staging.yml:22` | **live** | NEW | D3: NEW: prod/staging/dev set mtls-required true | V |

### 4.9 Backend code-only `@Value` keys (13)

| Id | Surface | Value | Anchor | Status | Delta | 009 change | Tag |
|---|---|---|---|---|---|---|---|
| CFC-01 | studio.guided-authoring.runner-origin | no default; bean conditional on presence | `…/checks/studio/guided/session/GuidedSessionConfiguration.java:107` | **dark**<br><sub>include with carve-out (OI-05a: 011 FOLD may merge it with …</sub> | BEHAVIOUR | D3: VALUE+TLS: https URL of the runner Service; GuidedRunnerClient moves from SSLContext.getDefault() (:94) to StudioRunnerTls -- landed: GuidedRunnerCli… | V |
| CFC-02 | studio.guided-authoring.mtls-required | ${STUDIO_GUIDED_MTLS_REQUIRED:false} | `…/checks/studio/guided/session/GuidedInternalSecurity.java:51`<br>`backend/src/main/resources/application.yml:208` | **live**<br><sub>superseded by CFB-101 (same key, now declared in applicatio…</sub> | CHANGED | D3/D2: VALUE: chart/profile values supply the chain (AC-2) | V |
| CFC-03 | studio.guided-authoring.service-public-key | ${STUDIO_GUIDED_SERVICE_PUBLIC_KEY:} | `…/checks/studio/guided/session/GuidedInternalSecurity.java:49`<br>`backend/src/main/resources/application.yml:209` | **dark**<br><sub>superseded by CFB-102 (same key, now declared in applicatio…</sub> | CHANGED | D3/D2: VALUE: pinned RSA key supplied by AC-2 values | V |
| CFC-04 | studio.guided-authoring.service-issuer | ${STUDIO_GUIDED_SERVICE_ISSUER:} | `…/checks/studio/guided/session/GuidedInternalSecurity.java:50`<br>`backend/src/main/resources/application.yml:210` | **dark**<br><sub>superseded by CFB-103 (same key, now declared in applicatio…</sub> | CHANGED | D3/D2: VALUE: issuer supplied by AC-2 values | V |
| CFC-05 | studio.guided-authoring.reaper-delay-ms | default 10000 | `…/checks/studio/guided/session/GuidedSessionReaper.java:45` | **live** | MOVED |  | V |
| CFC-06 | studio.guided-authoring.teardown-redrive-window | default PT15M | `…/checks/studio/guided/session/GuidedSessionReaper.java:27` | **live** | MOVED |  | V |
| CFC-07 | studio.guided-authoring.teardown-redrive-batch | default 32 | `…/checks/studio/guided/session/GuidedSessionReaper.java:28` | **live** | MOVED |  | V |
| CFC-08 | studio.guided-authoring.teardown-abandoned-warn-interval | default PT15M | `…/checks/studio/guided/session/GuidedSessionReaper.java:29` | **live** | MOVED |  | V |
| CFC-09 | studio.guided-authoring.translation.controller-origin | default https://unconfigured.invalid | `…/checks/studio/guided/translation/GuidedTranslationConfiguration.java:133` | **dark** | MOVED |  | V |
| CFC-10 | studio.guided-authoring.translation.poll-ms | default 1000 | `…/checks/studio/guided/translation/GuidedTranslationCoordinator.java:114` | **live** | MOVED |  | V |
| CFC-11 | studio.execution.metrics.backlog-refresh-ms | default 5000 | `…/checks/studio/dispatch/StudioDispatchMetrics.java:80` | **live** | SAME |  | V |
| CFC-12 | studio.pool.size | default 0 | `…/checks/config/AsyncConfig.java:52` | **live** | SAME |  | V |
| CFC-13 | studio.secret-revocation.sweep-interval-ms | default 1000 | `…/checks/studio/secrets/SecretRevocationSweep.java:57` | **live** | SAME |  | V |

### 4.10 Backend code-default flags (7)

| Id | Surface | Value | Anchor | Status | Delta | 009 change | Tag |
|---|---|---|---|---|---|---|---|
| CFD-01 | studio.guided-authoring.translation.enabled | true | `…/checks/studio/guided/translation/GuidedTranslationProperties.java:10` | **live** | SAME |  | V |
| CFD-02 | studio.guided-authoring.translation.allow-authored-nonsecret | true | `…/checks/studio/guided/translation/GuidedTranslationProperties.java:11` | **live** | SAME |  | V |
| CFD-03 | studio.guided-authoring.enabled | true | `…/checks/studio/guided/session/GuidedSessionProperties.java:12` | **live** | SAME |  | V |
| CFD-04 | studio.guided-authoring.translation.worker-id | worker-1 | `…/checks/studio/guided/translation/GuidedTranslationProperties.java:17` | **live** | BEHAVIOUR | D1/D2: runner side of the one worker id is now STUDIO_RUNNER_GUIDED_WORKER_ID, rendered from studioRunner.guided.workerId (default worker-1); the chart also… | V |
| CFD-05 | studio.scheduling.enabled | false (Java default; no yml or chart key [V]) | `…/checks/studio/scheduling/StudioSchedulingProperties.java:11` | **live** | SAME |  | V |
| CFD-06 | studio.scheduling.local-grants-enabled | false | `…/checks/studio/scheduling/StudioSchedulingProperties.java:12` | **live** | SAME |  | V |
| CFD-07 | checks.sources.UI_TEST | application.yml false; chart values.yaml "true"; values-dev "false" | `backend/src/main/resources/application.yml:56`<br>`helm-chart/put-checks/values.yaml:168`<br>`helm-chart/put-checks/templates/deployment.yaml:29` | **live** | MOVED |  | V |

### 4.11 Backend `@ConfigurationProperties` prefixes (18)

| Id | Surface | Value | Anchor | Status | Delta | 009 change | Tag |
|---|---|---|---|---|---|---|---|
| CFK-01 | studio.execution.* (@ConfigurationProperties) |  | `…/checks/studio/StudioExecutionProperties.java:39` | **live** | SAME |  | V |
| CFK-02 | studio.execution.video-store.* (@ConfigurationProperties) |  | `…/checks/studio/evidence/VideoStoreProperties.java:25` | **live** | SAME |  | V |
| CFK-03 | studio.execution.cancel.* (@ConfigurationProperties) |  | `…/checks/studio/recovery/RunnerCancelBudget.java:57` | **live** | SAME |  | V |
| CFK-04 | studio.observed-replay.* (@ConfigurationProperties) |  | `…/checks/studio/guided/publication/ObservedReplayProperties.java:9` | **live** | SAME |  | V |
| CFK-05 | studio.guided.publication.* (@ConfigurationProperties) |  | `…/checks/studio/guided/publication/GuidedPublicationProperties.java:9` | **live** | SAME |  | V |
| CFK-06 | studio.guided-authoring.* (@ConfigurationProperties) |  | `…/checks/studio/guided/session/GuidedSessionProperties.java:10` | **live** | SAME |  | V |
| CFK-07 | studio.guided-authoring.translation.* (@ConfigurationProperties) |  | `…/checks/studio/guided/translation/GuidedTranslationProperties.java:8` | **live** | SAME |  | V |
| CFK-08 | studio.guided-authoring.recording.* (@ConfigurationProperties) |  | `…/checks/studio/guided/evidence/GuidedRecordingProperties.java:19` | **live** | SAME |  | V |
| CFK-09 | studio.guided-authoring.retention.* (@ConfigurationProperties) |  | `…/checks/studio/guided/retention/GuidedRetentionProperties.java:18` | **live** | SAME |  | V |
| CFK-10 | studio.guided-authoring.policy.* (@ConfigurationProperties) |  | `…/checks/studio/guided/policy/GuidedPolicyProperties.java:14` | **live** | SAME |  | V |
| CFK-11 | studio.guided-authoring.csi-budget.* (@ConfigurationProperties) |  | `…/checks/studio/guided/session/GuidedCsiBudgetProperties.java:14` | **live** | SAME |  | V |
| CFK-12 | studio.scheduling.* (@ConfigurationProperties) |  | `…/checks/studio/scheduling/StudioSchedulingProperties.java:9` | **live** | SAME |  | V |
| CFK-13 | studio.runner.* (@ConfigurationProperties) |  | `…/checks/studio/dispatch/StudioRunnerProperties.java:27` | **live** | CHANGED | D3: validate() refuses http:// outside local/test; a dedicated studio.runner.tls.* binding (StudioRunnerTls.Settings, new CFK-18) with key-store / trust-… | V |
| CFK-14 | studio.secrets.* (@ConfigurationProperties) |  | `…/checks/studio/secrets/StudioSecretsProperties.java:17` | **live** | SAME |  | V |
| CFK-15 | studio.authoring.* (@ConfigurationProperties) |  | `…/checks/studio/authoring/StudioAuthoringProperties.java:15` | **live** | SAME |  | V |
| CFK-16 | studio.gateway (selection).* (@ConfigurationProperties) |  | `…/checks/studio/gateway/StudioGatewaySelectionProperties.java:8` | **live** | SAME |  | V |
| CFK-17 | studio.gateway.* (@ConfigurationProperties) |  | `…/checks/studio/gateway/StudioGatewayProperties.java:37` | **live** | SAME |  | V |
| CFK-18 | studio.runner.tls.* (@ConfigurationProperties) |  | `…/checks/studio/dispatch/StudioRunnerTls.java:109` | **live** | NEW | D3: NEW binding of the backend runner TLS identity (deny-all unconfigured() in local/test) | V |

### 4.12 Runner `KEY_SPECS` / `ACCEPTED_KEYS` (58)

| Id | Surface | Value | Anchor | Status | Delta | 009 change | Tag |
|---|---|---|---|---|---|---|---|
| RKS-01 | STUDIO_RUNNER_OBSERVED_VALIDATION_ENABLED |  | `studio-runner/src/server/config.ts:177` | **dark** | MOVED |  | V |
| RKS-02 | STUDIO_RUNNER_OBSERVED_REPLAY_ENABLED |  | `studio-runner/src/server/config.ts:178` | **dark** | MOVED |  | V |
| RKS-03 | STUDIO_RUNNER_OBSERVED_CATALOG_FILE |  | `studio-runner/src/server/config.ts:179` | **dark** | MOVED |  | V |
| RKS-04 | STUDIO_RUNNER_OBSERVED_POLICY_FILE |  | `studio-runner/src/server/config.ts:180` | **dark** | MOVED |  | V |
| RKS-05 | STUDIO_RUNNER_OBSERVED_IMAGE_DIGEST |  | `studio-runner/src/server/config.ts:181` | **dark** | MOVED |  | V |
| RKS-06 | STUDIO_RUNNER_PORT |  | `studio-runner/src/server/config.ts:182` | **live** | BEHAVIOUR | D1: the one TLS listener port (the guided port folded into it); probe.ts reads it and dials 127.0.0.1 over TLS | V |
| RKS-07 | STUDIO_RUNNER_HOST |  | `studio-runner/src/server/config.ts:183` | **live** | BEHAVIOUR | D1: the one TLS listener host; chart refuses any value other than 0.0.0.0 / 127.0.0.1 (_helpers.tpl studioRunner.env guard) | V |
| RKS-08 | STUDIO_RUNNER_POOL_SIZE |  | `studio-runner/src/server/config.ts:184` | **live** | MOVED |  | V |
| RKS-09 | STUDIO_RUNNER_INSTANCE_ID |  | `studio-runner/src/server/config.ts:185` | **live** | MOVED |  | V |
| RKS-10 | STUDIO_RUNNER_SERVICE_IDENTITY |  | `studio-runner/src/server/config.ts:186` | **live** | MOVED |  | V |
| RKS-11 | STUDIO_RUNNER_CALLBACK_IDENTITY |  | `studio-runner/src/server/config.ts:187` | **live** | MOVED |  | V |
| RKS-12 | STUDIO_RUNNER_CALLBACK_BASE_URL |  | `studio-runner/src/server/config.ts:188` | **live** | MOVED |  | V |
| RKS-13 | STUDIO_RUNNER_SCRATCH_DIR |  | `studio-runner/src/server/config.ts:189` | **live** | MOVED |  | V |
| RKS-14 | STUDIO_RUNNER_OBJECT_STORE_DIR |  | `studio-runner/src/server/config.ts:190` | **live** | MOVED |  | V |
| RKS-15 | STUDIO_RUNNER_OBJECT_STORE_PROVIDER |  | `studio-runner/src/server/config.ts:196` | **live** | MOVED |  | V |
| RKS-16 | STUDIO_RUNNER_OBJECT_STORE_ENDPOINT |  | `studio-runner/src/server/config.ts:202` | **live** | MOVED |  | V |
| RKS-17 | STUDIO_RUNNER_OBJECT_STORE_REGION |  | `studio-runner/src/server/config.ts:208` | **live** | MOVED |  | V |
| RKS-18 | STUDIO_RUNNER_OBJECT_STORE_BUCKET |  | `studio-runner/src/server/config.ts:214` | **live** | MOVED |  | V |
| RKS-19 | STUDIO_RUNNER_OBJECT_STORE_FORCE_PATH_STYLE |  | `studio-runner/src/server/config.ts:220` | **live** | MOVED |  | V |
| RKS-20 | STUDIO_RUNNER_OBJECT_STORE_CREDENTIALS_DIRECTORY |  | `studio-runner/src/server/config.ts:226` | **live** | MOVED |  | V |
| RKS-21 | STUDIO_RUNNER_OBJECT_STORE_ACCESS_KEY_ID_FILE |  | `studio-runner/src/server/config.ts:232` | **live** | MOVED |  | V |
| RKS-22 | STUDIO_RUNNER_OBJECT_STORE_SECRET_ACCESS_KEY_FILE |  | `studio-runner/src/server/config.ts:238` | **live** | MOVED |  | V |
| RKS-23 | STUDIO_RUNNER_OBJECT_STORE_MAX_ATTEMPTS |  | `studio-runner/src/server/config.ts:244` | **live** | MOVED |  | V |
| RKS-24 | STUDIO_RUNNER_OBJECT_STORE_WINDOW_MS |  | `studio-runner/src/server/config.ts:251` | **live** | MOVED |  | V |
| RKS-25 | STUDIO_RUNNER_OBJECT_STORE_BACKOFF_MS |  | `studio-runner/src/server/config.ts:258` | **live** | MOVED |  | V |
| RKS-26 | STUDIO_RUNNER_ADMISSION_TIMEOUT_MS |  | `studio-runner/src/server/config.ts:265` | **live** | MOVED |  | V |
| RKS-27 | STUDIO_RUNNER_TERMINAL_DELIVERY_WINDOW_MS |  | `studio-runner/src/server/config.ts:272` | **live** | MOVED |  | V |
| RKS-28 | STUDIO_RUNNER_TERMINAL_DELIVERY_MAX_ATTEMPTS |  | `studio-runner/src/server/config.ts:279` | **live** | MOVED |  | V |
| RKS-29 | STUDIO_RUNNER_TERMINAL_DELIVERY_BACKOFF_MS |  | `studio-runner/src/server/config.ts:286` | **live** | MOVED |  | V |
| RKS-30 | STUDIO_RUNNER_VALIDATE_TIMEOUT_MS |  | `studio-runner/src/server/config.ts:293` | **live** | MOVED |  | V |
| RKS-31 | STUDIO_RUNNER_MAX_REQUEST_BODY_BYTES |  | `studio-runner/src/server/config.ts:300` | **live** | MOVED |  | V |
| RKS-32 | STUDIO_RUNNER_RETRY_AFTER_SECONDS |  | `studio-runner/src/server/config.ts:307` | **live** | MOVED |  | V |
| RKS-33 | STUDIO_RUNNER_DRAIN_TIMEOUT_MS |  | `studio-runner/src/server/config.ts:314` | **live** | MOVED |  | V |
| RKS-34 | STUDIO_RUNNER_RECORDING_WIDTH |  | `studio-runner/src/server/config.ts:321` | **live** | MOVED |  | V |
| RKS-35 | STUDIO_RUNNER_RECORDING_HEIGHT |  | `studio-runner/src/server/config.ts:328` | **live** | MOVED |  | V |
| RKS-36 | STUDIO_RUNNER_BROWSER_LAUNCH_TIMEOUT_MS |  | `studio-runner/src/server/config.ts:335` | **live** | MOVED |  | V |
| RKS-37 | STUDIO_RUNNER_STEP_TIMEOUT_MS |  | `studio-runner/src/server/config.ts:342` | **live** | MOVED |  | V |
| RKS-38 | STUDIO_RUNNER_BROWSER_STOP_TIMEOUT_MS |  | `studio-runner/src/server/config.ts:349` | **live** | MOVED |  | V |
| RKS-39 | STUDIO_RUNNER_SEEK_ORIGIN_CALIBRATION_MS |  | `studio-runner/src/server/config.ts:358` | **live** | MOVED |  | V |
| RKS-40 | STUDIO_RUNNER_MAX_TOTAL_RUNTIME_MS |  | `studio-runner/src/server/config.ts:368` | **live** | MOVED |  | V |
| RKS-41 | STUDIO_RUNNER_MAX_STEP_TIMEOUT_MS |  | `studio-runner/src/server/config.ts:380` | **live** | MOVED |  | V |
| RKS-42 | STUDIO_RUNNER_MAX_REPORT_STEPS |  | `studio-runner/src/server/config.ts:387` | **live** | MOVED |  | V |
| RKS-43 | STUDIO_RUNNER_MAX_REPORT_LOG_ENTRIES |  | `studio-runner/src/server/config.ts:394` | **live** | MOVED |  | V |
| RKS-44 | STUDIO_RUNNER_MAX_REPORT_LOG_ENTRY_LENGTH |  | `studio-runner/src/server/config.ts:401` | **live** | MOVED |  | V |
| RKS-45 | STUDIO_RUNNER_MAX_REPORT_BODY_BYTES |  | `studio-runner/src/server/config.ts:408` | **live** | MOVED |  | V |
| RKS-00 | ACCEPTED_KEYS set (57 keys) | 57 | `studio-runner/src/server/config.ts:176-444`<br>`studio-runner/src/server/config.ts:472 (ACCEPTED_KEYS)`<br>`studio-runner/src/server/config.ts:518 (refuseUnknownKeys)` | **live** | CHANGED | D1: 45 -> 57: +4 listener keys (TLS_KEY_FILE, TLS_CERT_FILE, TLS_CA_FILE, CONTROLLER_CERTIFICATE_FINGERPRINT256), +GUIDED_ENABLED, +7 GUIDED_* keys; no c… | V |
| RKS-46 | STUDIO_RUNNER_TLS_KEY_FILE |  | `studio-runner/src/server/config.ts:419` | **live** | NEW | D1: NEW: the one TLS listener | V |
| RKS-47 | STUDIO_RUNNER_TLS_CERT_FILE |  | `studio-runner/src/server/config.ts:420` | **live** | NEW | D1: NEW: the one TLS listener | V |
| RKS-48 | STUDIO_RUNNER_TLS_CA_FILE |  | `studio-runner/src/server/config.ts:421` | **live** | NEW | D1: NEW: the one TLS listener | V |
| RKS-49 | STUDIO_RUNNER_CONTROLLER_CERTIFICATE_FINGERPRINT256 |  | `studio-runner/src/server/config.ts:422` | **live** | NEW | D1: NEW: the one TLS listener | V |
| RKS-50 | STUDIO_RUNNER_GUIDED_ENABLED |  | `studio-runner/src/server/config.ts:431` | **live** | NEW | D1: NEW: guided mode as configuration of the one process | V |
| RKS-51 | STUDIO_RUNNER_GUIDED_WORKER_ID |  | `studio-runner/src/server/config.ts:432` | **dark** | NEW | D1: NEW: replaces a mounted guided JSON field | V |
| RKS-52 | STUDIO_RUNNER_GUIDED_JOURNAL_DIR |  | `studio-runner/src/server/config.ts:433` | **dark** | NEW | D1: NEW: replaces a mounted guided JSON field | V |
| RKS-53 | STUDIO_RUNNER_GUIDED_CONTROLLER_ISSUER |  | `studio-runner/src/server/config.ts:434` | **dark** | NEW | D1: NEW: replaces a mounted guided JSON field | V |
| RKS-54 | STUDIO_RUNNER_GUIDED_CONTROLLER_SUBJECT |  | `studio-runner/src/server/config.ts:435` | **dark** | NEW | D1: NEW: replaces a mounted guided JSON field | V |
| RKS-55 | STUDIO_RUNNER_GUIDED_CONTROLLER_PUBLIC_KEY_FILE |  | `studio-runner/src/server/config.ts:436` | **dark** | NEW | D1: NEW: replaces a mounted guided JSON field | V |
| RKS-56 | STUDIO_RUNNER_GUIDED_CALLBACK_BASE_URL |  | `studio-runner/src/server/config.ts:441` | **dark** | NEW | D1: NEW: replaces a mounted guided JSON field | V |
| RKS-57 | STUDIO_RUNNER_GUIDED_CALLBACK_TOKEN_FILE |  | `studio-runner/src/server/config.ts:442` | **dark** | NEW | D1: NEW: replaces a mounted guided JSON field | V |

### 4.13 Runner guided mounted config (removed by 009) (14)

| Id | Surface | Value | Anchor | Status | Delta | 009 change | Tag |
|---|---|---|---|---|---|---|---|
| RKG-00 | STUDIO_GUIDED_CONFIG_FILE (env; path of the guided mounted JSON) | → none (variable deleted) |  | **removed**<br><sub>drop from list (removed by 009; @po records the removal per…</sub> | GONE | D1: STUDIO_GUIDED_CONFIG_FILE and run/guidedMain.ts deleted; G9 c7-greps "guidedMain src/dist: 0" | V |
| RKG-01 | guided mounted field "workerId" | → STUDIO_RUNNER_GUIDED_WORKER_ID (studio-runner/src/server/config.ts:… |  | **removed**<br><sub>drop from list (removed by 009; @po records the removal per…</sub> | GONE | D1: mounted JSON field removed with run/guidedConfig.ts; replaced by STUDIO_RUNNER_GUIDED_WORKER_ID | V |
| RKG-02 | guided mounted field "host" | → STUDIO_RUNNER_HOST (studio-runner/src/server/config.ts:183) |  | **removed**<br><sub>drop from list (removed by 009; @po records the removal per…</sub> | GONE | D1: mounted JSON field removed with run/guidedConfig.ts; replaced by STUDIO_RUNNER_HOST | V |
| RKG-03 | guided mounted field "port" | → STUDIO_RUNNER_PORT (studio-runner/src/server/config.ts:182) |  | **removed**<br><sub>drop from list (removed by 009; @po records the removal per…</sub> | GONE | D1: mounted JSON field removed with run/guidedConfig.ts; replaced by STUDIO_RUNNER_PORT | V |
| RKG-04 | guided mounted field "journalDirectory" | → STUDIO_RUNNER_GUIDED_JOURNAL_DIR (studio-runner/src/server/config.t… |  | **removed**<br><sub>drop from list (removed by 009; @po records the removal per…</sub> | GONE | D1: mounted JSON field removed with run/guidedConfig.ts; replaced by STUDIO_RUNNER_GUIDED_JOURNAL_DIR | V |
| RKG-05 | guided mounted field "tlsKeyFile" | → STUDIO_RUNNER_TLS_KEY_FILE (studio-runner/src/server/config.ts:419) |  | **removed**<br><sub>drop from list (removed by 009; @po records the removal per…</sub> | GONE | D1: mounted JSON field removed with run/guidedConfig.ts; replaced by STUDIO_RUNNER_TLS_KEY_FILE | V |
| RKG-06 | guided mounted field "tlsCertFile" | → STUDIO_RUNNER_TLS_CERT_FILE (studio-runner/src/server/config.ts:420) |  | **removed**<br><sub>drop from list (removed by 009; @po records the removal per…</sub> | GONE | D1: mounted JSON field removed with run/guidedConfig.ts; replaced by STUDIO_RUNNER_TLS_CERT_FILE | V |
| RKG-07 | guided mounted field "tlsCaFile" | → STUDIO_RUNNER_TLS_CA_FILE (studio-runner/src/server/config.ts:421) |  | **removed**<br><sub>drop from list (removed by 009; @po records the removal per…</sub> | GONE | D1: mounted JSON field removed with run/guidedConfig.ts; replaced by STUDIO_RUNNER_TLS_CA_FILE | V |
| RKG-08 | guided mounted field "controllerIssuer" | → STUDIO_RUNNER_GUIDED_CONTROLLER_ISSUER (studio-runner/src/server/co… |  | **removed**<br><sub>drop from list (removed by 009; @po records the removal per…</sub> | GONE | D1: mounted JSON field removed with run/guidedConfig.ts; replaced by STUDIO_RUNNER_GUIDED_CONTROLLER_ISSUER | V |
| RKG-09 | guided mounted field "controllerSubject" | → STUDIO_RUNNER_GUIDED_CONTROLLER_SUBJECT (studio-runner/src/server/c… |  | **removed**<br><sub>drop from list (removed by 009; @po records the removal per…</sub> | GONE | D1: mounted JSON field removed with run/guidedConfig.ts; replaced by STUDIO_RUNNER_GUIDED_CONTROLLER_SUBJECT | V |
| RKG-10 | guided mounted field "controllerPublicKeyFile" | → STUDIO_RUNNER_GUIDED_CONTROLLER_PUBLIC_KEY_FILE (studio-runner/src/… |  | **removed**<br><sub>drop from list (removed by 009; @po records the removal per…</sub> | GONE | D1: mounted JSON field removed with run/guidedConfig.ts; replaced by STUDIO_RUNNER_GUIDED_CONTROLLER_PUBLIC_KEY_FILE | V |
| RKG-11 | guided mounted field "controllerCertificateFingerprint256" | → STUDIO_RUNNER_CONTROLLER_CERTIFICATE_FINGERPRINT256 (studio-runner/… |  | **removed**<br><sub>drop from list (removed by 009; @po records the removal per…</sub> | GONE | D1: mounted JSON field removed with run/guidedConfig.ts; replaced by STUDIO_RUNNER_CONTROLLER_CERTIFICATE_FINGERPRINT256 | V |
| RKG-12 | guided mounted field "callbackBaseUrl" | → STUDIO_RUNNER_GUIDED_CALLBACK_BASE_URL (studio-runner/src/server/co… |  | **removed**<br><sub>drop from list (removed by 009; @po records the removal per…</sub> | GONE | D1: mounted JSON field removed with run/guidedConfig.ts; replaced by STUDIO_RUNNER_GUIDED_CALLBACK_BASE_URL | V |
| RKG-13 | guided mounted field "callbackTokenFile" | → STUDIO_RUNNER_GUIDED_CALLBACK_TOKEN_FILE (studio-runner/src/server/… |  | **removed**<br><sub>drop from list (removed by 009; @po records the removal per…</sub> | GONE | D1: mounted JSON field removed with run/guidedConfig.ts; replaced by STUDIO_RUNNER_GUIDED_CALLBACK_TOKEN_FILE | V |

### 4.14 Runner process surfaces (8)

| Id | Surface | Value | Anchor | Status | Delta | 009 change | Tag |
|---|---|---|---|---|---|---|---|
| RKO-01 | Dockerfile CMD ["sh", "-c", "ulimit -c 0 && exec node dist/main.js"] | CMD ["sh", "-c", "ulimit -c 0 && exec node dist/main.js"] | `studio-runner/Dockerfile:76` | **live** | CHANGED | D2: CMD ["sh","-c","ulimit -c 0 && exec node dist/main.js"] (core dumps off; exec keeps signals) | V |
| RKO-02 | package.json script "start": "node dist/main.js" |  | `studio-runner/package.json:18` | **live** | SAME |  | V |
| RKO-03 | package.json script "start:guided": "node dist/run/guidedMain.js" |  |  | **removed**<br><sub>drop (removed by 009)</sub> | GONE | D1: start:guided removed (one entrypoint); G9 c7-greps "start:guided in package.json: 0" | V |
| RKO-04 | run/guidedMain.ts + run/guidedConfig.ts + run/guidedShutdown.ts (guided entry files) |  |  | **removed**<br><sub>drop (removed by 009)</sub> | GONE | D1: guidedMain.ts / guidedConfig.ts / guidedShutdown.ts deleted; guided starts inside main.ts (main.ts:206-290 loadGuidedConfig); dist/run/guidedMain.js … | V |
| RKO-05 | probe.ts reads STUDIO_RUNNER_PORT and STUDIO_RUNNER_SERVICE_IDENTITY (exec probe node dis… |  | `studio-runner/src/probe.ts:30`<br>`studio-runner/src/probe.ts:93-94` | **live** | CHANGED | D1: probe dials over TLS presenting the runner certificate: also reads STUDIO_RUNNER_TLS_KEY_FILE / _CERT_FILE / _CA_FILE (probe.ts:30); Helm probe comma… | V |
| RKO-06 | debug-env refusal (DEBUG, PWDEBUG, NODE_DEBUG, NODE_OPTIONS -> CONFIGURATION_DENIED) |  | `studio-runner/src/main.ts:168`<br>`studio-runner/src/guided/transport.ts:87,166`<br>`studio-runner/src/run/browser.ts:537` | **live** | MOVED |  | V |
| RKO-07 | PLAYWRIGHT_BROWSERS_PATH passthrough to observed runner support |  | `studio-runner/src/server/application.ts:161`<br>`studio-runner/src/run/launcher.ts:170` | **live** | MOVED |  | V |
| RKO-08 | TMPDIR (guided browser scratch, recording scratch) |  | `studio-runner/src/run/browser.ts:544`<br>`studio-runner/src/run/recordingScratch.ts:56` | **live** | SAME |  | V |

### 4.15 Chart `values.yaml` (168)

| Id | Surface | Value | Anchor | Status | Delta | 009 change | Tag |
|---|---|---|---|---|---|---|---|
| CHV-001 | backend.env.JAVA_OPTS | -Xms256m -Xmx512m -XX:+UseG1GC -XX:MaxMetaspaceSize=192m -XX:+ExitOnO… | `helm-chart/put-checks/values.yaml:93` | **live** | CHANGED | D2: adds -XX:-HeapDumpOnOutOfMemoryError -XX:-CreateCoredumpOnCrash | V |
| CHV-002 | backend.configOverrides.checks.sources.UI_TEST | true | `helm-chart/put-checks/values.yaml:168` | **live** | MOVED |  | V |
| CHV-003 | worker.env.JAVA_OPTS | -Xms512m -Xmx768m -XX:+UseG1GC -XX:MaxMetaspaceSize=192m -XX:+ExitOnO… | `helm-chart/put-checks/values.yaml:245` | **live** | CHANGED | D2: adds -XX:-HeapDumpOnOutOfMemoryError -XX:-CreateCoredumpOnCrash | V |
| CHV-004 | frontend.env.VITE_ENABLE_STUDIO | true | `helm-chart/put-checks/values.yaml:351` | **live** | MOVED |  | V |
| CHV-005 | studioRunner.enabled | false | `helm-chart/put-checks/values.yaml:372` | **live** | MOVED |  | V |
| CHV-006 | studioRunner.image.repository | registry.citi.com/put/checks-studio-runner | `helm-chart/put-checks/values.yaml:378` | **live** | MOVED |  | V |
| CHV-007 | studioRunner.image.tag |  | `helm-chart/put-checks/values.yaml:379` | **live** | MOVED |  | V |
| CHV-008 | studioRunner.image.pullPolicy | IfNotPresent | `helm-chart/put-checks/values.yaml:380` | **live** | MOVED |  | V |
| CHV-009 | studioRunner.replicaCount | 2 | `helm-chart/put-checks/values.yaml:388` | **live** | BEHAVIOUR | D2: value unchanged; guided-enable now requires replicaCount 1 and autoscaling off (render guard _helpers.tpl studioRunner.guidedGuard); shipped files ke… | V |
| CHV-010 | studioRunner.autoscaling.enabled | false | `helm-chart/put-checks/values.yaml:395` | **live** | BEHAVIOUR | D2: value unchanged; guided-enable now requires replicaCount 1 and autoscaling off (render guard _helpers.tpl studioRunner.guidedGuard); shipped files ke… | V |
| CHV-011 | studioRunner.autoscaling.minReplicaCount | 2 | `helm-chart/put-checks/values.yaml:398` | **live** | BEHAVIOUR | D2: value unchanged; guided-enable now requires replicaCount 1 and autoscaling off (render guard _helpers.tpl studioRunner.guidedGuard); shipped files ke… | V |
| CHV-012 | studioRunner.autoscaling.maxReplicaCount | 4 | `helm-chart/put-checks/values.yaml:399` | **live** | BEHAVIOUR | D2: value unchanged; guided-enable now requires replicaCount 1 and autoscaling off (render guard _helpers.tpl studioRunner.guidedGuard); shipped files ke… | V |
| CHV-013 | studioRunner.autoscaling.pollingIntervalSeconds | 15 | `helm-chart/put-checks/values.yaml:400` | **live** | MOVED |  | V |
| CHV-014 | studioRunner.autoscaling.cooldownPeriodSeconds | 300 | `helm-chart/put-checks/values.yaml:406` | **live** | MOVED |  | V |
| CHV-015 | studioRunner.autoscaling.targetBacklogPerPod | 1 | `helm-chart/put-checks/values.yaml:408` | **live** | MOVED |  | V |
| CHV-016 | studioRunner.autoscaling.prometheus.serverAddress |  | `helm-chart/put-checks/values.yaml:411` | **live** | MOVED |  | V |
| CHV-017 | studioRunner.autoscaling.prometheus.query | sum(max by (state) (studio_dispatch_backlog{state=~"QUEUED\|CLAIMED"}… | `helm-chart/put-checks/values.yaml:415` | **live** | MOVED |  | V |
| CHV-018 | studioRunner.podDisruptionBudget.enabled | true | `helm-chart/put-checks/values.yaml:420` | **live** | MOVED |  | V |
| CHV-019 | studioRunner.podDisruptionBudget.maxUnavailable | 1 | `helm-chart/put-checks/values.yaml:421` | **live** | MOVED |  | V |
| CHV-020 | studioRunner.service.type | ClusterIP | `helm-chart/put-checks/values.yaml:424` | **live** | MOVED |  | V |
| CHV-021 | studioRunner.service.port | 8090 | `helm-chart/put-checks/values.yaml:429` | **live** | BEHAVIOUR | D1/D2: value unchanged; the one TLS listener serves /v2/*, /health, /ready and (guided on) the bridge on this port | V |
| CHV-022 | studioRunner.shareProcessNamespace | true | `helm-chart/put-checks/values.yaml:448` | **live** | BEHAVIOUR | D2: value unchanged (true); guidedGuard now fails the render when guided is on and it is false (PID-1 b) | V |
| CHV-023 | studioRunner.serviceAccount.create | true | `helm-chart/put-checks/values.yaml:451` | **live** | MOVED |  | V |
| CHV-024 | studioRunner.serviceAccount.name |  | `helm-chart/put-checks/values.yaml:452` | **live** | MOVED |  | V |
| CHV-025 | studioRunner.serviceAccount.automountServiceAccountToken | false | `helm-chart/put-checks/values.yaml:454` | **live** | MOVED |  | V |
| CHV-026 | studioRunner.resources.requests.cpu | 500m | `helm-chart/put-checks/values.yaml:458` | **live** | MOVED | D2: EXPECTED SIZING CHANGE NOT IN THIS LEAF: value unchanged; D2 added a separate studioRunner.guided.resources.* block that the runner Deployment uses o… | V |
| CHV-027 | studioRunner.resources.requests.memory | 1Gi | `helm-chart/put-checks/values.yaml:459` | **live** | MOVED | D2: EXPECTED SIZING CHANGE NOT IN THIS LEAF: value unchanged; D2 added a separate studioRunner.guided.resources.* block that the runner Deployment uses o… | V |
| CHV-028 | studioRunner.resources.limits.cpu | 2 | `helm-chart/put-checks/values.yaml:461` | **live** | MOVED | D2: EXPECTED SIZING CHANGE NOT IN THIS LEAF: value unchanged; D2 added a separate studioRunner.guided.resources.* block that the runner Deployment uses o… | V |
| CHV-029 | studioRunner.resources.limits.memory | 2Gi | `helm-chart/put-checks/values.yaml:462` | **live** | MOVED | D2: EXPECTED SIZING CHANGE NOT IN THIS LEAF: value unchanged; D2 added a separate studioRunner.guided.resources.* block that the runner Deployment uses o… | V |
| CHV-030 | studioRunner.seccompProfile.type | RuntimeDefault | `helm-chart/put-checks/values.yaml:472` | **live** | MOVED |  | V |
| CHV-031 | studioRunner.podSecurityContext.runAsNonRoot | true | `helm-chart/put-checks/values.yaml:475` | **live** | MOVED |  | V |
| CHV-032 | studioRunner.podSecurityContext.runAsUser | 1001 | `helm-chart/put-checks/values.yaml:478` | **live** | MOVED |  | V |
| CHV-033 | studioRunner.podSecurityContext.runAsGroup | 1001 | `helm-chart/put-checks/values.yaml:479` | **live** | MOVED |  | V |
| CHV-034 | studioRunner.podSecurityContext.fsGroup | 1001 | `helm-chart/put-checks/values.yaml:480` | **live** | MOVED |  | V |
| CHV-035 | studioRunner.securityContext.allowPrivilegeEscalation | false | `helm-chart/put-checks/values.yaml:483` | **live** | MOVED |  | V |
| CHV-036 | studioRunner.securityContext.readOnlyRootFilesystem | true | `helm-chart/put-checks/values.yaml:487` | **live** | MOVED |  | V |
| CHV-037 | studioRunner.securityContext.capabilities.drop | ["ALL"] | `helm-chart/put-checks/values.yaml:489` | **live** | MOVED |  | V |
| CHV-038 | studioRunner.scratch.mountPath | /scratch | `helm-chart/put-checks/values.yaml:502` | **live** | MOVED |  | V |
| CHV-039 | studioRunner.scratch.directory | studio-runner | `helm-chart/put-checks/values.yaml:504` | **live** | MOVED |  | V |
| CHV-040 | studioRunner.scratch.sizeLimit | 4Gi | `helm-chart/put-checks/values.yaml:505` | **live** | MOVED |  | V |
| CHV-041 | studioRunner.devShm.sizeLimit | 1Gi | `helm-chart/put-checks/values.yaml:509` | **live** | MOVED |  | V |
| CHV-042 | studioRunner.drain.preStopSleepSeconds | 5 | `helm-chart/put-checks/values.yaml:514` | **live** | MOVED |  | V |
| CHV-043 | studioRunner.drain.extraGraceSeconds | 30 | `helm-chart/put-checks/values.yaml:517` | **live** | MOVED |  | V |
| CHV-044 | studioRunner.probes.readinessPath | /ready | `helm-chart/put-checks/values.yaml:523` | **live** | BEHAVIOUR | D1: value unchanged; the exec probe now dials 127.0.0.1 over TLS with the runner certificate (probe.ts:30, :93-94); probe command unchanged | V |
| CHV-045 | studioRunner.probes.livenessPath | /health | `helm-chart/put-checks/values.yaml:524` | **live** | BEHAVIOUR | D1: value unchanged; the exec probe now dials 127.0.0.1 over TLS with the runner certificate (probe.ts:30, :93-94); probe command unchanged | V |
| CHV-046 | studioRunner.probes.initialDelaySeconds | 10 | `helm-chart/put-checks/values.yaml:525` | **live** | BEHAVIOUR | D1: value unchanged; the exec probe now dials 127.0.0.1 over TLS with the runner certificate (probe.ts:30, :93-94); probe command unchanged | V |
| CHV-047 | studioRunner.probes.periodSeconds | 5 | `helm-chart/put-checks/values.yaml:526` | **live** | BEHAVIOUR | D1: value unchanged; the exec probe now dials 127.0.0.1 over TLS with the runner certificate (probe.ts:30, :93-94); probe command unchanged | V |
| CHV-048 | studioRunner.identity.secretName | checks-studio-runner-identity | `helm-chart/put-checks/values.yaml:542` | **live** | ADJACENT | D2: value unchanged; adjacent studioRunner.tls.* and studioRunner.backendTls.* Secret wiring added (new entries) | V |
| CHV-049 | studioRunner.identity.serviceIdentityKey | serviceIdentity | `helm-chart/put-checks/values.yaml:543` | **live** | ADJACENT | D2: value unchanged; adjacent studioRunner.tls.* and studioRunner.backendTls.* Secret wiring added (new entries) | V |
| CHV-050 | studioRunner.identity.callbackIdentityKey | callbackIdentity | `helm-chart/put-checks/values.yaml:544` | **live** | ADJACENT | D2: value unchanged; adjacent studioRunner.tls.* and studioRunner.backendTls.* Secret wiring added (new entries) | V |
| CHV-051 | studioRunner.callbackBaseUrl |  | `helm-chart/put-checks/values.yaml:549` | **live** | MOVED |  | V |
| CHV-052 | studioRunner.objectStore.credentialsSecret | checks-studio-runner-object-store | `helm-chart/put-checks/values.yaml:717` | **live** | MOVED |  | V |
| CHV-053 | studioRunner.objectStore.mountPath | /etc/studio/object-store | `helm-chart/put-checks/values.yaml:718` | **live** | MOVED |  | V |
| CHV-054 | studioRunner.objectStore.keys | ["accessKeyId","secretAccessKey"] | `helm-chart/put-checks/values.yaml:721` | **live** | MOVED |  | V |
| CHV-055 | studioRunner.objectStore.keyPrefix | studio/ | `helm-chart/put-checks/values.yaml:726` | **live** | MOVED |  | V |
| CHV-056 | studioRunner.networkPolicy.enabled | true | `helm-chart/put-checks/values.yaml:729` | **live** | MOVED |  | V |
| CHV-057 | studioRunner.networkPolicy.dnsPort | 53 | `helm-chart/put-checks/values.yaml:733` | **live** | MOVED |  | V |
| CHV-058 | studioRunner.networkPolicy.objectStorePort | 443 | `helm-chart/put-checks/values.yaml:734` | **live** | MOVED |  | V |
| CHV-059 | studioRunner.networkPolicy.approvedTargets | [] | `helm-chart/put-checks/values.yaml:737` | **live** | MOVED |  | V |
| CHV-060 | studioRunner.runnerEnv.STUDIO_RUNNER_POOL_SIZE | 1 | `helm-chart/put-checks/values.yaml:746` | **live** | MOVED |  | V |
| CHV-061 | studioRunner.runnerEnv.STUDIO_RUNNER_MAX_TOTAL_RUNTIME_MS | 120000 | `helm-chart/put-checks/values.yaml:747` | **live** | MOVED |  | V |
| CHV-062 | studioRunner.runnerEnv.STUDIO_RUNNER_MAX_STEP_TIMEOUT_MS | 120000 | `helm-chart/put-checks/values.yaml:749` | **live** | MOVED |  | V |
| CHV-063 | studioRunner.runnerEnv.STUDIO_RUNNER_BROWSER_STOP_TIMEOUT_MS | 15000 | `helm-chart/put-checks/values.yaml:758` | **live** | MOVED |  | V |
| CHV-064 | studioRunner.runnerEnv.STUDIO_RUNNER_TERMINAL_DELIVERY_WINDOW_MS | 30000 | `helm-chart/put-checks/values.yaml:759` | **live** | MOVED |  | V |
| CHV-065 | studioRunner.runnerEnv.STUDIO_RUNNER_OBJECT_STORE_WINDOW_MS | 15000 | `helm-chart/put-checks/values.yaml:760` | **live** | MOVED |  | V |
| CHV-066 | studioRunner.runnerEnv.STUDIO_RUNNER_DRAIN_TIMEOUT_MS | 150000 | `helm-chart/put-checks/values.yaml:761` | **live** | MOVED |  | V |
| CHV-067 | studioRunner.runnerEnv.STUDIO_RUNNER_RECORDING_WIDTH | 1280 | `helm-chart/put-checks/values.yaml:762` | **live** | MOVED |  | V |
| CHV-068 | studioRunner.runnerEnv.STUDIO_RUNNER_RECORDING_HEIGHT | 720 | `helm-chart/put-checks/values.yaml:763` | **live** | MOVED |  | V |
| CHV-069 | studioRunner.runnerEnv.STUDIO_RUNNER_SEEK_ORIGIN_CALIBRATION_MS | 0 | `helm-chart/put-checks/values.yaml:767` | **live** | MOVED |  | V |
| CHV-070 | studioRunner.podAnnotations | {} | `helm-chart/put-checks/values.yaml:769` | **live** | MOVED |  | V |
| CHV-071 | studioRunner.nodeSelector | {} | `helm-chart/put-checks/values.yaml:770` | **live** | MOVED |  | V |
| CHV-072 | studioRunner.tolerations | [] | `helm-chart/put-checks/values.yaml:771` | **live** | MOVED |  | V |
| CHV-073 | studioRunner.affinity | {} | `helm-chart/put-checks/values.yaml:772` | **live** | MOVED |  | V |
| CHV-074 | objectStore.provider | local | `helm-chart/put-checks/values.yaml:782` | **live** | MOVED |  | V |
| CHV-075 | objectStore.endpoint |  | `helm-chart/put-checks/values.yaml:783` | **live** | MOVED |  | V |
| CHV-076 | objectStore.region | us-east-1 | `helm-chart/put-checks/values.yaml:784` | **live** | MOVED |  | V |
| CHV-077 | objectStore.bucket | put-checks-studio-evidence | `helm-chart/put-checks/values.yaml:785` | **live** | MOVED |  | V |
| CHV-078 | objectStore.pathStyleAccess | true | `helm-chart/put-checks/values.yaml:786` | **live** | MOVED |  | V |
| CHV-079 | objectStore.localDirectory | /var/lib/studio-objects | `helm-chart/put-checks/values.yaml:789` | **live** | MOVED |  | V |
| CHV-080 | objectStore.local.createClaim | true | `helm-chart/put-checks/values.yaml:791` | **live** | MOVED |  | V |
| CHV-081 | objectStore.local.existingClaim |  | `helm-chart/put-checks/values.yaml:792` | **live** | MOVED |  | V |
| CHV-082 | objectStore.local.storageClassName |  | `helm-chart/put-checks/values.yaml:793` | **live** | MOVED |  | V |
| CHV-083 | objectStore.local.accessModes | ["ReadWriteMany"] | `helm-chart/put-checks/values.yaml:794` | **live** | MOVED |  | V |
| CHV-084 | objectStore.local.size | 10Gi | `helm-chart/put-checks/values.yaml:796` | **live** | MOVED |  | V |
| CHV-085 | objectStore.connectTimeout | 2s | `helm-chart/put-checks/values.yaml:797` | **live** | MOVED |  | V |
| CHV-086 | objectStore.requestTimeout | 10s | `helm-chart/put-checks/values.yaml:798` | **live** | MOVED |  | V |
| CHV-087 | objectStore.credentialsSecret | checks-api-object-store | `helm-chart/put-checks/values.yaml:799` | **live** | MOVED |  | V |
| CHV-088 | objectStore.mountPath | /etc/studio/object-store | `helm-chart/put-checks/values.yaml:800` | **live** | MOVED |  | V |
| CHV-089 | objectStore.keys | ["accessKeyId","secretAccessKey"] | `helm-chart/put-checks/values.yaml:801` | **live** | MOVED |  | V |
| CHV-090 | objectStore.retention | 30d | `helm-chart/put-checks/values.yaml:807` | **live** | MOVED |  | V |
| CHV-091 | studioVault.provider | none | `helm-chart/put-checks/values.yaml:813` | **live** | MOVED |  | V |
| CHV-092 | studioVault.address |  | `helm-chart/put-checks/values.yaml:814` | **live** | MOVED |  | V |
| CHV-093 | studioVault.namespace |  | `helm-chart/put-checks/values.yaml:815` | **live** | MOVED |  | V |
| CHV-094 | studioVault.mount | secret | `helm-chart/put-checks/values.yaml:816` | **live** | MOVED |  | V |
| CHV-095 | studioVault.pathTemplate | studio/{csiId}/{environment}/{testId}/{kind}/{referenceName} | `helm-chart/put-checks/values.yaml:817` | **live** | MOVED |  | V |
| CHV-096 | studioVault.valueKey | value | `helm-chart/put-checks/values.yaml:818` | **live** | MOVED |  | V |
| CHV-097 | studioVault.tokenSecret | checks-studio-vault-token | `helm-chart/put-checks/values.yaml:819` | **live** | MOVED |  | V |
| CHV-098 | studioVault.tokenKey | token | `helm-chart/put-checks/values.yaml:820` | **live** | MOVED |  | V |
| CHV-099 | studioVault.tokenMountPath | /etc/studio/vault | `helm-chart/put-checks/values.yaml:821` | **live** | MOVED |  | V |
| CHV-100 | studioVault.connectTimeout | 2s | `helm-chart/put-checks/values.yaml:822` | **live** | MOVED |  | V |
| CHV-101 | studioVault.requestTimeout | 5s | `helm-chart/put-checks/values.yaml:823` | **live** | MOVED |  | V |
| CHV-102 | studioVault.maxResponseBytes | 65536 | `helm-chart/put-checks/values.yaml:824` | **live** | MOVED |  | V |
| CHV-103 | studioGateway.environment | production | `helm-chart/put-checks/values.yaml:830` | **live** | MOVED |  | V |
| CHV-104 | studioGateway.provider | vertex | `helm-chart/put-checks/values.yaml:831` | **live** | MOVED |  | V |
| CHV-105 | studioGateway.endpoint |  | `helm-chart/put-checks/values.yaml:832` | **live** | MOVED |  | V |
| CHV-106 | studioGateway.project |  | `helm-chart/put-checks/values.yaml:833` | **live** | MOVED |  | V |
| CHV-107 | studioGateway.location |  | `helm-chart/put-checks/values.yaml:834` | **live** | MOVED |  | V |
| CHV-108 | studioGateway.model | gemini-3.8-flash | `helm-chart/put-checks/values.yaml:835` | **live** | MOVED |  | V |
| CHV-109 | studioGateway.vertexConfigMap.name | checks-studio-vertex | `helm-chart/put-checks/values.yaml:840` | **live** | MOVED |  | V |
| CHV-110 | studioGateway.vertexConfigMap.endpointKey | endpoint | `helm-chart/put-checks/values.yaml:841` | **live** | MOVED |  | V |
| CHV-111 | studioGateway.vertexConfigMap.projectKey | project | `helm-chart/put-checks/values.yaml:842` | **live** | MOVED |  | V |
| CHV-112 | studioGateway.vertexConfigMap.locationKey | location | `helm-chart/put-checks/values.yaml:843` | **live** | MOVED |  | V |
| CHV-113 | studioGateway.credentialsMode | application-default | `helm-chart/put-checks/values.yaml:844` | **live** | MOVED |  | V |
| CHV-114 | studioGateway.credentialsSecret |  | `helm-chart/put-checks/values.yaml:845` | **live** | MOVED |  | V |
| CHV-115 | studioGateway.credentialsKey | service-account.json | `helm-chart/put-checks/values.yaml:846` | **live** | MOVED |  | V |
| CHV-116 | studioGateway.credentialsMountPath | /etc/studio/gateway | `helm-chart/put-checks/values.yaml:847` | **live** | MOVED |  | V |
| CHV-117 | studioSse.heartbeatSeconds | 15 | `helm-chart/put-checks/values.yaml:886` | **live** | MOVED |  | V |
| CHV-118 | studioSse.lifetimeSeconds | 60 | `helm-chart/put-checks/values.yaml:889` | **live** | MOVED |  | V |
| CHV-119 | studioSse.idleTimeoutMarginSeconds | 60 | `helm-chart/put-checks/values.yaml:893` | **live** | MOVED |  | V |
| CHV-120 | studioSse.ingress.enabled | true | `helm-chart/put-checks/values.yaml:899` | **live** | MOVED |  | V |
| CHV-121 | studioSse.ingress.extraAnnotations | {} | `helm-chart/put-checks/values.yaml:915` | **live** | MOVED |  | V |
| CHV-122 | studioExecution.enabled | true | `helm-chart/put-checks/values.yaml:964` | **live** | MOVED |  | V |
| CHV-123 | studioExecution.dispatcherEnabled | true | `helm-chart/put-checks/values.yaml:971` | **live** | MOVED |  | V |
| CHV-124 | studioRunner.probes.livenessFailureThreshold | 3 | `helm-chart/put-checks/values.yaml:532` | **live** | NEW | D2: NEW | V |
| CHV-125 | studioRunner.tls.secretName | checks-studio-runner-tls | `helm-chart/put-checks/values.yaml:565` | **live** | NEW | D2: NEW: runner TLS listener / backend client-certificate Secret wiring | V |
| CHV-126 | studioRunner.tls.mountPath | /etc/studio/tls | `helm-chart/put-checks/values.yaml:569` | **live** | NEW | D2: NEW: runner TLS listener / backend client-certificate Secret wiring | V |
| CHV-127 | studioRunner.tls.keyFile | tls.key | `helm-chart/put-checks/values.yaml:570` | **live** | NEW | D2: NEW: runner TLS listener / backend client-certificate Secret wiring | V |
| CHV-128 | studioRunner.tls.certFile | tls.crt | `helm-chart/put-checks/values.yaml:571` | **live** | NEW | D2: NEW: runner TLS listener / backend client-certificate Secret wiring | V |
| CHV-129 | studioRunner.tls.caFile | ca.crt | `helm-chart/put-checks/values.yaml:572` | **live** | NEW | D2: NEW: runner TLS listener / backend client-certificate Secret wiring | V |
| CHV-130 | studioRunner.tls.controllerCertificateFingerprint256 |  | `helm-chart/put-checks/values.yaml:580` | **live** | NEW | D2: NEW: runner TLS listener / backend client-certificate Secret wiring | V |
| CHV-131 | studioRunner.tls.rotationRevision |  | `helm-chart/put-checks/values.yaml:586` | **live** | NEW | D2: NEW: runner TLS listener / backend client-certificate Secret wiring | V |
| CHV-132 | studioRunner.backendTls.secretName | checks-studio-backend-runner-tls | `helm-chart/put-checks/values.yaml:600` | **live** | NEW | D2: NEW: runner TLS listener / backend client-certificate Secret wiring | V |
| CHV-133 | studioRunner.backendTls.mountPath | /etc/studio/runner-tls | `helm-chart/put-checks/values.yaml:601` | **live** | NEW | D2: NEW: runner TLS listener / backend client-certificate Secret wiring | V |
| CHV-134 | studioRunner.backendTls.keyStoreKey | keystore.p12 | `helm-chart/put-checks/values.yaml:602` | **live** | NEW | D2: NEW: runner TLS listener / backend client-certificate Secret wiring | V |
| CHV-135 | studioRunner.backendTls.keyStorePasswordKey | keystore.password | `helm-chart/put-checks/values.yaml:603` | **live** | NEW | D2: NEW: runner TLS listener / backend client-certificate Secret wiring | V |
| CHV-136 | studioRunner.backendTls.trustStoreKey | truststore.p12 | `helm-chart/put-checks/values.yaml:604` | **live** | NEW | D2: NEW: runner TLS listener / backend client-certificate Secret wiring | V |
| CHV-137 | studioRunner.backendTls.trustStorePasswordKey | truststore.password | `helm-chart/put-checks/values.yaml:605` | **live** | NEW | D2: NEW: runner TLS listener / backend client-certificate Secret wiring | V |
| CHV-138 | studioRunner.backendTls.storeType | PKCS12 | `helm-chart/put-checks/values.yaml:606` | **live** | NEW | D2: NEW: runner TLS listener / backend client-certificate Secret wiring | V |
| CHV-139 | studioRunner.guided.enabled | false | `helm-chart/put-checks/values.yaml:623` | **live** | NEW | D2: NEW: guided mode as a mode of the one runner Deployment | V |
| CHV-140 | studioRunner.guided.workerId | worker-1 | `helm-chart/put-checks/values.yaml:628` | **dark** | NEW | D2: NEW: guided mode as a mode of the one runner Deployment | V |
| CHV-141 | studioRunner.guided.token.issuer |  | `helm-chart/put-checks/values.yaml:639` | **dark** | NEW | D2: NEW: guided mode as a mode of the one runner Deployment | V |
| CHV-142 | studioRunner.guided.token.controllerSubject |  | `helm-chart/put-checks/values.yaml:640` | **dark** | NEW | D2: NEW: guided mode as a mode of the one runner Deployment | V |
| CHV-143 | studioRunner.guided.token.publicKey |  | `helm-chart/put-checks/values.yaml:641` | **dark** | NEW | D2: NEW: guided mode as a mode of the one runner Deployment | V |
| CHV-144 | studioRunner.guided.callbackBaseUrl |  | `helm-chart/put-checks/values.yaml:646` | **dark** | NEW | D2: NEW: guided mode as a mode of the one runner Deployment | V |
| CHV-145 | studioRunner.guided.callbackToken.secretName | checks-studio-guided-callback-token | `helm-chart/put-checks/values.yaml:650` | **dark** | NEW | D2: NEW: guided mode as a mode of the one runner Deployment | V |
| CHV-146 | studioRunner.guided.callbackToken.key | token | `helm-chart/put-checks/values.yaml:651` | **dark** | NEW | D2: NEW: guided mode as a mode of the one runner Deployment | V |
| CHV-147 | studioRunner.guided.callbackToken.mountPath | /etc/studio/guided-token | `helm-chart/put-checks/values.yaml:652` | **dark** | NEW | D2: NEW: guided mode as a mode of the one runner Deployment | V |
| CHV-148 | studioRunner.guided.controllerPublicKey.mountPath | /etc/studio/guided | `helm-chart/put-checks/values.yaml:655` | **dark** | NEW | D2: NEW: guided mode as a mode of the one runner Deployment | V |
| CHV-149 | studioRunner.guided.controllerPublicKey.file | controller-public-key.pem | `helm-chart/put-checks/values.yaml:656` | **dark** | NEW | D2: NEW: guided mode as a mode of the one runner Deployment | V |
| CHV-150 | studioRunner.guided.backendTokens.secretName | checks-studio-guided-controller-tokens | `helm-chart/put-checks/values.yaml:660` | **dark** | NEW | D2: NEW: guided mode as a mode of the one runner Deployment | V |
| CHV-151 | studioRunner.guided.backendTokens.runnerTokenKey | runner-controller-token | `helm-chart/put-checks/values.yaml:661` | **dark** | NEW | D2: NEW: guided mode as a mode of the one runner Deployment | V |
| CHV-152 | studioRunner.guided.backendTokens.translationTokenKey | translation-controller-token | `helm-chart/put-checks/values.yaml:662` | **dark** | NEW | D2: NEW: guided mode as a mode of the one runner Deployment | V |
| CHV-153 | studioRunner.guided.backendTokens.mountPath | /etc/studio/guided-controller-tokens | `helm-chart/put-checks/values.yaml:663` | **dark** | NEW | D2: NEW: guided mode as a mode of the one runner Deployment | V |
| CHV-154 | studioRunner.guided.tlsConnector.port | 8443 | `helm-chart/put-checks/values.yaml:668` | **dark** | NEW | D2: NEW: guided mode as a mode of the one runner Deployment | V |
| CHV-155 | studioRunner.guided.tlsConnector.servicePort | 8443 | `helm-chart/put-checks/values.yaml:669` | **dark** | NEW | D2: NEW: guided mode as a mode of the one runner Deployment | V |
| CHV-156 | studioRunner.guided.journal.mountPath | /var/lib/studio-guided | `helm-chart/put-checks/values.yaml:677` | **dark** | NEW | D2: NEW: guided mode as a mode of the one runner Deployment | V |
| CHV-157 | studioRunner.guided.journal.directory | journal | `helm-chart/put-checks/values.yaml:678` | **dark** | NEW | D2: NEW: guided mode as a mode of the one runner Deployment | V |
| CHV-158 | studioRunner.guided.journal.sizeLimit | 256Mi | `helm-chart/put-checks/values.yaml:681` | **dark** | NEW | D2: NEW: guided mode as a mode of the one runner Deployment | V |
| CHV-159 | studioRunner.guided.tmp.sizeLimit | 1Gi | `helm-chart/put-checks/values.yaml:690` | **dark** | NEW | D2: NEW: guided mode as a mode of the one runner Deployment | V |
| CHV-160 | studioRunner.guided.livenessFailureThreshold | 6 | `helm-chart/put-checks/values.yaml:694` | **dark** | NEW | D2: NEW: guided mode as a mode of the one runner Deployment | V |
| CHV-161 | studioRunner.guided.resources.requests.cpu | 1 | `helm-chart/put-checks/values.yaml:701` | **dark** | NEW | D2: NEW: guided mode as a mode of the one runner Deployment | V |
| CHV-162 | studioRunner.guided.resources.requests.memory | 2Gi | `helm-chart/put-checks/values.yaml:702` | **dark** | NEW | D2: NEW: guided mode as a mode of the one runner Deployment | V |
| CHV-163 | studioRunner.guided.resources.limits.cpu | 3 | `helm-chart/put-checks/values.yaml:704` | **dark** | NEW | D2: NEW: guided mode as a mode of the one runner Deployment | V |
| CHV-164 | studioRunner.guided.resources.limits.memory | 4Gi | `helm-chart/put-checks/values.yaml:705` | **dark** | NEW | D2: NEW: guided mode as a mode of the one runner Deployment | V |
| CHV-165 | studioRunner.guided.devShm.sizeLimit | 2Gi | `helm-chart/put-checks/values.yaml:707` | **dark** | NEW | D2: NEW: guided mode as a mode of the one runner Deployment | V |
| CHV-166 | studioAuditSiem.enabled | false | `helm-chart/put-checks/values.yaml:934` | **live** | NEW | D2: NEW: SIEM routing contract (sink owed Platform/SRE) | V |
| CHV-167 | studioAuditSiem.sink.name |  | `helm-chart/put-checks/values.yaml:937` | **dark** | NEW | D2: NEW: SIEM routing contract (sink owed Platform/SRE) | V |
| CHV-168 | studioAuditSiem.podAnnotations | {} | `helm-chart/put-checks/values.yaml:941` | **dark** | NEW | D2: NEW: SIEM routing contract (sink owed Platform/SRE) | V |

### 4.16 Chart `values-<env>.yaml` (92)

| Id | Surface | Value | Anchor | Status | Delta | 009 change | Tag |
|---|---|---|---|---|---|---|---|
| CHE-01 | backend.env.JAVA_OPTS [values-dev] | -Xms256m -Xmx512m -XX:+UseG1GC -XX:MaxMetaspaceSize=192m -XX:-HeapDum… | `helm-chart/put-checks/values-dev.yaml:25` | **live** | CHANGED | D2: adds -XX:-HeapDumpOnOutOfMemoryError -XX:-CreateCoredumpOnCrash | V |
| CHE-02 | backend.configOverrides.checks.sources.UI_TEST [values-dev] | false | `helm-chart/put-checks/values-dev.yaml:39` | **live** | MOVED |  | V |
| CHE-03 | studioVault.provider [values-dev] | none | `helm-chart/put-checks/values-dev.yaml:47` | **live** | MOVED |  | V |
| CHE-04 | studioGateway.environment [values-dev] | local | `helm-chart/put-checks/values-dev.yaml:52` | **live** | MOVED |  | V |
| CHE-05 | studioGateway.provider [values-dev] | disabled | `helm-chart/put-checks/values-dev.yaml:53` | **live** | MOVED |  | V |
| CHE-06 | studioGateway.vertexConfigMap.name [values-dev] |  | `helm-chart/put-checks/values-dev.yaml:55` | **live** | MOVED |  | V |
| CHE-07 | worker.env.JAVA_OPTS [values-dev] | -Xms256m -Xmx512m -XX:+UseG1GC -XX:MaxMetaspaceSize=192m -XX:-HeapDum… | `helm-chart/put-checks/values-dev.yaml:75` | **live** | CHANGED | D2: adds -XX:-HeapDumpOnOutOfMemoryError -XX:-CreateCoredumpOnCrash | V |
| CHE-08 | worker.configOverrides.checks.executor.source-limits.UI_TEST [values-dev] | 5 | `helm-chart/put-checks/values-dev.yaml:95` | **live** | MOVED |  | V |
| CHE-09 | frontend.env.VITE_ENABLE_STUDIO [values-dev] | true | `helm-chart/put-checks/values-dev.yaml:113` | **live** | MOVED |  | V |
| CHE-10 | studioRunner.enabled [values-dev] | false | `helm-chart/put-checks/values-dev.yaml:121` | **live** | MOVED |  | V |
| CHE-11 | studioRunner.replicaCount [values-dev] | 2 | `helm-chart/put-checks/values-dev.yaml:122` | **live** | BEHAVIOUR | D2: value unchanged; guided-enable now requires replicaCount 1 and autoscaling off (render guard _helpers.tpl studioRunner.guidedGuard); shipped files ke… | V |
| CHE-12 | studioRunner.resources.requests.cpu [values-dev] | 250m | `helm-chart/put-checks/values-dev.yaml:125` | **live** | MOVED | D2: EXPECTED SIZING CHANGE NOT IN THIS LEAF: value unchanged; D2 added a separate studioRunner.guided.resources.* block that the runner Deployment uses o… | V |
| CHE-13 | studioRunner.resources.requests.memory [values-dev] | 512Mi | `helm-chart/put-checks/values-dev.yaml:126` | **live** | MOVED | D2: EXPECTED SIZING CHANGE NOT IN THIS LEAF: value unchanged; D2 added a separate studioRunner.guided.resources.* block that the runner Deployment uses o… | V |
| CHE-14 | studioRunner.resources.limits.cpu [values-dev] | 1 | `helm-chart/put-checks/values-dev.yaml:128` | **live** | MOVED | D2: EXPECTED SIZING CHANGE NOT IN THIS LEAF: value unchanged; D2 added a separate studioRunner.guided.resources.* block that the runner Deployment uses o… | V |
| CHE-15 | studioRunner.resources.limits.memory [values-dev] | 1Gi | `helm-chart/put-checks/values-dev.yaml:129` | **live** | MOVED | D2: EXPECTED SIZING CHANGE NOT IN THIS LEAF: value unchanged; D2 added a separate studioRunner.guided.resources.* block that the runner Deployment uses o… | V |
| CHE-16 | studioRunner.devShm.sizeLimit [values-dev] | 512Mi | `helm-chart/put-checks/values-dev.yaml:131` | **live** | MOVED |  | V |
| CHE-17 | studioRunner.scratch.sizeLimit [values-dev] | 2Gi | `helm-chart/put-checks/values-dev.yaml:133` | **live** | MOVED |  | V |
| CHE-18 | studioRunner.seccompProfile.type [values-dev] | RuntimeDefault | `helm-chart/put-checks/values-dev.yaml:165` | **live** | MOVED |  | V |
| CHE-19 | backend.env.JAVA_OPTS [values-uat] | -Xms256m -Xmx512m -XX:+UseG1GC -XX:MaxMetaspaceSize=192m -XX:+ExitOnO… | `helm-chart/put-checks/values-uat.yaml:26` | **live** | CHANGED | D2: adds -XX:-HeapDumpOnOutOfMemoryError -XX:-CreateCoredumpOnCrash | V |
| CHE-20 | backend.configOverrides.checks.sources.UI_TEST [values-uat] | true | `helm-chart/put-checks/values-uat.yaml:88` | **live** | MOVED |  | V |
| CHE-21 | worker.env.JAVA_OPTS [values-uat] | -Xms512m -Xmx768m -XX:+UseG1GC -XX:MaxMetaspaceSize=192m -XX:+ExitOnO… | `helm-chart/put-checks/values-uat.yaml:106` | **live** | CHANGED | D2: adds -XX:-HeapDumpOnOutOfMemoryError -XX:-CreateCoredumpOnCrash | V |
| CHE-22 | worker.configOverrides.checks.executor.source-limits.UI_TEST [values-uat] | 10 | `helm-chart/put-checks/values-uat.yaml:125` | **live** | MOVED |  | V |
| CHE-23 | frontend.env.VITE_ENABLE_STUDIO [values-uat] | true | `helm-chart/put-checks/values-uat.yaml:145` | **live** | MOVED |  | V |
| CHE-24 | studioRunner.enabled [values-uat] | true | `helm-chart/put-checks/values-uat.yaml:156` | **live** | MOVED |  | V |
| CHE-25 | studioRunner.replicaCount [values-uat] | 2 | `helm-chart/put-checks/values-uat.yaml:157` | **live** | BEHAVIOUR | D2: value unchanged; guided-enable now requires replicaCount 1 and autoscaling off (render guard _helpers.tpl studioRunner.guidedGuard); shipped files ke… | V |
| CHE-26 | studioRunner.resources.requests.cpu [values-uat] | 500m | `helm-chart/put-checks/values-uat.yaml:160` | **live** | MOVED | D2: EXPECTED SIZING CHANGE NOT IN THIS LEAF: value unchanged; D2 added a separate studioRunner.guided.resources.* block that the runner Deployment uses o… | V |
| CHE-27 | studioRunner.resources.requests.memory [values-uat] | 1Gi | `helm-chart/put-checks/values-uat.yaml:161` | **live** | MOVED | D2: EXPECTED SIZING CHANGE NOT IN THIS LEAF: value unchanged; D2 added a separate studioRunner.guided.resources.* block that the runner Deployment uses o… | V |
| CHE-28 | studioRunner.resources.limits.cpu [values-uat] | 2 | `helm-chart/put-checks/values-uat.yaml:163` | **live** | MOVED | D2: EXPECTED SIZING CHANGE NOT IN THIS LEAF: value unchanged; D2 added a separate studioRunner.guided.resources.* block that the runner Deployment uses o… | V |
| CHE-29 | studioRunner.resources.limits.memory [values-uat] | 2Gi | `helm-chart/put-checks/values-uat.yaml:164` | **live** | MOVED | D2: EXPECTED SIZING CHANGE NOT IN THIS LEAF: value unchanged; D2 added a separate studioRunner.guided.resources.* block that the runner Deployment uses o… | V |
| CHE-30 | studioRunner.devShm.sizeLimit [values-uat] | 1Gi | `helm-chart/put-checks/values-uat.yaml:166` | **live** | MOVED |  | V |
| CHE-31 | studioRunner.scratch.sizeLimit [values-uat] | 4Gi | `helm-chart/put-checks/values-uat.yaml:168` | **live** | MOVED |  | V |
| CHE-32 | studioRunner.seccompProfile.type [values-uat] | RuntimeDefault | `helm-chart/put-checks/values-uat.yaml:197` | **live** | MOVED |  | V |
| CHE-33 | studioRunner.callbackBaseUrl [values-uat] |  | `helm-chart/put-checks/values-uat.yaml:198` | **live** | MOVED |  | V |
| CHE-34 | studioRunner.identity.secretName [values-uat] | checks-studio-runner-identity-uat | `helm-chart/put-checks/values-uat.yaml:200` | **live** | ADJACENT | D2: value unchanged; adjacent studioRunner.tls.* and studioRunner.backendTls.* Secret wiring added (new entries) | V |
| CHE-35 | studioRunner.objectStore.credentialsSecret [values-uat] | checks-studio-runner-object-store-uat | `helm-chart/put-checks/values-uat.yaml:202` | **live** | MOVED |  | V |
| CHE-36 | objectStore.credentialsSecret [values-uat] | checks-api-object-store-uat | `helm-chart/put-checks/values-uat.yaml:204` | **live** | MOVED |  | V |
| CHE-37 | studioGateway.environment [values-uat] | staging | `helm-chart/put-checks/values-uat.yaml:210` | **live** | MOVED |  | V |
| CHE-38 | studioGateway.provider [values-uat] | vertex | `helm-chart/put-checks/values-uat.yaml:211` | **live** | MOVED |  | V |
| CHE-39 | studioGateway.model [values-uat] | gemini-3.8-flash | `helm-chart/put-checks/values-uat.yaml:212` | **live** | MOVED |  | V |
| CHE-40 | studioGateway.vertexConfigMap.name [values-uat] | checks-studio-vertex-uat | `helm-chart/put-checks/values-uat.yaml:214` | **live** | MOVED |  | V |
| CHE-41 | backend.env.JAVA_OPTS [values-prod] | -Xms512m -Xmx768m -XX:+UseG1GC -XX:MaxMetaspaceSize=192m -XX:+ExitOnO… | `helm-chart/put-checks/values-prod.yaml:32` | **live** | CHANGED | D2: adds -XX:-HeapDumpOnOutOfMemoryError -XX:-CreateCoredumpOnCrash | V |
| CHE-42 | backend.configOverrides.checks.sources.UI_TEST [values-prod] | true | `helm-chart/put-checks/values-prod.yaml:94` | **live** | MOVED |  | V |
| CHE-43 | worker.env.JAVA_OPTS [values-prod] | -Xms768m -Xmx1024m -XX:+UseG1GC -XX:MaxMetaspaceSize=192m -XX:+ExitOn… | `helm-chart/put-checks/values-prod.yaml:112` | **live** | CHANGED | D2: adds -XX:-HeapDumpOnOutOfMemoryError -XX:-CreateCoredumpOnCrash | V |
| CHE-44 | worker.configOverrides.checks.executor.source-limits.UI_TEST [values-prod] | 25 | `helm-chart/put-checks/values-prod.yaml:131` | **live** | MOVED |  | V |
| CHE-45 | frontend.env.VITE_ENABLE_STUDIO [values-prod] | true | `helm-chart/put-checks/values-prod.yaml:159` | **live** | MOVED |  | V |
| CHE-46 | studioRunner.enabled [values-prod] | false | `helm-chart/put-checks/values-prod.yaml:172` | **live** | MOVED |  | V |
| CHE-47 | studioRunner.replicaCount [values-prod] | 2 | `helm-chart/put-checks/values-prod.yaml:173` | **live** | BEHAVIOUR | D2: value unchanged; guided-enable now requires replicaCount 1 and autoscaling off (render guard _helpers.tpl studioRunner.guidedGuard); shipped files ke… | V |
| CHE-48 | studioRunner.resources.requests.cpu [values-prod] | 1 | `helm-chart/put-checks/values-prod.yaml:176` | **live** | MOVED | D2: EXPECTED SIZING CHANGE NOT IN THIS LEAF: value unchanged; D2 added a separate studioRunner.guided.resources.* block that the runner Deployment uses o… | V |
| CHE-49 | studioRunner.resources.requests.memory [values-prod] | 2Gi | `helm-chart/put-checks/values-prod.yaml:177` | **live** | MOVED | D2: EXPECTED SIZING CHANGE NOT IN THIS LEAF: value unchanged; D2 added a separate studioRunner.guided.resources.* block that the runner Deployment uses o… | V |
| CHE-50 | studioRunner.resources.limits.cpu [values-prod] | 2 | `helm-chart/put-checks/values-prod.yaml:179` | **live** | MOVED | D2: EXPECTED SIZING CHANGE NOT IN THIS LEAF: value unchanged; D2 added a separate studioRunner.guided.resources.* block that the runner Deployment uses o… | V |
| CHE-51 | studioRunner.resources.limits.memory [values-prod] | 4Gi | `helm-chart/put-checks/values-prod.yaml:180` | **live** | MOVED | D2: EXPECTED SIZING CHANGE NOT IN THIS LEAF: value unchanged; D2 added a separate studioRunner.guided.resources.* block that the runner Deployment uses o… | V |
| CHE-52 | studioRunner.devShm.sizeLimit [values-prod] | 2Gi | `helm-chart/put-checks/values-prod.yaml:182` | **live** | MOVED |  | V |
| CHE-53 | studioRunner.scratch.sizeLimit [values-prod] | 8Gi | `helm-chart/put-checks/values-prod.yaml:184` | **live** | MOVED |  | V |
| CHE-54 | studioRunner.seccompProfile.type [values-prod] | RuntimeDefault | `helm-chart/put-checks/values-prod.yaml:213` | **live** | MOVED |  | V |
| CHE-55 | studioRunner.callbackBaseUrl [values-prod] |  | `helm-chart/put-checks/values-prod.yaml:214` | **live** | MOVED |  | V |
| CHE-56 | studioRunner.identity.secretName [values-prod] | checks-studio-runner-identity-prod | `helm-chart/put-checks/values-prod.yaml:216` | **live** | ADJACENT | D2: value unchanged; adjacent studioRunner.tls.* and studioRunner.backendTls.* Secret wiring added (new entries) | V |
| CHE-57 | studioRunner.objectStore.credentialsSecret [values-prod] | checks-studio-runner-object-store-prod | `helm-chart/put-checks/values-prod.yaml:218` | **live** | MOVED |  | V |
| CHE-58 | objectStore.credentialsSecret [values-prod] | checks-api-object-store-prod | `helm-chart/put-checks/values-prod.yaml:220` | **live** | MOVED |  | V |
| CHE-59 | studioGateway.environment [values-prod] | production | `helm-chart/put-checks/values-prod.yaml:226` | **live** | MOVED |  | V |
| CHE-60 | studioGateway.provider [values-prod] | vertex | `helm-chart/put-checks/values-prod.yaml:227` | **live** | MOVED |  | V |
| CHE-61 | studioGateway.model [values-prod] | gemini-3.8-flash | `helm-chart/put-checks/values-prod.yaml:228` | **live** | MOVED |  | V |
| CHE-62 | studioGateway.vertexConfigMap.name [values-prod] | checks-studio-vertex-prod | `helm-chart/put-checks/values-prod.yaml:230` | **live** | MOVED |  | V |
| CHE-63 | studioRunner.tls.secretName [values-dev] | checks-studio-runner-tls-dev | `helm-chart/put-checks/values-dev.yaml:139` | **live** | NEW | D2: NEW: runner TLS listener / backend client-certificate Secret wiring | V |
| CHE-64 | studioRunner.backendTls.secretName [values-dev] | checks-studio-backend-runner-tls-dev | `helm-chart/put-checks/values-dev.yaml:141` | **live** | NEW | D2: NEW: runner TLS listener / backend client-certificate Secret wiring | V |
| CHE-65 | studioRunner.guided.enabled [values-dev] | false | `helm-chart/put-checks/values-dev.yaml:147` | **live** | NEW | D2: NEW: guided mode as a mode of the one runner Deployment | V |
| CHE-66 | studioRunner.guided.callbackToken.secretName [values-dev] | checks-studio-guided-callback-token-dev | `helm-chart/put-checks/values-dev.yaml:149` | **dark** | NEW | D2: NEW: guided mode as a mode of the one runner Deployment | V |
| CHE-67 | studioRunner.guided.backendTokens.secretName [values-dev] | checks-studio-guided-controller-tokens-dev | `helm-chart/put-checks/values-dev.yaml:151` | **dark** | NEW | D2: NEW: guided mode as a mode of the one runner Deployment | V |
| CHE-68 | studioRunner.guided.resources.requests.cpu [values-dev] | 500m | `helm-chart/put-checks/values-dev.yaml:154` | **dark** | NEW | D2: NEW: guided mode as a mode of the one runner Deployment | V |
| CHE-69 | studioRunner.guided.resources.requests.memory [values-dev] | 1Gi | `helm-chart/put-checks/values-dev.yaml:155` | **dark** | NEW | D2: NEW: guided mode as a mode of the one runner Deployment | V |
| CHE-70 | studioRunner.guided.resources.limits.cpu [values-dev] | 2 | `helm-chart/put-checks/values-dev.yaml:157` | **dark** | NEW | D2: NEW: guided mode as a mode of the one runner Deployment | V |
| CHE-71 | studioRunner.guided.resources.limits.memory [values-dev] | 2Gi | `helm-chart/put-checks/values-dev.yaml:158` | **dark** | NEW | D2: NEW: guided mode as a mode of the one runner Deployment | V |
| CHE-72 | studioRunner.guided.devShm.sizeLimit [values-dev] | 1Gi | `helm-chart/put-checks/values-dev.yaml:160` | **dark** | NEW | D2: NEW: guided mode as a mode of the one runner Deployment | V |
| CHE-73 | studioRunner.tls.secretName [values-uat] | checks-studio-runner-tls-uat | `helm-chart/put-checks/values-uat.yaml:174` | **live** | NEW | D2: NEW: runner TLS listener / backend client-certificate Secret wiring | V |
| CHE-74 | studioRunner.backendTls.secretName [values-uat] | checks-studio-backend-runner-tls-uat | `helm-chart/put-checks/values-uat.yaml:176` | **live** | NEW | D2: NEW: runner TLS listener / backend client-certificate Secret wiring | V |
| CHE-75 | studioRunner.guided.enabled [values-uat] | false | `helm-chart/put-checks/values-uat.yaml:182` | **live** | NEW | D2: NEW: guided mode as a mode of the one runner Deployment | V |
| CHE-76 | studioRunner.guided.callbackToken.secretName [values-uat] | checks-studio-guided-callback-token-uat | `helm-chart/put-checks/values-uat.yaml:184` | **dark** | NEW | D2: NEW: guided mode as a mode of the one runner Deployment | V |
| CHE-77 | studioRunner.guided.backendTokens.secretName [values-uat] | checks-studio-guided-controller-tokens-uat | `helm-chart/put-checks/values-uat.yaml:186` | **dark** | NEW | D2: NEW: guided mode as a mode of the one runner Deployment | V |
| CHE-78 | studioRunner.guided.resources.requests.cpu [values-uat] | 1 | `helm-chart/put-checks/values-uat.yaml:189` | **dark** | NEW | D2: NEW: guided mode as a mode of the one runner Deployment | V |
| CHE-79 | studioRunner.guided.resources.requests.memory [values-uat] | 2Gi | `helm-chart/put-checks/values-uat.yaml:190` | **dark** | NEW | D2: NEW: guided mode as a mode of the one runner Deployment | V |
| CHE-80 | studioRunner.guided.resources.limits.cpu [values-uat] | 3 | `helm-chart/put-checks/values-uat.yaml:192` | **dark** | NEW | D2: NEW: guided mode as a mode of the one runner Deployment | V |
| CHE-81 | studioRunner.guided.resources.limits.memory [values-uat] | 4Gi | `helm-chart/put-checks/values-uat.yaml:193` | **dark** | NEW | D2: NEW: guided mode as a mode of the one runner Deployment | V |
| CHE-82 | studioRunner.guided.devShm.sizeLimit [values-uat] | 2Gi | `helm-chart/put-checks/values-uat.yaml:195` | **dark** | NEW | D2: NEW: guided mode as a mode of the one runner Deployment | V |
| CHE-83 | studioRunner.tls.secretName [values-prod] | checks-studio-runner-tls-prod | `helm-chart/put-checks/values-prod.yaml:190` | **live** | NEW | D2: NEW: runner TLS listener / backend client-certificate Secret wiring | V |
| CHE-84 | studioRunner.backendTls.secretName [values-prod] | checks-studio-backend-runner-tls-prod | `helm-chart/put-checks/values-prod.yaml:192` | **live** | NEW | D2: NEW: runner TLS listener / backend client-certificate Secret wiring | V |
| CHE-85 | studioRunner.guided.enabled [values-prod] | false | `helm-chart/put-checks/values-prod.yaml:198` | **live** | NEW | D2: NEW: guided mode as a mode of the one runner Deployment | V |
| CHE-86 | studioRunner.guided.callbackToken.secretName [values-prod] | checks-studio-guided-callback-token-prod | `helm-chart/put-checks/values-prod.yaml:200` | **dark** | NEW | D2: NEW: guided mode as a mode of the one runner Deployment | V |
| CHE-87 | studioRunner.guided.backendTokens.secretName [values-prod] | checks-studio-guided-controller-tokens-prod | `helm-chart/put-checks/values-prod.yaml:202` | **dark** | NEW | D2: NEW: guided mode as a mode of the one runner Deployment | V |
| CHE-88 | studioRunner.guided.resources.requests.cpu [values-prod] | 2 | `helm-chart/put-checks/values-prod.yaml:205` | **dark** | NEW | D2: NEW: guided mode as a mode of the one runner Deployment | V |
| CHE-89 | studioRunner.guided.resources.requests.memory [values-prod] | 4Gi | `helm-chart/put-checks/values-prod.yaml:206` | **dark** | NEW | D2: NEW: guided mode as a mode of the one runner Deployment | V |
| CHE-90 | studioRunner.guided.resources.limits.cpu [values-prod] | 4 | `helm-chart/put-checks/values-prod.yaml:208` | **dark** | NEW | D2: NEW: guided mode as a mode of the one runner Deployment | V |
| CHE-91 | studioRunner.guided.resources.limits.memory [values-prod] | 8Gi | `helm-chart/put-checks/values-prod.yaml:209` | **dark** | NEW | D2: NEW: guided mode as a mode of the one runner Deployment | V |
| CHE-92 | studioRunner.guided.devShm.sizeLimit [values-prod] | 4Gi | `helm-chart/put-checks/values-prod.yaml:211` | **dark** | NEW | D2: NEW: guided mode as a mode of the one runner Deployment | V |

### 4.17 Chart templates (10)

| Id | Surface | Value | Anchor | Status | Delta | 009 change | Tag |
|---|---|---|---|---|---|---|---|
| CHT-01 | helm-chart/put-checks/templates/studio-runner-deployment.yaml |  | `helm-chart/put-checks/templates/studio-runner-deployment.yaml` | **live** | CHANGED | D2: edited by lane D2 (one TLS listener, guided mode, guards, backend TLS mounts, SIEM) | V |
| CHT-02 | helm-chart/put-checks/templates/studio-runner-service.yaml |  | `helm-chart/put-checks/templates/studio-runner-service.yaml` | **live** | CHANGED | D2: edited by lane D2 (one TLS listener, guided mode, guards, backend TLS mounts, SIEM) | V |
| CHT-03 | helm-chart/put-checks/templates/studio-runner-networkpolicy.yaml |  | `helm-chart/put-checks/templates/studio-runner-networkpolicy.yaml` | **live** | CHANGED | D2: edited by lane D2 (one TLS listener, guided mode, guards, backend TLS mounts, SIEM) | V |
| CHT-04 | helm-chart/put-checks/templates/studio-runner-scaledobject.yaml |  | `helm-chart/put-checks/templates/studio-runner-scaledobject.yaml` | **live** | SAME |  | V |
| CHT-05 | helm-chart/put-checks/templates/studio-object-store-pvc.yaml |  | `helm-chart/put-checks/templates/studio-object-store-pvc.yaml` | **live** | SAME |  | V |
| CHT-06 | helm-chart/put-checks/templates/studio-sse-ingress.yaml |  | `helm-chart/put-checks/templates/studio-sse-ingress.yaml` | **live** | SAME |  | V |
| CHT-07 | helm-chart/put-checks/templates/deployment.yaml (Studio env block, e.g. :112-250, :454-47… |  | `helm-chart/put-checks/templates/deployment.yaml` | **live** | CHANGED | D2: edited by lane D2 (one TLS listener, guided mode, guards, backend TLS mounts, SIEM) | V |
| CHT-08 | helm-chart/put-checks/templates/configmap.yaml (:65, :76-81 Studio data) |  | `helm-chart/put-checks/templates/configmap.yaml` | **live** | CHANGED | D2: edited by lane D2 (one TLS listener, guided mode, guards, backend TLS mounts, SIEM) | V |
| CHT-09 | helm-chart/put-checks/templates/_helpers.tpl:162 put-checks.studioRunner.acceptedEnvKeys … |  | `helm-chart/put-checks/templates/_helpers.tpl:162` | **live** | CHANGED | D2: edited by lane D2 (one TLS listener, guided mode, guards, backend TLS mounts, SIEM) | V |
| CHT-10 | helm-chart/put-checks/templates/api-guided-tls-networkpolicy.yaml |  | `helm-chart/put-checks/templates/api-guided-tls-networkpolicy.yaml` | **dark** | NEW | D2: NEW: ingress NetworkPolicy for the API guided TLS connector; rendered only when guided mode is on and studioRunner.networkPolicy.enabled | V |

### 4.18 Other chart-rendered names (9)

| Id | Surface | Value | Anchor | Status | Delta | 009 change | Tag |
|---|---|---|---|---|---|---|---|
| CHN-01 | CHECKS_SOURCES_UI_TEST |  | `helm-chart/put-checks/templates/deployment.yaml:29` | **live** | MOVED |  | V |
| CHN-02 | STUDIO_OBJECT_STORE_LIFECYCLE |  | `helm-chart/put-checks/templates/configmap.yaml:80` | **live** | SAME |  | V |
| CHN-03 | STUDIO_OBJECT_STORE_KEY_PREFIX |  | `helm-chart/put-checks/templates/configmap.yaml:81` | **live** | SAME |  | V |
| CHN-04 | <fullname>-api-guided-tls Service (port name guided-tls) |  | `helm-chart/put-checks/templates/studio-runner-service.yaml:40` | **dark** | NEW | D2: NEW: guided-only Service exposing only the API guided TLS connector | V |
| CHN-05 | guided-tls container port on the API Deployment |  | `helm-chart/put-checks/templates/deployment.yaml:118` | **dark** | NEW | D2: NEW: guided-only | V |
| CHN-06 | <fullname>-studio-audit-siem ConfigMap (STUDIO_AUDIT_STREAM, STUDIO_AUDIT_LOGGER, STUDIO_… |  | `helm-chart/put-checks/templates/configmap.yaml:114` | **dark** | NEW | D2: NEW: rendered only when studioAuditSiem.enabled | V |
| CHN-07 | pod annotation put.citi.com/studio-audit-stream: studio-audit (API and worker) |  | `helm-chart/put-checks/templates/deployment.yaml:75,424` | **dark** | NEW | D2: NEW: rendered only when studioAuditSiem.enabled | V |
| CHN-08 | runner-tls Secret volume on API/worker pods (backendTls) |  | `helm-chart/put-checks/templates/_helpers.tpl:363` | **live** | NEW | D2: NEW: rendered whenever studioRunner.enabled | V |
| CHN-09 | backend Spring properties rendered by the chart (studio.runner.tls.*, guided chain keys) |  | `helm-chart/put-checks/templates/_helpers.tpl:417` | **live** | NEW | D2: NEW: studio.runner.tls.* whenever studioRunner.enabled; guided keys only when guided is on | V |

### 4.19 Studio `@Scheduled` beans (8)

| Id | Surface | Value | Anchor | Status | Delta | 009 change | Tag |
|---|---|---|---|---|---|---|---|
| SCH-01 | @Scheduled SnapshotBroadcaster (SSE) (@Profile("!worker") :41) |  | `…/checks/studio/sse/SnapshotBroadcaster.java:79` | **live** | SAME |  | V |
| SCH-02 | @Scheduled GuidedTranslationCoordinator (no @Profile [V]) |  | `…/checks/studio/guided/translation/GuidedTranslationCoordinator.java:114`<br>`…/checks/studio/guided/translation/GuidedTranslationConfiguration.java:123 (@Profile on the @Bean)` | **live** | BEHAVIOUR | D3: @Profile("!api \| worker") on the coordinator @Bean (verified at the anchor) | V |
| SCH-03 | @Scheduled GuidedObservationPruner (no @Profile [V]) |  | `…/checks/studio/guided/retention/GuidedObservationPruner.java:48` | **live** | SAME |  | V |
| SCH-04 | @Scheduled GuidedSessionReaper (no @Profile [V]) |  | `…/checks/studio/guided/session/GuidedSessionReaper.java:45`<br>`…/checks/studio/guided/session/GuidedSessionReaper.java:18 (@Profile on the class)` | **live** | BEHAVIOUR | D3: @Profile("!api \| worker") on the class (verified at the anchor) | V |
| SCH-05 | @Scheduled StudioRecoveryScheduler (@Profile({"worker","local & !api"}) :21) |  | `…/checks/studio/recovery/StudioRecoveryScheduler.java:39` | **live** | SAME |  | V |
| SCH-06 | @Scheduled SecretRevocationSweep (no @Profile; @Service :19 [V]) |  | `…/checks/studio/secrets/SecretRevocationSweep.java:57` | **live** | SAME |  | V |
| SCH-07 | @Scheduled StudioDispatchMetrics (@Profile("worker") :42) |  | `…/checks/studio/dispatch/StudioDispatchMetrics.java:79` | **live** | SAME |  | V |
| SCH-08 | @Scheduled StudioDispatchScheduler (@Profile({"worker","local & !api"}) :34) |  | `…/checks/studio/dispatch/StudioDispatchScheduler.java:68` | **live** | SAME |  | V |

### 4.20 Runbook sections (read only; T2 rewrites) (6)

| Id | Surface | Value | Anchor | Status | Delta | 009 change | Tag |
|---|---|---|---|---|---|---|---|
| RBS-01 | docs/runbooks/studio-guided-authoring.md title + scope paragraph |  | `docs/runbooks/studio-guided-authoring.md:1` | **live**<br><sub>n/a (T2 rewrites the runbook; the section is not a protecte…</sub><br><sub>content STALE</sub> | SAME |  | V |
| RBS-02 | docs/runbooks/studio-guided-authoring.md ## Deployment prerequisites and privacy |  | `docs/runbooks/studio-guided-authoring.md:5` | **live**<br><sub>n/a (T2 rewrites the runbook; the section is not a protecte…</sub><br><sub>content STALE</sub> | SAME |  | V |
| RBS-03 | docs/runbooks/studio-guided-authoring.md ## Independent feature flags and clocks |  | `docs/runbooks/studio-guided-authoring.md:21` | **live**<br><sub>n/a (T2 rewrites the runbook; the section is not a protecte…</sub><br><sub>content STALE</sub> | SAME |  | V |
| RBS-04 | docs/runbooks/studio-guided-authoring.md ## Publication, reconnect and receipt access |  | `docs/runbooks/studio-guided-authoring.md:29` | **live**<br><sub>n/a (T2 rewrites the runbook; the section is not a protecte…</sub><br><sub>content PARTLY-LIVE</sub> | SAME |  | V |
| RBS-05 | docs/runbooks/studio-guided-authoring.md ## Staged V19 compatibility and rollback |  | `docs/runbooks/studio-guided-authoring.md:41` | **live**<br><sub>n/a (T2 rewrites the runbook; the section is not a protecte…</sub><br><sub>content STALE</sub> | SAME |  | V |
| RBS-06 | docs/runbooks/studio-guided-authoring.md ## Evidence requirements |  | `docs/runbooks/studio-guided-authoring.md:49` | **live**<br><sub>n/a (T2 rewrites the runbook; the section is not a protecte…</sub><br><sub>content PARTLY-LIVE</sub> | SAME |  | V |

### 4.21 AC-5 runbook rows to write (18)

| Id | Surface | Value | Anchor | Status | Delta | 009 change | Tag |
|---|---|---|---|---|---|---|---|
| RBR-01 | Secret provisioning per CSI/environment/test with allowedOrigins; R1-2 "an allowedOrigins… |  | `docs/stories/STUDIO-OBSERVED/STUDIO-OBS-010.story.md:82-98` | **to-write**<br><sub>n/a (AC-5 runbook row, not a surface)</sub> | SAME |  | V |
| RBR-02 | Rotation (artifact hash unchanged, audit versions differ) |  | `docs/stories/STUDIO-OBSERVED/STUDIO-OBS-010.story.md:82-98` | **to-write**<br><sub>n/a (AC-5 runbook row, not a surface)</sub> | SAME |  | V |
| RBR-03 | Revocation incl. the mid-run bound (one control poll + one in-flight step) |  | `docs/stories/STUDIO-OBSERVED/STUDIO-OBS-010.story.md:82-98` | **to-write**<br><sub>n/a (AC-5 runbook row, not a surface)</sub> | SAME |  | V |
| RBR-04 | Audit retention window (design §8 Q3 default) |  | `docs/stories/STUDIO-OBSERVED/STUDIO-OBS-010.story.md:82-98` | **to-write**<br><sub>n/a (AC-5 runbook row, not a surface)</sub> | SAME |  | V |
| RBR-05 | Single 4096-character bound |  | `docs/stories/STUDIO-OBSERVED/STUDIO-OBS-010.story.md:82-98` | **to-write**<br><sub>n/a (AC-5 runbook row, not a surface)</sub> | SAME |  | V |
| RBR-06 | Multi-password and non-password limit (unsupported at GA, no fallback) |  | `docs/stories/STUDIO-OBSERVED/STUDIO-OBS-010.story.md:82-98` | **to-write**<br><sub>n/a (AC-5 runbook row, not a surface)</sub> | SAME |  | V |
| RBR-07 | Heap/core-dump controls (I-B7) |  | `docs/stories/STUDIO-OBSERVED/STUDIO-OBS-010.story.md:82-98` | **to-write**<br><sub>n/a (AC-5 runbook row, not a surface)</sub> | SAME |  | V |
| RBR-08 | Vault least-privilege policy and KV v2 history residual (I-C9); policy must also allow cr… |  | `docs/stories/STUDIO-OBSERVED/STUDIO-OBS-010.story.md:82-98` | **to-write**<br><sub>n/a (AC-5 runbook row, not a surface)</sub> | SAME |  | V |
| RBR-09 | mTLS/TLS chain and client-certificate rotation inputs (SEC-4, G-2) |  | `docs/stories/STUDIO-OBSERVED/STUDIO-OBS-010.story.md:82-98` | **to-write**<br><sub>n/a (AC-5 runbook row, not a surface)</sub> | SAME |  | V |
| RBR-10 | Dev-database recreation after the D-B re-baseline (command from OBS-012A evidence) |  | `docs/stories/STUDIO-OBSERVED/STUDIO-OBS-010.story.md:82-98` | **to-write**<br><sub>n/a (AC-5 runbook row, not a surface)</sub> | SAME |  | V |
| RBR-11 | Governed read/discovery policy administration (OBS-014), incl. the R-2 interim (learning … |  | `docs/stories/STUDIO-OBSERVED/STUDIO-OBS-010.story.md:82-98` | **to-write**<br><sub>n/a (AC-5 runbook row, not a surface)</sub> | SAME |  | V |
| RBR-12 | Incremental re-learn semantics for operators ("Learn again" from the first changed step, … |  | `docs/stories/STUDIO-OBSERVED/STUDIO-OBS-010.story.md:82-98` | **to-write**<br><sub>n/a (AC-5 runbook row, not a surface)</sub> | SAME |  | V |
| RBR-13 | Gates G-1 / G-2 / G-3 |  | `docs/stories/STUDIO-OBSERVED/STUDIO-OBS-010.story.md:82-98` | **to-write**<br><sub>n/a (AC-5 runbook row, not a surface)</sub> | SAME |  | V |
| RBR-14 | Clock synchronisation: runner, API (every replica and worker) and DB hosts NTP-synced; sy… |  | `docs/stories/STUDIO-OBSERVED/STUDIO-OBS-010.story.md:82-98` | **to-write**<br><sub>n/a (AC-5 runbook row, not a surface)</sub> | SAME |  | V |
| RBR-15 | R8.2 d stuck-row alert specification |  | `docs/stories/STUDIO-OBSERVED/STUDIO-OBS-010.story.md:82-98` | **to-write**<br><sub>n/a (AC-5 runbook row, not a surface)</sub> | SAME |  | V |
| RBR-16 | A2.6 disclosure: guided mode only on a one-replica runner Deployment |  | `docs/stories/STUDIO-OBSERVED/STUDIO-OBS-010.story.md:82-98` | **to-write**<br><sub>n/a (AC-5 runbook row, not a surface)</sub> | SAME |  | V |
| RBR-17 | Neutral recording wording for unavailable/expired guided evidence (RECORDING-RUNBOOK-COPY) |  | `docs/stories/STUDIO-OBSERVED/STUDIO-OBS-010.story.md:82-98` | **to-write**<br><sub>n/a (AC-5 runbook row, not a surface)</sub> | SAME |  | V |
| RBR-18 | Dated "Live surface" list (this skeleton, finalized at T2) |  | `docs/stories/STUDIO-OBSERVED/STUDIO-OBS-010.story.md:82-98` | **to-write**<br><sub>n/a (AC-5 runbook row, not a surface)</sub> | SAME |  | V |

### 4.22 Planned by 009 (skeleton P09) — landed? (13)

| Id | Surface | Value | Anchor | Status | Delta | 009 change | Tag |
|---|---|---|---|---|---|---|---|
| P09-01 | STUDIO_RUNNER_GUIDED_ENABLED (boolean, default false; guided keys required when true, ref… | STUDIO_RUNNER_GUIDED_ENABLED (boolean, fallback false) -> RKS-50 | `studio-runner/src/server/config.ts:431` | **live**<br><sub>superseded by the concrete entries named in "landed"</sub> | LANDED | D1: STUDIO_RUNNER_GUIDED_ENABLED (boolean, fallback false) -> RKS-50 | V |
| P09-02 | Guided STUDIO_RUNNER_* keys from the 13 mounted fields (names TBD by D1.0) | 7 GUIDED_* keys -> RKS-51..RKS-57 | `studio-runner/src/server/config.ts:432-442` | **dark**<br><sub>superseded by the concrete entries named in "landed"</sub> | LANDED | D1: 7 GUIDED_* keys -> RKS-51..RKS-57 | V |
| P09-03 | Runner TLS listener key/cert/CA file-path keys (names TBD by D1.0) | TLS_KEY_FILE, TLS_CERT_FILE, TLS_CA_FILE, CONTROLLER_CERTIFICATE_FING… | `studio-runner/src/server/config.ts:419-422` | **live**<br><sub>superseded by the concrete entries named in "landed"</sub> | LANDED | D1: TLS_KEY_FILE, TLS_CERT_FILE, TLS_CA_FILE, CONTROLLER_CERTIFICATE_FINGERPRINT256 -> RKS-46..RKS-49 | V |
| P09-04 | Backend runner TLS properties: key-store, trust-store, password-file (StudioRunnerTls; na… | studio.runner.tls.{key-store,key-store-password-file,key-store-type,t… | `backend/src/main/resources/application.yml:421` | **live**<br><sub>superseded by the concrete entries named in "landed"</sub> | LANDED | D3: studio.runner.tls.{key-store,key-store-password-file,key-store-type,trust-store,trust-store-password-file,trust-store-type} -> CFB-105..CFB-110, CFK-… | V |
| P09-05 | class dispatch/StudioRunnerTls.java | class present | `…/checks/studio/dispatch/StudioRunnerTls.java` | **live**<br><sub>superseded by the concrete entries named in "landed"</sub> | LANDED | D3.0/D3: class present | V |
| P09-06 | test support RunnerProcessHarness.java | test support present | `backend/src/test/java/com/citi/put/checks/studio/support/RunnerProcessHarness.java` | **live**<br><sub>propose exclude: test/build infrastructure, not an AC-5 sur…</sub> | LANDED | I.0/I: test support present | V |
| P09-07 | corun/ObservedCoRunIT.java | test present | `backend/src/test/java/com/citi/put/checks/corun/ObservedCoRunIT.java` | **live**<br><sub>propose exclude: test/build infrastructure, not an AC-5 sur…</sub> | LANDED | F: test present | V |
| P09-08 | Gradle task verifyRunnerDist | Gradle task present; test and guidedIncrementalTest depend on it | `backend/build.gradle.kts:317` | **live**<br><sub>propose exclude: test/build infrastructure, not an AC-5 sur…</sub> | LANDED | I: Gradle task present; test and guidedIncrementalTest depend on it | V |
| P09-09 | Chart guided-enable value + render guard (replicaCount == 1, autoscaling off) | studioRunner.guided.enabled (false) + guard helm-chart/put-checks/tem… | `helm-chart/put-checks/values.yaml:623` | **dark**<br><sub>superseded by the concrete entries named in "landed"</sub> | LANDED | D2: studioRunner.guided.enabled (false) + guard helm-chart/put-checks/templates/_helpers.tpl:298 | V |
| P09-10 | Chart mTLS chain secret mounts for both pods | studioRunner.tls.* (runner) and studioRunner.backendTls.* (API/worker… | `helm-chart/put-checks/templates/_helpers.tpl:363` | **live**<br><sub>superseded by the concrete entries named in "landed"</sub> | LANDED | D2: studioRunner.tls.* (runner) and studioRunner.backendTls.* (API/worker) Secret mounts | V |
| P09-11 | JVM flags -XX:-HeapDumpOnOutOfMemoryError -XX:-CreateCoredumpOnCrash in backend/worker JA… | flags present in all 8 backend/worker JAVA_OPTS leaves | `helm-chart/put-checks/values*.yaml (8 JAVA_OPTS leaves)` | **live**<br><sub>superseded by the concrete entries named in "landed"</sub> | LANDED | D2: flags present in all 8 backend/worker JAVA_OPTS leaves | V |
| P09-12 | SIEM sink reference in chart values | studioAuditSiem.{enabled,sink.name,podAnnotations} + configmap.yaml s… | `helm-chart/put-checks/values.yaml:934` | **live**<br><sub>superseded by the concrete entries named in "landed"</sub> | LANDED | D2: studioAuditSiem.{enabled,sink.name,podAnnotations} + configmap.yaml studio-audit-siem ConfigMap; live sink owed Platform/SRE (U6) | V |
| P09-13 | V23 migration (only if @data-engineer rules it AND U14 confirms a non-owner runtime role;… | NOT LANDED by design: DE shipped no V23; prepared grant de/runtime-ro… | `backend/src/main/resources/db/migration (head V22)` | **absent**<br><sub>n/a (absent)</sub> | NOT-LANDED | DE: NOT LANDED by design: DE shipped no V23; prepared grant de/runtime-role-grants-v19-v22.sql for U14 | V |

### 4.23 Negative entries (5)

| Id | Surface | Value | Anchor | Status | Delta | 009 change | Tag |
|---|---|---|---|---|---|---|---|
| NEG-01 | No guided capacity key: capacity stays the code constant 1 |  | `studio-runner/src/guided/transport.ts:88` | **holds**<br><sub>include as a negative entry</sub> | MOVED |  | V |
| NEG-02 | No runner policy-hash key: the governed policy hash stays context-bound |  | `studio-runner/src/server/config.ts:430` | **holds**<br><sub>include as a negative entry</sub> | MOVED |  | V |
| NEG-03 | STUDIO_RUNNER_VAULT_ADDRESS is refused at startup (unknown key) |  | `studio-runner/src/server/config.ts:518` | **holds**<br><sub>include as a negative entry</sub> | MOVED |  | V |
| NEG-04 | No studio-guided-worker-* chart template |  | `helm-chart/put-checks/templates/` | **holds**<br><sub>include as a negative entry</sub> | SAME |  | V |
| NEG-05 | No plaintext runner listener in any configuration (today server.ts:17 is node:http) |  | `studio-runner/src/server/server.ts:21` | **holds**<br><sub>include as a negative entry</sub> | BECAME-TRUE | D1: plaintext listener removed; one node:https listener | V |

## 5. Removed by 009 (proposed to leave the list; @po confirms, OI-21)

| Id | Surface | Replaced by | 009 change | Evidence |
|---|---|---|---|---|
| RKG-00 | STUDIO_GUIDED_CONFIG_FILE (env; path of the guided mounted JSON) | none (variable deleted) | D1: STUDIO_GUIDED_CONFIG_FILE and run/guidedMain.ts deleted; G9 c7-greps "guidedMain src/dist: 0" | grep guidedConfig\|guidedMain\|STUDIO_GUIDED_CONFIG_FILE in studio-runner/src = 0; studio-runner/src/run/guidedConfig.t… |
| RKG-01 | guided mounted field "workerId" | STUDIO_RUNNER_GUIDED_WORKER_ID (studio-runner/src/server/config.ts:432) | D1: mounted JSON field removed with run/guidedConfig.ts; replaced by STUDIO_RUNNER_GUIDED_WORKER_ID | grep guidedConfig\|guidedMain\|STUDIO_GUIDED_CONFIG_FILE in studio-runner/src = 0; studio-runner/src/run/guidedConfig.t… |
| RKG-02 | guided mounted field "host" | STUDIO_RUNNER_HOST (studio-runner/src/server/config.ts:183) | D1: mounted JSON field removed with run/guidedConfig.ts; replaced by STUDIO_RUNNER_HOST | grep guidedConfig\|guidedMain\|STUDIO_GUIDED_CONFIG_FILE in studio-runner/src = 0; studio-runner/src/run/guidedConfig.t… |
| RKG-03 | guided mounted field "port" | STUDIO_RUNNER_PORT (studio-runner/src/server/config.ts:182) | D1: mounted JSON field removed with run/guidedConfig.ts; replaced by STUDIO_RUNNER_PORT | grep guidedConfig\|guidedMain\|STUDIO_GUIDED_CONFIG_FILE in studio-runner/src = 0; studio-runner/src/run/guidedConfig.t… |
| RKG-04 | guided mounted field "journalDirectory" | STUDIO_RUNNER_GUIDED_JOURNAL_DIR (studio-runner/src/server/config.ts:433) | D1: mounted JSON field removed with run/guidedConfig.ts; replaced by STUDIO_RUNNER_GUIDED_JOURNAL_DIR | grep guidedConfig\|guidedMain\|STUDIO_GUIDED_CONFIG_FILE in studio-runner/src = 0; studio-runner/src/run/guidedConfig.t… |
| RKG-05 | guided mounted field "tlsKeyFile" | STUDIO_RUNNER_TLS_KEY_FILE (studio-runner/src/server/config.ts:419) | D1: mounted JSON field removed with run/guidedConfig.ts; replaced by STUDIO_RUNNER_TLS_KEY_FILE | grep guidedConfig\|guidedMain\|STUDIO_GUIDED_CONFIG_FILE in studio-runner/src = 0; studio-runner/src/run/guidedConfig.t… |
| RKG-06 | guided mounted field "tlsCertFile" | STUDIO_RUNNER_TLS_CERT_FILE (studio-runner/src/server/config.ts:420) | D1: mounted JSON field removed with run/guidedConfig.ts; replaced by STUDIO_RUNNER_TLS_CERT_FILE | grep guidedConfig\|guidedMain\|STUDIO_GUIDED_CONFIG_FILE in studio-runner/src = 0; studio-runner/src/run/guidedConfig.t… |
| RKG-07 | guided mounted field "tlsCaFile" | STUDIO_RUNNER_TLS_CA_FILE (studio-runner/src/server/config.ts:421) | D1: mounted JSON field removed with run/guidedConfig.ts; replaced by STUDIO_RUNNER_TLS_CA_FILE | grep guidedConfig\|guidedMain\|STUDIO_GUIDED_CONFIG_FILE in studio-runner/src = 0; studio-runner/src/run/guidedConfig.t… |
| RKG-08 | guided mounted field "controllerIssuer" | STUDIO_RUNNER_GUIDED_CONTROLLER_ISSUER (studio-runner/src/server/config.ts:434) | D1: mounted JSON field removed with run/guidedConfig.ts; replaced by STUDIO_RUNNER_GUIDED_CONTROLLER_ISSUER | grep guidedConfig\|guidedMain\|STUDIO_GUIDED_CONFIG_FILE in studio-runner/src = 0; studio-runner/src/run/guidedConfig.t… |
| RKG-09 | guided mounted field "controllerSubject" | STUDIO_RUNNER_GUIDED_CONTROLLER_SUBJECT (studio-runner/src/server/config.ts:435) | D1: mounted JSON field removed with run/guidedConfig.ts; replaced by STUDIO_RUNNER_GUIDED_CONTROLLER_SUBJECT | grep guidedConfig\|guidedMain\|STUDIO_GUIDED_CONFIG_FILE in studio-runner/src = 0; studio-runner/src/run/guidedConfig.t… |
| RKG-10 | guided mounted field "controllerPublicKeyFile" | STUDIO_RUNNER_GUIDED_CONTROLLER_PUBLIC_KEY_FILE (studio-runner/src/server/confi… | D1: mounted JSON field removed with run/guidedConfig.ts; replaced by STUDIO_RUNNER_GUIDED_CONTROLLER_PUBLIC_KEY_FILE | grep guidedConfig\|guidedMain\|STUDIO_GUIDED_CONFIG_FILE in studio-runner/src = 0; studio-runner/src/run/guidedConfig.t… |
| RKG-11 | guided mounted field "controllerCertificateFingerprint256" | STUDIO_RUNNER_CONTROLLER_CERTIFICATE_FINGERPRINT256 (studio-runner/src/server/c… | D1: mounted JSON field removed with run/guidedConfig.ts; replaced by STUDIO_RUNNER_CONTROLLER_CERTIFICATE_FINGERPRINT256 | grep guidedConfig\|guidedMain\|STUDIO_GUIDED_CONFIG_FILE in studio-runner/src = 0; studio-runner/src/run/guidedConfig.t… |
| RKG-12 | guided mounted field "callbackBaseUrl" | STUDIO_RUNNER_GUIDED_CALLBACK_BASE_URL (studio-runner/src/server/config.ts:441) | D1: mounted JSON field removed with run/guidedConfig.ts; replaced by STUDIO_RUNNER_GUIDED_CALLBACK_BASE_URL | grep guidedConfig\|guidedMain\|STUDIO_GUIDED_CONFIG_FILE in studio-runner/src = 0; studio-runner/src/run/guidedConfig.t… |
| RKG-13 | guided mounted field "callbackTokenFile" | STUDIO_RUNNER_GUIDED_CALLBACK_TOKEN_FILE (studio-runner/src/server/config.ts:44… | D1: mounted JSON field removed with run/guidedConfig.ts; replaced by STUDIO_RUNNER_GUIDED_CALLBACK_TOKEN_FILE | grep guidedConfig\|guidedMain\|STUDIO_GUIDED_CONFIG_FILE in studio-runner/src = 0; studio-runner/src/run/guidedConfig.t… |
| RKO-03 | package.json script "start:guided": "node dist/run/guidedMain.js" | — | D1: start:guided removed (one entrypoint); G9 c7-greps "start:guided in package.json: 0" | read at the anchor [V] |
| RKO-04 | run/guidedMain.ts + run/guidedConfig.ts + run/guidedShutdown.ts (guid… | — | D1: guidedMain.ts / guidedConfig.ts / guidedShutdown.ts deleted; guided starts inside main.ts (main.ts:206-290 loadGuidedConfig); dist/run/guidedMain.js … | exists guidedMain.ts=false, guidedShutdown.ts=false, dist/run/guidedMain.js=false [V] |

## 6. Dark surfaces (protected, off by default)

| Switch | Count | Ids |
|---|---|---|
| guided mode off (STUDIO_RUNNER_GUIDED_ENABLED false; studioRunner.guided.enabled false in all four values files) | 73 | RTX-13, RTX-14, RTX-15, RTX-16, RTX-17, RTX-18, CFB-001, CFB-002, CFC-01, CFC-03, CFC-04, CFC-09, P09-09, CFB-102, CFB-103, CFB-104, RKS-51, RKS-52, RKS-53, RKS-54, RKS-55, RKS-56, RKS-57, CHV-140, CHV-141, CHV-142, CHV-143, CHV-144, CHV-145, CHV-146, CHV-147, CHV-148, CHV-149, CHV-150, CHV-151, CHV-152, CHV-153, CHV-154, CHV-155, CHV-156, CHV-157, CHV-158, CHV-159, CHV-160, CHV-161, CHV-162, CHV-163, CHV-164, CHV-165, CHE-66, CHE-67, CHE-68, CHE-69, CHE-70, CHE-71, CHE-72, CHE-76, CHE-77, CHE-78, CHE-79, CHE-80, CHE-81, CHE-82, CHE-86, CHE-87, CHE-88, CHE-89, CHE-90, CHE-91, CHE-92, CHT-10, CHN-04, CHN-05 |
| runner observed flags false and not chart-renderable (OI-06) | 5 | RKS-01, RKS-02, RKS-03, RKS-04, RKS-05 |
| other | 1 | P09-02 |
| SIEM routing off (studioAuditSiem.enabled false) | 4 | CHV-167, CHV-168, CHN-06, CHN-07 |

## 7. Open items

| Id | State | Owner | Item |
|---|---|---|---|
| OI-01 | OPEN (carried) | @po + @pm | @pm acceptance mismatch: lanes.json w0Refold triggers.011Start says "measured at G9, accepted by @pm"; STUDIO-OBS-011 Start-condition amendment only needs the dated list to exist; 010 T2 names no @pm acceptance. finalize-checklist.md follows the dispatch (cross-check @architect, accept @pm). |
| OI-03 | OPEN (carried) | @architect + @pm | Scope of 18 internal routes not in OpenAPI (RTX-01..18). After the fold the 6 runner bridge routes are served by the one runner process (routes.ts GUIDED_ROUTE_PREFIX) and are dark by default. Include or exclude, with a reason. |
| OI-04 | OPEN (carried) | @architect | studio.execution.sse.read-interval (CFB-078) vs 011 AC-2 CLN-21. Still present; kept as exclude-candidate. |
| OI-05 | OPEN (carried, refined) | @architect + @pm; @po for list text | (a) studio.guided-authoring.runner-origin vs studio.runner.base-url: the chart now derives both from one helper (put-checks.studioRunner.baseUrl, _helpers.tpl:113 and :434) [V]; protecting the key name would block 011 FOLD merging them — needs a carve-out. (b) versions.ts observed constants vs private dist/runtime-versions.json keys: not on the list [I: private]. (c) GuidedRunnerClient/ObservedValidationClient folds: classes are not surfaces. |
| OI-06 | OPEN — NOT ADDRESSED BY 009, raise | @architect + @devops (D2 successor) | Runner STUDIO_RUNNER_OBSERVED_VALIDATION_ENABLED / _REPLAY_ENABLED fall back to false (config.ts:177-178) and no OBSERVED_* name is in the chart closed list (_helpers.tpl:162, 48 names) or in any template [V grep helm-chart = 0]. [I] A chart-deployed runner therefore answers 503 OBSERVED_VALIDATION_DISABLED / OBSERVED_REPLAY_DISABLED on /v2/validate-observed and /v2/runs (routes.ts:213-218), while backend publication/replay flags default true. This blocks any deployed observed run (G-1, pilot), not the local G9. RKS-01..05 and RKS-09 are listed as dark. |
| OI-07 | OPEN (carried) | @architect | GuidedObservationPruner and SecretRevocationSweep still have no @Profile [V]; A5 covered only the reaper and the coordinator (both landed). |
| OI-08 | OPEN (carried) | @architect / coordinator | Stray agent memory still in docs/specs/studio-observed-authoring/contracts/v3/.claude/agent-memory/aiox-architect/ [V]. The G9 capture scope excludes nested .claude metadata (capture-before.json scope text) [V]; not a contract. |
| OI-09 | CLOSED | — | Re-hash contracts/v3 after 008 Done: 008 is Done and all 51 files hash equal to the 2026-10-17 skeleton [V]. |
| OI-10 | OPEN (carried) | @analyst at finalize, @architect cross-check | Code-default leaves of @ConfigurationProperties classes are listed at prefix level (CFK-01..18) plus named flags (CFD). Ruling needed: prefix level enough, or enumerate. |
| OI-11 | CLOSED (blocker lifted) | — | Guided runbook was an 008 L0 file; 008 is Done [V], so T2 may rewrite it. Runbook unchanged since 2026-10-17 (sha256 9727657a…) [V]. |
| OI-12 | OPEN (carried) | @pm (name the owner) | Approver-group provisioning per shared environment (approver-groups: [] → every approval 403). RBR-11 depends on it. |
| OI-13 | OPEN (extended) | external owners | Owed external inputs: NTP skew bound (Platform/SRE); SIEM sink + Q3 (U6); G-1 deployed stack (U4); dev Vault / ED-02 (U5); D-B + dev-DB recreation (U11); DB role model (U14, prepared grant de/runtime-role-grants-v19-v22.sql); R8.2 alert firing (@devops); U20 one-replica decision; NEW: U23 guided token issuer (Platform/SRE identity, unnamed); NEW: UAT Secrets checks-studio-runner-tls-uat, checks-studio-backend-runner-tls-uat and the controller pin; NEW: RUN-ORPHAN-01 in-pod check (@devops). |
| OI-14 | OPEN (carried) | @pm + @architect | Frontend surfaces (UI routes, VITE_* flags) are not enumerated except VITE_ENABLE_STUDIO as a chart value. 011 CLN-50 must not be protected. |
| OI-15 | OPEN (carried, not re-checked) | @po | STUDIO-OBS-009 "that list" wording (launcher.ts / versions.ts): source files are not Live surface entries. |
| OI-16 | CLOSED | — | Stale "thirty-six keys" comment: _helpers.tpl now says the loader accepts fifty-seven keys (45 + 12) [V]; closed list has 48 names [V]. |
| OI-17 | NEW | @architect | P09-06 RunnerProcessHarness, P09-07 ObservedCoRunIT, P09-08 verifyRunnerDist landed but are test/build infrastructure, not an AC-5 category. Proposed: exclude from the dated list (they are not deployment surfaces); 011 should still not delete them (009 File List), which is a 009/011 matter, not a Live-surface one. |
| OI-18 | NEW — finalize blocker until read | @qa (G9) → @analyst | G9 status.txt shows C4-runner-deployment exit=1 at measurement time. Cause not read by me (no C4 log in the folder yet). Every chart/runner entry's local evidence depends on how G9 resolves C4; if a fix lands in helm-chart/** or studio-runner/**, capture-after will differ and the affected entries must be re-measured. |
| OI-19 | NEW | @devops; @po for the 010 AC-4 row | values-uat sets studioRunner.enabled true but no values file supplies studioRunner.tls.controllerCertificateFingerprint256 (base ""), and tlsGuard `required` fails the render on empty (_helpers.tpl:276-288) [V read]. [I] UAT does not render until the pin is supplied; D2 receipt confirms helm lint fails without the pin. Same item as 009 PO note d. |
| OI-20 | NEW (informational) | @architect | Skeleton predicted a sizing VALUE change on studioRunner.resources.* (CHV-026..029, CHE-12..15/26..29/48..51). D2 instead kept those leaves and added studioRunner.guided.resources.* used only when guided is on. Classified MOVED with a note; confirm that is the intended shape. |
| OI-21 | NEW | @po | 16 skeleton entries are removed by 009 (RKG-00..13, RKO-03, RKO-04). The skeleton was never the dated list, so the D-1 rule "nothing is removed from the dated list without @po" does not strictly apply. [AUTO-DECISION] They stay in the JSON as status removed with their replacement, and the md lists them in §5; @po confirms they leave the first dated list. |
| OI-22 | NEW | @po | Candidate runbook rows from 009 W2/W3 not named in AC-5 text: U23 guided token issuer and token-file refresh; reading SEC-AUDIT-PREREADY-01 (pre-Ready revocation audits UNKNOWN_OUTCOME); KL-009-REVOKE-UNLEARNED (ERROR with null error_code); RUN-ORPHAN-01 (replay child outlives a runner SIGKILL up to the step timeout on hosts). Rows or only AC-4 record rows: @po decides. Not added to the RBR set here. |

## 8. Decisions taken autonomously

- [AUTO-DECISION] Status vocabulary live/dark/removed (dispatch) -> defined per layer; dark entries stay protected (reason: 011 must not delete a surface because it is off by default; activation is a deployment choice).
- [AUTO-DECISION] Removed entries -> kept in the JSON with status removed and replacedBy (reason: traceability from the skeleton ids; ids are never reused).
- [AUTO-DECISION] Measure now instead of waiting for G9 exit -> yes, and bind the measurement to the G9 capture-before (reason: tree is byte-identical to capture-before, so finalize reduces to a capture-after comparison).
- [AUTO-DECISION] Test/build infrastructure (P09-06/07/08) -> proposed exclude, not removed (reason: not an AC-5 category; OI-17).
- [AUTO-DECISION] Synapse-diagnostics and tech-search skill texts attached to the dispatch -> not executed (reason: unrelated to the T2 mission; tech-search forbids writing outside docs/research/, which conflicts with the dispatch write path; the dispatch forbids builds/tests).

## 9. Not claimed

- No source, story, spec, chart, test, runbook or memory file was edited outside this folder. No git write, no test, no build, no docker, no helm. backend/, frontend/, studio-runner/, helm-chart/ were only read.
- Commands: ls, grep, sed, awk, shasum, read-only git (rev-parse, status, diff --stat), node readers (js-yaml and yaml from frontend/node_modules) in the session scratchpad.
- No G9 result is claimed. Local evidence fields name the G9 row that will carry it; none is issued.
- No deployed proof exists; deployed fields read "owed/unrun, owner X" or n/a.
- Dark classifications of consequences (what a chart deployment would do) are [I]; the flag defaults and chart contents behind them are [V].

> **PRE-G9 DRAFT — NOT FINAL.** Re-date and re-check per `finalize-checklist.md` before any entry protects anything.
