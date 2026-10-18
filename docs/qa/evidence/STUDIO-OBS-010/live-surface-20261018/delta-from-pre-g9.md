# STUDIO-OBS-010 T2 Live surface: delta from the pre-G9 draft to the dated list (G9b, 2026-10-18)

Compares `../live-surface-pre-g9-20261018/live-surface-list.pre-g9.json` (sha256 `d0d34e18…`, 712 entries, measured at the G9 capture, source digest `6fcc12ee…`) with `live-surface-list.json` in this folder (sha256 `e5c58fa57f389879b2843815b5b389d0efa99921bc142155d6b18b970d7c2c57`, 729 entries, at the G9b capture, source digest `fd793c95…`). Ids are carried. New ids continue each prefix, and no id is reused.

- **Author:** Alex (@analyst), 2026-10-18. Read-only. **[V]** = read or re-measured today. **[I]** = inference, with its basis.
- **Why it changed:** the 009 post-G9 batch (`docs/qa/evidence/STUDIO-OBS-009/execution-20261018/post-g9/receipt.md`). It contains model-sizing A-ii, the catalog-entry script plus one Dockerfile `COPY`, the chart observed-env patch (ruling B5) and test fixes. On top of that come the inclusion rulings (Aria A1–A6, Morgan's pm-ack) and @po's 010 story edits (P-1, the CFC-01 text).

## 1. Summary

| | Pre-G9 draft | Dated list (G9b) | Why |
|---|---|---|---|
| Source capture | `6fcc12ee…`, 1805 files | `fd793c95…`, **1808** files | +3 new files (catalog script, its `.d.mts`, its test) |
| Dist digest | `4add1307…` | `698a9365…` (238 files) | root rebuilt the dist after the schema bundles changed |
| Helm-before | `8dbe073c…` (G9) | `46070907…` (G9b) | 6 of 22 helm files changed |
| Entries | 712 | **729** (+17 NEW, 0 dropped) | the chart observed block, one runner script, two guards, the P-1 runbook row |
| Status live / dark / removed / absent / holds / to-write | 589 / 83 / 16 / 1 / 5 / 18 | **608 / 78 / 16 / 1 / 7 / 19** | RKS-01..05 dark → live; 14 new live entries; 2 new holds; 1 new row |
| Protected | not set in the draft | **671** | rulings applied (§4) |
| OpenAPI | `bbf37fd1…`, 44 ops | same, unchanged [V] | — |
| `contracts/v3` | 51 files, all equal to the skeleton | 51 files, **2 changed** (CON-25, CON-33) | model-sizing A-ii |
| `application.yml` `studio.*` leaves | 110 | 110; **0 values changed**, 101 lines moved +1 [V] | [I] one comment line was added in the `csi-budget` comment (the lines now cite the MODEL-SIZING ruling at `application.yml:230-232`); leaf values were re-read and are all equal |
| Runner `KEY_SPECS` | 57 | 57; `config.ts` byte-identical | — |
| Chart closed runner env list | 48 | **53** | +5 `STUDIO_RUNNER_OBSERVED_*` (B5 item 2) |
| `values.yaml` Studio leaves | 168 | **174** | +6 `studioObserved.*` |
| `values-<env>.yaml` leaves | 92 | **94** | +2 in values-uat (`studioObserved.validationEnabled`/`replayEnabled: true`) |
| Chart templates | 10 | 10; 4 changed (CHT-01, -07, -08, -09) | observed guards, env, ConfigMap, volume, digest image form |

ΔG9b per entry: **SAME 513, MOVED 187, CHANGED 7, STATUS 5, NEW 17**.

## 2. Files that changed between the G9 and G9b captures [V, file by file]

Source capture: 25 changed or added files. Helm: 6 files. All 31 match the post-G9 receipt's `files.txt` and sha table. The receipt also lists `canary.test.ts`, which is byte-unchanged.

| File | Effect on the list |
|---|---|
| `backend/.../guided/session/GuidedSessionProperties.java` | **CFK-06 CHANGED**: the component defaults are now `maxModelInputTokensTotal` 786432 (was 262144) and `maxModelOutputTokensTotal` 98304 (was 32000). Current bytes [V]; old values from `dex-prep/model-sizing.patch` [V]. CFD-03 (`enabled`, :12) is unchanged |
| `backend/.../guided/session/GuidedContracts.java` | Not an entry: `SESSION_SCHEMA_EPOCH` moved (a code constant) |
| `backend/src/main/resources/application.yml` | 101 CFB leaves MOVED +1 line, 9 SAME, 0 value changes, 0 new or gone leaves. P09-04 re-pointed (:421 → :422) |
| `contracts/v3/limits.schema.json` | **CON-25 CHANGED** `f6e4bba0…` → `73679130…`: input max 262144 → **1572864** (default 786432); output max 32000 → **131072** (default 98304) [V] |
| `contracts/v3/publication-fixtures.json` | **CON-33 CHANGED** `861619da…` → `c573e50b…` |
| `studio-runner/Dockerfile` | RKO-01 CMD MOVED :76 → :79, same value. **NEW RKO-09**: `COPY … scripts/print-observed-catalog.mjs` (:48) |
| `studio-runner/scripts/print-observed-catalog.{mjs,d.mts}` | RKO-09 anchor (sha256 `cc954c63…`) |
| `studio-runner/src/guided/schemas.json`, `src/validator/observedSchemas.json` | Not entries: generated runner copies of the contract bundles |
| `studio-runner/evaluation/**`, backend and runner tests, `consensus-plan.md` | Not entries (benchmark tooling, tests and docs) |
| `helm-chart/.../_helpers.tpl` | **CHT-09 CHANGED** (closed list 53 at :164-165; observed refusal :192-193; `studioObserved` helpers and guards :354-497; springProperties :576, observed props :610-611). CHN-08 / CHN-09 / P09-10 re-pointed. CFC-01's chart line `runner-origin` is now :593 (it was :434) |
| `helm-chart/.../configmap.yaml` | **CHT-08 CHANGED** (observed-trust ConfigMap :102-122). CHN-06 SIEM ConfigMap :114 → :135 |
| `helm-chart/.../deployment.yaml` | **CHT-07 CHANGED** (guard call :5-7, +3 lines). CHN-01, CHN-05, CHN-07 and CFD-07 MOVED +3 |
| `helm-chart/.../studio-runner-deployment.yaml` | **CHT-01 CHANGED** (guards :9, checksum :58, digest image :127, OBSERVED env :242-252, volume and mount :308/:378) |
| `helm-chart/.../values.yaml` | 115 CHV SAME, 53 MOVED (everything below the new block), 0 value changes. **NEW CHV-169..174** |
| `helm-chart/.../values-uat.yaml` | 28 CHE SAME, 4 MOVED. **NEW CHE-93/94** |

## 3. Entry-level changes

**CHANGED (7):** CON-25, CON-33, CFK-06, CHT-01, CHT-07, CHT-08, CHT-09. Each one carries a `changeG9b` record (batch, what, evidence) in the JSON.

**STATUS (5): RKS-01..05 `STUDIO_RUNNER_OBSERVED_{VALIDATION_ENABLED, REPLAY_ENABLED, CATALOG_FILE, POLICY_FILE, IMAGE_DIGEST}` dark → live.**
- The chart now renders the two flags in both directions and the three file and digest keys only while either flag is on (`studio-runner-deployment.yaml:242-252`).
- `values-uat.yaml:213-214` sets both flags to true. By the list's status rule (dark only when no shipped values file turns the switch on), they are live.
- `config.ts` is unchanged, and the runner fallbacks are still false.
- [I, from ruling B5 item 9 and guards G-O2/G-O3] A UAT render still fails until the deploy-time catalog and policy files are supplied. That is by design, and each entry notes it.

**NEW (17):**

| Id | Surface | Status |
|---|---|---|
| CHV-169..174 | `studioObserved.{validationEnabled, replayEnabled, catalog, additionalBackendCatalog, policies, mountPath}` (`values.yaml:803-819`) | live |
| CHE-93, CHE-94 | `studioObserved.validationEnabled` / `replayEnabled` `[values-uat]` = true (`values-uat.yaml:213-214`) | live |
| CHN-10 | `<fullname>-studio-observed-trust` ConfigMap | live |
| CHN-11 | `studio-observed-trust` volume and read-only mount (runner) | live |
| CHN-12 | backend `studio.observed-replay.{catalog,policies}-json` rendered by the chart | live |
| CHN-13 | runner image by digest `<repo>@sha256:<catalog.build.executableImageDigest>` while observed is on | live |
| CHN-14 | pod annotation `checksum/studio-observed-trust` | live |
| RKO-09 | `scripts/print-observed-catalog.mjs` in the runner image (CI catalog producer) | live; [AUTO-DECISION], @architect to confirm (OI-28) |
| NEG-06 | a `runnerEnv` `STUDIO_RUNNER_OBSERVED_*` override fails the render | holds |
| NEG-07 | observed render guards G-O1..G-O4 | holds |
| RBR-19 | first-learn limit runbook row (010 AC-5 addition P-1) | to-write |

**Notes added without a delta change:** CFB-021/CFB-022 (`studio.observed-replay.catalog-json` / `policies-json`): the chart now renders them while observed is on, and G-O4 refuses any second source. CFB-079 carries the A2 note ("do not tidy into one name").

**Story re-anchors:** RBR-01..18 re-pointed from `STUDIO-OBS-010.story.md:82-98` to `:94-118`, because @po edited the story. The AC-5 text was re-read, and the categories are unchanged (§5).

## 4. Inclusion changes from the rulings

| Ruling | Before (pre-G9) | Now |
|---|---|---|
| A1 / OI-03 | RTX-01..18 "scope-open" | **included** as their own category. Protection unit: method + path + direction + caller-auth class |
| A2 / OI-04 | CFB-078 "exclude-candidate" | **annex: excluded with reason** (bound but never read; 011 CLN-21). CFB-079 protected |
| A3 / OI-05 a | CFC-01 "include with carve-out (proposed)" | **included with the verbatim @po/@pm merge-permitted annotation** (C1–C6; C2 blocking) |
| A4 / OI-10 | CFK prefix entries, question open | **prefix level plus the three-part removal rule** (`protectionRule` on CFK-01..18) |
| A5 / OI-17 | P09-06..08 "proposed exclude" | **annex: not a surface** |
| A6 duplicates | CFC-02..04 "superseded, keep one row at finalize" | **annex: superseded duplicate**. Protection is carried by CFB-101..103 |
| OI-21 removals | 16 entries "proposed to leave the list" | **kept on the list and flagged**: no @po confirmation exists (searched 2026-10-18) |

No entry left the list.

## 5. Story drift (P6) [V]

| Story | Pre-G9 hash | Now | AC-5 effect |
|---|---|---|---|
| 009 | `ebc4e9d5…` | `e900e715…` | none on the list categories (the residues are placed as text) |
| 010 | `f2b1dd0c…` (then `aeac3cc6…` at the rulings) | `413dcac3…` (0.3.14) | AC-5 meaning and categories unchanged. P-1 applied, so **RBR-19** was added. The CFC-01 text was written and @pm accepted it |
| 011 | `18014f33…` (then `ef0eec7f…`) | `413fcaa4…` (0.2.15 T0 ratification) | start condition unchanged (G9 local ACs validated + the dated list exists). The T0 plan does not use the CFC-01 carve-out (P-12) |

## 6. What did not change but matters

- `openapi.yaml`, both pins, all migrations, `config.ts`, `routes.ts`, `transport.ts`, the backend controllers, the 49 other `contracts/v3` files and the runbook (`9727657a…`) are byte-identical to pre-G9 [V by hash].
- [I] Aria's A6 expected CON-46 and CON-44 to move with A-ii. They did not. The regenerated bundles are the runner copies, which are not entries (OI-27).
- Dark switches re-checked in all four values files: guided and SIEM are off everywhere. Observed is on only in values-uat.
