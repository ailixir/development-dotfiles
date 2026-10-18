# STUDIO-OBS-010 T2 "Live surface" — DRAFT SKELETON (2026-10-17)

> **DRAFT — NOT THE T2 LIST.** Lane T2-SK (optional, "NOT T2; no status effect", `lanes.json` → `w0Refold20261017`). Measured on the 2026-10-17 working tree, before STUDIO-OBS-008 Done and before the STUDIO-OBS-009 local gate (G9). The list is **finalized only against the tree at G9**: the 009 AC-1 fold changes runner keys and chart values. Nothing here binds STUDIO-OBS-011, and STUDIO-OBS-010 stays **Ready**.

- **Author:** Alex (@analyst). **Mode:** YOLO, docs only, beside the 008 final gates. Allowed by `lanes.json` `parallelWith008.withoutNewDecision`: "010 Live-surface skeleton under docs/qa/evidence/STUDIO-OBS-010/".
- **Writes:** this file and `live-surface-skeleton.json` (machine twin, all 604 entries with every field). No story, source, spec, chart, test or runbook edit. No git write, Gradle, test, build or install. `backend/` and `frontend/` were only read.
- **Measured:** 2026-10-17 22:00 EDT (2026-10-18 02:00Z), HEAD `734ad704f` with a dirty working tree, so file hashes identify what was measured. Commands: `ls`, `find`, `grep`, `sed -n`, `awk`, `wc`, `stat`, `shasum`, read-only `git`, and `node` readers using `frontend/node_modules/js-yaml` (no install).
- **Legend:** [V] verified by the recorded command or read. [I] inference. Local proofs named below are **PLANNED_NOT_RUN** by me.
- **Context:** 015 Done; 008 InProgress (final gates); 009 Ready with T0 rulings and the W0 refold of 2026-10-17, no source lane started. The 010 T2 trigger is Quinn's D2 local-validation record at G9 exit (`prep-20261016/qa/t0-qa-20261017.md` §2), not issued yet.

**Inputs read (sha256):**

| File | sha256 |
|---|---|
| `docs/stories/STUDIO-OBSERVED/STUDIO-OBS-010.story.md` | `f2b1dd0c754120d9eca6cae341b24587fd92338c24f52937eb98461de373bb76` |
| `docs/stories/STUDIO-OBSERVED/STUDIO-OBS-011.story.md` | `afe5e7487db4b9f2541b16cc3cdaf745bff4ecbc028f0279ca552bb241d3b25c` |
| `docs/stories/STUDIO-OBSERVED/STUDIO-OBS-009.story.md` | `a2cd39d353b3cf7e140eee935aa3e53144aef53c09e5a30fde63b5bbab7c7a6f` |
| `docs/qa/evidence/STUDIO-OBS-009/prep-20261016/implementation-plan.md` | `5d642f0a16be6b5a553f3e9c419481d84da8f3275373560f9931be8a448f1855` |
| `docs/qa/evidence/STUDIO-OBS-009/prep-20261016/lanes.json` | `97b6de8fe5a72dccb5390b9b3e0de1323a778e3ab98be0c28e258da58c929e24` |
| `docs/qa/evidence/STUDIO-OBS-009/prep-20261016/prerequisite-register.json` | `dcc24d127affe6fa66c4fe8144fbd66906fb0b8fcef0bba3484252fde1b34bc4` |
| `docs/qa/evidence/STUDIO-OBS-009/prep-20261016/t0-rulings/ruling.md` | `e7beb6ce36bba8f71950cd73df833d53a75f78316ea9c9ad98e1e54d095de66b` |
| `docs/qa/evidence/STUDIO-OBS-009/prep-20261016/t0-rulings/w0-refold.md` | `8bca5fdaf7ad004fecaa5db8c74bd8e5c496e788703ebede1a1cb07500e3dacb` |
| `docs/qa/evidence/STUDIO-OBS-009/prep-20261016/qa/t0-qa-20261017.md` | `0f1e2f6f7e77740856931469e8dc651a2bd458c09cc9cd62fcb6fbf5f4fae4f9` |
| `docs/runbooks/studio-guided-authoring.md` | `9727657a78268acda3e95d634da1eeeeaff36680b4691ab3f0f3d5fcb6d00855` |
| `docs/architecture/ADR-SC-005-single-path-observed-authoring.md` | `e5367fde754ad79a3041eee27dccfa9d67080985e5f161bab7c7582b4a752400` |
| `docs/architecture/ADR-SC-006-accessibility-scope-functional-only.md` | `399c7810965f68b03232a5f24b46a0127730451689da0c7a2e6fb5f9a716bc20` |

## 0. What this is and is not (DRAFT)

- **Is:** the list structure 010 AC-5 requires, filled with **candidate** entries measured from today's tree, each with a `file:line` anchor, an owner, its live evidence and a status; the entries the 009 fold is expected to change; the re-dating procedure for G9; open items.
- **Is not:** the dated Live surface list. It does not satisfy the STUDIO-OBS-011 start condition ("OBS-010's dated Live surface list exists"). It is not accepted by @pm or cross-checked by @architect. It protects nothing yet.
- **Rule carried from the story:** rows that need an OBS-009 external proof read "owed/unrun, owner X" until that proof exists (010 dependency note D-1). After 009 Done and before T3/T4 the list is re-dated again. Nothing is removed from the dated list without @po.

## 1. List structure (DRAFT row schema)

| Field | Meaning |
|---|---|
| `id` | stable id, prefix = category (see idPrefixes); never reused |
| `category` | surface category |
| `surface` | the surface itself: route, contract file, migration, configuration key, env var, chart value, chart template, schedule, runbook section or row |
| `kind` | short type, incl. on-by-default flag / kill switch markers |
| `anchor` | file:line (or file) where the surface is defined, measured 2026-10-17 |
| `tag` | V = verified by the recorded command or read; I = inference |
| `owner` | who owns the file that holds the surface now (single-owner rule, lanes.json) - not who approves the list |
| `introducedBy` | story/ruling that introduced it, only where a source says so; otherwise "untraced" |
| `liveEvidence` | { tree: presence evidence, local: local proof (G9 QA local-validation record row; named tests are PLANNED_NOT_RUN by me), deployed: deployed proof or "owed/unrun, owner X" } |
| `status` | see statusVocabulary |
| `fold009` | null, or { change, effect, ruling } when the 009 AC-1 fold or a sibling 009 lane is expected to change it |
| `sha256` | for files (contracts, migrations, templates, runbook): content hash at measurement |
| `notes` | anything that affects inclusion |

**Status vocabulary**

| Status | Meaning |
|---|---|
| `CANDIDATE` | present in the tree [V]; proposed for the dated list; re-measure at G9 |
| `CANDIDATE-SCOPE-OPEN` | present [V], but its category is not named by AC-5; include/exclude is an open item (OI-03) |
| `CHANGES-IN-009` | present; a key, value or file content is expected to change in 009 (effect KEY, VALUE or EDIT); measure only at G9 |
| `RECHECK-AT-G9` | present; key/path/value expected unchanged, but behaviour or neighbours change in 009 (effect BEHAVIOUR or ADJACENT) |
| `PLANNED-009` | absent today [V or I]; named by a 009 ruling or plan; expected at G9 |
| `NOT-A-SURFACE` | negative entry: ruled not to exist or must be refused |
| `EXCLUDE-CANDIDATE` | present but a recorded STUDIO-OBS-011 removal target / dead; must not be protected without an @architect ruling |
| `STALE` | runbook text no longer true at the tree; T2 rewrites it |
| `PARTLY-LIVE` | runbook section mixing live and stale statements |
| `TO-WRITE` | AC-5 runbook row not yet written |

**009 effect vocabulary** (`fold009.effect`)

| Effect | Meaning |
|---|---|
| `KEY` | key or file removed/renamed/added |
| `VALUE` | value or document content changes |
| `EDIT` | file edited by a 009 lane |
| `BEHAVIOUR` | same key/path/value; semantics, transport, host process or profile change |
| `ADJACENT` | unchanged; new surfaces added next to it |
| `ADD` | new surface |
| `BECOMES-TRUE` | negative entry becomes true after the fold |

**Id prefixes:** `RTP` public route; `RTI` internal route in OpenAPI; `RTX` internal route not in OpenAPI; `OAS` OpenAPI document/components; `CON` contracts/v3 file; `MIG` Flyway migration; `CFB` application.yml studio.* leaf; `CFP` profile override; `CFC` code-only @Value key; `CFD` code-default flag/key; `CFK` @ConfigurationProperties prefix; `RKS` runner KEY_SPECS key; `RKG` guided mounted config; `RKO` runner process surface; `CHV` values.yaml leaf; `CHE` values-<env>.yaml leaf; `CHT` chart template; `CHN` other chart-rendered name; `SCH` @Scheduled bean; `RBS` existing runbook section; `RBR` runbook row to write; `P09` planned by 009; `NEG` negative entry.

**Owed/unrun owners used** (from `prerequisite-register.json` and the story): U4 deployed stack and G-1 → Platform/SRE + @devops; U5 dev Vault / ED-02 → PUT Core / BFF; U6 SIEM + Q3 → Platform/SRE; U11 D-B confirmation and dev-DB recreation → user / Platform-SRE; U14 DB role model → Platform DBA / @devops; NTP skew bound → Platform/SRE; R8.2 alert firing → @devops.

## 2. Candidate entries (DRAFT, tree of 2026-10-17)

### 2.0 Counts

| Category | Entries | CHANGES-IN-009 | RECHECK-AT-G9 | Other statuses |
|---|---|---|---|---|
| route-public | 36 | 0 | 0 | CANDIDATE 36 |
| route-internal-openapi | 8 | 0 | 5 | CANDIDATE 3 |
| route-internal-not-in-openapi | 18 | 0 | 8 | CANDIDATE-SCOPE-OPEN 10 |
| contract-openapi | 5 | 3 | 0 | CANDIDATE 2 |
| contracts-v3 | 51 | 0 | 0 | CANDIDATE 51 |
| migration | 22 | 0 | 0 | CANDIDATE 22 |
| config-backend-yml | 100 | 1 | 0 | CANDIDATE 98, EXCLUDE-CANDIDATE 1 |
| config-backend-profile | 12 | 0 | 0 | CANDIDATE 12 |
| config-backend-code-only | 13 | 4 | 0 | CANDIDATE 9 |
| config-backend-code-default | 7 | 0 | 1 | CANDIDATE 6 |
| config-backend-properties-class | 17 | 1 | 0 | CANDIDATE 16 |
| config-runner-key | 46 | 1 | 2 | CANDIDATE 43 |
| config-runner-guided-mounted | 14 | 14 | 0 |  |
| config-runner-process | 8 | 3 | 1 | CANDIDATE 4 |
| chart-value | 123 | 6 | 13 | CANDIDATE 104 |
| chart-value-env | 62 | 18 | 5 | CANDIDATE 39 |
| chart-template | 9 | 7 | 0 | CANDIDATE 2 |
| chart-env-other | 3 | 0 | 0 | CANDIDATE 3 |
| schedule | 8 | 0 | 2 | CANDIDATE 6 |
| runbook-section | 6 | 0 | 0 | STALE 4, PARTLY-LIVE 2 |
| runbook-row-to-write | 18 | 0 | 0 | TO-WRITE 18 |
| planned-by-009 | 13 | 0 | 0 | PLANNED-009 13 |
| negative | 5 | 0 | 0 | NOT-A-SURFACE 5 |

**Total 604.** By status: CANDIDATE 456, RECHECK-AT-G9 37, CANDIDATE-SCOPE-OPEN 10, CHANGES-IN-009 58, EXCLUDE-CANDIDATE 1, STALE 4, PARTLY-LIVE 2, TO-WRITE 18, PLANNED-009 13, NOT-A-SURFACE 5. Entries carrying a 009 flag: 109.

Measured facts behind the counts [V]: `openapi.yaml` sha256 `b5ecdcad…29244`, 36 paths, 44 operations (36 public under `/api/v1/studio`, 8 internal: 5 runner, 3 api-callback), equal to both digest pins and the op-count pin `hasSize(44)`; `contracts/v3` 51 JSON files (44 schemas, 7 fixtures/vectors); Flyway V1–V22 (V1–V11 byte-identical to `d954a21c5`, no `backend/db/cutover`); `application.yml` 100 `studio.*` leaves; runner `KEY_SPECS` 45 keys; chart closed runner env list 36 names; `values.yaml` 123 Studio leaves.

### 2.1 Public routes — `/api/v1/studio/**` (36)

| Id | Route | operationId | OpenAPI | Backend mapping | Introduced by | Status |
|---|---|---|---|---|---|---|
| RTP-01 | `GET /api/v1/studio/tests` | listTests | 283 | StudioController.java:51 | cited "story 10.46" in op block | CANDIDATE |
| RTP-02 | `POST /api/v1/studio/tests` | createTest | 351 | StudioController.java:66 | untraced (openapi :6 names story 10.1 for the document as a whole, not per operation) | CANDIDATE |
| RTP-03 | `GET /api/v1/studio/tests/{id}` | getTest | 438 | StudioController.java:75 | untraced (openapi :6 names story 10.1 for the document as a whole, not per operation) | CANDIDATE |
| RTP-04 | `PUT /api/v1/studio/tests/{id}` | updateTest | 535 | StudioController.java:80 | untraced (openapi :6 names story 10.1 for the document as a whole, not per operation) | CANDIDATE |
| RTP-05 | `DELETE /api/v1/studio/tests/{id}` | deleteTest | 623 | StudioController.java:94 | untraced (openapi :6 names story 10.1 for the document as a whole, not per operation) | CANDIDATE |
| RTP-06 | `POST /api/v1/studio/tests/{id}/execute` | executeTest | 641 | StudioController.java:112 | cited "Story 10.1, STUDIO-OBS-014" | CANDIDATE |
| RTP-07 | `POST /api/v1/studio/tests/{id}/validate-variables` | validateTestVariables | 753 | StudioController.java:177 | kept by STUDIO-OBS-012A (ADR-SC-005 :88) | CANDIDATE |
| RTP-08 | `GET /api/v1/studio/tests/{id}/secrets` | listTestSecrets | 811 | secrets/StudioSecretsController.java:36 | untraced (openapi :6 names story 10.1 for the document as a whole, not per operation) | CANDIDATE |
| RTP-09 | `POST /api/v1/studio/tests/{id}/secrets` | createTestSecret | 847 | secrets/StudioSecretsController.java:42 | untraced (openapi :6 names story 10.1 for the document as a whole, not per operation) | CANDIDATE |
| RTP-10 | `GET /api/v1/studio/tests/{id}/capabilities` | getStudioTestCapabilities | 935 | secrets/StudioSecretsCapabilityController.java:33 | STUDIO-OBS-008 (010 AC-5 addition D-3) | CANDIDATE |
| RTP-11 | `GET /api/v1/studio/executions` | listExecutions | 1000 | StudioController.java:155 | cited "story 10.46" | CANDIDATE |
| RTP-12 | `GET /api/v1/studio/executions/{id}` | getExecution | 1061 | StudioController.java:131 | untraced (openapi :6 names story 10.1 for the document as a whole, not per operation) | CANDIDATE |
| RTP-13 | `POST /api/v1/studio/executions/{id}/cancel` | cancelExecution | 1118 | StudioController.java:144 | untraced (openapi :6 names story 10.1 for the document as a whole, not per operation) | CANDIDATE |
| RTP-14 | `GET /api/v1/studio/executions/{id}/events` | streamExecution | 1166 | sse/ExecutionEventsController.java:70 | untraced (openapi :6 names story 10.1 for the document as a whole, not per operation) | CANDIDATE |
| RTP-15 | `GET /api/v1/studio/executions/{id}/video` | getExecutionVideo | 1200 | ExecutionVideoController.java:55 | cited STUDIO-OBS-012A, OBS-007 | CANDIDATE |
| RTP-16 | `POST /api/v1/studio/guided-sessions` | startGuidedSession | 1296 | guided/session/GuidedSessionController.java:35 | cited STUDIO-OBS-003, -014 | CANDIDATE |
| RTP-17 | `GET /api/v1/studio/guided-sessions/{id}` | readGuidedSession | 1467 | guided/session/GuidedSessionController.java:45 | cited STUDIO-OBS-003, -008 | CANDIDATE |
| RTP-18 | `GET /api/v1/studio/guided-sessions/{id}/result` | readGuidedResult | 1515 | guided/session/GuidedSessionController.java:59 | cited STUDIO-OBS-006, -008 | CANDIDATE |
| RTP-19 | `GET /api/v1/studio/guided-sessions/{id}/clarification` | readGuidedClarification | 1685 | guided/session/GuidedSessionController.java:77 | cited STUDIO-OBS-005 | CANDIDATE |
| RTP-20 | `POST /api/v1/studio/guided-sessions/{id}/clarify` | clarifyGuidedSession | 1727 | guided/session/GuidedSessionController.java:83 | cited STUDIO-OBS-005 | CANDIDATE |
| RTP-21 | `POST /api/v1/studio/guided-sessions/{id}/cancel` | cancelGuidedSession | 1778 | guided/session/GuidedSessionController.java:93 | cited STUDIO-OBS-003 | CANDIDATE |
| RTP-22 | `POST /api/v1/studio/guided-sessions/{id}/finalize` | finalizeObservedPublication | 1824 | guided/publication/GuidedPublicationController.java:28 | STUDIO-OBS-006 (runbook :31) | CANDIDATE |
| RTP-23 | `GET /api/v1/studio/guided-sessions/{id}/video` | getGuidedSessionVideo | 1868 | guided/evidence/GuidedSessionVideoController.java:75 | STUDIO-OBS-013 (runbook :3) | CANDIDATE |
| RTP-24 | `GET /api/v1/studio/guided-policies` | lookupGuidedPolicy | 1950 | guided/policy/ObservationPolicyController.java:42 | STUDIO-OBS-014 (010 AC-5 addition D-3) | CANDIDATE |
| RTP-25 | `POST /api/v1/studio/guided-policies` | createGuidedPolicy | 1986 | guided/policy/ObservationPolicyController.java:54 | STUDIO-OBS-014 | CANDIDATE |
| RTP-26 | `GET /api/v1/studio/guided-policies/{id}` | readGuidedPolicy | 2116 | guided/policy/ObservationPolicyController.java:60 | STUDIO-OBS-014 | CANDIDATE |
| RTP-27 | `POST /api/v1/studio/guided-policies/{id}/versions` | createGuidedPolicyVersion | 2142 | guided/policy/ObservationPolicyController.java:65 | STUDIO-OBS-014 | CANDIDATE |
| RTP-28 | `POST /api/v1/studio/guided-policies/{id}/versions/{version}/approval` | approveGuidedPolicyVersion | 2190 | guided/policy/ObservationPolicyController.java:74 | STUDIO-OBS-014 (approval is not the 010 S&C release approval; openapi :2202-2203) | CANDIDATE |
| RTP-29 | `GET /api/v1/studio/tests/{id}/schedule/capabilities` | studioScheduleCapabilities | 2578 | scheduling/StudioScheduleController.java:32 | ADR-003/ADR-004 scheduling, preserved by ADR-SC-005 :9 [V]; untraced per op | CANDIDATE |
| RTP-30 | `GET /api/v1/studio/tests/{id}/schedule` | readStudioSchedule | 2605 | scheduling/StudioScheduleController.java:37 | ADR-003/ADR-004 scheduling, preserved by ADR-SC-005 :9 [V]; untraced per op | CANDIDATE |
| RTP-31 | `PUT /api/v1/studio/tests/{id}/schedule` | updateStudioSchedule | 2672 | scheduling/StudioScheduleController.java:55 | ADR-003/ADR-004 scheduling, preserved by ADR-SC-005 :9 [V]; untraced per op | CANDIDATE |
| RTP-32 | `POST /api/v1/studio/tests/{id}/schedule` | createStudioSchedule | 2628 | scheduling/StudioScheduleController.java:48 | ADR-003/ADR-004 scheduling, preserved by ADR-SC-005 :9 [V]; untraced per op | CANDIDATE |
| RTP-33 | `DELETE /api/v1/studio/tests/{id}/schedule` | removeStudioSchedule | 2717 | scheduling/StudioScheduleController.java:67 | ADR-003/ADR-004 scheduling, preserved by ADR-SC-005 :9 [V]; untraced per op | CANDIDATE |
| RTP-34 | `PATCH /api/v1/studio/tests/{id}/schedule/enabled` | enableStudioSchedule | 2762 | scheduling/StudioScheduleController.java:61 | ADR-003/ADR-004 scheduling, preserved by ADR-SC-005 :9 [V]; untraced per op | CANDIDATE |
| RTP-35 | `POST /api/v1/studio/schedules/preview` | previewStudioSchedule | 2812 | scheduling/StudioScheduleController.java:74 | ADR-003/ADR-004 scheduling, preserved by ADR-SC-005 :9 [V]; untraced per op | CANDIDATE |
| RTP-36 | `GET /api/v1/studio/tests/{id}/schedule/occurrences` | listStudioScheduleOccurrences | 2841 | scheduling/StudioScheduleController.java:80 | ADR-003/ADR-004 scheduling, preserved by ADR-SC-005 :9 [V]; untraced per op | CANDIDATE |

Live evidence for all 36: tree [V]; local = `StudioContractTest.java:340-341` op-count pin + G9 record row; deployed = owed/unrun, owner Platform/SRE + @devops (U4).

### 2.2 Internal routes declared in OpenAPI (8)

| Id | Route | Handler | Status | 009 effect | Expected change |
|---|---|---|---|---|---|
| RTI-01 | `POST /v2/validate-observed (runner; server https://runner.example.invalid)` | studio-runner/src/server/routes.ts:159 | RECHECK-AT-G9 | BEHAVIOUR | TRANSPORT: served on the one TLS listener with client-certificate auth; bearer stays as second factor; path unchanged [I] |
| RTI-02 | `POST /v2/runs (runner; server https://runner.example.invalid)` | studio-runner/src/server/routes.ts:159 | RECHECK-AT-G9 | BEHAVIOUR | TRANSPORT: served on the one TLS listener with client-certificate auth; bearer stays as second factor; path unchanged [I] |
| RTI-03 | `POST /internal/studio/executions/{id}/observed-admission (api-callback; server https://controller.example.invalid)` | internal/StudioInternalController.java:69 | CANDIDATE |  | A3: runner->backend callback hops are outside AC-3 (no change ruled) |
| RTI-04 | `DELETE /v2/runs/{id} (runner; server {runnerBaseUrl})` | studio-runner/src/server/routes.ts:179 | RECHECK-AT-G9 | BEHAVIOUR | TRANSPORT: served on the one TLS listener with client-certificate auth; bearer stays as second factor; path unchanged [I] |
| RTI-05 | `GET /internal/studio/executions/{id}/control (api-callback; server {apiInternalBaseUrl})` | internal/StudioInternalController.java:64 | CANDIDATE |  | A3: runner->backend callback hops are outside AC-3 (no change ruled) |
| RTI-06 | `POST /internal/studio/executions/{id}/progress (api-callback; server {apiInternalBaseUrl})` | internal/StudioInternalController.java:91 | CANDIDATE |  | A3: runner->backend callback hops are outside AC-3 (no change ruled) |
| RTI-07 | `GET /health (runner; server {runnerBaseUrl})` | studio-runner/src/server/routes.ts:141 | RECHECK-AT-G9 | BEHAVIOUR | TRANSPORT+AUTH: served on the one TLS listener; /health and /ready accept the controller or the runner-own certificate fingerprint plus the probe bearer; path unchanged [I] |
| RTI-08 | `GET /ready (runner; server {runnerBaseUrl})` | studio-runner/src/server/routes.ts:147 | RECHECK-AT-G9 | BEHAVIOUR | TRANSPORT+AUTH: served on the one TLS listener; /health and /ready accept the controller or the runner-own certificate fingerprint plus the probe bearer; path unchanged [I] |

### 2.3 Internal routes not in OpenAPI (18) — scope open (OI-03)

| Id | Route | Anchor | Status | 009 effect | Expected change |
|---|---|---|---|---|---|
| RTX-01 | `POST /internal/v2/studio/guided-sessions/{id}/claim (backend; runner->API bridge callback)` | guided/session/GuidedInternalController.java:31 | CANDIDATE-SCOPE-OPEN |  |  |
| RTX-02 | `POST /internal/v2/studio/guided-sessions/{id}/observations (backend; runner->API bridge callback)` | guided/session/GuidedInternalController.java:42 | CANDIDATE-SCOPE-OPEN |  |  |
| RTX-03 | `POST /internal/v2/studio/guided-sessions/{id}/admissions (backend; runner->API bridge callback)` | guided/session/GuidedInternalController.java:54 | CANDIDATE-SCOPE-OPEN |  |  |
| RTX-04 | `POST /internal/v2/studio/guided-sessions/{id}/advance (backend; runner->API bridge callback)` | guided/session/GuidedInternalController.java:68 | CANDIDATE-SCOPE-OPEN |  |  |
| RTX-05 | `POST /internal/v2/studio/guided-sessions/{id}/outcomes (backend; runner->API bridge callback)` | guided/session/GuidedInternalController.java:82 | CANDIDATE-SCOPE-OPEN |  |  |
| RTX-06 | `POST /internal/v2/studio/guided-sessions/{id}/bootstrap-evidence (backend; runner->API bridge callback)` | guided/session/GuidedInternalController.java:94 | CANDIDATE-SCOPE-OPEN |  |  |
| RTX-07 | `POST /internal/v2/studio/guided-sessions/{id}/lifecycle (backend; runner->API bridge callback)` | guided/session/GuidedInternalController.java:106 | RECHECK-AT-G9 | BEHAVIOUR | SEMANTIC: LIFECYCLE-REASON-01 makes the context lifecycle honour the runner stop reason (lane BL; no tolerance); path unchanged |
| RTX-08 | `POST /internal/v2/studio/guided-sessions/{id}/recording-evidence (backend; runner->API bridge callback)` | guided/evidence/GuidedSessionEvidenceInternalController.java:50 (ROUTE GuidedSessionEvidenceService.java:43) | RECHECK-AT-G9 | BEHAVIOUR | SEMANTIC (conditional): accepted context revision becomes membership in {n} or {n, n-1} only if the W1 probe reproduces STALE_FENCE; else R1 closes "not reproduced"; path unchanged |
| RTX-09 | `POST /internal/v2/studio/guided-sessions/{id}/plans (backend; runner->API bridge callback)` | guided/translation/GuidedPlanningController.java:29 | CANDIDATE-SCOPE-OPEN |  |  |
| RTX-10 | `POST /internal/v2/studio/guided-sessions/{id}/proposals (backend; runner->API bridge callback)` | guided/translation/GuidedPlanningController.java:41 | CANDIDATE-SCOPE-OPEN |  |  |
| RTX-11 | `POST /internal/v2/studio/guided-sessions/{id}/dependency-admissions (backend; runner->API bridge callback)` | guided/translation/GuidedPlanningController.java:53 | CANDIDATE-SCOPE-OPEN |  |  |
| RTX-12 | `POST /internal/v2/studio/guided-sessions/{id}/planning-context (backend; runner->API bridge callback)` | guided/translation/GuidedPlanningController.java:65 | CANDIDATE-SCOPE-OPEN |  |  |
| RTX-13 | `POST /internal/v2/studio/guided-sessions/{id}/assign (runner guided bridge; API->runner)` | studio-runner/src/guided/transport.ts:83 | RECHECK-AT-G9 | BEHAVIOUR | HOST: served by the one folded runner process on its one TLS listener (guidedMain.ts deleted); route path expected unchanged [I] |
| RTX-14 | `POST /internal/v2/studio/guided-sessions/{id}/context (runner guided bridge; API->runner)` | studio-runner/src/guided/transport.ts:83 | RECHECK-AT-G9 | BEHAVIOUR | HOST: served by the one folded runner process on its one TLS listener (guidedMain.ts deleted); route path expected unchanged [I] |
| RTX-15 | `POST /internal/v2/studio/guided-sessions/{id}/prepare (runner guided bridge; API->runner)` | studio-runner/src/guided/transport.ts:83 | RECHECK-AT-G9 | BEHAVIOUR | HOST: served by the one folded runner process on its one TLS listener (guidedMain.ts deleted); route path expected unchanged [I] |
| RTX-16 | `POST /internal/v2/studio/guided-sessions/{id}/dispatch (runner guided bridge; API->runner)` | studio-runner/src/guided/transport.ts:83 | RECHECK-AT-G9 | BEHAVIOUR | HOST: served by the one folded runner process on its one TLS listener (guidedMain.ts deleted); route path expected unchanged [I] |
| RTX-17 | `POST /internal/v2/studio/guided-sessions/{id}/observe (runner guided bridge; API->runner)` | studio-runner/src/guided/transport.ts:83 | RECHECK-AT-G9 | BEHAVIOUR | HOST: served by the one folded runner process on its one TLS listener (guidedMain.ts deleted); route path expected unchanged [I] |
| RTX-18 | `POST /internal/v2/studio/guided-sessions/{id}/stop (runner guided bridge; API->runner)` | studio-runner/src/guided/transport.ts:83 | RECHECK-AT-G9 | BEHAVIOUR | HOST: served by the one folded runner process on its one TLS listener (guidedMain.ts deleted); route path expected unchanged [I] |

### 2.4 OpenAPI document and named components (5)

| Id | Surface | Anchor | Status | 009 effect | Note |
|---|---|---|---|---|---|
| OAS-00 | docs/specs/studio/openapi.yaml (36 paths, 44 operations: 36 public + 8 internal) | docs/specs/studio/openapi.yaml:1; backend/src/test/java/com/citi/put/checks/studio/StudioContractTest.java:89-91 (digest pin); StudioContractTest.java:340-341 (op count 44); studio-runner/test/run/confinement.test.ts:293-294 (digest pin) | CHANGES-IN-009 | VALUE | DIGEST: C9 edits RuntimeVersions/ReportedRuntimeVersions descriptions and four example blocks; both pins re-anchored; operation count stays 44 |
| OAS-01 | components.schemas.RuntimeVersions | docs/specs/studio/openapi.yaml:4149 | CHANGES-IN-009 | VALUE | DESCRIPTION: field names kept; meanings re-pointed in projectRuntime (chromium <- observedChromiumBuild, validator <- "3:"+observedSchemaBundleHash, executor <- observedBrowserLauncherSha256) |
| OAS-02 | components.schemas.ReportedRuntimeVersions | docs/specs/studio/openapi.yaml:4562 | CHANGES-IN-009 | VALUE | DESCRIPTION: field names kept; meanings re-pointed in projectRuntime (chromium <- observedChromiumBuild, validator <- "3:"+observedSchemaBundleHash, executor <- observedBrowserLauncherSha256) |
| OAS-03 | components.schemas.ExecutionSnapshot.replayFailure | docs/specs/studio/openapi.yaml:4279 | CANDIDATE |  | STUDIO-OBS-008 A1/P1 (010 AC-5 addition D-3) [V] |
| OAS-04 | components.schemas.ReplayFailure | docs/specs/studio/openapi.yaml:4282 | CANDIDATE |  | STUDIO-OBS-008 A1/P1 (010 AC-5 addition D-3) [V] |

### 2.5 `contracts/v3` documents (51)

Folder `docs/specs/studio-observed-authoring/contracts/v3/`. Local proof: `node tools/check-studio-observed-contracts.cjs` (PLANNED_NOT_RUN). No deployed counterpart. The stray `.claude/` subfolder is excluded (OI-08).

| Id | File | sha256 (prefix) | Note |
|---|---|---|---|
| CON-01 | `action-timing.schema.json` | `d2cb597f799dfac2` |  |
| CON-02 | `action.schema.json` | `cf6844f8eb31169c` |  |
| CON-03 | `allocation.schema.json` | `8261aca9be0cfdda` |  |
| CON-04 | `assignment-lifecycle.schema.json` | `52a37865db75a8e2` |  |
| CON-05 | `assignment-receipt.schema.json` | `7efac7f0b31dff85` |  |
| CON-06 | `assignment-stop.schema.json` | `358e6d151e4fb7b2` |  |
| CON-07 | `assignment.schema.json` | `ced834f01f4f346f` |  |
| CON-08 | `authored-inputs.schema.json` | `9ff02b3dd33bfb2c` |  |
| CON-09 | `authoring-snapshot.schema.json` | `dc212b318aee6076` |  |
| CON-10 | `availability.schema.json` | `e286e88762d4e301` |  |
| CON-11 | `binding.schema.json` | `78ba6b131343ec5b` |  |
| CON-12 | `bridge.schema.json` | `039ad4017a825648` |  |
| CON-13 | `clarification.schema.json` | `8ec215edc4334d4b` |  |
| CON-14 | `commands.schema.json` | `7a8dbc6c5af455dc` |  |
| CON-15 | `consumer-edge.schema.json` | `921982d21c7a8151` |  |
| CON-16 | `current-synthetic-worlds.json` | `88abb9cb08689f2e` |  |
| CON-17 | `error.schema.json` | `4bf2846a3bafdc9f` |  |
| CON-18 | `execution-evidence.schema.json` | `5f9eda27221c948d` |  |
| CON-19 | `fixtures.json` | `fb1f9856353fef07` | mtime 2026-10-17 15:30-15:35 (008 in flight); re-hash after 008 Done (OI-09) |
| CON-20 | `guided-model-response.schema.json` | `2d986c098548b604` |  |
| CON-21 | `guided-planning-commands.schema.json` | `7229d5841845c045` |  |
| CON-22 | `guided-policy.schema.json` | `9536507b5a3b6fe6` |  |
| CON-23 | `learned-plan.schema.json` | `404ec2ea1ee73337` |  |
| CON-24 | `ledger.schema.json` | `081f1c4f45386a52` |  |
| CON-25 | `limits.schema.json` | `f6e4bba01ee38ee2` |  |
| CON-26 | `observation-refresh.schema.json` | `66d7a4591ac4fae4` |  |
| CON-27 | `observation.schema.json` | `31afe5aa601b10ea` |  |
| CON-28 | `planning-context.schema.json` | `aa83c37a4b647dae` |  |
| CON-29 | `planning-fixtures.json` | `f642159fd4947430` |  |
| CON-30 | `producer.schema.json` | `9a71f3e82034bc7b` |  |
| CON-31 | `public-ui-projections.schema.json` | `a435e034f7dd0910` | mtime 2026-10-17 15:30-15:35 (008 in flight); re-hash after 008 Done (OI-09) |
| CON-32 | `publication-canonical-vectors.json` | `995458217fdd08ae` |  |
| CON-33 | `publication-fixtures.json` | `861619da6c311836` | mtime 2026-10-17 15:30-15:35 (008 in flight); re-hash after 008 Done (OI-09) |
| CON-34 | `publication.schema.json` | `f5314de5d45dd277` |  |
| CON-35 | `replay-artifact.schema.json` | `590e3d79a0d4b6ef` |  |
| CON-36 | `replay-ipc.schema.json` | `6bbf2c36dafb970f` |  |
| CON-37 | `replay-job.schema.json` | `f1c850dedcc62e7e` |  |
| CON-38 | `replay-operation.schema.json` | `1e5035d1badbe7c7` |  |
| CON-39 | `replay-policy.schema.json` | `045ee1bd22bd654c` |  |
| CON-40 | `replay-profile.schema.json` | `adf91ed11e9d878e` |  |
| CON-41 | `replay-validation.schema.json` | `40d547d989156154` |  |
| CON-42 | `result.schema.json` | `22ce88aeeac00de3` | mtime 2026-10-17 15:30-15:35 (008 in flight); re-hash after 008 Done (OI-09) |
| CON-43 | `revision.schema.json` | `e37b2bd9869d42af` |  |
| CON-44 | `runner-context.schema.json` | `7db2628f53fb646c` |  |
| CON-45 | `session-view.schema.json` | `38dd5dddc4e48003` | mtime 2026-10-17 15:30-15:35 (008 in flight); re-hash after 008 Done (OI-09) |
| CON-46 | `session.schema.json` | `3651dc302709f3b1` |  |
| CON-47 | `source-reference.schema.json` | `184a99cc4018f589` |  |
| CON-48 | `source-selection.schema.json` | `df429534e7b827b5` |  |
| CON-49 | `timing-order-vectors.json` | `28a2171311f37dc5` | STUDIO-OBS-015 (AC-5 addition D-3) |
| CON-50 | `versions.schema.json` | `02bc1bbc453daea9` |  |
| CON-51 | `wire-parity.fixtures.json` | `38d30dc9fa01b714` |  |

### 2.6 Migrations — V1–V18 re-baseline plus forward-only V19…head (22)

| Id | File | Kind | Introduced by | sha256 (prefix) |
|---|---|---|---|---|
| MIG-01 | `V1__init.sql` | core migration (byte-identical to d954a21c5 [V]) | Checks core (ADR-SC-005 D-B: V1-V11 byte-identical) | `2e010e6e1e6f0170` |
| MIG-02 | `V2__schedule_next_execution.sql` | core migration (byte-identical to d954a21c5 [V]) | Checks core (ADR-SC-005 D-B: V1-V11 byte-identical) | `7a36462fcceb86d2` |
| MIG-03 | `V3__check_templates_seed.sql` | core migration (byte-identical to d954a21c5 [V]) | Checks core (ADR-SC-005 D-B: V1-V11 byte-identical) | `8c356f1081df490c` |
| MIG-04 | `V4__secrets_encrypted_value.sql` | core migration (byte-identical to d954a21c5 [V]) | Checks core (ADR-SC-005 D-B: V1-V11 byte-identical) | `91662e9f2c8f07e2` |
| MIG-05 | `V5__story_3_schema_additions.sql` | core migration (byte-identical to d954a21c5 [V]) | Checks core (ADR-SC-005 D-B: V1-V11 byte-identical) | `b930941c1b7ba06b` |
| MIG-06 | `V6__report_next_delivery.sql` | core migration (byte-identical to d954a21c5 [V]) | Checks core (ADR-SC-005 D-B: V1-V11 byte-identical) | `d4669fed42d82824` |
| MIG-07 | `V7__partition_remaining_tables_and_defaults.sql` | core migration (byte-identical to d954a21c5 [V]) | Checks core (ADR-SC-005 D-B: V1-V11 byte-identical) | `ee6f50fe699f70af` |
| MIG-08 | `V8__failed_dispatches_and_report_failures.sql` | core migration (byte-identical to d954a21c5 [V]) | Checks core (ADR-SC-005 D-B: V1-V11 byte-identical) | `78ad49e718124c78` |
| MIG-09 | `V9__schedules_check_type_column.sql` | core migration (byte-identical to d954a21c5 [V]) | Checks core (ADR-SC-005 D-B: V1-V11 byte-identical) | `9c91a6b11df2f9b0` |
| MIG-10 | `V10__uppercase_status_standardization.sql` | core migration (byte-identical to d954a21c5 [V]) | Checks core (ADR-SC-005 D-B: V1-V11 byte-identical) | `714ea331197e4b30` |
| MIG-11 | `V11__check_acknowledge_assign.sql` | core migration (byte-identical to d954a21c5 [V]) | Checks core (ADR-SC-005 D-B: V1-V11 byte-identical) | `13a95eb5154cc4f3` |
| MIG-12 | `V12__tests_revisions.sql` | Studio re-baseline V12-V18 (D-B) | STUDIO-OBS-012A re-baseline (ADR-SC-005 D-B) [V] | `274c26c4d41fbd99` |
| MIG-13 | `V13__executions_ledger.sql` | Studio re-baseline V12-V18 (D-B) | STUDIO-OBS-012A re-baseline (ADR-SC-005 D-B) [V] | `f258e01be9963e58` |
| MIG-14 | `V14__guided_sessions.sql` | Studio re-baseline V12-V18 (D-B) | STUDIO-OBS-012A re-baseline (ADR-SC-005 D-B) [V] | `bc28e43835aefe15` |
| MIG-15 | `V15__publication.sql` | Studio re-baseline V12-V18 (D-B) | STUDIO-OBS-012A re-baseline (ADR-SC-005 D-B) [V] | `ef092dfff93a24c4` |
| MIG-16 | `V16__scheduling.sql` | Studio re-baseline V12-V18 (D-B) | STUDIO-OBS-012A re-baseline (ADR-SC-005 D-B) [V] | `6d7f4888aabf4a72` |
| MIG-17 | `V17__secret_use_audit.sql` | Studio re-baseline V12-V18 (D-B) | STUDIO-OBS-012A re-baseline (ADR-SC-005 D-B) [V] | `a5b6a89525f3b537` |
| MIG-18 | `V18__drop_plaintext_secrets.sql` | Studio re-baseline V12-V18 (D-B) | STUDIO-OBS-012A re-baseline (ADR-SC-005 D-B) [V] | `febfd5eb1624240e` |
| MIG-19 | `V19__guided_governance.sql` | forward-only after re-baseline | V19 guided_governance (STUDIO-OBS-014) [V via 010 AC-5 D-2] | `628b47efbb656aef` |
| MIG-20 | `V20__guided_session_recording.sql` | forward-only after re-baseline | V20 guided_session_recording (STUDIO-OBS-013) [I] | `e26da3077ca90fc0` |
| MIG-21 | `V21__guided_session_replaying_prefix.sql` | forward-only after re-baseline | V21 guided_session_replaying_prefix (STUDIO-OBS-015) [I] | `b012ddddb44b599c` |
| MIG-22 | `V22__execution_replay_failure.sql` | forward-only after re-baseline | V22 execution_replay_failure (STUDIO-OBS-008) [V via 010 AC-5 D-2] | `29437d3bda6479fa` |

Deployed proof for V12–V22: owed/unrun, owner user / Platform-SRE (U11: dev-DB recreation, D-B confirmation) and Platform/SRE + @devops (U4). A V23 appears only under P09-13.

### 2.7 Backend configuration

**On-by-default flags and the kill switch** (010 AC-5 names them explicitly):

| Id | Key | Default / value | Anchor | Kind | Status | 009 effect |
|---|---|---|---|---|---|---|
| CFB-011 | `studio.guided.publication.enabled` | `${STUDIO_OBSERVED_PUBLICATION_ENABLED:true}` | backend/src/main/resources/application.yml:239 | on-by-default flag (ADR-SC-005 defaults "Flags") [V] | CANDIDATE |  |
| CFB-016 | `studio.observed-replay.enabled` | `${STUDIO_OBSERVED_REPLAY_ENABLED:true}` | backend/src/main/resources/application.yml:245 | on-by-default flag (ADR-SC-005 defaults "Flags") [V] | CANDIDATE |  |
| CFB-036 | `studio.execution.enabled` | `${STUDIO_EXECUTION_ENABLED:true}` | backend/src/main/resources/application.yml:284 | KILL SWITCH (ADR-SC-005 defaults "Flags": remains the kill switch) [V] | CANDIDATE |  |
| CFD-01 | `studio.guided-authoring.translation.enabled` | `true` | guided/translation/GuidedTranslationProperties.java:10; GuidedTranslationConfiguration.java:76-79, :114-117 (matchIfMissing=true) | ON-BY-DEFAULT flag (ADR-SC-005 defaults "Flags"; OBS-007) [V] | CANDIDATE |  |
| CFD-02 | `studio.guided-authoring.translation.allow-authored-nonsecret` | `true` | guided/translation/GuidedTranslationProperties.java:11 | ON-BY-DEFAULT (INPUT-POLICY-01 branch A; ADR-SC-005 defaults "Flags") [V] | CANDIDATE |  |
| CFD-03 | `studio.guided-authoring.enabled` | `true` | guided/session/GuidedSessionProperties.java:12 | code default true [V] | CANDIDATE |  |
| CFD-04 | `studio.guided-authoring.translation.worker-id` | `worker-1` | guided/translation/GuidedTranslationProperties.java:17 | single worker id [V] | RECHECK-AT-G9 | BEHAVIOUR |
| CFD-05 | `studio.scheduling.enabled` | `false (Java default; no yml or chart key [V])` | scheduling/StudioSchedulingProperties.java:11 | Studio schedules switch | CANDIDATE |  |
| CFD-06 | `studio.scheduling.local-grants-enabled` | `false` | scheduling/StudioSchedulingProperties.java:12 | local grants switch (G-3 relevance [I]) | CANDIDATE |  |
| CFD-07 | `checks.sources.UI_TEST` | `application.yml false; chart values.yaml "true"; values-dev "false"` | backend/src/main/resources/application.yml:56; helm-chart/put-checks/values.yaml:163; helm-chart/put-checks/templates/deployment.yaml:23-28 | Studio source switch (outside studio.*; the chart fails a deployed render without it) [V] | CANDIDATE |  |

**Code-only `@Value` keys** (no line in any `application*.yml`):

| Id | Key | Default | Anchor | Status | 009 effect | Expected change / note |
|---|---|---|---|---|---|---|
| CFC-01 | `studio.guided-authoring.runner-origin` | no default; bean conditional on presence | guided/session/GuidedSessionConfiguration.java:81-85 | CHANGES-IN-009 | VALUE | VALUE+TLS: https URL of the runner Service; GuidedRunnerClient moves from SSLContext.getDefault() (:94) to StudioRunnerTls — OI-05: 011 FOLD may merge it with studio.runner.base-url (A4) |
| CFC-02 | `studio.guided-authoring.mtls-required` | default false | guided/session/GuidedInternalSecurity.java:51 | CHANGES-IN-009 | VALUE | VALUE: chart/profile values supply the chain (AC-2) |
| CFC-03 | `studio.guided-authoring.service-public-key` | default empty | guided/session/GuidedInternalSecurity.java:49 | CHANGES-IN-009 | VALUE | VALUE: pinned RSA key supplied by AC-2 values |
| CFC-04 | `studio.guided-authoring.service-issuer` | default empty | guided/session/GuidedInternalSecurity.java:50 | CHANGES-IN-009 | VALUE | VALUE: issuer supplied by AC-2 values |
| CFC-05 | `studio.guided-authoring.reaper-delay-ms` | default 10000 | guided/session/GuidedSessionReaper.java:36 | CANDIDATE |  | bean gains @Profile (see SCH-04) |
| CFC-06 | `studio.guided-authoring.teardown-redrive-window` | default PT15M | guided/session/GuidedSessionReaper.java:18 | CANDIDATE |  |  |
| CFC-07 | `studio.guided-authoring.teardown-redrive-batch` | default 32 | guided/session/GuidedSessionReaper.java:19 | CANDIDATE |  |  |
| CFC-08 | `studio.guided-authoring.teardown-abandoned-warn-interval` | default PT15M | guided/session/GuidedSessionReaper.java:20 | CANDIDATE |  |  |
| CFC-09 | `studio.guided-authoring.translation.controller-origin` | default https://unconfigured.invalid | guided/translation/GuidedTranslationConfiguration.java:122-123 | CANDIDATE |  | coordinator @Bean gains @Profile (see SCH-02) |
| CFC-10 | `studio.guided-authoring.translation.poll-ms` | default 1000 | guided/translation/GuidedTranslationCoordinator.java:53 | CANDIDATE |  |  |
| CFC-11 | `studio.execution.metrics.backlog-refresh-ms` | default 5000 | dispatch/StudioDispatchMetrics.java:80 | CANDIDATE |  |  |
| CFC-12 | `studio.pool.size` | default 0 | backend/src/main/java/com/citi/put/checks/config/AsyncConfig.java:52 | CANDIDATE |  |  |
| CFC-13 | `studio.secret-revocation.sweep-interval-ms` | default 1000 | secrets/SecretRevocationSweep.java:57 | CANDIDATE |  |  |

**`application.yml` `studio.*` leaves (100).** Anchor `backend/src/main/resources/application.yml:<line>`. Owner: @dev backend (single owner = 009 lane D3). Deployed proof for all: owed/unrun, owner Platform/SRE + @devops (U4).

| Id | Key | Line | Value (as written) | Status | 009 |
|---|---|---|---|---|---|
| CFB-001 | `studio.guided-authoring.controller-token-file` | 200 | `${STUDIO_GUIDED_RUNNER_CONTROLLER_TOKEN_FILE:}` | CANDIDATE |  |
| CFB-002 | `studio.guided-authoring.translation.controller-token-file` | 202 | `${STUDIO_GUIDED_CONTROLLER_TOKEN_FILE:${studio.guided-authoring.controller-token-file:}}` | CANDIDATE |  |
| CFB-003 | `studio.guided-authoring.retention.observation-window` | 208 | `${STUDIO_GUIDED_OBSERVATION_RETENTION:30d}` | CANDIDATE |  |
| CFB-004 | `studio.guided-authoring.retention.pruner-delay-ms` | 209 | `3600000` | CANDIDATE |  |
| CFB-005 | `studio.guided-authoring.retention.batch-size` | 210 | `100` | CANDIDATE |  |
| CFB-006 | `studio.guided-authoring.csi-budget.max-concurrent-sessions` | 214 | `${STUDIO_GUIDED_CSI_MAX_CONCURRENT:3}` | CANDIDATE |  |
| CFB-007 | `studio.guided-authoring.csi-budget.daily-model-input-tokens` | 215 | `${STUDIO_GUIDED_CSI_DAILY_INPUT_TOKENS:5242880}` | CANDIDATE |  |
| CFB-008 | `studio.guided-authoring.csi-budget.daily-model-output-tokens` | 216 | `${STUDIO_GUIDED_CSI_DAILY_OUTPUT_TOKENS:640000}` | CANDIDATE |  |
| CFB-009 | `studio.guided-authoring.policy.approver-groups` | 220 | `[]` | CANDIDATE |  |
| CFB-010 | `studio.guided-authoring.policy.default-destructive-vocabulary` | 221 | `[list]` | CANDIDATE |  |
| CFB-011 | `studio.guided.publication.enabled` | 239 | `${STUDIO_OBSERVED_PUBLICATION_ENABLED:true}` | CANDIDATE |  |
| CFB-012 | `studio.guided.publication.max-validation-attempts` | 240 | `3` | CANDIDATE |  |
| CFB-013 | `studio.guided.publication.validation-timeout-ms` | 241 | `15000` | CANDIDATE |  |
| CFB-014 | `studio.guided.publication.authorization-ttl-ms` | 242 | `5000` | CANDIDATE |  |
| CFB-015 | `studio.guided.publication.max-validation-bytes` | 243 | `8388608` | CANDIDATE |  |
| CFB-016 | `studio.observed-replay.enabled` | 245 | `${STUDIO_OBSERVED_REPLAY_ENABLED:true}` | CANDIDATE |  |
| CFB-017 | `studio.observed-replay.authorization-ttl-ms` | 246 | `30000` | CANDIDATE |  |
| CFB-018 | `studio.observed-replay.max-artifact-bytes` | 247 | `1048576` | CANDIDATE |  |
| CFB-019 | `studio.observed-replay.max-job-bytes` | 248 | `4194304` | CANDIDATE |  |
| CFB-020 | `studio.observed-replay.max-execute-frame-bytes` | 249 | `2097152` | CANDIDATE |  |
| CFB-021 | `studio.observed-replay.catalog-json` | 250 | `'${STUDIO_OBSERVED_CATALOG_JSON:[]}'` | CANDIDATE |  |
| CFB-022 | `studio.observed-replay.policies-json` | 251 | `'${STUDIO_OBSERVED_POLICIES_JSON:[]}'` | CANDIDATE |  |
| CFB-023 | `studio.observed-replay.recording-width` | 252 | `${STUDIO_OBSERVED_RECORDING_WIDTH:1280}` | CANDIDATE |  |
| CFB-024 | `studio.observed-replay.recording-height` | 253 | `${STUDIO_OBSERVED_RECORDING_HEIGHT:720}` | CANDIDATE |  |
| CFB-025 | `studio.authoring.max-steps` | 256 | `${STUDIO_AUTHORING_MAX_STEPS:100}` | CANDIDATE |  |
| CFB-026 | `studio.secrets.vault.provider` | 269 | `${STUDIO_VAULT_PROVIDER:none}` | CANDIDATE |  |
| CFB-027 | `studio.secrets.vault.hashicorp.address` | 271 | `${STUDIO_VAULT_ADDRESS:}` | CANDIDATE |  |
| CFB-028 | `studio.secrets.vault.hashicorp.namespace` | 272 | `${STUDIO_VAULT_NAMESPACE:}` | CANDIDATE |  |
| CFB-029 | `studio.secrets.vault.hashicorp.mount` | 273 | `${STUDIO_VAULT_MOUNT:secret}` | CANDIDATE |  |
| CFB-030 | `studio.secrets.vault.hashicorp.path-template` | 274 | `${STUDIO_VAULT_PATH_TEMPLATE:}` | CANDIDATE |  |
| CFB-031 | `studio.secrets.vault.hashicorp.value-key` | 275 | `${STUDIO_VAULT_VALUE_KEY:value}` | CANDIDATE |  |
| CFB-032 | `studio.secrets.vault.hashicorp.token-file` | 276 | `${STUDIO_VAULT_TOKEN_FILE:}` | CANDIDATE |  |
| CFB-033 | `studio.secrets.vault.hashicorp.connect-timeout` | 277 | `${STUDIO_VAULT_CONNECT_TIMEOUT:2s}` | CANDIDATE |  |
| CFB-034 | `studio.secrets.vault.hashicorp.request-timeout` | 278 | `${STUDIO_VAULT_REQUEST_TIMEOUT:5s}` | CANDIDATE |  |
| CFB-035 | `studio.secrets.vault.hashicorp.max-response-bytes` | 279 | `${STUDIO_VAULT_MAX_RESPONSE_BYTES:65536}` | CANDIDATE |  |
| CFB-036 | `studio.execution.enabled` | 284 | `${STUDIO_EXECUTION_ENABLED:true}` | CANDIDATE |  |
| CFB-037 | `studio.execution.pending-sla` | 286 | `${STUDIO_PENDING_SLA:600s}` | CANDIDATE |  |
| CFB-038 | `studio.execution.start-deadline` | 287 | `${STUDIO_START_DEADLINE:30s}` | CANDIDATE |  |
| CFB-039 | `studio.execution.run-deadline` | 288 | `${STUDIO_RUN_DEADLINE:600s}` | CANDIDATE |  |
| CFB-040 | `studio.execution.total-runtime` | 294 | `${STUDIO_TOTAL_RUNTIME:120s}` | CANDIDATE |  |
| CFB-041 | `studio.execution.admission-timeout` | 295 | `${STUDIO_ADMISSION_TIMEOUT:10s}` | CANDIDATE |  |
| CFB-042 | `studio.execution.evidence-retention` | 296 | `${STUDIO_EVIDENCE_RETENTION:30d}` | CANDIDATE |  |
| CFB-043 | `studio.execution.callback-base-url` | 298 | `${STUDIO_CALLBACK_BASE_URL:http://put-checks-api:8080}` | CANDIDATE |  |
| CFB-044 | `studio.execution.video-store.bucket` | 303 | `${STUDIO_EVIDENCE_BUCKET:put-checks-studio-evidence}` | CANDIDATE |  |
| CFB-045 | `studio.execution.video-store.endpoint` | 304 | `${STUDIO_EVIDENCE_ENDPOINT:}` | CANDIDATE |  |
| CFB-046 | `studio.execution.video-store.provider` | 307 | `${STUDIO_EVIDENCE_PROVIDER:none}` | CANDIDATE |  |
| CFB-047 | `studio.execution.video-store.directory` | 308 | `${STUDIO_EVIDENCE_DIRECTORY:/tmp/studio-runner-objects}` | CANDIDATE |  |
| CFB-048 | `studio.execution.video-store.region` | 309 | `${STUDIO_EVIDENCE_REGION:us-east-1}` | CANDIDATE |  |
| CFB-049 | `studio.execution.video-store.path-style-access` | 310 | `${STUDIO_EVIDENCE_PATH_STYLE_ACCESS:true}` | CANDIDATE |  |
| CFB-050 | `studio.execution.video-store.access-key-id-file` | 311 | `${STUDIO_EVIDENCE_ACCESS_KEY_ID_FILE:}` | CANDIDATE |  |
| CFB-051 | `studio.execution.video-store.secret-access-key-file` | 312 | `${STUDIO_EVIDENCE_SECRET_ACCESS_KEY_FILE:}` | CANDIDATE |  |
| CFB-052 | `studio.execution.video-store.max-manifest-bytes` | 313 | `${STUDIO_EVIDENCE_MAX_MANIFEST_BYTES:524288}` | CANDIDATE |  |
| CFB-053 | `studio.execution.video-store.connect-timeout` | 314 | `${STUDIO_EVIDENCE_CONNECT_TIMEOUT:2s}` | CANDIDATE |  |
| CFB-054 | `studio.execution.video-store.request-timeout` | 315 | `${STUDIO_EVIDENCE_REQUEST_TIMEOUT:10s}` | CANDIDATE |  |
| CFB-055 | `studio.execution.quotas.per-csi` | 317 | `${STUDIO_QUOTA_PER_CSI:20}` | CANDIDATE |  |
| CFB-056 | `studio.execution.quotas.global` | 318 | `${STUDIO_QUOTA_GLOBAL:200}` | CANDIDATE |  |
| CFB-057 | `studio.execution.quotas.max-steps-per-test` | 319 | `${STUDIO_MAX_STEPS:200}` | CANDIDATE |  |
| CFB-058 | `studio.execution.recovery.poll-interval-ms` | 322 | `${STUDIO_RECOVERY_POLL_MS:5000}` | CANDIDATE |  |
| CFB-059 | `studio.execution.cancel.control-poll-interval` | 332 | `2s` | CANDIDATE |  |
| CFB-060 | `studio.execution.cancel.report-timeout` | 333 | `${STUDIO_RUNNER_ADMISSION_TIMEOUT_MS:10000}` | CANDIDATE |  |
| CFB-061 | `studio.execution.cancel.stop-grace` | 334 | `${STUDIO_RUNNER_BROWSER_STOP_TIMEOUT_MS:5000}` | CANDIDATE |  |
| CFB-062 | `studio.execution.cancel.evidence-window` | 335 | `${STUDIO_RUNNER_OBJECT_STORE_WINDOW_MS:15000}` | CANDIDATE |  |
| CFB-063 | `studio.execution.cancel.delivery-window` | 336 | `${STUDIO_RUNNER_TERMINAL_DELIVERY_WINDOW_MS:30000}` | CANDIDATE |  |
| CFB-064 | `studio.execution.cancel.slack` | 337 | `${STUDIO_CANCEL_MARGIN_SLACK:10s}` | CANDIDATE |  |
| CFB-065 | `studio.execution.cancel.margin` | 338 | `${STUDIO_CANCEL_MARGIN:}` | CANDIDATE |  |
| CFB-066 | `studio.execution.dispatcher.enabled` | 340 | `${STUDIO_DISPATCHER_ENABLED:false}` | CANDIDATE |  |
| CFB-067 | `studio.execution.dispatcher.threads` | 341 | `${STUDIO_DISPATCHER_THREADS:4}` | CANDIDATE |  |
| CFB-068 | `studio.execution.dispatcher.batch-size` | 342 | `${STUDIO_DISPATCHER_BATCH:20}` | CANDIDATE |  |
| CFB-069 | `studio.execution.dispatcher.lease` | 343 | `${STUDIO_DISPATCHER_LEASE:60s}` | CANDIDATE |  |
| CFB-070 | `studio.execution.dispatcher.poll-interval-ms` | 344 | `${STUDIO_DISPATCHER_POLL_MS:2000}` | CANDIDATE |  |
| CFB-071 | `studio.execution.callback.max-body-bytes` | 346 | `${STUDIO_CALLBACK_MAX_BODY:262144}` | CANDIDATE |  |
| CFB-072 | `studio.execution.callback.max-steps` | 347 | `${STUDIO_CALLBACK_MAX_STEPS:500}` | CANDIDATE |  |
| CFB-073 | `studio.execution.callback.max-log-entries` | 348 | `${STUDIO_CALLBACK_MAX_LOGS:500}` | CANDIDATE |  |
| CFB-074 | `studio.execution.callback.max-log-entry-chars` | 349 | `${STUDIO_CALLBACK_MAX_LOG_CHARS:2000}` | CANDIDATE |  |
| CFB-075 | `studio.execution.callback.service-token` | 352 | `${STUDIO_CALLBACK_SERVICE_TOKEN:}` | CANDIDATE |  |
| CFB-076 | `studio.execution.sse.heartbeat` | 354 | `${STUDIO_SSE_HEARTBEAT:15s}` | CANDIDATE |  |
| CFB-077 | `studio.execution.sse.lifetime` | 355 | `${STUDIO_SSE_LIFETIME:60s}` | CANDIDATE |  |
| CFB-078 | `studio.execution.sse.read-interval` | 356 | `${STUDIO_SSE_READ_INTERVAL:750ms}` | EXCLUDE-CANDIDATE |  |
| CFB-079 | `studio.execution.sse.read-interval-ms` | 358 | `${STUDIO_SSE_READ_INTERVAL_MS:750}` | CANDIDATE |  |
| CFB-080 | `studio.execution.sse.authorization-refresh` | 359 | `${STUDIO_SSE_AUTH_REFRESH:30s}` | CANDIDATE |  |
| CFB-081 | `studio.execution.sse.max-streams-per-user` | 360 | `${STUDIO_SSE_MAX_PER_USER:5}` | CANDIDATE |  |
| CFB-082 | `studio.execution.sse.max-streams-per-pod` | 361 | `${STUDIO_SSE_MAX_PER_POD:200}` | CANDIDATE |  |
| CFB-083 | `studio.execution.sse.max-watched-executions` | 362 | `${STUDIO_SSE_MAX_WATCHED:200}` | CANDIDATE |  |
| CFB-084 | `studio.execution.sse.sender-threads` | 363 | `${STUDIO_SSE_SENDER_THREADS:4}` | CANDIDATE |  |
| CFB-085 | `studio.gateway.provider` | 367 | `${STUDIO_GATEWAY_PROVIDER:disabled}` | CANDIDATE |  |
| CFB-086 | `studio.gateway.endpoint` | 368 | `${STUDIO_GATEWAY_ENDPOINT:}` | CANDIDATE |  |
| CFB-087 | `studio.gateway.project` | 369 | `${STUDIO_GATEWAY_PROJECT:}` | CANDIDATE |  |
| CFB-088 | `studio.gateway.location` | 370 | `${STUDIO_GATEWAY_LOCATION:}` | CANDIDATE |  |
| CFB-089 | `studio.gateway.model` | 371 | `${STUDIO_GATEWAY_MODEL:gemini-3.8-flash}` | CANDIDATE |  |
| CFB-090 | `studio.gateway.credentials.mode` | 373 | `${STUDIO_GATEWAY_CREDENTIALS_MODE:application-default}` | CANDIDATE |  |
| CFB-091 | `studio.gateway.credentials.service-account-key-file` | 374 | `${STUDIO_GATEWAY_CREDENTIALS_KEY_FILE:}` | CANDIDATE |  |
| CFB-092 | `studio.gateway.request-timeout` | 375 | `${STUDIO_GATEWAY_REQUEST_TIMEOUT:150s}` | CANDIDATE |  |
| CFB-093 | `studio.gateway.max-concurrency` | 376 | `${STUDIO_GATEWAY_MAX_CONCURRENCY:4}` | CANDIDATE |  |
| CFB-094 | `studio.gateway.max-input-bytes` | 377 | `${STUDIO_GATEWAY_MAX_INPUT_BYTES:262144}` | CANDIDATE |  |
| CFB-095 | `studio.gateway.max-output-bytes` | 378 | `${STUDIO_GATEWAY_MAX_OUTPUT_BYTES:262144}` | CANDIDATE |  |
| CFB-096 | `studio.gateway.max-output-tokens` | 379 | `${STUDIO_GATEWAY_MAX_OUTPUT_TOKENS:32768}` | CANDIDATE |  |
| CFB-097 | `studio.gateway.thinking-level` | 383 | `${STUDIO_GATEWAY_THINKING_LEVEL:LOW}` | CANDIDATE |  |
| CFB-098 | `studio.runner.base-url` | 390 | `${STUDIO_RUNNER_BASE_URL:}` | CHANGES-IN-009 | VALUE |
| CFB-099 | `studio.runner.service-identity-token` | 391 | `${STUDIO_RUNNER_SERVICE_TOKEN:}` | CANDIDATE |  |
| CFB-100 | `studio.runner.connect-timeout` | 392 | `${STUDIO_RUNNER_CONNECT_TIMEOUT:2s}` | CANDIDATE |  |

**Profile overrides (12):**

| Id | Key [profile] | Anchor | Value |
|---|---|---|---|
| CFP-01 | `studio.execution.dispatcher.enabled [profile worker]` | application-worker.yml:23 | `true` |
| CFP-02 | `studio.secrets.vault.provider [profile dev]` | application-dev.yml:31 | `${STUDIO_VAULT_PROVIDER:none}` |
| CFP-03 | `studio.execution.dispatcher.enabled [profile local]` | application-local.yml:69 | `${STUDIO_DISPATCHER_ENABLED:true}` |
| CFP-04 | `studio.execution.video-store.provider [profile local]` | application-local.yml:72 | `${STUDIO_EVIDENCE_PROVIDER:local}` |
| CFP-05 | `studio.secrets.vault.provider [profile local]` | application-local.yml:80 | `${STUDIO_VAULT_PROVIDER:none}` |
| CFP-06 | `studio.gateway.provider [profile local]` | application-local.yml:85 | `${STUDIO_GATEWAY_PROVIDER:disabled}` |
| CFP-07 | `studio.gateway.credentials.mode [profile local]` | application-local.yml:87 | `${STUDIO_GATEWAY_CREDENTIALS_MODE:application-default}` |
| CFP-08 | `studio.gateway.provider [profile staging]` | application-staging.yml:16 | `${STUDIO_GATEWAY_PROVIDER:disabled}` |
| CFP-09 | `studio.gateway.model [profile staging]` | application-staging.yml:17 | `${STUDIO_GATEWAY_MODEL:gemini-3.8-flash}` |
| CFP-10 | `studio.gateway.credentials.mode [profile staging]` | application-staging.yml:19 | `${STUDIO_GATEWAY_CREDENTIALS_MODE:application-default}` |
| CFP-11 | `studio.gateway.provider [profile test]` | application-test.yml:33 | `disabled` |
| CFP-12 | `studio.secrets.vault.provider [profile test]` | application-test.yml:36 | `none` |

**`@ConfigurationProperties` prefixes (17)** — leaves with a Java default and no yml line are not enumerated individually (OI-10):

| Id | Prefix | Anchor | Status | 009 effect |
|---|---|---|---|---|
| CFK-01 | `studio.execution.* (@ConfigurationProperties)` | StudioExecutionProperties.java:39 | CANDIDATE |  |
| CFK-02 | `studio.execution.video-store.* (@ConfigurationProperties)` | evidence/VideoStoreProperties.java:25 | CANDIDATE |  |
| CFK-03 | `studio.execution.cancel.* (@ConfigurationProperties)` | recovery/RunnerCancelBudget.java:57 | CANDIDATE |  |
| CFK-04 | `studio.observed-replay.* (@ConfigurationProperties)` | guided/publication/ObservedReplayProperties.java:9 | CANDIDATE |  |
| CFK-05 | `studio.guided.publication.* (@ConfigurationProperties)` | guided/publication/GuidedPublicationProperties.java:9 | CANDIDATE |  |
| CFK-06 | `studio.guided-authoring.* (@ConfigurationProperties)` | guided/session/GuidedSessionProperties.java:10 | CANDIDATE |  |
| CFK-07 | `studio.guided-authoring.translation.* (@ConfigurationProperties)` | guided/translation/GuidedTranslationProperties.java:8 | CANDIDATE |  |
| CFK-08 | `studio.guided-authoring.recording.* (@ConfigurationProperties)` | guided/evidence/GuidedRecordingProperties.java:19 | CANDIDATE |  |
| CFK-09 | `studio.guided-authoring.retention.* (@ConfigurationProperties)` | guided/retention/GuidedRetentionProperties.java:18 | CANDIDATE |  |
| CFK-10 | `studio.guided-authoring.policy.* (@ConfigurationProperties)` | guided/policy/GuidedPolicyProperties.java:14 | CANDIDATE |  |
| CFK-11 | `studio.guided-authoring.csi-budget.* (@ConfigurationProperties)` | guided/session/GuidedCsiBudgetProperties.java:14 | CANDIDATE |  |
| CFK-12 | `studio.scheduling.* (@ConfigurationProperties)` | scheduling/StudioSchedulingProperties.java:9 | CANDIDATE |  |
| CFK-13 | `studio.runner.* (@ConfigurationProperties)` | dispatch/StudioRunnerProperties.java:24 | CHANGES-IN-009 | KEY |
| CFK-14 | `studio.secrets.* (@ConfigurationProperties)` | secrets/StudioSecretsProperties.java:17 | CANDIDATE |  |
| CFK-15 | `studio.authoring.* (@ConfigurationProperties)` | authoring/StudioAuthoringProperties.java:15 | CANDIDATE |  |
| CFK-16 | `studio.gateway (selection).* (@ConfigurationProperties)` | gateway/StudioGatewaySelectionProperties.java:8 | CANDIDATE |  |
| CFK-17 | `studio.gateway.* (@ConfigurationProperties)` | gateway/StudioGatewayProperties.java:37 | CANDIDATE |  |

### 2.8 Runner configuration

**`KEY_SPECS` / `ACCEPTED_KEYS` (45 + the set entry).** Anchor `studio-runner/src/server/config.ts:<line>`; any other `STUDIO_RUNNER_*` key is refused (`refuseUnknownKeys` `:459`). Local proof: deployment tier `envfrom-keys.test.ts` / `chart.test.ts` (rendered env ⊆ accepted keys) + G9. Deployed: owed/unrun (U4).

| Id | Key | Line | Status | 009 | Note |
|---|---|---|---|---|---|
| RKS-01 | `STUDIO_RUNNER_OBSERVED_VALIDATION_ENABLED` | 176 | CANDIDATE |  | not in the chart closed env list (_helpers.tpl:157); not renderable by the chart today [V] (OI-06) |
| RKS-02 | `STUDIO_RUNNER_OBSERVED_REPLAY_ENABLED` | 177 | CANDIDATE |  | not in the chart closed env list (_helpers.tpl:157); not renderable by the chart today [V] (OI-06) |
| RKS-03 | `STUDIO_RUNNER_OBSERVED_CATALOG_FILE` | 178 | CANDIDATE |  | not in the chart closed env list (_helpers.tpl:157); not renderable by the chart today [V] (OI-06) |
| RKS-04 | `STUDIO_RUNNER_OBSERVED_POLICY_FILE` | 179 | CANDIDATE |  | not in the chart closed env list (_helpers.tpl:157); not renderable by the chart today [V] (OI-06) |
| RKS-05 | `STUDIO_RUNNER_OBSERVED_IMAGE_DIGEST` | 180 | CANDIDATE |  | not in the chart closed env list (_helpers.tpl:157); not renderable by the chart today [V] (OI-06) |
| RKS-06 | `STUDIO_RUNNER_PORT` | 181 | RECHECK-AT-G9 | BEHAVIOUR | SEMANTIC: the one TLS listener port (guided port folds into it); probe.ts also reads it |
| RKS-07 | `STUDIO_RUNNER_HOST` | 182 | RECHECK-AT-G9 | BEHAVIOUR | SEMANTIC: the one TLS listener host (guided host folds into it) |
| RKS-08 | `STUDIO_RUNNER_POOL_SIZE` | 183 | CANDIDATE |  |  |
| RKS-09 | `STUDIO_RUNNER_INSTANCE_ID` | 184 | CANDIDATE |  | not in the chart closed env list (_helpers.tpl:157); not renderable by the chart today [V] (OI-06) |
| RKS-10 | `STUDIO_RUNNER_SERVICE_IDENTITY` | 185 | CANDIDATE |  |  |
| RKS-11 | `STUDIO_RUNNER_CALLBACK_IDENTITY` | 186 | CANDIDATE |  |  |
| RKS-12 | `STUDIO_RUNNER_CALLBACK_BASE_URL` | 187 | CANDIDATE |  |  |
| RKS-13 | `STUDIO_RUNNER_SCRATCH_DIR` | 188 | CANDIDATE |  |  |
| RKS-14 | `STUDIO_RUNNER_OBJECT_STORE_DIR` | 189 | CANDIDATE |  |  |
| RKS-15 | `STUDIO_RUNNER_OBJECT_STORE_PROVIDER` | 195 | CANDIDATE |  |  |
| RKS-16 | `STUDIO_RUNNER_OBJECT_STORE_ENDPOINT` | 201 | CANDIDATE |  |  |
| RKS-17 | `STUDIO_RUNNER_OBJECT_STORE_REGION` | 207 | CANDIDATE |  |  |
| RKS-18 | `STUDIO_RUNNER_OBJECT_STORE_BUCKET` | 213 | CANDIDATE |  |  |
| RKS-19 | `STUDIO_RUNNER_OBJECT_STORE_FORCE_PATH_STYLE` | 219 | CANDIDATE |  |  |
| RKS-20 | `STUDIO_RUNNER_OBJECT_STORE_CREDENTIALS_DIRECTORY` | 225 | CANDIDATE |  |  |
| RKS-21 | `STUDIO_RUNNER_OBJECT_STORE_ACCESS_KEY_ID_FILE` | 231 | CANDIDATE |  |  |
| RKS-22 | `STUDIO_RUNNER_OBJECT_STORE_SECRET_ACCESS_KEY_FILE` | 237 | CANDIDATE |  |  |
| RKS-23 | `STUDIO_RUNNER_OBJECT_STORE_MAX_ATTEMPTS` | 243 | CANDIDATE |  |  |
| RKS-24 | `STUDIO_RUNNER_OBJECT_STORE_WINDOW_MS` | 250 | CANDIDATE |  |  |
| RKS-25 | `STUDIO_RUNNER_OBJECT_STORE_BACKOFF_MS` | 257 | CANDIDATE |  |  |
| RKS-26 | `STUDIO_RUNNER_ADMISSION_TIMEOUT_MS` | 264 | CANDIDATE |  |  |
| RKS-27 | `STUDIO_RUNNER_TERMINAL_DELIVERY_WINDOW_MS` | 271 | CANDIDATE |  |  |
| RKS-28 | `STUDIO_RUNNER_TERMINAL_DELIVERY_MAX_ATTEMPTS` | 278 | CANDIDATE |  |  |
| RKS-29 | `STUDIO_RUNNER_TERMINAL_DELIVERY_BACKOFF_MS` | 285 | CANDIDATE |  |  |
| RKS-30 | `STUDIO_RUNNER_VALIDATE_TIMEOUT_MS` | 292 | CANDIDATE |  |  |
| RKS-31 | `STUDIO_RUNNER_MAX_REQUEST_BODY_BYTES` | 299 | CANDIDATE |  |  |
| RKS-32 | `STUDIO_RUNNER_RETRY_AFTER_SECONDS` | 306 | CANDIDATE |  |  |
| RKS-33 | `STUDIO_RUNNER_DRAIN_TIMEOUT_MS` | 313 | CANDIDATE |  |  |
| RKS-34 | `STUDIO_RUNNER_RECORDING_WIDTH` | 320 | CANDIDATE |  |  |
| RKS-35 | `STUDIO_RUNNER_RECORDING_HEIGHT` | 327 | CANDIDATE |  |  |
| RKS-36 | `STUDIO_RUNNER_BROWSER_LAUNCH_TIMEOUT_MS` | 334 | CANDIDATE |  |  |
| RKS-37 | `STUDIO_RUNNER_STEP_TIMEOUT_MS` | 341 | CANDIDATE |  |  |
| RKS-38 | `STUDIO_RUNNER_BROWSER_STOP_TIMEOUT_MS` | 348 | CANDIDATE |  |  |
| RKS-39 | `STUDIO_RUNNER_SEEK_ORIGIN_CALIBRATION_MS` | 357 | CANDIDATE |  |  |
| RKS-40 | `STUDIO_RUNNER_MAX_TOTAL_RUNTIME_MS` | 367 | CANDIDATE |  | ceiling 120000, STUDIO-OBS-015 ruling G (AC-5 addition D-3) |
| RKS-41 | `STUDIO_RUNNER_MAX_STEP_TIMEOUT_MS` | 379 | CANDIDATE |  | ceiling 120000, STUDIO-OBS-015 ruling G (AC-5 addition D-3) |
| RKS-42 | `STUDIO_RUNNER_MAX_REPORT_STEPS` | 386 | CANDIDATE |  |  |
| RKS-43 | `STUDIO_RUNNER_MAX_REPORT_LOG_ENTRIES` | 393 | CANDIDATE |  |  |
| RKS-44 | `STUDIO_RUNNER_MAX_REPORT_LOG_ENTRY_LENGTH` | 400 | CANDIDATE |  |  |
| RKS-45 | `STUDIO_RUNNER_MAX_REPORT_BODY_BYTES` | 407 | CANDIDATE |  |  |
| RKS-00 | `ACCEPTED_KEYS set (45 keys today)` | 175-415 | CHANGES-IN-009 | KEY | ADD: STUDIO_RUNNER_GUIDED_ENABLED plus the guided keys from the 13 mounted fields (host/port merge into HOST/PORT) and TLS file-path keys; names fixed by drop D1.0; no capacity key, no policy-hash key |

**Guided worker mounted configuration (14) — all removed or renamed by the fold:**

| Id | Surface | Anchor | Expected change |
|---|---|---|---|
| RKG-00 | STUDIO_GUIDED_CONFIG_FILE (env; path of the guided mounted JSON) | studio-runner/src/run/guidedMain.ts:26 | REMOVE: the mounted-file parser and this variable are deleted; D1 grep for STUDIO_GUIDED_CONFIG_FILE = 0 |
| RKG-01 | guided mounted field "workerId" | studio-runner/src/run/guidedConfig.ts:14 | RENAME: becomes a named STUDIO_RUNNER_* key (name from D1.0) |
| RKG-02 | guided mounted field "host" | studio-runner/src/run/guidedConfig.ts:14 | MERGE: becomes the one listener host/port (STUDIO_RUNNER_HOST/PORT) |
| RKG-03 | guided mounted field "port" | studio-runner/src/run/guidedConfig.ts:14 | MERGE: becomes the one listener host/port (STUDIO_RUNNER_HOST/PORT) |
| RKG-04 | guided mounted field "journalDirectory" | studio-runner/src/run/guidedConfig.ts:14 | RENAME: becomes a named STUDIO_RUNNER_* key (name from D1.0) |
| RKG-05 | guided mounted field "tlsKeyFile" | studio-runner/src/run/guidedConfig.ts:14 | RENAME: becomes a STUDIO_RUNNER_* file-path key mounted from a Kubernetes Secret (name from D1.0) |
| RKG-06 | guided mounted field "tlsCertFile" | studio-runner/src/run/guidedConfig.ts:14 | RENAME: becomes a STUDIO_RUNNER_* file-path key mounted from a Kubernetes Secret (name from D1.0) |
| RKG-07 | guided mounted field "tlsCaFile" | studio-runner/src/run/guidedConfig.ts:14 | RENAME: becomes a STUDIO_RUNNER_* file-path key mounted from a Kubernetes Secret (name from D1.0) |
| RKG-08 | guided mounted field "controllerIssuer" | studio-runner/src/run/guidedConfig.ts:14 | RENAME: becomes a named STUDIO_RUNNER_* key (name from D1.0) |
| RKG-09 | guided mounted field "controllerSubject" | studio-runner/src/run/guidedConfig.ts:14 | RENAME: becomes a named STUDIO_RUNNER_* key (name from D1.0) |
| RKG-10 | guided mounted field "controllerPublicKeyFile" | studio-runner/src/run/guidedConfig.ts:14 | RENAME: becomes a STUDIO_RUNNER_* file-path key mounted from a Kubernetes Secret (name from D1.0) |
| RKG-11 | guided mounted field "controllerCertificateFingerprint256" | studio-runner/src/run/guidedConfig.ts:14 | RENAME: becomes a named STUDIO_RUNNER_* key (name from D1.0) |
| RKG-12 | guided mounted field "callbackBaseUrl" | studio-runner/src/run/guidedConfig.ts:14 | RENAME: guided callback base stays its own https-only STUDIO_RUNNER_* key (replay CALLBACK_BASE_URL unchanged) |
| RKG-13 | guided mounted field "callbackTokenFile" | studio-runner/src/run/guidedConfig.ts:14 | RENAME: becomes a STUDIO_RUNNER_* file-path key mounted from a Kubernetes Secret (name from D1.0) |

**Runner process surfaces (8):**

| Id | Surface | Anchor | Status | 009 | Expected change / note |
|---|---|---|---|---|---|
| RKO-01 | Dockerfile CMD ["node","dist/main.js"] | studio-runner/Dockerfile:61 | CHANGES-IN-009 | VALUE | CHANGE: CMD ["sh","-c","ulimit -c 0 && exec node dist/main.js"]; drain property re-recorded |
| RKO-02 | package.json script "start": "node dist/main.js" | studio-runner/package.json:18 | CANDIDATE |  |  |
| RKO-03 | package.json script "start:guided": "node dist/run/guidedMain.js" | studio-runner/package.json:30 | CHANGES-IN-009 | KEY | REMOVE (one entrypoint) |
| RKO-04 | run/guidedMain.ts + run/guidedConfig.ts + run/guidedShutdown.ts (guided entry files) | studio-runner/src/run/guidedMain.ts:1-42; studio-runner/src/run/guidedConfig.ts:1-27 | CHANGES-IN-009 | KEY | REMOVE/FOLD (guidedShutdown folds into the one drain) |
| RKO-05 | probe.ts reads STUDIO_RUNNER_PORT and STUDIO_RUNNER_SERVICE_IDENTITY (exec probe node dist/probe.js) | studio-runner/src/probe.ts:25-26 | RECHECK-AT-G9 | BEHAVIOUR | TRANSPORT: probe speaks TLS presenting the runner certificate; Helm probe command unchanged |
| RKO-06 | debug-env refusal (DEBUG, PWDEBUG, NODE_DEBUG, NODE_OPTIONS -> CONFIGURATION_DENIED) | studio-runner/src/guided/transport.ts:69; studio-runner/src/run/guidedMain.ts:20; studio-runner/src/run/browser.ts:537 | CANDIDATE |  | kept first in the folded startup order (A2.5) |
| RKO-07 | PLAYWRIGHT_BROWSERS_PATH passthrough to observed runner support | studio-runner/src/server/application.ts:118 | CANDIDATE |  |  |
| RKO-08 | TMPDIR (guided browser scratch, recording scratch) | studio-runner/src/run/browser.ts:544; studio-runner/src/run/recordingScratch.ts:56 | CANDIDATE |  |  |

### 2.9 Chart

**Templates (9):**

| Id | Template | sha256 (prefix) | Status | 009 | Expected change |
|---|---|---|---|---|---|
| CHT-01 | `templates/studio-runner-deployment.yaml` | `fbafd93c01724d2f` | CHANGES-IN-009 | EDIT | EDIT by 009 lane D2 (fold, guard, TLS mounts, dumps, SIEM) |
| CHT-02 | `templates/studio-runner-service.yaml` | `f9e7ee6915f5e368` | CHANGES-IN-009 | EDIT | EDIT by 009 lane D2 (fold, guard, TLS mounts, dumps, SIEM) |
| CHT-03 | `templates/studio-runner-networkpolicy.yaml` | `3ea14acb6c3639ae` | CHANGES-IN-009 | EDIT | EDIT by 009 lane D2 (fold, guard, TLS mounts, dumps, SIEM) |
| CHT-04 | `templates/studio-runner-scaledobject.yaml` | `11bd0472999a2adf` | CHANGES-IN-009 | EDIT | EDIT by 009 lane D2 (fold, guard, TLS mounts, dumps, SIEM) |
| CHT-05 | `templates/studio-object-store-pvc.yaml` | `46c3ea74c9abe703` | CANDIDATE |  |  |
| CHT-06 | `templates/studio-sse-ingress.yaml` | `df2be610db0ca398` | CANDIDATE |  |  |
| CHT-07 | `templates/deployment.yaml (Studio env block, e.g. :112-250, :454-471)` | `a1a8389c462e6fbd` | CHANGES-IN-009 | EDIT | EDIT by 009 lane D2 (fold, guard, TLS mounts, dumps, SIEM) |
| CHT-08 | `templates/configmap.yaml (:65, :76-81 Studio data)` | `6cce5ae1b5130289` | CHANGES-IN-009 | EDIT | EDIT by 009 lane D2 (fold, guard, TLS mounts, dumps, SIEM) |
| CHT-09 | `templates/_helpers.tpl:157 put-checks.studioRunner.acceptedEnvKeys (36 names) and :167-180 env renderer` | `567a2486e9464e22` | CHANGES-IN-009 | EDIT | EDIT likely [I]: new guided/TLS keys must join the closed list to be renderable; _helpers.tpl is not in D2.writes but helm-chart/** is D2 single-owner |

**Chart-rendered names not in `application.yml` or `KEY_SPECS` (3):**

| Id | Name | Anchor | Note |
|---|---|---|---|
| CHN-01 | `CHECKS_SOURCES_UI_TEST` | helm-chart/put-checks/templates/deployment.yaml:25 | Studio source switch env alias |
| CHN-02 | `STUDIO_OBJECT_STORE_LIFECYCLE` | helm-chart/put-checks/templates/configmap.yaml:80 | ConfigMap data; no in-repo reader, asserted by chart.test.ts:930,968 [V] |
| CHN-03 | `STUDIO_OBJECT_STORE_KEY_PREFIX` | helm-chart/put-checks/templates/configmap.yaml:81 | ConfigMap data; no in-repo reader, asserted by chart.test.ts:932 [V] |

**`values.yaml` Studio leaves (123).** Anchor `helm-chart/put-checks/values.yaml:<line>`. Owner @devops with @dev (single owner = 009 lane D2). Local proof: deployment tier. Deployed: owed/unrun, owner Platform/SRE + @devops (U4).

| Id | Key | Line | Value | Status | 009 |
|---|---|---|---|---|---|
| CHV-001 | `backend.env.JAVA_OPTS` | 88 | `"-Xms256m -Xmx512m -XX:+UseG1GC -XX:MaxMetaspaceSize=192m -XX:+ExitOnOutOfMemoryError"` | CHANGES-IN-009 | VALUE |
| CHV-002 | `backend.configOverrides.checks.sources.UI_TEST` | 163 | `"true"` | CANDIDATE |  |
| CHV-003 | `worker.env.JAVA_OPTS` | 239 | `"-Xms512m -Xmx768m -XX:+UseG1GC -XX:MaxMetaspaceSize=192m -XX:+ExitOnOutOfMemoryError"` | CHANGES-IN-009 | VALUE |
| CHV-004 | `frontend.env.VITE_ENABLE_STUDIO` | 345 | `"true"` | CANDIDATE |  |
| CHV-005 | `studioRunner.enabled` | 366 | `false` | CANDIDATE |  |
| CHV-006 | `studioRunner.image.repository` | 372 | `registry.citi.com/put/checks-studio-runner` | CANDIDATE |  |
| CHV-007 | `studioRunner.image.tag` | 373 | `""` | CANDIDATE |  |
| CHV-008 | `studioRunner.image.pullPolicy` | 374 | `IfNotPresent` | CANDIDATE |  |
| CHV-009 | `studioRunner.replicaCount` | 382 | `2` | RECHECK-AT-G9 | BEHAVIOUR |
| CHV-010 | `studioRunner.autoscaling.enabled` | 389 | `false` | RECHECK-AT-G9 | BEHAVIOUR |
| CHV-011 | `studioRunner.autoscaling.minReplicaCount` | 392 | `2` | RECHECK-AT-G9 | BEHAVIOUR |
| CHV-012 | `studioRunner.autoscaling.maxReplicaCount` | 393 | `4` | RECHECK-AT-G9 | BEHAVIOUR |
| CHV-013 | `studioRunner.autoscaling.pollingIntervalSeconds` | 394 | `15` | CANDIDATE |  |
| CHV-014 | `studioRunner.autoscaling.cooldownPeriodSeconds` | 400 | `300` | CANDIDATE |  |
| CHV-015 | `studioRunner.autoscaling.targetBacklogPerPod` | 402 | `"1"` | CANDIDATE |  |
| CHV-016 | `studioRunner.autoscaling.prometheus.serverAddress` | 405 | `""` | CANDIDATE |  |
| CHV-017 | `studioRunner.autoscaling.prometheus.query` | 409 | `'sum(max by (state) (studio_dispatch_backlog{state=~"QUEUED\|CLAIMED"}))'` | CANDIDATE |  |
| CHV-018 | `studioRunner.podDisruptionBudget.enabled` | 414 | `true` | CANDIDATE |  |
| CHV-019 | `studioRunner.podDisruptionBudget.maxUnavailable` | 415 | `1` | CANDIDATE |  |
| CHV-020 | `studioRunner.service.type` | 418 | `ClusterIP` | CANDIDATE |  |
| CHV-021 | `studioRunner.service.port` | 423 | `8090` | RECHECK-AT-G9 | BEHAVIOUR |
| CHV-022 | `studioRunner.shareProcessNamespace` | 442 | `true` | RECHECK-AT-G9 | BEHAVIOUR |
| CHV-023 | `studioRunner.serviceAccount.create` | 445 | `true` | CANDIDATE |  |
| CHV-024 | `studioRunner.serviceAccount.name` | 446 | `""` | CANDIDATE |  |
| CHV-025 | `studioRunner.serviceAccount.automountServiceAccountToken` | 448 | `false` | CANDIDATE |  |
| CHV-026 | `studioRunner.resources.requests.cpu` | 452 | `500m` | CHANGES-IN-009 | VALUE |
| CHV-027 | `studioRunner.resources.requests.memory` | 453 | `1Gi` | CHANGES-IN-009 | VALUE |
| CHV-028 | `studioRunner.resources.limits.cpu` | 455 | `"2"` | CHANGES-IN-009 | VALUE |
| CHV-029 | `studioRunner.resources.limits.memory` | 456 | `2Gi` | CHANGES-IN-009 | VALUE |
| CHV-030 | `studioRunner.seccompProfile.type` | 466 | `RuntimeDefault` | CANDIDATE |  |
| CHV-031 | `studioRunner.podSecurityContext.runAsNonRoot` | 469 | `true` | CANDIDATE |  |
| CHV-032 | `studioRunner.podSecurityContext.runAsUser` | 472 | `1001` | CANDIDATE |  |
| CHV-033 | `studioRunner.podSecurityContext.runAsGroup` | 473 | `1001` | CANDIDATE |  |
| CHV-034 | `studioRunner.podSecurityContext.fsGroup` | 474 | `1001` | CANDIDATE |  |
| CHV-035 | `studioRunner.securityContext.allowPrivilegeEscalation` | 477 | `false` | CANDIDATE |  |
| CHV-036 | `studioRunner.securityContext.readOnlyRootFilesystem` | 481 | `true` | CANDIDATE |  |
| CHV-037 | `studioRunner.securityContext.capabilities.drop` | 483 | `["ALL"]` | CANDIDATE |  |
| CHV-038 | `studioRunner.scratch.mountPath` | 496 | `/scratch` | CANDIDATE |  |
| CHV-039 | `studioRunner.scratch.directory` | 498 | `studio-runner` | CANDIDATE |  |
| CHV-040 | `studioRunner.scratch.sizeLimit` | 499 | `4Gi` | CANDIDATE |  |
| CHV-041 | `studioRunner.devShm.sizeLimit` | 503 | `1Gi` | CANDIDATE |  |
| CHV-042 | `studioRunner.drain.preStopSleepSeconds` | 508 | `5` | CANDIDATE |  |
| CHV-043 | `studioRunner.drain.extraGraceSeconds` | 511 | `30` | CANDIDATE |  |
| CHV-044 | `studioRunner.probes.readinessPath` | 517 | `/ready` | RECHECK-AT-G9 | BEHAVIOUR |
| CHV-045 | `studioRunner.probes.livenessPath` | 518 | `/health` | RECHECK-AT-G9 | BEHAVIOUR |
| CHV-046 | `studioRunner.probes.initialDelaySeconds` | 519 | `10` | RECHECK-AT-G9 | BEHAVIOUR |
| CHV-047 | `studioRunner.probes.periodSeconds` | 520 | `5` | RECHECK-AT-G9 | BEHAVIOUR |
| CHV-048 | `studioRunner.identity.secretName` | 530 | `checks-studio-runner-identity` | RECHECK-AT-G9 | ADJACENT |
| CHV-049 | `studioRunner.identity.serviceIdentityKey` | 531 | `serviceIdentity` | RECHECK-AT-G9 | ADJACENT |
| CHV-050 | `studioRunner.identity.callbackIdentityKey` | 532 | `callbackIdentity` | RECHECK-AT-G9 | ADJACENT |
| CHV-051 | `studioRunner.callbackBaseUrl` | 537 | `""` | CANDIDATE |  |
| CHV-052 | `studioRunner.objectStore.credentialsSecret` | 547 | `checks-studio-runner-object-store` | CANDIDATE |  |
| CHV-053 | `studioRunner.objectStore.mountPath` | 548 | `/etc/studio/object-store` | CANDIDATE |  |
| CHV-054 | `studioRunner.objectStore.keys` | 551 | `[list]` | CANDIDATE |  |
| CHV-055 | `studioRunner.objectStore.keyPrefix` | 556 | `studio/` | CANDIDATE |  |
| CHV-056 | `studioRunner.networkPolicy.enabled` | 559 | `true` | CANDIDATE |  |
| CHV-057 | `studioRunner.networkPolicy.dnsPort` | 563 | `53` | CANDIDATE |  |
| CHV-058 | `studioRunner.networkPolicy.objectStorePort` | 564 | `443` | CANDIDATE |  |
| CHV-059 | `studioRunner.networkPolicy.approvedTargets` | 567 | `[]` | CANDIDATE |  |
| CHV-060 | `studioRunner.runnerEnv.STUDIO_RUNNER_POOL_SIZE` | 576 | `"1"` | CANDIDATE |  |
| CHV-061 | `studioRunner.runnerEnv.STUDIO_RUNNER_MAX_TOTAL_RUNTIME_MS` | 577 | `"120000"` | CANDIDATE |  |
| CHV-062 | `studioRunner.runnerEnv.STUDIO_RUNNER_MAX_STEP_TIMEOUT_MS` | 579 | `"120000"` | CANDIDATE |  |
| CHV-063 | `studioRunner.runnerEnv.STUDIO_RUNNER_BROWSER_STOP_TIMEOUT_MS` | 588 | `"15000"` | CANDIDATE |  |
| CHV-064 | `studioRunner.runnerEnv.STUDIO_RUNNER_TERMINAL_DELIVERY_WINDOW_MS` | 589 | `"30000"` | CANDIDATE |  |
| CHV-065 | `studioRunner.runnerEnv.STUDIO_RUNNER_OBJECT_STORE_WINDOW_MS` | 590 | `"15000"` | CANDIDATE |  |
| CHV-066 | `studioRunner.runnerEnv.STUDIO_RUNNER_DRAIN_TIMEOUT_MS` | 591 | `"150000"` | CANDIDATE |  |
| CHV-067 | `studioRunner.runnerEnv.STUDIO_RUNNER_RECORDING_WIDTH` | 592 | `"1280"` | CANDIDATE |  |
| CHV-068 | `studioRunner.runnerEnv.STUDIO_RUNNER_RECORDING_HEIGHT` | 593 | `"720"` | CANDIDATE |  |
| CHV-069 | `studioRunner.runnerEnv.STUDIO_RUNNER_SEEK_ORIGIN_CALIBRATION_MS` | 597 | `"0"` | CANDIDATE |  |
| CHV-070 | `studioRunner.podAnnotations` | 599 | `{}` | CANDIDATE |  |
| CHV-071 | `studioRunner.nodeSelector` | 600 | `{}` | CANDIDATE |  |
| CHV-072 | `studioRunner.tolerations` | 601 | `[]` | CANDIDATE |  |
| CHV-073 | `studioRunner.affinity` | 602 | `{}` | CANDIDATE |  |
| CHV-074 | `objectStore.provider` | 612 | `local` | CANDIDATE |  |
| CHV-075 | `objectStore.endpoint` | 613 | `""` | CANDIDATE |  |
| CHV-076 | `objectStore.region` | 614 | `us-east-1` | CANDIDATE |  |
| CHV-077 | `objectStore.bucket` | 615 | `put-checks-studio-evidence` | CANDIDATE |  |
| CHV-078 | `objectStore.pathStyleAccess` | 616 | `true` | CANDIDATE |  |
| CHV-079 | `objectStore.localDirectory` | 619 | `/var/lib/studio-objects` | CANDIDATE |  |
| CHV-080 | `objectStore.local.createClaim` | 621 | `true` | CANDIDATE |  |
| CHV-081 | `objectStore.local.existingClaim` | 622 | `""` | CANDIDATE |  |
| CHV-082 | `objectStore.local.storageClassName` | 623 | `""` | CANDIDATE |  |
| CHV-083 | `objectStore.local.accessModes` | 624 | `[list]` | CANDIDATE |  |
| CHV-084 | `objectStore.local.size` | 626 | `10Gi` | CANDIDATE |  |
| CHV-085 | `objectStore.connectTimeout` | 627 | `2s` | CANDIDATE |  |
| CHV-086 | `objectStore.requestTimeout` | 628 | `10s` | CANDIDATE |  |
| CHV-087 | `objectStore.credentialsSecret` | 629 | `checks-api-object-store` | CANDIDATE |  |
| CHV-088 | `objectStore.mountPath` | 630 | `/etc/studio/object-store` | CANDIDATE |  |
| CHV-089 | `objectStore.keys` | 631 | `[list]` | CANDIDATE |  |
| CHV-090 | `objectStore.retention` | 637 | `30d` | CANDIDATE |  |
| CHV-091 | `studioVault.provider` | 643 | `none` | CANDIDATE |  |
| CHV-092 | `studioVault.address` | 644 | `""` | CANDIDATE |  |
| CHV-093 | `studioVault.namespace` | 645 | `""` | CANDIDATE |  |
| CHV-094 | `studioVault.mount` | 646 | `secret` | CANDIDATE |  |
| CHV-095 | `studioVault.pathTemplate` | 647 | `"studio/{csiId}/{environment}/{testId}/{kind}/{referenceName}"` | CANDIDATE |  |
| CHV-096 | `studioVault.valueKey` | 648 | `value` | CANDIDATE |  |
| CHV-097 | `studioVault.tokenSecret` | 649 | `checks-studio-vault-token` | CANDIDATE |  |
| CHV-098 | `studioVault.tokenKey` | 650 | `token` | CANDIDATE |  |
| CHV-099 | `studioVault.tokenMountPath` | 651 | `/etc/studio/vault` | CANDIDATE |  |
| CHV-100 | `studioVault.connectTimeout` | 652 | `2s` | CANDIDATE |  |
| CHV-101 | `studioVault.requestTimeout` | 653 | `5s` | CANDIDATE |  |
| CHV-102 | `studioVault.maxResponseBytes` | 654 | `65536` | CANDIDATE |  |
| CHV-103 | `studioGateway.environment` | 660 | `production` | CANDIDATE |  |
| CHV-104 | `studioGateway.provider` | 661 | `vertex` | CANDIDATE |  |
| CHV-105 | `studioGateway.endpoint` | 662 | `""` | CANDIDATE |  |
| CHV-106 | `studioGateway.project` | 663 | `""` | CANDIDATE |  |
| CHV-107 | `studioGateway.location` | 664 | `""` | CANDIDATE |  |
| CHV-108 | `studioGateway.model` | 665 | `gemini-3.8-flash` | CANDIDATE |  |
| CHV-109 | `studioGateway.vertexConfigMap.name` | 670 | `checks-studio-vertex` | CANDIDATE |  |
| CHV-110 | `studioGateway.vertexConfigMap.endpointKey` | 671 | `endpoint` | CANDIDATE |  |
| CHV-111 | `studioGateway.vertexConfigMap.projectKey` | 672 | `project` | CANDIDATE |  |
| CHV-112 | `studioGateway.vertexConfigMap.locationKey` | 673 | `location` | CANDIDATE |  |
| CHV-113 | `studioGateway.credentialsMode` | 674 | `application-default` | CANDIDATE |  |
| CHV-114 | `studioGateway.credentialsSecret` | 675 | `""` | CANDIDATE |  |
| CHV-115 | `studioGateway.credentialsKey` | 676 | `service-account.json` | CANDIDATE |  |
| CHV-116 | `studioGateway.credentialsMountPath` | 677 | `/etc/studio/gateway` | CANDIDATE |  |
| CHV-117 | `studioSse.heartbeatSeconds` | 716 | `15` | CANDIDATE |  |
| CHV-118 | `studioSse.lifetimeSeconds` | 719 | `60` | CANDIDATE |  |
| CHV-119 | `studioSse.idleTimeoutMarginSeconds` | 723 | `60` | CANDIDATE |  |
| CHV-120 | `studioSse.ingress.enabled` | 729 | `true` | CANDIDATE |  |
| CHV-121 | `studioSse.ingress.extraAnnotations` | 745 | `{}` | CANDIDATE |  |
| CHV-122 | `studioExecution.enabled` | 768 | `true` | CANDIDATE |  |
| CHV-123 | `studioExecution.dispatcherEnabled` | 775 | `true` | CANDIDATE |  |

**Environment values files (62):**

| Id | Key [file] | Line | Value | Status | 009 |
|---|---|---|---|---|---|
| CHE-01 | `backend.env.JAVA_OPTS [values-dev]` | 23 | `"-Xms256m -Xmx512m -XX:+UseG1GC -XX:MaxMetaspaceSize=192m"` | CHANGES-IN-009 | VALUE |
| CHE-02 | `backend.configOverrides.checks.sources.UI_TEST [values-dev]` | 37 | `"false"` | CANDIDATE |  |
| CHE-03 | `studioVault.provider [values-dev]` | 45 | `none` | CANDIDATE |  |
| CHE-04 | `studioGateway.environment [values-dev]` | 50 | `local` | CANDIDATE |  |
| CHE-05 | `studioGateway.provider [values-dev]` | 51 | `disabled` | CANDIDATE |  |
| CHE-06 | `studioGateway.vertexConfigMap.name [values-dev]` | 53 | `""` | CANDIDATE |  |
| CHE-07 | `worker.env.JAVA_OPTS [values-dev]` | 71 | `"-Xms256m -Xmx512m -XX:+UseG1GC -XX:MaxMetaspaceSize=192m"` | CHANGES-IN-009 | VALUE |
| CHE-08 | `worker.configOverrides.checks.executor.source-limits.UI_TEST [values-dev]` | 91 | `"5"` | CANDIDATE |  |
| CHE-09 | `frontend.env.VITE_ENABLE_STUDIO [values-dev]` | 109 | `"true"` | CANDIDATE |  |
| CHE-10 | `studioRunner.enabled [values-dev]` | 117 | `false` | CANDIDATE |  |
| CHE-11 | `studioRunner.replicaCount [values-dev]` | 118 | `2` | RECHECK-AT-G9 | BEHAVIOUR |
| CHE-12 | `studioRunner.resources.requests.cpu [values-dev]` | 121 | `250m` | CHANGES-IN-009 | VALUE |
| CHE-13 | `studioRunner.resources.requests.memory [values-dev]` | 122 | `512Mi` | CHANGES-IN-009 | VALUE |
| CHE-14 | `studioRunner.resources.limits.cpu [values-dev]` | 124 | `"1"` | CHANGES-IN-009 | VALUE |
| CHE-15 | `studioRunner.resources.limits.memory [values-dev]` | 125 | `1Gi` | CHANGES-IN-009 | VALUE |
| CHE-16 | `studioRunner.devShm.sizeLimit [values-dev]` | 127 | `512Mi` | CANDIDATE |  |
| CHE-17 | `studioRunner.scratch.sizeLimit [values-dev]` | 129 | `2Gi` | CANDIDATE |  |
| CHE-18 | `studioRunner.seccompProfile.type [values-dev]` | 134 | `RuntimeDefault` | CANDIDATE |  |
| CHE-19 | `backend.env.JAVA_OPTS [values-uat]` | 24 | `"-Xms256m -Xmx512m -XX:+UseG1GC -XX:MaxMetaspaceSize=192m -XX:+ExitOnOutOfMemoryError"` | CHANGES-IN-009 | VALUE |
| CHE-20 | `backend.configOverrides.checks.sources.UI_TEST [values-uat]` | 86 | `"true"` | CANDIDATE |  |
| CHE-21 | `worker.env.JAVA_OPTS [values-uat]` | 102 | `"-Xms512m -Xmx768m -XX:+UseG1GC -XX:MaxMetaspaceSize=192m -XX:+ExitOnOutOfMemoryError"` | CHANGES-IN-009 | VALUE |
| CHE-22 | `worker.configOverrides.checks.executor.source-limits.UI_TEST [values-uat]` | 121 | `"10"` | CANDIDATE |  |
| CHE-23 | `frontend.env.VITE_ENABLE_STUDIO [values-uat]` | 141 | `"true"` | CANDIDATE |  |
| CHE-24 | `studioRunner.enabled [values-uat]` | 152 | `true` | CANDIDATE |  |
| CHE-25 | `studioRunner.replicaCount [values-uat]` | 153 | `2` | RECHECK-AT-G9 | BEHAVIOUR |
| CHE-26 | `studioRunner.resources.requests.cpu [values-uat]` | 156 | `500m` | CHANGES-IN-009 | VALUE |
| CHE-27 | `studioRunner.resources.requests.memory [values-uat]` | 157 | `1Gi` | CHANGES-IN-009 | VALUE |
| CHE-28 | `studioRunner.resources.limits.cpu [values-uat]` | 159 | `"2"` | CHANGES-IN-009 | VALUE |
| CHE-29 | `studioRunner.resources.limits.memory [values-uat]` | 160 | `2Gi` | CHANGES-IN-009 | VALUE |
| CHE-30 | `studioRunner.devShm.sizeLimit [values-uat]` | 162 | `1Gi` | CANDIDATE |  |
| CHE-31 | `studioRunner.scratch.sizeLimit [values-uat]` | 164 | `4Gi` | CANDIDATE |  |
| CHE-32 | `studioRunner.seccompProfile.type [values-uat]` | 166 | `RuntimeDefault` | CANDIDATE |  |
| CHE-33 | `studioRunner.callbackBaseUrl [values-uat]` | 167 | `""` | CANDIDATE |  |
| CHE-34 | `studioRunner.identity.secretName [values-uat]` | 169 | `checks-studio-runner-identity-uat` | RECHECK-AT-G9 | ADJACENT |
| CHE-35 | `studioRunner.objectStore.credentialsSecret [values-uat]` | 171 | `checks-studio-runner-object-store-uat` | CANDIDATE |  |
| CHE-36 | `objectStore.credentialsSecret [values-uat]` | 173 | `checks-api-object-store-uat` | CANDIDATE |  |
| CHE-37 | `studioGateway.environment [values-uat]` | 179 | `staging` | CANDIDATE |  |
| CHE-38 | `studioGateway.provider [values-uat]` | 180 | `vertex` | CANDIDATE |  |
| CHE-39 | `studioGateway.model [values-uat]` | 181 | `gemini-3.8-flash` | CANDIDATE |  |
| CHE-40 | `studioGateway.vertexConfigMap.name [values-uat]` | 183 | `checks-studio-vertex-uat` | CANDIDATE |  |
| CHE-41 | `backend.env.JAVA_OPTS [values-prod]` | 30 | `"-Xms512m -Xmx768m -XX:+UseG1GC -XX:MaxMetaspaceSize=192m -XX:+ExitOnOutOfMemoryError"` | CHANGES-IN-009 | VALUE |
| CHE-42 | `backend.configOverrides.checks.sources.UI_TEST [values-prod]` | 92 | `"true"` | CANDIDATE |  |
| CHE-43 | `worker.env.JAVA_OPTS [values-prod]` | 108 | `"-Xms768m -Xmx1024m -XX:+UseG1GC -XX:MaxMetaspaceSize=192m -XX:+ExitOnOutOfMemoryError"` | CHANGES-IN-009 | VALUE |
| CHE-44 | `worker.configOverrides.checks.executor.source-limits.UI_TEST [values-prod]` | 127 | `"25"` | CANDIDATE |  |
| CHE-45 | `frontend.env.VITE_ENABLE_STUDIO [values-prod]` | 155 | `"true"` | CANDIDATE |  |
| CHE-46 | `studioRunner.enabled [values-prod]` | 168 | `false` | CANDIDATE |  |
| CHE-47 | `studioRunner.replicaCount [values-prod]` | 169 | `2` | RECHECK-AT-G9 | BEHAVIOUR |
| CHE-48 | `studioRunner.resources.requests.cpu [values-prod]` | 172 | `"1"` | CHANGES-IN-009 | VALUE |
| CHE-49 | `studioRunner.resources.requests.memory [values-prod]` | 173 | `2Gi` | CHANGES-IN-009 | VALUE |
| CHE-50 | `studioRunner.resources.limits.cpu [values-prod]` | 175 | `"2"` | CHANGES-IN-009 | VALUE |
| CHE-51 | `studioRunner.resources.limits.memory [values-prod]` | 176 | `4Gi` | CHANGES-IN-009 | VALUE |
| CHE-52 | `studioRunner.devShm.sizeLimit [values-prod]` | 178 | `2Gi` | CANDIDATE |  |
| CHE-53 | `studioRunner.scratch.sizeLimit [values-prod]` | 180 | `8Gi` | CANDIDATE |  |
| CHE-54 | `studioRunner.seccompProfile.type [values-prod]` | 182 | `RuntimeDefault` | CANDIDATE |  |
| CHE-55 | `studioRunner.callbackBaseUrl [values-prod]` | 183 | `""` | CANDIDATE |  |
| CHE-56 | `studioRunner.identity.secretName [values-prod]` | 185 | `checks-studio-runner-identity-prod` | RECHECK-AT-G9 | ADJACENT |
| CHE-57 | `studioRunner.objectStore.credentialsSecret [values-prod]` | 187 | `checks-studio-runner-object-store-prod` | CANDIDATE |  |
| CHE-58 | `objectStore.credentialsSecret [values-prod]` | 189 | `checks-api-object-store-prod` | CANDIDATE |  |
| CHE-59 | `studioGateway.environment [values-prod]` | 195 | `production` | CANDIDATE |  |
| CHE-60 | `studioGateway.provider [values-prod]` | 196 | `vertex` | CANDIDATE |  |
| CHE-61 | `studioGateway.model [values-prod]` | 197 | `gemini-3.8-flash` | CANDIDATE |  |
| CHE-62 | `studioGateway.vertexConfigMap.name [values-prod]` | 199 | `checks-studio-vertex-prod` | CANDIDATE |  |

### 2.10 Schedules — Studio `@Scheduled` beans (8)

| Id | Bean (profile today) | Anchor | Status | 009 | Expected change / note |
|---|---|---|---|---|---|
| SCH-01 | SnapshotBroadcaster (SSE) (@Profile("!worker") :41) | sse/SnapshotBroadcaster.java:79 | CANDIDATE |  |  |
| SCH-02 | GuidedTranslationCoordinator (no @Profile [V]) | guided/translation/GuidedTranslationCoordinator.java:53; GuidedTranslationConfiguration.java:113-117 (@Bean) | RECHECK-AT-G9 | BEHAVIOUR | PROFILE: @Profile("!api \| worker") on the coordinator @Bean method |
| SCH-03 | GuidedObservationPruner (no @Profile [V]) | guided/retention/GuidedObservationPruner.java:48; GuidedRetentionConfiguration.java:15-18 (@Bean) | CANDIDATE |  | not named by A5; OI-07 |
| SCH-04 | GuidedSessionReaper (no @Profile [V]) | guided/session/GuidedSessionReaper.java:36 | RECHECK-AT-G9 | BEHAVIOUR | PROFILE: @Profile("!api \| worker") on the class |
| SCH-05 | StudioRecoveryScheduler (@Profile({"worker","local & !api"}) :21) | recovery/StudioRecoveryScheduler.java:39 | CANDIDATE |  |  |
| SCH-06 | SecretRevocationSweep (no @Profile; @Service :19 [V]) | secrets/SecretRevocationSweep.java:57 | CANDIDATE |  | not named by A5; OI-07 |
| SCH-07 | StudioDispatchMetrics (@Profile("worker") :42) | dispatch/StudioDispatchMetrics.java:79 | CANDIDATE |  |  |
| SCH-08 | StudioDispatchScheduler (@Profile({"worker","local & !api"}) :34) | dispatch/StudioDispatchScheduler.java:68 | CANDIDATE |  |  |

### 2.11 Runbook — `docs/runbooks/studio-guided-authoring.md` (read only; sha256 `9727657a…00855`)

**Existing sections (6):**

| Id | Section | Line | Status | Evidence |
|---|---|---|---|---|
| RBS-01 | title + scope paragraph | 1 | STALE | describes OBS-006 scope and an "account provider" sentence; AC-5 removes account-provider text |
| RBS-02 | ## Deployment prerequisites and privacy | 5 | STALE | "through V33", "V30-V32" do not exist (head V22) [V ls]; keys it names exist: studio.observed-replay.catalog-json/policies-json (application.yml:250-251), STUDIO_RUNNER_OBSERVED_* (config.ts:176-180), controller-token-file keys (application.yml:200-202) [V] |
| RBS-03 | ## Independent feature flags and clocks | 21 | STALE | says publication/replay "default false"; today both default true (application.yml:239, :245) [V]; "legacy replay" text predates the single path [I] |
| RBS-04 | ## Publication, reconnect and receipt access | 29 | PARTLY-LIVE | finalize route exists (openapi :1824) [V]; 008 L0 edited this file (git diff: 2 lines) [V]; "clears the old compile-request pointer" has no backing code (grep compile_request\|compileRequest backend/src/main = 0) [V] |
| RBS-05 | ## Staged V19 compatibility and rollback | 41 | STALE | backend/db/cutover absent; V33 absent [V]; 010 Dev Notes: replace with V1-V18 re-baseline + forward-only V19..head and the dev-DB recreation row |
| RBS-06 | ## Evidence requirements | 49 | PARTLY-LIVE | "account connectivity" wording predates secret login [I] |

**AC-5 rows T2 must write (18)** — source `STUDIO-OBS-010.story.md:82-98` unless noted:

| Id | Row | Implementing evidence to cite | External part |
|---|---|---|---|
| RBR-01 | Secret provisioning per CSI/environment/test with allowedOrigins; R1-2 "an allowedOrigins entry asserts the whole origin's content is trusted" | STUDIO-OBS-007 | owed/unrun, owner PUT Core / BFF (ED-02; U5) |
| RBR-02 | Rotation (artifact hash unchanged, audit versions differ) | STUDIO-OBS-007 | owed/unrun, owner PUT Core / BFF (ED-02; U5) |
| RBR-03 | Revocation incl. the mid-run bound (one control poll + one in-flight step) | STUDIO-OBS-007 AC-13 (local); 009 AC-11 live half | owed/unrun, owner Platform/SRE + @devops (U4: deployed stack, internal image) (live revocation within one real control poll) |
| RBR-04 | Audit retention window (design §8 Q3 default) | secret-login design §8 Q3 | owed/unrun, owner Platform/SRE (SIEM sink and Q3 retention; U6) |
| RBR-05 | Single 4096-character bound | STUDIO-OBS-007 AC-12 (StudioSecretsService.java:60 MAX_VALUE_LENGTH = 4096 [V]) | n/a (no deployed counterpart) |
| RBR-06 | Multi-password and non-password limit (unsupported at GA, no fallback) | ADR-SC-005 defaults "Secrets" | n/a (no deployed counterpart) |
| RBR-07 | Heap/core-dump controls (I-B7) | 009 AC-4 (lane D2, A6) | backend core rlimit: owed/unrun, owner Platform/SRE (ruling.md §1 A6) |
| RBR-08 | Vault least-privilege policy and KV v2 history residual (I-C9); policy must also allow create + metadata list | 009 AC-4; QA t0-qa-20261017.md:30 (P3) | owed/unrun, owner PUT Core / BFF (ED-02; U5) (dev-Vault policy test; local container is REHEARSAL_ONLY_NON_CREDITING) |
| RBR-09 | mTLS/TLS chain and client-certificate rotation inputs (SEC-4, G-2) | 009 AC-2/AC-3 (lanes D1, D2, D3) | owed/unrun, owner Platform/SRE + @devops (G-1 verified in a shared environment; U4) |
| RBR-10 | Dev-database recreation after the D-B re-baseline (command from OBS-012A evidence) | STUDIO-OBS-012A evidence (path to cite at T2) | owed/unrun, owner user / Platform-SRE (U11: D-B confirmation, dev-DB recreation) |
| RBR-11 | Governed read/discovery policy administration (OBS-014), incl. the R-2 interim (learning governed, replay TrustedPolicy) and approver groups (default none -> every approval 403) | STUDIO-OBS-014; application.yml:217-220; openapi :2196-2198 | approver-group provisioning per environment: owner not named in sources (yml comment says "until OBS-010 provisions one") -> OI-12 |
| RBR-12 | Incremental re-learn semantics for operators ("Learn again" from the first changed step, D-D) | STUDIO-OBS-015 | n/a (no deployed counterpart) |
| RBR-13 | Gates G-1 / G-2 / G-3 | 009 AC-2, AC-3, AC-6 | owed/unrun, owner Platform/SRE + @devops (G-1 verified in a shared environment; U4); G-3 production authorization sources (GA C-2): owed/unrun, owner PUT Core / BFF (ED-02; U5) |
| RBR-14 | Clock synchronisation: runner, API (every replica and worker) and DB hosts NTP-synced; symptom 409 AUTHORIZATION_EXPIRED from observedReplay.ts:443 [V]; no tolerance/window remedy | 010 AC-5 addition (R9-OBS-1/2) | bound owed, owner Platform/SRE |
| RBR-15 | R8.2 d stuck-row alert specification | 009 AC-11 d (lane D2, A15) | owed/unrun, owner @devops (monitoring stack not named) |
| RBR-16 | A2.6 disclosure: guided mode only on a one-replica runner Deployment | 009 AC-1 note A2.6 (root R1 provisional, U20) | user decision U20 open (root) |
| RBR-17 | Neutral recording wording for unavailable/expired guided evidence (RECORDING-RUNBOOK-COPY) | 010 carried follow-up; OBS-008 copy | n/a (no deployed counterpart) |
| RBR-18 | Dated "Live surface" list (this skeleton, finalized at T2) | 010 AC-5 + D-3 | per-row: see entries |

### 2.12 Planned by 009 (absent today) and negative entries

| Id | Surface | Source | Measured today |
|---|---|---|---|
| P09-01 | STUDIO_RUNNER_GUIDED_ENABLED (boolean, default false; guided keys required when true, refused when false) | ruling.md §1 A2.2 | grep GUIDED_ENABLED studio-runner/src = 0 [V] |
| P09-02 | Guided STUDIO_RUNNER_* keys from the 13 mounted fields (names TBD by D1.0) | ruling.md §1 A2.2, A2.7 | [I] names unknown |
| P09-03 | Runner TLS listener key/cert/CA file-path keys (names TBD by D1.0) | ruling.md §1 A2.2, A3 | [I] names unknown |
| P09-04 | Backend runner TLS properties: key-store, trust-store, password-file (StudioRunnerTls; names TBD by D3.0) | ruling.md §1 A4 | [I] names unknown |
| P09-05 | class dispatch/StudioRunnerTls.java | implementation-plan.md §3; ruling.md §1 A4 | find backend/src -name StudioRunnerTls* = 0 [V] |
| P09-06 | test support RunnerProcessHarness.java | implementation-plan.md §3; lanes I.0 | find = 0 [V] |
| P09-07 | corun/ObservedCoRunIT.java | implementation-plan.md §3; ruling.md §1 A16 | find = 0 [V] |
| P09-08 | Gradle task verifyRunnerDist | implementation-plan.md §3; ruling.md §1 A14 | grep verifyRunnerDist backend/build.gradle.kts = 0 [V] |
| P09-09 | Chart guided-enable value + render guard (replicaCount == 1, autoscaling off) | ruling.md §1 A2.6; 009 AC-1 note A2.6 | [I] value name unknown |
| P09-10 | Chart mTLS chain secret mounts for both pods | implementation-plan.md §2 D2 | [I] |
| P09-11 | JVM flags -XX:-HeapDumpOnOutOfMemoryError -XX:-CreateCoredumpOnCrash in backend/worker JAVA_OPTS (all values files) | ruling.md §1 A6 | grep in helm-chart = 0 [V] |
| P09-12 | SIEM sink reference in chart values | 009 AC-5; implementation-plan.md §2 D2 | [I] name unknown; live sink owed/unrun, owner Platform/SRE (SIEM sink and Q3 retention; U6) |
| P09-13 | V23 migration (only if @data-engineer rules it AND U14 confirms a non-owner runtime role; or if ADJ-1 option (a) needs SQL) | lanes.json w0Refold DE; ruling.md §2 C1 | head is V22 [V]; default: none |

| Id | Must not exist / must refuse | Anchor | Source | 009 |
|---|---|---|---|---|
| NEG-01 | No guided capacity key: capacity stays the code constant 1 | studio-runner/src/guided/transport.ts:70 | ruling.md §1 A2.3 (withdrew the 2026-10-16 key) |  |
| NEG-02 | No runner policy-hash key: the governed policy hash stays context-bound | studio-runner/src/run/guidedConfig.ts:1-5,22-23 (mounted policy refused) | ruling.md §1 A2.4; OBS-014 AR-2 |  |
| NEG-03 | STUDIO_RUNNER_VAULT_ADDRESS is refused at startup (unknown key) | studio-runner/src/server/config.ts:459 (refuseUnknownKeys); not in KEY_SPECS [V grep] | 009 AC-4 |  |
| NEG-04 | No studio-guided-worker-* chart template | helm-chart/put-checks/templates/ (ls: none) [V] | 009 AC-1 |  |
| NEG-05 | No plaintext runner listener in any configuration (today server.ts:17 is node:http) | studio-runner/src/server/server.ts:17 | ruling.md §1 A3 | BECOMES-TRUE |

## 3. Entries the 009 fold is expected to change (DRAFT)

Source: Aria's A2 ruling (`t0-rulings/ruling.md` §1 A2: one entrypoint `node dist/main.js`; `STUDIO_RUNNER_GUIDED_ENABLED`; no capacity key; no policy-hash key; A2.6 one-pod guard) and the sibling rulings that land in the same F-merge (A3 TLS listener, A4 runner TLS context, A5 profiles, A6 dumps, A7 P2, A11 R1, LR). Re-measure every one of these at G9 and record the new name, value or line.

| Ruling | Entries | Count | Expected change |
|---|---|---|---|
| A2.1 one entrypoint | RKG-00, RKO-03, RKO-04 | 3 | guided entry files, `start:guided` and `STUDIO_GUIDED_CONFIG_FILE` removed; D1 grep = 0 |
| A2.2 guided mode is configuration | RKS-00, RKS-06, RKS-07, RKG-01, RKG-02, RKG-03, RKG-04, RKG-05, RKG-06, RKG-07, RKG-08, RKG-09, RKG-10, RKG-11, RKG-12, RKG-13, P09-01, P09-02, P09-03, CFD-04 | 20 | `STUDIO_RUNNER_GUIDED_ENABLED` added; 13 mounted fields become `STUDIO_RUNNER_*` keys (host/port merge); the key set grows from 45 |
| A2.3 / A2.4 no capacity key, no policy-hash key | NEG-01, NEG-02 | 2 | negative entries; the AC-1 text about capacity/policy hash "as configuration" is met by the code constant and the context-bound hash |
| A2.6 one-pod guard (root R1, provisional, U20) | CHV-009, CHV-010, CHV-011, CHV-012, CHV-026, CHV-027, CHV-028, CHV-029, CHE-11, CHE-12, CHE-13, CHE-14, CHE-15, CHE-25, CHE-26, CHE-27, CHE-28, CHE-29, CHE-47, CHE-48, CHE-49, CHE-50, CHE-51, P09-09 | 24 | render fails for guided-enabled values with `replicaCount != 1` or `autoscaling.enabled`; pod sizing for one replay + one guided browser |
| AC-1 PID-1 b (init for the guided mode) | CHV-022 | 1 | `shareProcessNamespace: true` stays; the chart test is extended to every guided-enabled values file (PID-1 does not count toward the 011 start) |
| A3 one TLS listener, no plaintext | RTI-01, RTI-02, RTI-04, RTI-07, RTI-08, RTX-13, RTX-14, RTX-15, RTX-16, RTX-17, RTX-18, RKO-05, CHV-021, CHV-044, CHV-045, CHV-046, CHV-047, NEG-05 | 18 | paths unchanged [I]; transport and peer authorization change; probe speaks TLS |
| A3 / A4 backend TLS and https-only base URL | CFB-098, CFK-13, CFC-01, P09-04, P09-05 | 5 | `validate()` refuses `http://` outside local/test; one `StudioRunnerTls` context; `SSLContext.getDefault()` grep = 0 |
| AC-2 mTLS chain values | CFC-02, CFC-03, CFC-04, CHV-048, CHV-049, CHV-050, CHE-34, CHE-56, P09-10 | 9 | key/issuer/truststore values supplied; chain secret mounts for both pods |
| A5 profile gates | SCH-02, SCH-04 | 2 | `@Profile("!api \| worker")` on the reaper class and the coordinator `@Bean` |
| A6 dumps | RKO-01, CHV-001, CHV-003, CHE-01, CHE-07, CHE-19, CHE-21, CHE-41, CHE-43, P09-11 | 10 | image CMD `sh -c "ulimit -c 0 && exec node dist/main.js"`; JVM dump flags in every values file |
| A7 P2 + C9 | OAS-00, OAS-01, OAS-02 | 3 | descriptions and four examples change; both pins re-anchored; 44 operations kept |
| A11 R1, LIFECYCLE-REASON-01 | RTX-07, RTX-08 | 2 | route semantics only |
| D2 chart templates | CHT-01, CHT-02, CHT-03, CHT-04, CHT-07, CHT-08, CHT-09 | 7 | edited by lane D2 (`_helpers.tpl` [I]) |
| Other 009 additions | P09-06, P09-07, P09-08, P09-12, P09-13 | 5 | `RunnerProcessHarness`, `ObservedCoRunIT`, `verifyRunnerDist`, SIEM chart reference, conditional V23 |

All 109 flagged entries are in the table above. By effect: BEHAVIOUR 32, VALUE 33, KEY 18, ADJACENT 5, EDIT 7, ADD 13, BECOMES-TRUE 1.

## 4. Re-dating procedure at the 009 local gate (G9)

**When.** First re-dating = 010 T2 proper: at G9 exit (Quinn D2 record issued, trigger MET), at the record's one source digest (010 dependency note D-1; lanes.json triggers.010T2). Second re-dating: after 009 Done and before 010 T3/T4 (010 dependency note D-1).

**Freeze.** Measure inside the G9 freeze window or at a tree whose capture-manifest digest (plus the helm-chart supplement) equals the D2 record's; record git rev-parse HEAD and both digests (qa/t0-qa-20261017.md §2.3).

**Commands** (repo root, read-only; each output is kept in the T2 evidence folder):

- **R0 trigger**
  ```bash
  ls docs/qa/evidence/STUDIO-OBS-009/local-gate-*/qa-local-validation-record.json
  node -e "const r=require(process.argv[1]);console.log(r.trigger,r.isVerdict)" <that file>   # expect MET false; copy its source digest
  git rev-parse HEAD; git status --short | wc -l
  ```
- **R1 OpenAPI (RTP, RTI, OAS)**
  ```bash
  shasum -a 256 docs/specs/studio/openapi.yaml
  node -e "const y=require('./frontend/node_modules/js-yaml');const d=y.load(require('fs').readFileSync('docs/specs/studio/openapi.yaml','utf8'));let n=0,p=0;for(const [k,v] of Object.entries(d.paths))for(const m of ['get','put','post','delete','patch'])if(v[m]){n++;const t=v[m].tags||[];if(!t.includes('internal'))p++;console.log(m.toUpperCase(),k,v[m].operationId,t.join('|'))}console.log('paths',Object.keys(d.paths).length,'ops',n,'public',p)"
  grep -n "^  /\|^    \(get\|put\|post\|delete\|patch\):" docs/specs/studio/openapi.yaml   # line anchors
  grep -n "hasSize(\|BASE_SHA256" backend/src/test/java/com/citi/put/checks/studio/StudioContractTest.java studio-runner/test/run/confinement.test.ts
  grep -n "^    RuntimeVersions:\|^    ReportedRuntimeVersions:\|^    ReplayFailure:\|replayFailure:" docs/specs/studio/openapi.yaml
  grep -rn --include='*.java' -E '@(RequestMapping|GetMapping|PostMapping|PutMapping|DeleteMapping|PatchMapping)' backend/src/main/java/com/citi/put/checks/studio
  ```
- **R2 runner routes (RTI runner, RTX bridge)**
  ```bash
  grep -rn "path === '/\|path==='/\|RUN_PATH" studio-runner/src/server
  grep -rn "internal/v2/studio/guided-sessions" studio-runner/src   # after the fold the bridge regex moves out of guided/transport.ts:83 into the folded server
  ```
- **R3 contracts/v3 (CON)**
  ```bash
  ls docs/specs/studio-observed-authoring/contracts/v3/*.json | wc -l   # 51 on 2026-10-17
  shasum -a 256 docs/specs/studio-observed-authoring/contracts/v3/*.json
  find docs/specs/studio-observed-authoring/contracts/v3 -mindepth 1 ! -name "*.json"   # 2026-10-17: only the stray .claude/ dir (OI-08)
  ```
- **R4 migrations (MIG)**
  ```bash
  ls backend/src/main/resources/db/migration | sort -V   # head V22 on 2026-10-17
  shasum -a 256 backend/src/main/resources/db/migration/*.sql
  for i in 1 2 3 4 5 6 7 8 9 10 11; do f=$(ls backend/src/main/resources/db/migration/V${i}__*.sql); [ "$(shasum -a 256 "$f" | cut -c1-64)" = "$(git show d954a21c5:"$f" | shasum -a 256 | cut -c1-64)" ] && echo "V$i same" || echo "V$i DIFF"; done
  ls backend/db/cutover   # expect: No such file or directory
  ```
- **R5 backend configuration (CFB, CFP)**
  ```bash
  node -e "const y=require('./frontend/node_modules/js-yaml');const f=(o,p)=>Object.entries(o||{}).flatMap(([k,v])=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).length?f(v,p+k+'.'):[p+k+'='+JSON.stringify(v)]);for(const n of ['','-api','-worker','-dev','-local','-prod','-staging','-test']){const d=y.load(require('fs').readFileSync('backend/src/main/resources/application'+n+'.yml','utf8'))||{};const l=f(d.studio,'studio.');console.log(n||'base',l.length);l.forEach(x=>console.log('  '+x))}"   # 2026-10-17: base 100, worker 1, dev 1, local 5, staging 3, test 2
  grep -n "studio:" backend/src/main/resources/application.yml; grep -n "UI_TEST" backend/src/main/resources/application*.yml
  ```
- **R6 code-only keys and flags (CFC, CFD, CFK, OI-04)**
  ```bash
  grep -rn --include='*.java' -oE '"\$\{studio\.[a-zA-Z0-9.\-]+' backend/src/main/java | sort -t: -k3 -u
  grep -rn --include='*.java' "@ConfigurationProperties" backend/src/main/java/com/citi/put/checks/studio
  grep -rn --include='*.java' -A4 "@ConditionalOnProperty" backend/src/main/java/com/citi/put/checks/studio | grep "name\|havingValue\|matchIfMissing"
  grep -n "@DefaultValue" backend/src/main/java/com/citi/put/checks/studio/guided/translation/GuidedTranslationProperties.java backend/src/main/java/com/citi/put/checks/studio/guided/session/GuidedSessionProperties.java backend/src/main/java/com/citi/put/checks/studio/guided/publication/GuidedPublicationProperties.java backend/src/main/java/com/citi/put/checks/studio/guided/publication/ObservedReplayProperties.java
  grep -rn "readIntervalOrDefault\|runner-origin" backend/src/main
  ```
- **R7 runner configuration (RKS, RKG, RKO, NEG)**
  ```bash
  awk '/^const KEY_SPECS/{f=1} f && match($0,/^  [A-Z_]+:/){print NR": STUDIO_RUNNER_"substr($0,RSTART+2,RLENGTH-3)} f && /^};/{f=0}' studio-runner/src/server/config.ts   # 45 on 2026-10-17
  grep -n "GUIDED_ENABLED\|VAULT" studio-runner/src/server/config.ts   # GUIDED_ENABLED expected after the fold; VAULT expected 0
  grep -rn "guidedMain\|start:guided\|STUDIO_GUIDED_CONFIG_FILE" studio-runner/src studio-runner/package.json   # expected 0 after the fold (lanes.json D1.verify)
  grep -rn "process\.env\." studio-runner/src
  grep -n "^CMD\|^ENTRYPOINT" studio-runner/Dockerfile
  node -e "console.log(require('./studio-runner/package.json').scripts)"
  grep -n "capacity" studio-runner/src/guided/transport.ts; grep -n "node:http\|node:https" studio-runner/src/server/server.ts
  ls studio-runner/dist/main.js studio-runner/dist/run/guidedMain.js   # QA C7: guidedMain.js absent after the clean F-merge build
  ```
- **R8 chart (CHV, CHE, CHT, CHN)**
  ```bash
  node -e "const y=require('./frontend/node_modules/js-yaml');const f=(o,p)=>Object.entries(o||{}).flatMap(([k,v])=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).length?f(v,p+k+'.'):[p+k+'='+JSON.stringify(v)]);for(const n of ['','-dev','-uat','-prod']){const d=y.load(require('fs').readFileSync('helm-chart/put-checks/values'+n+'.yaml','utf8'));const r=n?/studio|objectStore|JAVA_OPTS|UI_TEST|VITE_ENABLE_STUDIO/i:/^(studio|objectStore)|^(backend|worker)\.env\.JAVA_OPTS=|^backend\.configOverrides\.checks\.sources\.UI_TEST=|^frontend\.env\.VITE_ENABLE_STUDIO=/;const l=f(d,'').filter(k=>r.test(k));console.log(n||'base',l.length);l.forEach(x=>console.log('  '+x))}"   # 2026-10-17: base 123, dev 18, uat 22, prod 22
  ls helm-chart/put-checks/templates   # no studio-guided-worker-* (NEG-04)
  shasum -a 256 helm-chart/put-checks/templates/*.yaml helm-chart/put-checks/templates/_helpers.tpl
  grep -rhno "STUDIO_[A-Z0-9_]*[A-Z0-9]\|CHECKS_SOURCES_UI_TEST" helm-chart/put-checks/templates | sort -u
  sed -n '/define "put-checks.studioRunner.acceptedEnvKeys"/,/end/p' helm-chart/put-checks/templates/_helpers.tpl   # 36 names on 2026-10-17
  grep -rn "HeapDumpOnOutOfMemoryError\|CreateCoredumpOnCrash\|HeapDumpPath" helm-chart; grep -rn -i "guided" helm-chart
  ```
- **R9 schedules (SCH)**
  ```bash
  for f in $(grep -rln --include='*.java' "@Scheduled" backend/src/main/java/com/citi/put/checks/studio); do echo "$f"; grep -n "@Scheduled\|@Profile" "$f"; done
  grep -n -B4 "GuidedTranslationCoordinator guidedTranslationCoordinator\|GuidedObservationPruner guidedObservationPruner" backend/src/main/java/com/citi/put/checks/studio/guided/translation/GuidedTranslationConfiguration.java backend/src/main/java/com/citi/put/checks/studio/guided/retention/GuidedRetentionConfiguration.java
  ```
- **R10 runbook (RBS, RBR)**
  ```bash
  shasum -a 256 docs/runbooks/studio-guided-authoring.md; grep -n "^#" docs/runbooks/studio-guided-authoring.md
  grep -n "V33\|V30\|V19\|default false\|compile-request\|account" docs/runbooks/studio-guided-authoring.md
  ```
- **R11 planned 009 surfaces (P09)**
  ```bash
  find backend/src -name "StudioRunnerTls*.java" -o -name "RunnerTestTls.java" -o -name "RunnerProcessHarness*.java" -o -name "ObservedCoRunIT.java"
  grep -n "verifyRunnerDist" backend/build.gradle.kts
  ```

**Classification.**

1. Re-measure every JSON entry by id. Record for each: SAME (anchor line may move: record the new line), CHANGED, GONE or NEW, with the command output line that shows it.
2. CHANGED or GONE on an entry with fold009 effect KEY/VALUE/EDIT, or NEW matching a P09 entry: expected; record the new name/value and cite the 009 lane evidence.
3. CHANGED or GONE on any other entry: unexpected; @architect rules before the list is dated. An entry is never silently dropped.
4. RECHECK-AT-G9 entries: confirm the key/path/value is unchanged, then set CANDIDATE, or reclassify with the reason.
5. Resolve or carry OI-03, OI-04, OI-05 and OI-10 before dating, because they decide inclusion.
6. Every row that needs an OBS-009 external proof keeps "owed/unrun, owner X" in liveEvidence.deployed. The G9 record supplies only local proof.
7. Date the list, record HEAD plus the source and helm digests, and write it to the runbook "Live surface" section (010 AC-5) with this evidence folder linked.

**Who checks.**

- @analyst (Alex): runs R0-R11, updates every entry, writes the dated list and the AC-5 runbook rows (010 T2; executor "analyst").
- @architect (Aria): cross-checks every entry against the tree and rules the inclusion items (implementation-plan.md §3: "I cross-check every entry against the tree"; lanes.json T2.agent).
- @pm (Morgan): accepts the dated list (implementation-plan.md §3 and R9.8; lanes.json T2.exit). See OI-01: STUDIO-OBS-011 only requires that the list exists.
- @po (Pax): nothing is removed from the dated list without @po (010 dependency note D-1); any change to story text.
- @qa (Quinn): the D2 local-validation record is the trigger (qa/t0-qa-20261017.md §2); 010 sdc_reviewer later.
- Coordinator (root): confirms the 011 start condition before 011 T0 (011 clarification S-2).

## 5. Open items

| Id | Owner | Item |
|---|---|---|
| OI-01 | @po + @pm (not resolved here) | @pm acceptance mismatch. lanes.json T2.exit ("dated list accepted by @pm") and implementation-plan.md R9.8 (011 starts when the list, "measured at G9 and accepted by @pm", exists) add an @pm acceptance. STUDIO-OBS-011 Start-condition amendment (:233-235) and its 2026-10-16 clarification only require that "OBS-010's dated Live surface list exists"; STUDIO-OBS-010 T2 (:107) names no @pm acceptance. Raised by Pax; recorded only. |
| OI-02 | root / @architect (no action expected) | Folder name. The dispatch asked for live-surface-draft-20261017/; lanes.json T2 names live-surface-draft/**; the refold T2-SK lane and plan R9.3 name live-surface-skeleton/**. All three are under docs/qa/evidence/STUDIO-OBS-010/, which lanes.json parallelWith008.withoutNewDecision allows. [I] The R9.6 overlap result (NOW vs 008 W3-W5 = 0) still holds, because the 008 write sets are frontend paths. |
| OI-03 | @architect + @pm | Scope of internal routes. 12 backend /internal/v2/studio/guided-sessions/{id}/* routes and 6 runner bridge routes are not in OpenAPI (RTX-01..18). AC-5 names "public routes" and "contracts/v3 documents" only. Include them (they carry the v3 bridge bodies, and 011 FOLD rewrites the clients that call them) or exclude them, with a reason. |
| OI-04 | @architect | Conflict with STUDIO-OBS-011 AC-2 CLN-21. studio.execution.sse.read-interval (application.yml:356; bound at StudioExecutionProperties.java:197; readIntervalOrDefault :212 has 0 callers [V]) is a named 011 removal target. If the dated list protects it, 011 AC-2 is blocked. Marked EXCLUDE-CANDIDATE (CFB-078); needs a ruling. |
| OI-05 | @architect + @pm, @po for list text | Other 011 overlaps. (a) studio.guided-authoring.runner-origin vs studio.runner.base-url: ruling A4 says "merging them is 011 FOLD's"; protecting the key name would forbid that merge, so the list needs a carve-out or a ruling. (b) 011 CLN-41 (versions.ts observed constants) vs the private dist/runtime-versions.json observed keys that ReplayIT reads (ruling A7 keeps them); those keys are not on this skeleton [I: private, not a deployment surface]. (c) 011 AC-4 folds GuidedRunnerClient/ObservedValidationClient; no class is on this skeleton except the P09 additions. |
| OI-06 | @architect (cross-check), @devops + @dev (009 lanes D1.0/D2) | Runner observed flags not renderable by the chart. STUDIO_RUNNER_OBSERVED_VALIDATION_ENABLED and _REPLAY_ENABLED fall back to false (config.ts:176-177) [V]. Those keys, the other three OBSERVED_* keys and INSTANCE_ID are not in the chart closed env list (_helpers.tpl:157, 36 names) [V], and no template sets them [V grep]. [I] A chart-deployed runner therefore cannot enable observed validation or replay, while the backend publication and replay flags default true (application.yml:239, :245). Not ruled here; flagged so D1.0/D2 and the T2 list treat it explicitly. |
| OI-07 | @architect | @Scheduled beans without @Profile beyond ruling A5's two: GuidedObservationPruner (@Bean in GuidedRetentionConfiguration.java:15-18; @Scheduled GuidedObservationPruner.java:48) and SecretRevocationSweep (@Service :19; @Scheduled :57) [V]. 009 AC-5 names only GuidedSessionReaper and GuidedTranslationCoordinator. Whether the other two are meant to run on API pods is not decided here. |
| OI-08 | @architect / coordinator | Stray agent memory in a contract folder: docs/specs/studio-observed-authoring/contracts/v3/.claude/agent-memory/aiox-architect/{MEMORY.md,obs008_w0_refold.md} (created 2026-10-17 15:04) [V]. It is not a contract document and is excluded here. [I] It looks like an agent memory written with the wrong working directory. I did not run the contract checker, so I do not know whether it globs this folder. |
| OI-09 | @analyst (T2) | Five contracts/v3 files changed on 2026-10-17 15:30-15:35 while 008 was in flight (fixtures.json, public-ui-projections.schema.json, publication-fixtures.json, result.schema.json, session-view.schema.json) [V mtime]. The CON hashes here predate 008 Done; re-hash at G9. |
| OI-10 | @analyst (T2), @architect cross-check | Coverage gap: code-default leaves of the 17 @ConfigurationProperties classes are listed at prefix level (CFK) plus the named flags (CFD); a leaf that has a Java default but no yml line is not enumerated individually (e.g. most of GuidedSessionProperties, StudioSchedulingProperties). T2 enumerates them, or @architect rules that prefix level is enough. |
| OI-11 | @analyst (T2), after 008 Done | The guided runbook is an 008 L0 file until 008 Done (lanes.json collisions008); 008 L0 changed 2 lines [V git diff --stat]. RBS-01/02/03/05 are STALE (V33/V19 cutover, "default false", account provider) and RBS-04/06 PARTLY-LIVE. T2 rewrites them; this skeleton edits nothing. |
| OI-12 | @pm (name the owner) | Approver-group provisioning. application.yml:217-220 ships approver-groups: [] with the comment "fail closed until OBS-010 provisions one", so every policy approval answers 403 (openapi :2196-2198) [V]. OBS-010 is docs-only, so provisioning per shared environment needs a named external owner. The RBR-11 runbook row depends on it. |
| OI-13 | external owners as listed | Owed external inputs for runbook rows and deployed proofs: NTP skew bound (Platform/SRE); SIEM sink + Q3 retention (Platform/SRE, U6); G-1 in a shared environment and the deployed stack (Platform/SRE + @devops, U4); dev Vault policy test and production authorization sources (PUT Core/BFF ED-02, U5); D-B confirmation and dev-DB recreation (user / Platform-SRE, U11); DB role model (Platform DBA / @devops, U14); monitoring stack for the R8.2 alert (@devops); A2.6 one-replica decision (user via root, U20). None is obtained. |
| OI-14 | @pm + @architect | Frontend surfaces (UI routes, VITE_* flags such as VITE_ENABLE_STUDIO at values.yaml:345) are not named by AC-5 and are not enumerated, except VITE_ENABLE_STUDIO as a chart value. 011 CLN-50 (VITE_ALLOW_INSECURE_MSW_FALLBACK, read by nothing) must not be protected. |
| OI-15 | @po (wording only) | Ambiguous sentence in STUDIO-OBS-009 (:557): "`launcher.ts` (AC-11 j) and `versions.ts` (AC-1 P2) are on that list". [I] "that list" is the 011 start list of 009 ACs, not the Live surface list; source files are not Live surface entries under AC-5. Confirm the reading so nobody treats those files as protected. |
| OI-16 | @devops (lane D2) | Stale count in a chart comment: _helpers.tpl says "the loader accepts thirty-six keys"; KEY_SPECS has 45 today [V]. The closed list itself has 36 names. Doc drift only. |

## 6. Decisions taken autonomously

- [AUTO-DECISION] Output folder: dispatch path live-surface-draft-20261017/ vs lanes.json live-surface-skeleton/** -> used the dispatch path (reason: explicit instruction; both are under docs/qa/evidence/STUDIO-OBS-010/, OI-02).
- [AUTO-DECISION] Granularity -> one entry per leaf for application.yml, KEY_SPECS, chart values, contracts and migrations; prefix level for @ConfigurationProperties classes (reason: leaves are measurable now by command; class leaves need per-record reading, OI-10).
- [AUTO-DECISION] Include contracts/v3 and migrations although the dispatch item 2 does not name them -> yes (reason: 010 AC-5 and addition D-3 require them in the list).
- [AUTO-DECISION] Include internal routes not in OpenAPI -> yes, as CANDIDATE-SCOPE-OPEN (reason: they exist and 011 FOLD touches their callers; AC-5 does not name them, OI-03).
- [AUTO-DECISION] studio.execution.sse.read-interval -> EXCLUDE-CANDIDATE, not CANDIDATE (reason: zero readers [V] and a named 011 CLN-21 target; protecting it would block 011 AC-2, OI-04).
- [AUTO-DECISION] 009 flags split by effect -> KEY/VALUE/EDIT = CHANGES-IN-009, BEHAVIOUR/ADJACENT = RECHECK-AT-G9 (reason: the list protects names and values; behaviour-only changes keep the entry but must be re-checked).
- [AUTO-DECISION] STUDIO-OBS-010 Status -> unchanged (Ready) (reason: this is T2-SK, "NOT T2; no status effect" per lanes.json; the dispatch forbids story edits).
- [AUTO-DECISION] No accessibility surface is listed (reason: ADR-SC-006; the a11y audit files are a regression guard, not a deployment surface).

## 7. Not claimed

- No source, story, spec, chart, test or runbook was edited. No git write, Gradle, test, build or install was run. backend/ and frontend/ were only read.
- Commands run: ls, find, grep, sed -n, awk, wc, stat, shasum, git status/diff --stat/log/show (read), and node/python3 readers over the tree with js-yaml from frontend/node_modules (no install). Scratch scripts live in the session scratchpad, not in the repo.
- The R1-R11 re-dating commands (§4) were dry-run once on 2026-10-17 (read-only) to check that they execute; their counts match this skeleton (ops 44, contracts 51, migrations 22, application.yml 100, KEY_SPECS 45, values.yaml 123). R0 was not run: no D2 record exists yet.
- Every local proof named in liveEvidence.local is PLANNED_NOT_RUN by me. No deployed proof exists; every deployed field reads "owed/unrun, owner X" or n/a.
- Names of 009 additions (keys, chart values, properties) are unknown until drops D1.0/D3.0; P09 entries describe them, they do not invent names.

> **DRAFT — NOT THE T2 LIST.** Re-measure at G9 (§4) before any entry protects anything.
