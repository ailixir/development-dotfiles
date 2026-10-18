# STUDIO-OBS-010 T2 — dated "Live surface" list — DATED 2026-10-18 at the G9b digest

> **DATED 2026-10-18 at the STUDIO-OBS-009 G9b capture.** Source digest `fd793c9561bfa86d3046abd9791c6da231546f309e7e920a569792deb5afcb67` (1808 files), dist digest `698a936537f3be1de45436c4459390fee5628b31e6790e1aa2b183cfaf814210` (238 files), helm-before sha256 `4607090747e4fef31713ff90db5545eb243bdcff67c3b9acfd5fff2e8e01ada8` (22 files). This is the list STUDIO-OBS-011 T0 reads (010 AC-5, D-1, D-3). It supersedes the PRE-G9 DRAFT in `../live-surface-pre-g9-20261018/`. Ids are carried from the 2026-10-17 skeleton and never reused.

## 0. Identity and sign-off lines

- **List sha256 (machine list `live-surface-list.json`): `e5c58fa57f389879b2843815b5b389d0efa99921bc142155d6b18b970d7c2c57`**. This md is the readable twin; the JSON is the list of record. Sign-off lines live here and in `finalize-record.md`, never in the JSON, so the JSON hash stays stable while they are filled.
- **Entries:** 729 ids (712 pre-G9 + 17 new at G9b). **Protected: 671.** Annexes: 1 excluded with reason, 3 not a surface, 3 superseded duplicates. Removed by 009 but kept pending @po: 16. Runbook items (not surfaces): 25. Planned-by-009 bookkeeping: 10.

@qa D2 local-validation record trigger: **MET** (2026-10-18, under the user's C8 waiver in `execution-20261018/w0/decisions.md`), bound to source `061fc41feb02ac4cf12fd5f696257682994e11671b8def3cf31bd1f5c9ce1617`, dist `698a9365…`, helm `46070907…`. Record `docs/qa/evidence/STUDIO-OBS-009/local-gate-20261018/qa-local-validation-record.md` sha256 `bca21f5393d4c80df49842f805ddd3b3928fff559b09919720b349962f65633a` (json `27833e9b6557fdccd6bf395fb91abcb5691621d0ae3a8f7fe882ab23b7bc136f`), isVerdict:false. Filled by root. Drift from the G9b capture this list was measured at: exactly 2 backend test files (`GuidedPlanningIntegrationTest`, `ObservedPublicationFixture`). Test tooling is excluded by ruling A5, so no list entry moves. P1 MET; OI-23 closed.

@architect cross-check (Aria; note naming the JSON sha256 above): **CROSS-CHECKED-WITH-NOTES**, 2026-10-18, Aria (@architect), list `live-surface-list.json` sha256 `e5c58fa57f389879b2843815b5b389d0efa99921bc142155d6b18b970d7c2c57` (recomputed with `python3 -I`, equal). No required change to list content. Notes AX-1..AX-8 below and in `finalize-record.md` §E.

> **Architect cross-check notes (Aria, 2026-10-18; read-only, no test/build/helm/node run).**
> - **Checked [V]:** the JSON hash, as above. Source tree re-hashed against G9b `capture-before.json`: 1808/1808 equal. Ids are unique. Counts agree with the entries (729; protected 671; ΔG9b SAME 513 / MOVED 187 / CHANGED 7 / STATUS 5 / NEW 17). `ruling.md` (`71832a0a…`) and `pm-ack.md` (`cd618df7…`) are unchanged since they were cited.
> - **Rulings applied exactly:**
>   - A1: RTX-01..18 are protected, with the protection unit as ruled.
>   - A2: CFB-078 is in the excluded-with-reason annex, and CFB-079 is protected with its A2 note.
>   - A3: the CFC-01 annotation is a verbatim substring of 010 story `413dcac3…` (C1–C6 and C2 blocking are present). The `_helpers.tpl:434 → :593` drift is noted outside the quote, which is correct; :593 is still inside `guidedEnabled`.
>   - A4: all 18 CFK entries have the three-part `protectionRule`.
>   - A5: P09-06..08 are in the not-a-surface annex.
>   - A6: CFC-02..04 are superseded by CFB-101..103.
> - **Code spot-checks [V]:**
>   - CFK-06 matches `GuidedSessionProperties.java:17-18` (786432 / 98304).
>   - CON-25 sha `73679130…` matches, with input max 1572864 / default 786432 and output max 131072 / default 98304. CON-33 sha `c573e50b…` matches.
>   - CHT-01/07/08/09 hashes match.
>   - The chart observed block conforms to B5 items 1–9: closed list 53, `STUDIO_RUNNER_OBSERVED_` refusal at `_helpers.tpl:192-193`, G-O1..G-O4 at :438-497, catalog-first `prepend` at :610, flags rendered both ways and file/digest keys only while on (`studio-runner-deployment.yaml:242-252`), digest image at :127, ConfigMap/volume/checksum.
>   - The new rows have correct anchors: CHV-169..174 at `values.yaml:803-819`, CHE-93/94 at `values-uat.yaml:213-214`, RKS-01..05 at `config.ts:177-181`, RKO-09 at `Dockerfile:48` with script sha `cc954c63…`.
>   - Sampled MOVED anchors: CFB-021/022/078/079/098, CHV-075/076/091/097/106/113, CHE-37, CHN-09.
> - **AX-1 RKO-09 (OI-28): CONFIRMED as a surface.** It ships in the runner image, and CI calls it across the image boundary (`docker run <image> node scripts/print-observed-catalog.mjs <digest>`). It is the only producer of `studioObserved.catalog`, which G-O2 requires. Deleting or renaming it breaks every observed release, and no in-repo grep would show the missing caller (the CI step is owed). It is not test tooling, so A5 does not apply.
>   - Protection unit: the image path, the one positional digest argument, a single-line `{profile, build}` JSON on stdout validated against `BuildIdentity`, and exit 1 with no stdout on refusal.
>   - The `.d.mts` and the test file are not separate entries. That is correct.
> - **AX-2 observed entries classed live under values-uat: CONFIRMED.**
>   - The list's own status rule is "dark only if no shipped values file turns the switch on", and `values-uat.yaml:213-214` turns it on.
>   - A UAT render that fails until deploy-time inputs are supplied does not make an entry dark. Every runner-dependent entry already classed live via values-uat is in the same position because of the controller pin (B-19). Treating observed differently would be inconsistent.
>   - Under the single path, observed is the only Studio run path, so "dark" would misdescribe it.
>   - Protection is identical under both classes, so this choice moves no 011 boundary.
>   - "Live" here means switched on in a shipped values file, not deployable today. Deployability stays on the `liveEvidence.deployed` leg (owed: CI catalog step, policy owner, U4).
> - **AX-3 (A5 encoding, accepted):** my ruling said "status `excluded-not-surface`". The list keeps `status: live` (tree presence) and puts the exclusion in `protection: annex:not-a-surface` plus the inclusion text. The effect is the same, and `protection` is the field 011 reads. Consequence: the live count (608) includes 7 annexed or superseded entries. Cite the protected count (671), not the live count, as "what 011 may not remove".
> - **AX-4 (OI-27):** Alex is right, and my A6 inference was wrong. `session.schema.json` references limits by `$id` URI (`:207`), so CON-44 and CON-46 bytes do not move with A-ii (re-hashed, SAME). OI-27 is closed as informational.
> - **AX-5..AX-8 (bookkeeping, fix at the 009-Done re-date, not blocking):**
>   - (5) CON-25 and CON-33 still read `deltaVsSkeleton: SAME`; they are now changed against the skeleton.
>   - (6) CHN-12's first anchor `_helpers.tpl:357` is a doc comment; the operative lines are :605-611.
>   - (7) The CHT-07 and CHT-08 `surface` line ranges are carried from pre-G9 and do not name the observed lines. Their hashes are current.
>   - (8) `statusVocabulary.dark` still gives "runner OBSERVED_* flags" as an example dark switch. Reword it to "unless a shipped values file turns them on".
> - **Not checked:** the G9b capture-after (it does not exist yet), the @qa trigger, and the 16 @po removals. These are outside this cross-check. This is not a G9b verdict.

@pm acceptance (Morgan; per `live-surface-pre-g9-20261018/rulings/pm-ack.md` §5, list sha256 `<…>`): **ACCEPTED-WITH-NOTES**, Morgan (@pm), 2026-10-18, per `live-surface-pre-g9-20261018/rulings/pm-ack.md` §5 (`cd618df7…`), list `live-surface-list.json` sha256 `e5c58fa57f389879b2843815b5b389d0efa99921bc142155d6b18b970d7c2c57` (recomputed with `shasum -a 256`, equal). Conditions met: **P1** (@qa record `bca21f53…`/json `27833e9b…`: `trigger: MET`, `isVerdict: false`, under the user's C8 waiver, bound to source `061fc41f…`); **P2** (G9b capture-after equals capture-before in files, source and dist digests, helm-before = helm-after; drift to the bound digest is exactly 2 backend test files, current hashes `9c68ac5b…`/`9264ae0e…` equal the bound ones; test tooling is out by ruling A5); **P3** (A1–A6 applied per @architect CROSS-CHECKED-WITH-NOTES; CFC-01 annotation still a verbatim substring of the current 010 story); **P4** (exactly 16 entries `status: removed`, = RKG-00..13, RKO-03, RKO-04, confirmed by @po `0b95414d…`; 729 ids, 671 protected); **P5** (Aria's line names this sha); **P6** (009 `e900e715…` and 011 `413fcaa4…` equal today; 010 moved `413dcac3…` → `5847ece2…` only by append-only change-log rows 0.3.15 (@po note) and 0.3.16 (Status), which state no AC text changed; RBR-19 (P-1) included). Notes: (1) the list was measured at `fd793c95…` and the trigger is bound to `061fc41f…`; this acceptance stands on @qa's reading that the waiver covers that one-step successor, and it lapses if the user says the waiver stops at `fd793c95…`. (2) This is a start-path acceptance, not a quality claim: the full backend regression and JaCoCo gate are owed at the 011 T0 fresh baseline before any 011 lane claims credit, and residues R1–R9 stay owed. (3) The JSON's `g9Record` and `storyStatusChange` fields are stale (G9 NOT_MET record, "010 stays Ready"); §0 and finalize §F supersede them; fix at the 009-Done re-date with AX-5..AX-8. (4) Not covered: the second re-date after 009 Done (separate @pm acceptance), the runbook write (OI-25), the per-environment policy owner (user-owed). (5) Not re-done by me: the full 1808-file source capture; only the two drifted files were re-hashed. No test, build or git.

@po confirmation that RKG-00..13, RKO-03, RKO-04 leave the list: **CONFIRMED, all 16, Pax (@po) 2026-10-18**, `po-removal-confirmation.md`, against list sha256 `e5c58fa57f389879b2843815b5b389d0efa99921bc142155d6b18b970d7c2c57`. (Record sha256 `0b95414dd5c8dc3c2bccee5e998fa222c8978f5682cce3c09948da4f214bb1ff`. Line copied verbatim from its "Line for the list sign-off"; added by Alex (@analyst) 2026-10-18. **P4 met.** Per the root decision of 2026-10-18 no new list version is cut: the JSON above stays the list of record, and the 16 already carry `status: removed`, outside the 671 protected entries.)

- **Author:** Alex (@analyst), 2026-10-18. Mode YOLO, read-only. Writes: this folder only. Companions: `delta-from-pre-g9.md`, `finalize-record.md`.
- **Tree:** HEAD `734ad704f`, dirty. all 1808 source files, 238 dist files and 22 helm files re-hashed equal to the G9b capture-before / helm-before [V]. Re-hashed at 18:07 EDT and again by the generator at the final write (~18:16 EDT). G9b `capture-after.json` does not exist yet.
- **OpenAPI:** sha256 `bbf37fd1f96c0da33bbca6db4c04c94222a44429a4b6f0e33c92dfc59fca02c4` (unchanged since pre-G9), 36 paths, 44 operations (36 public + 8 internal).
- **G9b state when finalized** (`local-gate-20261018b/status.txt`, sha256 `e553ac3d7b68755e…`): R0-clean exit=0; R0-build exit=0; R0-verifyRunnerDist exit=0; helm-before 4607090747e4fef31713ff90db5545eb243bdcff67c3b9acfd5fff2e8e01ada8; C1-runner-typecheck-lint exit=0; C2-runner-unit exit=0; C3-runner-fixtures exit=0; C4-image-buildstage exit=0; C4-image-final exit=0; C4-runner-deployment exit=0; C5-pins exit=0; C5-contracts exit=0; C5-codegen exit=0; C6-frontend exit=0; C8-full ABORTED by root on user decision (targeted run instead).
- **G9 record:** `docs/qa/evidence/STUDIO-OBS-009/local-gate-20261018/qa-local-validation-record.md` (sha256 `e13bfbbf73aa3822…`) says `trigger: NOT_MET (pending G9b)`, `isVerdict: false`, bound to `6fcc12eef193338c…`. No G9b record exists at writing.
- **Legend:** [V] verified today by reading the anchor or by the recorded command. [I] inference, basis stated.

**Inputs (sha256 at writing):**

| File | sha256 |
|---|---|
| `docs/qa/evidence/STUDIO-OBS-010/live-surface-pre-g9-20261018/live-surface-list.pre-g9.json` | `d0d34e189da8870edbe97c4c7ec6665657c3c04b0e00a16ea0f921cd66b59b52` |
| `docs/qa/evidence/STUDIO-OBS-010/live-surface-pre-g9-20261018/live-surface-list.pre-g9.md` | `ae4794b20bf0a4891c2869b080daab5118add6a90a0e2cc7bff0b3a6a1e4fc11` |
| `docs/qa/evidence/STUDIO-OBS-010/live-surface-pre-g9-20261018/delta-from-skeleton.md` | `78eb1ad3e91b70ae7fb931e78f26eb7a720e258936e3af4133bc385c3986ec02` |
| `docs/qa/evidence/STUDIO-OBS-010/live-surface-pre-g9-20261018/finalize-checklist.md` | `bcc54bccd989dc8f264f59bc8a3ac2c7b74915da32c9e9f998906ce1764285f4` |
| `docs/qa/evidence/STUDIO-OBS-010/live-surface-pre-g9-20261018/rulings/ruling.md` | `71832a0a42f2663673a77f7915d0ea917328f162d337902f17b6d2713f6635ce` |
| `docs/qa/evidence/STUDIO-OBS-010/live-surface-pre-g9-20261018/rulings/pm-ack.md` | `cd618df756e12adbbcbc93d8fe3a4446e2f6360fb35457f41e6a273ecccf5854` |
| `docs/stories/STUDIO-OBSERVED/STUDIO-OBS-009.story.md` | `e900e7155b8033a8de91fcba95408000cce9e691f963e9b468367dbe7170c955` |
| `docs/stories/STUDIO-OBSERVED/STUDIO-OBS-010.story.md` | `413dcac36eb4994143dd10cff1176da29d2018d4cce266441f3d85ccaf9d75f5` |
| `docs/stories/STUDIO-OBSERVED/STUDIO-OBS-011.story.md` | `413fcaa4d825f51906965baa841966c0fa0c79dbac55778eef5b1a5c47753931` |
| `docs/stories/STUDIO-OBSERVED/STUDIO-OBS-011-cleanup-inventory.md` | `3f0d3a53f113d5bb17855cb60e38d1081d2f1dbccd824e1cec0d56702e91221d` |
| `docs/qa/evidence/STUDIO-OBS-011/t0-prep-20261018/po-ratification.md` | `a729e4359c928f5e9402cf45670bcf5883e1987d8ebc0b651cc6056b7976623a` |
| `docs/qa/evidence/STUDIO-OBS-009/execution-20261018/po-carry/receipt-4.md` | `5ee169b3cd5b17ab640bd52262e6d8775cd5aecd4c3c0100a1260a122d38ebf6` |
| `docs/qa/evidence/STUDIO-OBS-009/execution-20261018/post-g9/receipt.md` | `a192e903059826b902f8b16b0222563391722df9a144fd189db2bb267d8686fc` |
| `docs/qa/evidence/STUDIO-OBS-009/local-gate-20261018/capture-before.json` | `4e31560a7c8cff1ef566ac465f07fe9db14d47c271b907d25354d3fe3fb12a1b` |
| `docs/qa/evidence/STUDIO-OBS-009/local-gate-20261018/helm-before.txt` | `8dbe073c706c80b8e560ecc60593ceb550cc93fd6c4ca6486016829899dd04a6` |
| `docs/qa/evidence/STUDIO-OBS-009/local-gate-20261018/qa-local-validation-record.md` | `e13bfbbf73aa3822045523da4021fb4e9dd7980f85ffe8be6d65b63ee2551c51` |
| `docs/qa/evidence/STUDIO-OBS-009/local-gate-20261018b/capture-before.json` | `e335ea72863e050705aa0a1ac0c769c0a554ca0d505f5f43624d61708d061544` |
| `docs/qa/evidence/STUDIO-OBS-009/local-gate-20261018b/helm-before.txt` | `4607090747e4fef31713ff90db5545eb243bdcff67c3b9acfd5fff2e8e01ada8` |
| `docs/qa/evidence/STUDIO-OBS-009/local-gate-20261018b/status.txt` | `e553ac3d7b68755ea07a14d8f574358dc6743a6729de6c2752eb04b39743dc93` |
| `docs/runbooks/studio-guided-authoring.md` | `9727657a78268acda3e95d634da1eeeeaff36680b4691ab3f0f3d5fcb6d00855` |

## 1. Vocabulary

| Status | Meaning |
|---|---|
| **live** | present in the tree and in effect under shipped defaults of its layer (code default for backend/runner keys and routes; for chart values/templates: consumed on the default (guided-off) render path of a runner-enabled values file — values-uat sets studioRunner.enabled true) |
| **dark** | present in the tree but in effect under no shipped default: behind a switch that is off by default and that no shipped values file turns on (STUDIO_RUNNER_GUIDED_ENABLED / studioRunner.guided.enabled, studioAuditSiem.enabled, runner OBSERVED_* flags), or set by the chart only on such a path. Dark entries are still protected (the list protects existence, not activation) |
| **removed** | on the 2026-10-17 skeleton, gone from the tree now (removed by a 009 lane). Kept on this dated list until @po confirms the removal (D-1) |
| **absent** | planned entry that did not land (by design) |
| **holds** | negative entry ("must not exist / must refuse") verified to hold |
| **to-write** | AC-5 runbook row still to write (T2) |

| Protection | Meaning |
|---|---|
| `protected` | on the dated list; 011 must not remove it (D-1, 011 G12) |
| `annex:excluded-with-reason` | listed in an annex with a ruling reason; not protected; id kept (ruling A2) |
| `annex:not-a-surface` | listed in an annex; not an AC-5 category; id kept (ruling A5) |
| `annex:superseded-duplicate` | same key as a protected entry; protection carried by that entry (ruling A6) |
| `removed-pending-po` | gone from the tree; stays on the list until @po confirms (OI-21) |
| `not-a-surface (runbook)` | runbook section or AC-5 row to write; not a protected surface |
| `planned (protection via the landed entries)` | planned 009 item; the concrete landed entries carry the protection |
| `planned, not landed` | planned 009 item that did not land |

| Delta vs pre-G9 (ΔG9b) | Meaning |
|---|---|
| SAME | anchor file byte-identical between the G9 and G9b captures, or value and line re-read equal |
| MOVED | same name and value; anchor line moved (file changed elsewhere) |
| CHANGED | value, sha256 or component defaults changed by the post-G9 batch |
| STATUS | tree text of the entry unchanged; live/dark classification changed by the post-G9 batch |
| NEW | not on the pre-G9 draft; present at G9b |

ΔSkel is the delta against the 2026-10-17 skeleton, carried from the pre-G9 draft (vocabulary in the JSON, `deltaVsSkeletonVocabulary`).

## 2. Counts

| Category | Entries | live | dark | removed | absent | holds | to-write | protected | annex | ΔG9b NEW | ΔG9b CHANGED | ΔG9b STATUS | ΔG9b MOVED |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| route-public | 36 | 36 |  |  |  |  |  | 36 |  |  |  |  |  |
| route-internal-openapi | 8 | 8 |  |  |  |  |  | 8 |  |  |  |  |  |
| route-internal-not-in-openapi | 18 | 12 | 6 |  |  |  |  | 18 |  |  |  |  |  |
| contract-openapi | 5 | 5 |  |  |  |  |  | 5 |  |  |  |  |  |
| contracts-v3 | 51 | 51 |  |  |  |  |  | 51 |  |  | 2 |  |  |
| migration | 22 | 22 |  |  |  |  |  | 22 |  |  |  |  |  |
| config-backend-yml | 110 | 105 | 5 |  |  |  |  | 109 | 1 |  |  |  | 101 |
| config-backend-profile | 15 | 15 |  |  |  |  |  | 15 |  |  |  |  |  |
| config-backend-code-only | 13 | 9 | 4 |  |  |  |  | 10 | 3 |  |  |  |  |
| config-backend-code-default | 7 | 7 |  |  |  |  |  | 7 |  |  |  |  | 1 |
| config-backend-properties-class | 18 | 18 |  |  |  |  |  | 18 |  |  | 1 |  |  |
| config-runner-key | 58 | 51 | 7 |  |  |  |  | 58 |  |  |  | 5 |  |
| config-runner-guided-mounted | 14 |  |  | 14 |  |  |  |  |  |  |  |  |  |
| config-runner-process | 9 | 7 |  | 2 |  |  |  | 7 |  | 1 |  |  | 1 |
| chart-value | 174 | 146 | 28 |  |  |  |  | 174 |  | 6 |  |  | 53 |
| chart-value-env | 94 | 73 | 21 |  |  |  |  | 94 |  | 2 |  |  | 4 |
| chart-template | 10 | 9 | 1 |  |  |  |  | 10 |  |  | 4 |  |  |
| chart-env-other | 14 | 10 | 4 |  |  |  |  | 14 |  | 5 |  |  | 6 |
| schedule | 8 | 8 |  |  |  |  |  | 8 |  |  |  |  |  |
| runbook-section | 6 | 6 |  |  |  |  |  |  |  |  |  |  |  |
| runbook-row-to-write | 19 |  |  |  |  |  | 19 |  |  | 1 |  |  | 18 |
| planned-by-009 | 13 | 10 | 2 |  | 1 |  |  |  | 3 |  |  |  | 3 |
| negative | 7 |  |  |  |  | 7 |  | 7 |  | 2 |  |  |  |
| **Total** | **729** | **608** | **78** | **16** | **1** | **7** | **19** | **671** | **7** | **17** | **7** | **5** | **187** |

Measured at G9b [V]: OpenAPI 44 operations; `contracts/v3` 51 files; migrations 22 (head V22, no V23); `application.yml` `studio.*` leaves 110; runner `KEY_SPECS` 57 (config.ts unchanged); chart closed runner env list **53** names (was 48); `values.yaml` Studio leaves **174** (was 168); `values-<env>.yaml` leaves **94** (was 92); chart templates 10.

## 3. AC-5 named surfaces — where they are at G9b

| AC-5 / D-3 item | Entries | Anchor (G9b) | Note |
|---|---|---|---|
| Public routes `/api/v1/studio/**` incl. guided-sessions and video | RTP-15 (live), RTP-16 (live), RTP-23 (live) | `docs/specs/studio/openapi.yaml:1200`<br>`docs/specs/studio/openapi.yaml:1296`<br>`docs/specs/studio/openapi.yaml:1900` | 36 public operations RTP-01..36, all SAME at G9b (openapi.yaml unchanged) |
| OpenAPI operation enumeration with its count | OAS-00 (live) | `docs/specs/studio/openapi.yaml:1` | 44 operations; pins `StudioContractTest.java:94`, `confinement.test.ts:298` (both files unchanged) |
| `ExecutionSnapshot.replayFailure`, `ReplayFailure`, capability op (008 A1/P1) | OAS-03 (live), OAS-04 (live), RTP-10 (live) | `docs/specs/studio/openapi.yaml:4327`<br>`docs/specs/studio/openapi.yaml:4330`<br>`docs/specs/studio/openapi.yaml:935` |  |
| `/guided-policies/**` (014) | RTP-24 (live), RTP-25 (live), RTP-26 (live), RTP-27 (live), RTP-28 (live) | `docs/specs/studio/openapi.yaml:1982`<br>`docs/specs/studio/openapi.yaml:2018`<br>`docs/specs/studio/openapi.yaml:2148`<br>`docs/specs/studio/openapi.yaml:2174`<br>`docs/specs/studio/openapi.yaml:2222` |  |
| `contracts/v3` file list incl. `timing-order-vectors.json` (015) | CON-49 (live) | `docs/specs/studio-observed-authoring/contracts/v3/timing-order-vectors.json` | 51 files CON-01..51; **CON-25 `limits.schema.json` and CON-33 `publication-fixtures.json` CHANGED at G9b** (model-sizing A-ii); the other 49 unchanged |
| On-by-default flags | CFB-011 (live), CFB-016 (live) | `backend/src/main/resources/application.yml:259`<br>`backend/src/main/resources/application.yml:265` | publication and observed replay, default true |
| `studio.execution.enabled` kill switch | CFB-036 (live) | `backend/src/main/resources/application.yml:304` | chart renders STUDIO_EXECUTION_ENABLED for API and worker |
| Runner ceilings `STUDIO_RUNNER_MAX_STEP_TIMEOUT_MS` / `_MAX_TOTAL_RUNTIME_MS` "120000" | RKS-41 (live), RKS-40 (live), CHV-061 (live), CHV-062 (live) | `studio-runner/src/server/config.ts:380`<br>`studio-runner/src/server/config.ts:368`<br>`helm-chart/put-checks/values.yaml:747`<br>`helm-chart/put-checks/values.yaml:749` | chart runnerEnv `values.yaml:747` and `values.yaml:749`, value "120000", line unchanged since pre-G9 (the studioObserved block was inserted below it); the 2026-10-16 story anchor :577-579 is stale |
| `KEY_SPECS` / `ACCEPTED_KEYS` | RKS-00 (live) | `studio-runner/src/server/config.ts:176-444` | 57 keys; chart closed list now 53 of them (CHT-09) |
| Migrations V1–V18 re-baseline + forward-only V19…head | MIG-01 (live), MIG-22 (live) | `backend/src/main/resources/db/migration/V1__init.sql`<br>`backend/src/main/resources/db/migration/V22__execution_replay_failure.sql` | head V22; V23 not landed (P09-13) |
| Chart values | CHV-009 (live), CHV-022 (live), CHV-169 (live) | `helm-chart/put-checks/values.yaml:388`<br>`helm-chart/put-checks/values.yaml:448`<br>`helm-chart/put-checks/values.yaml:803` | all chart-value / chart-value-env entries; NEW `studioObserved.*` block CHV-169..174, values-uat CHE-93/94 |

## 4. Rulings applied (exactly as ruled)

| Ruling | Applied as |
|---|---|
| A1 | RTX-01..18 included (internal routes not in OpenAPI); @pm ack pm-ack.md §1 |
| A2 | CFB-078 to the excluded-with-reason annex; CFB-079 protected |
| A3 | CFC-01 carries the merge-permitted annotation verbatim (C1-C6); @pm accepted pm-ack.md §2 |
| A4 | CFK-01..18 prefix level with the three-part removal rule (protectionRule) |
| A5 | P09-06..08 to the not-a-surface annex |
| A6 | CFC-02..04 superseded-by CFB-101..103 |
| OI-14 | not ruled; the default stands: frontend surfaces out except VITE_ENABLE_STUDIO (CHV-004, CHE-09/23/45) (pm-ack.md "Not decided here") |
| P-1 | RBR-19 added (runbook row set includes P-1) |

Sources: Aria `../live-surface-pre-g9-20261018/rulings/ruling.md` (sha256 `71832a0a…`), Morgan `../live-surface-pre-g9-20261018/rulings/pm-ack.md` (sha256 `cd618df7…`), @po CFC-01 list text in `STUDIO-OBS-010.story.md` (0.3.13/0.3.14).

## 5. The list (every entry)

Columns: **Id** · **Surface** · **Value** (truncated) · **Anchor** (file:line at G9b) · **Status** · **Protection** · **ΔG9b** · **ΔSkel** · **Tag**. Owner, liveEvidence {tree, local, deployed}, notes, inclusion text, 009 and G9b change records, pre-G9 anchors and skeleton anchors are in the JSON.

### 5.1 Public routes `/api/v1/studio/**` (36)

| Id | Surface | Value | Anchor | Status | Protection | ΔG9b | ΔSkel | Tag |
|---|---|---|---|---|---|---|---|---|
| RTP-01 | GET /api/v1/studio/tests |  | `docs/specs/studio/openapi.yaml:283`<br>`…/checks/studio/StudioController.java:51` | **live** | `protected` | SAME | SAME | V |
| RTP-02 | POST /api/v1/studio/tests |  | `docs/specs/studio/openapi.yaml:351`<br>`…/checks/studio/StudioController.java:66` | **live** | `protected` | SAME | SAME | V |
| RTP-03 | GET /api/v1/studio/tests/{id} |  | `docs/specs/studio/openapi.yaml:438`<br>`…/checks/studio/StudioController.java:75` | **live** | `protected` | SAME | SAME | V |
| RTP-04 | PUT /api/v1/studio/tests/{id} |  | `docs/specs/studio/openapi.yaml:535`<br>`…/checks/studio/StudioController.java:80` | **live** | `protected` | SAME | SAME | V |
| RTP-05 | DELETE /api/v1/studio/tests/{id} |  | `docs/specs/studio/openapi.yaml:623`<br>`…/checks/studio/StudioController.java:94` | **live** | `protected` | SAME | SAME | V |
| RTP-06 | POST /api/v1/studio/tests/{id}/execute |  | `docs/specs/studio/openapi.yaml:641`<br>`…/checks/studio/StudioController.java:112` | **live** | `protected` | SAME | SAME | V |
| RTP-07 | POST /api/v1/studio/tests/{id}/validate-variables |  | `docs/specs/studio/openapi.yaml:753`<br>`…/checks/studio/StudioController.java:177` | **live** | `protected` | SAME | SAME | V |
| RTP-08 | GET /api/v1/studio/tests/{id}/secrets |  | `docs/specs/studio/openapi.yaml:811`<br>`…/checks/studio/secrets/StudioSecretsController.java:36` | **live** | `protected` | SAME | SAME | V |
| RTP-09 | POST /api/v1/studio/tests/{id}/secrets |  | `docs/specs/studio/openapi.yaml:847`<br>`…/checks/studio/secrets/StudioSecretsController.java:42` | **live** | `protected` | SAME | SAME | V |
| RTP-10 | GET /api/v1/studio/tests/{id}/capabilities |  | `docs/specs/studio/openapi.yaml:935`<br>`…/checks/studio/secrets/StudioSecretsCapabilityController.java:33` | **live** | `protected` | SAME | SAME | V |
| RTP-11 | GET /api/v1/studio/executions |  | `docs/specs/studio/openapi.yaml:1000`<br>`…/checks/studio/StudioController.java:155` | **live** | `protected` | SAME | SAME | V |
| RTP-12 | GET /api/v1/studio/executions/{id} |  | `docs/specs/studio/openapi.yaml:1061`<br>`…/checks/studio/StudioController.java:131` | **live** | `protected` | SAME | SAME | V |
| RTP-13 | POST /api/v1/studio/executions/{id}/cancel |  | `docs/specs/studio/openapi.yaml:1118`<br>`…/checks/studio/StudioController.java:144` | **live** | `protected` | SAME | SAME | V |
| RTP-14 | GET /api/v1/studio/executions/{id}/events |  | `docs/specs/studio/openapi.yaml:1166`<br>`…/checks/studio/sse/ExecutionEventsController.java:70` | **live** | `protected` | SAME | SAME | V |
| RTP-15 | GET /api/v1/studio/executions/{id}/video |  | `docs/specs/studio/openapi.yaml:1200`<br>`…/checks/studio/ExecutionVideoController.java:55` | **live** | `protected` | SAME | SAME | V |
| RTP-16 | POST /api/v1/studio/guided-sessions |  | `docs/specs/studio/openapi.yaml:1296`<br>`…/checks/studio/guided/session/GuidedSessionController.java:35` | **live** | `protected` | SAME | CHANGED | V |
| RTP-17 | GET /api/v1/studio/guided-sessions/{id} |  | `docs/specs/studio/openapi.yaml:1499`<br>`…/checks/studio/guided/session/GuidedSessionController.java:45` | **live** | `protected` | SAME | MOVED | V |
| RTP-18 | GET /api/v1/studio/guided-sessions/{id}/result |  | `docs/specs/studio/openapi.yaml:1547`<br>`…/checks/studio/guided/session/GuidedSessionController.java:59` | **live** | `protected` | SAME | MOVED | V |
| RTP-19 | GET /api/v1/studio/guided-sessions/{id}/clarification |  | `docs/specs/studio/openapi.yaml:1717`<br>`…/checks/studio/guided/session/GuidedSessionController.java:77` | **live** | `protected` | SAME | MOVED | V |
| RTP-20 | POST /api/v1/studio/guided-sessions/{id}/clarify |  | `docs/specs/studio/openapi.yaml:1759`<br>`…/checks/studio/guided/session/GuidedSessionController.java:83` | **live** | `protected` | SAME | MOVED | V |
| RTP-21 | POST /api/v1/studio/guided-sessions/{id}/cancel |  | `docs/specs/studio/openapi.yaml:1810`<br>`…/checks/studio/guided/session/GuidedSessionController.java:93` | **live** | `protected` | SAME | MOVED | V |
| RTP-22 | POST /api/v1/studio/guided-sessions/{id}/finalize |  | `docs/specs/studio/openapi.yaml:1856`<br>`…/checks/studio/guided/publication/GuidedPublicationController.java:28` | **live** | `protected` | SAME | MOVED | V |
| RTP-23 | GET /api/v1/studio/guided-sessions/{id}/video |  | `docs/specs/studio/openapi.yaml:1900`<br>`…/checks/studio/guided/evidence/GuidedSessionVideoController.java:75` | **live** | `protected` | SAME | MOVED | V |
| RTP-24 | GET /api/v1/studio/guided-policies |  | `docs/specs/studio/openapi.yaml:1982`<br>`…/checks/studio/guided/policy/ObservationPolicyController.java:42` | **live** | `protected` | SAME | MOVED | V |
| RTP-25 | POST /api/v1/studio/guided-policies |  | `docs/specs/studio/openapi.yaml:2018`<br>`…/checks/studio/guided/policy/ObservationPolicyController.java:54` | **live** | `protected` | SAME | MOVED | V |
| RTP-26 | GET /api/v1/studio/guided-policies/{id} |  | `docs/specs/studio/openapi.yaml:2148`<br>`…/checks/studio/guided/policy/ObservationPolicyController.java:60` | **live** | `protected` | SAME | MOVED | V |
| RTP-27 | POST /api/v1/studio/guided-policies/{id}/versions |  | `docs/specs/studio/openapi.yaml:2174`<br>`…/checks/studio/guided/policy/ObservationPolicyController.java:65` | **live** | `protected` | SAME | MOVED | V |
| RTP-28 | POST /api/v1/studio/guided-policies/{id}/versions/{version}/approval |  | `docs/specs/studio/openapi.yaml:2222`<br>`…/checks/studio/guided/policy/ObservationPolicyController.java:74` | **live** | `protected` | SAME | MOVED | V |
| RTP-29 | GET /api/v1/studio/tests/{id}/schedule/capabilities |  | `docs/specs/studio/openapi.yaml:2614`<br>`…/checks/studio/scheduling/StudioScheduleController.java:32` | **live** | `protected` | SAME | MOVED | V |
| RTP-30 | GET /api/v1/studio/tests/{id}/schedule |  | `docs/specs/studio/openapi.yaml:2641`<br>`…/checks/studio/scheduling/StudioScheduleController.java:37` | **live** | `protected` | SAME | MOVED | V |
| RTP-31 | PUT /api/v1/studio/tests/{id}/schedule |  | `docs/specs/studio/openapi.yaml:2708`<br>`…/checks/studio/scheduling/StudioScheduleController.java:55` | **live** | `protected` | SAME | MOVED | V |
| RTP-32 | POST /api/v1/studio/tests/{id}/schedule |  | `docs/specs/studio/openapi.yaml:2664`<br>`…/checks/studio/scheduling/StudioScheduleController.java:48` | **live** | `protected` | SAME | MOVED | V |
| RTP-33 | DELETE /api/v1/studio/tests/{id}/schedule |  | `docs/specs/studio/openapi.yaml:2753`<br>`…/checks/studio/scheduling/StudioScheduleController.java:67` | **live** | `protected` | SAME | MOVED | V |
| RTP-34 | PATCH /api/v1/studio/tests/{id}/schedule/enabled |  | `docs/specs/studio/openapi.yaml:2798`<br>`…/checks/studio/scheduling/StudioScheduleController.java:61` | **live** | `protected` | SAME | MOVED | V |
| RTP-35 | POST /api/v1/studio/schedules/preview |  | `docs/specs/studio/openapi.yaml:2848`<br>`…/checks/studio/scheduling/StudioScheduleController.java:74` | **live** | `protected` | SAME | MOVED | V |
| RTP-36 | GET /api/v1/studio/tests/{id}/schedule/occurrences |  | `docs/specs/studio/openapi.yaml:2877`<br>`…/checks/studio/scheduling/StudioScheduleController.java:80` | **live** | `protected` | SAME | MOVED | V |

### 5.2 Internal routes declared in OpenAPI (8)

| Id | Surface | Value | Anchor | Status | Protection | ΔG9b | ΔSkel | Tag |
|---|---|---|---|---|---|---|---|---|
| RTI-01 | POST /v2/validate-observed (runner; server https://runner.example.invalid) |  | `docs/specs/studio/openapi.yaml:144`<br>`studio-runner/src/server/routes.ts:206` | **live** | `protected` | SAME | CHANGED | V |
| RTI-02 | POST /v2/runs (runner; server https://runner.example.invalid) |  | `docs/specs/studio/openapi.yaml:181`<br>`studio-runner/src/server/routes.ts:206` | **live** | `protected` | SAME | CHANGED | V |
| RTI-03 | POST /internal/studio/executions/{id}/observed-admission (api-callback; server https://controller.example.inv… |  | `docs/specs/studio/openapi.yaml:225`<br>`…/checks/studio/internal/StudioInternalController.java:69` | **live** | `protected` | SAME | SAME | V |
| RTI-04 | DELETE /v2/runs/{id} (runner; server {runnerBaseUrl}) |  | `docs/specs/studio/openapi.yaml:2284`<br>`studio-runner/src/server/routes.ts:127,226` | **live** | `protected` | SAME | CHANGED | V |
| RTI-05 | GET /internal/studio/executions/{id}/control (api-callback; server {apiInternalBaseUrl}) |  | `docs/specs/studio/openapi.yaml:2344`<br>`…/checks/studio/internal/StudioInternalController.java:64` | **live** | `protected` | SAME | MOVED | V |
| RTI-06 | POST /internal/studio/executions/{id}/progress (api-callback; server {apiInternalBaseUrl}) |  | `docs/specs/studio/openapi.yaml:2395`<br>`…/checks/studio/internal/StudioInternalController.java:91` | **live** | `protected` | SAME | MOVED | V |
| RTI-07 | GET /health (runner; server {runnerBaseUrl}) |  | `docs/specs/studio/openapi.yaml:2550`<br>`studio-runner/src/server/routes.ts:188` | **live** | `protected` | SAME | CHANGED | V |
| RTI-08 | GET /ready (runner; server {runnerBaseUrl}) |  | `docs/specs/studio/openapi.yaml:2582`<br>`studio-runner/src/server/routes.ts:194` | **live** | `protected` | SAME | CHANGED | V |

### 5.3 Internal routes not in OpenAPI (included, ruling A1) (18)

| Id | Surface | Value | Anchor | Status | Protection | ΔG9b | ΔSkel | Tag |
|---|---|---|---|---|---|---|---|---|
| RTX-01 | POST /internal/v2/studio/guided-sessions/{id}/claim (backend; runner->API bridge callback) |  | `…/checks/studio/guided/session/GuidedInternalController.java:31` | **live** | `protected` | SAME | SAME | V |
| RTX-02 | POST /internal/v2/studio/guided-sessions/{id}/observations (backend; runner->API bridge callback) |  | `…/checks/studio/guided/session/GuidedInternalController.java:42` | **live** | `protected` | SAME | SAME | V |
| RTX-03 | POST /internal/v2/studio/guided-sessions/{id}/admissions (backend; runner->API bridge callback) |  | `…/checks/studio/guided/session/GuidedInternalController.java:54` | **live** | `protected` | SAME | SAME | V |
| RTX-04 | POST /internal/v2/studio/guided-sessions/{id}/advance (backend; runner->API bridge callback) |  | `…/checks/studio/guided/session/GuidedInternalController.java:68` | **live** | `protected` | SAME | SAME | V |
| RTX-05 | POST /internal/v2/studio/guided-sessions/{id}/outcomes (backend; runner->API bridge callback) |  | `…/checks/studio/guided/session/GuidedInternalController.java:82` | **live** | `protected` | SAME | SAME | V |
| RTX-06 | POST /internal/v2/studio/guided-sessions/{id}/bootstrap-evidence (backend; runner->API bridge callback) |  | `…/checks/studio/guided/session/GuidedInternalController.java:94` | **live** | `protected` | SAME | SAME | V |
| RTX-07 | POST /internal/v2/studio/guided-sessions/{id}/lifecycle (backend; runner->API bridge callback) |  | `…/checks/studio/guided/session/GuidedInternalController.java:106` | **live** | `protected` | SAME | BEHAVIOUR | V |
| RTX-08 | POST /internal/v2/studio/guided-sessions/{id}/recording-evidence (backend; runner->API bridge callback) |  | `…/checks/studio/guided/evidence/GuidedSessionEvidenceInternalController.java:50 (ROUTE GuidedSessionEvidenceService.java:43)` | **live** | `protected` | SAME | BEHAVIOUR | V |
| RTX-09 | POST /internal/v2/studio/guided-sessions/{id}/plans (backend; runner->API bridge callback) |  | `…/checks/studio/guided/translation/GuidedPlanningController.java:29` | **live** | `protected` | SAME | SAME | V |
| RTX-10 | POST /internal/v2/studio/guided-sessions/{id}/proposals (backend; runner->API bridge callback) |  | `…/checks/studio/guided/translation/GuidedPlanningController.java:41` | **live** | `protected` | SAME | SAME | V |
| RTX-11 | POST /internal/v2/studio/guided-sessions/{id}/dependency-admissions (backend; runner->API bridge callback) |  | `…/checks/studio/guided/translation/GuidedPlanningController.java:53` | **live** | `protected` | SAME | SAME | V |
| RTX-12 | POST /internal/v2/studio/guided-sessions/{id}/planning-context (backend; runner->API bridge callback) |  | `…/checks/studio/guided/translation/GuidedPlanningController.java:65` | **live** | `protected` | SAME | SAME | V |
| RTX-13 | POST /internal/v2/studio/guided-sessions/{id}/assign (runner guided bridge; API->runner) |  | `studio-runner/src/guided/transport.ts:101`<br>`studio-runner/src/server/routes.ts:130` | **dark** | `protected` | SAME | CHANGED | V |
| RTX-14 | POST /internal/v2/studio/guided-sessions/{id}/context (runner guided bridge; API->runner) |  | `studio-runner/src/guided/transport.ts:101`<br>`studio-runner/src/server/routes.ts:130` | **dark** | `protected` | SAME | CHANGED | V |
| RTX-15 | POST /internal/v2/studio/guided-sessions/{id}/prepare (runner guided bridge; API->runner) |  | `studio-runner/src/guided/transport.ts:101`<br>`studio-runner/src/server/routes.ts:130` | **dark** | `protected` | SAME | CHANGED | V |
| RTX-16 | POST /internal/v2/studio/guided-sessions/{id}/dispatch (runner guided bridge; API->runner) |  | `studio-runner/src/guided/transport.ts:101`<br>`studio-runner/src/server/routes.ts:130` | **dark** | `protected` | SAME | CHANGED | V |
| RTX-17 | POST /internal/v2/studio/guided-sessions/{id}/observe (runner guided bridge; API->runner) |  | `studio-runner/src/guided/transport.ts:101`<br>`studio-runner/src/server/routes.ts:130` | **dark** | `protected` | SAME | CHANGED | V |
| RTX-18 | POST /internal/v2/studio/guided-sessions/{id}/stop (runner guided bridge; API->runner) |  | `studio-runner/src/guided/transport.ts:101`<br>`studio-runner/src/server/routes.ts:130` | **dark** | `protected` | SAME | CHANGED | V |

### 5.4 OpenAPI document and named components (5)

| Id | Surface | Value | Anchor | Status | Protection | ΔG9b | ΔSkel | Tag |
|---|---|---|---|---|---|---|---|---|
| OAS-00 | docs/specs/studio/openapi.yaml (36 paths, 44 operations: 36 public + 8 internal) | sha256 bbf37fd1f96c0da33bbca6db4c04c94222a44429a4b6f0e33c92dfc59fca02… | `docs/specs/studio/openapi.yaml:1`<br>`backend/src/test/java/com/citi/put/checks/studio/StudioContractTest.java:94 (BASE_SHA256), :345-346 (hasSize 44)`<br>`studio-runner/test/run/confinement.test.ts:298 (BASE_SHA256)` | **live** | `protected` | SAME | CHANGED | V |
| OAS-01 | components.schemas.RuntimeVersions |  | `docs/specs/studio/openapi.yaml:4185` | **live** | `protected` | SAME | CHANGED | V |
| OAS-02 | components.schemas.ReportedRuntimeVersions |  | `docs/specs/studio/openapi.yaml:4610` | **live** | `protected` | SAME | CHANGED | V |
| OAS-03 | components.schemas.ExecutionSnapshot.replayFailure |  | `docs/specs/studio/openapi.yaml:4327` | **live** | `protected` | SAME | MOVED | V |
| OAS-04 | components.schemas.ReplayFailure |  | `docs/specs/studio/openapi.yaml:4330` | **live** | `protected` | SAME | MOVED | V |

### 5.5 `contracts/v3` documents (51)

| Id | Surface | Value | Anchor | Status | Protection | ΔG9b | ΔSkel | Tag |
|---|---|---|---|---|---|---|---|---|
| CON-01 | contracts/v3/action-timing.schema.json | sha256 `d2cb597f799dfac2…` | `docs/specs/studio-observed-authoring/contracts/v3/action-timing.schema.json` | **live** | `protected` | SAME | SAME | V |
| CON-02 | contracts/v3/action.schema.json | sha256 `cf6844f8eb31169c…` | `docs/specs/studio-observed-authoring/contracts/v3/action.schema.json` | **live** | `protected` | SAME | SAME | V |
| CON-03 | contracts/v3/allocation.schema.json | sha256 `8261aca9be0cfdda…` | `docs/specs/studio-observed-authoring/contracts/v3/allocation.schema.json` | **live** | `protected` | SAME | SAME | V |
| CON-04 | contracts/v3/assignment-lifecycle.schema.json | sha256 `52a37865db75a8e2…` | `docs/specs/studio-observed-authoring/contracts/v3/assignment-lifecycle.schema.json` | **live** | `protected` | SAME | SAME | V |
| CON-05 | contracts/v3/assignment-receipt.schema.json | sha256 `7efac7f0b31dff85…` | `docs/specs/studio-observed-authoring/contracts/v3/assignment-receipt.schema.json` | **live** | `protected` | SAME | SAME | V |
| CON-06 | contracts/v3/assignment-stop.schema.json | sha256 `358e6d151e4fb7b2…` | `docs/specs/studio-observed-authoring/contracts/v3/assignment-stop.schema.json` | **live** | `protected` | SAME | SAME | V |
| CON-07 | contracts/v3/assignment.schema.json | sha256 `ced834f01f4f346f…` | `docs/specs/studio-observed-authoring/contracts/v3/assignment.schema.json` | **live** | `protected` | SAME | SAME | V |
| CON-08 | contracts/v3/authored-inputs.schema.json | sha256 `9ff02b3dd33bfb2c…` | `docs/specs/studio-observed-authoring/contracts/v3/authored-inputs.schema.json` | **live** | `protected` | SAME | SAME | V |
| CON-09 | contracts/v3/authoring-snapshot.schema.json | sha256 `dc212b318aee6076…` | `docs/specs/studio-observed-authoring/contracts/v3/authoring-snapshot.schema.json` | **live** | `protected` | SAME | SAME | V |
| CON-10 | contracts/v3/availability.schema.json | sha256 `e286e88762d4e301…` | `docs/specs/studio-observed-authoring/contracts/v3/availability.schema.json` | **live** | `protected` | SAME | SAME | V |
| CON-11 | contracts/v3/binding.schema.json | sha256 `78ba6b131343ec5b…` | `docs/specs/studio-observed-authoring/contracts/v3/binding.schema.json` | **live** | `protected` | SAME | SAME | V |
| CON-12 | contracts/v3/bridge.schema.json | sha256 `039ad4017a825648…` | `docs/specs/studio-observed-authoring/contracts/v3/bridge.schema.json` | **live** | `protected` | SAME | SAME | V |
| CON-13 | contracts/v3/clarification.schema.json | sha256 `8ec215edc4334d4b…` | `docs/specs/studio-observed-authoring/contracts/v3/clarification.schema.json` | **live** | `protected` | SAME | SAME | V |
| CON-14 | contracts/v3/commands.schema.json | sha256 `7a8dbc6c5af455dc…` | `docs/specs/studio-observed-authoring/contracts/v3/commands.schema.json` | **live** | `protected` | SAME | SAME | V |
| CON-15 | contracts/v3/consumer-edge.schema.json | sha256 `921982d21c7a8151…` | `docs/specs/studio-observed-authoring/contracts/v3/consumer-edge.schema.json` | **live** | `protected` | SAME | SAME | V |
| CON-16 | contracts/v3/current-synthetic-worlds.json | sha256 `88abb9cb08689f2e…` | `docs/specs/studio-observed-authoring/contracts/v3/current-synthetic-worlds.json` | **live** | `protected` | SAME | SAME | V |
| CON-17 | contracts/v3/error.schema.json | sha256 `4bf2846a3bafdc9f…` | `docs/specs/studio-observed-authoring/contracts/v3/error.schema.json` | **live** | `protected` | SAME | SAME | V |
| CON-18 | contracts/v3/execution-evidence.schema.json | sha256 `5f9eda27221c948d…` | `docs/specs/studio-observed-authoring/contracts/v3/execution-evidence.schema.json` | **live** | `protected` | SAME | SAME | V |
| CON-19 | contracts/v3/fixtures.json | sha256 `fb1f9856353fef07…` | `docs/specs/studio-observed-authoring/contracts/v3/fixtures.json` | **live** | `protected` | SAME | SAME | V |
| CON-20 | contracts/v3/guided-model-response.schema.json | sha256 `2d986c098548b604…` | `docs/specs/studio-observed-authoring/contracts/v3/guided-model-response.schema.json` | **live** | `protected` | SAME | SAME | V |
| CON-21 | contracts/v3/guided-planning-commands.schema.json | sha256 `7229d5841845c045…` | `docs/specs/studio-observed-authoring/contracts/v3/guided-planning-commands.schema.json` | **live** | `protected` | SAME | SAME | V |
| CON-22 | contracts/v3/guided-policy.schema.json | sha256 `9536507b5a3b6fe6…` | `docs/specs/studio-observed-authoring/contracts/v3/guided-policy.schema.json` | **live** | `protected` | SAME | SAME | V |
| CON-23 | contracts/v3/learned-plan.schema.json | sha256 `404ec2ea1ee73337…` | `docs/specs/studio-observed-authoring/contracts/v3/learned-plan.schema.json` | **live** | `protected` | SAME | SAME | V |
| CON-24 | contracts/v3/ledger.schema.json | sha256 `081f1c4f45386a52…` | `docs/specs/studio-observed-authoring/contracts/v3/ledger.schema.json` | **live** | `protected` | SAME | SAME | V |
| CON-25 | contracts/v3/limits.schema.json | sha256 `736791305cf68723…` | `docs/specs/studio-observed-authoring/contracts/v3/limits.schema.json` | **live** | `protected` | CHANGED | SAME | V |
| CON-26 | contracts/v3/observation-refresh.schema.json | sha256 `66d7a4591ac4fae4…` | `docs/specs/studio-observed-authoring/contracts/v3/observation-refresh.schema.json` | **live** | `protected` | SAME | SAME | V |
| CON-27 | contracts/v3/observation.schema.json | sha256 `31afe5aa601b10ea…` | `docs/specs/studio-observed-authoring/contracts/v3/observation.schema.json` | **live** | `protected` | SAME | SAME | V |
| CON-28 | contracts/v3/planning-context.schema.json | sha256 `aa83c37a4b647dae…` | `docs/specs/studio-observed-authoring/contracts/v3/planning-context.schema.json` | **live** | `protected` | SAME | SAME | V |
| CON-29 | contracts/v3/planning-fixtures.json | sha256 `f642159fd4947430…` | `docs/specs/studio-observed-authoring/contracts/v3/planning-fixtures.json` | **live** | `protected` | SAME | SAME | V |
| CON-30 | contracts/v3/producer.schema.json | sha256 `9a71f3e82034bc7b…` | `docs/specs/studio-observed-authoring/contracts/v3/producer.schema.json` | **live** | `protected` | SAME | SAME | V |
| CON-31 | contracts/v3/public-ui-projections.schema.json | sha256 `a435e034f7dd0910…` | `docs/specs/studio-observed-authoring/contracts/v3/public-ui-projections.schema.json` | **live** | `protected` | SAME | SAME | V |
| CON-32 | contracts/v3/publication-canonical-vectors.json | sha256 `995458217fdd08ae…` | `docs/specs/studio-observed-authoring/contracts/v3/publication-canonical-vectors.json` | **live** | `protected` | SAME | SAME | V |
| CON-33 | contracts/v3/publication-fixtures.json | sha256 `c573e50bb3fb6cbf…` | `docs/specs/studio-observed-authoring/contracts/v3/publication-fixtures.json` | **live** | `protected` | CHANGED | SAME | V |
| CON-34 | contracts/v3/publication.schema.json | sha256 `f5314de5d45dd277…` | `docs/specs/studio-observed-authoring/contracts/v3/publication.schema.json` | **live** | `protected` | SAME | SAME | V |
| CON-35 | contracts/v3/replay-artifact.schema.json | sha256 `590e3d79a0d4b6ef…` | `docs/specs/studio-observed-authoring/contracts/v3/replay-artifact.schema.json` | **live** | `protected` | SAME | SAME | V |
| CON-36 | contracts/v3/replay-ipc.schema.json | sha256 `6bbf2c36dafb970f…` | `docs/specs/studio-observed-authoring/contracts/v3/replay-ipc.schema.json` | **live** | `protected` | SAME | SAME | V |
| CON-37 | contracts/v3/replay-job.schema.json | sha256 `f1c850dedcc62e7e…` | `docs/specs/studio-observed-authoring/contracts/v3/replay-job.schema.json` | **live** | `protected` | SAME | SAME | V |
| CON-38 | contracts/v3/replay-operation.schema.json | sha256 `1e5035d1badbe7c7…` | `docs/specs/studio-observed-authoring/contracts/v3/replay-operation.schema.json` | **live** | `protected` | SAME | SAME | V |
| CON-39 | contracts/v3/replay-policy.schema.json | sha256 `045ee1bd22bd654c…` | `docs/specs/studio-observed-authoring/contracts/v3/replay-policy.schema.json` | **live** | `protected` | SAME | SAME | V |
| CON-40 | contracts/v3/replay-profile.schema.json | sha256 `adf91ed11e9d878e…` | `docs/specs/studio-observed-authoring/contracts/v3/replay-profile.schema.json` | **live** | `protected` | SAME | SAME | V |
| CON-41 | contracts/v3/replay-validation.schema.json | sha256 `40d547d989156154…` | `docs/specs/studio-observed-authoring/contracts/v3/replay-validation.schema.json` | **live** | `protected` | SAME | SAME | V |
| CON-42 | contracts/v3/result.schema.json | sha256 `22ce88aeeac00de3…` | `docs/specs/studio-observed-authoring/contracts/v3/result.schema.json` | **live** | `protected` | SAME | SAME | V |
| CON-43 | contracts/v3/revision.schema.json | sha256 `e37b2bd9869d42af…` | `docs/specs/studio-observed-authoring/contracts/v3/revision.schema.json` | **live** | `protected` | SAME | SAME | V |
| CON-44 | contracts/v3/runner-context.schema.json | sha256 `7db2628f53fb646c…` | `docs/specs/studio-observed-authoring/contracts/v3/runner-context.schema.json` | **live** | `protected` | SAME | SAME | V |
| CON-45 | contracts/v3/session-view.schema.json | sha256 `38dd5dddc4e48003…` | `docs/specs/studio-observed-authoring/contracts/v3/session-view.schema.json` | **live** | `protected` | SAME | SAME | V |
| CON-46 | contracts/v3/session.schema.json | sha256 `3651dc302709f3b1…` | `docs/specs/studio-observed-authoring/contracts/v3/session.schema.json` | **live** | `protected` | SAME | SAME | V |
| CON-47 | contracts/v3/source-reference.schema.json | sha256 `184a99cc4018f589…` | `docs/specs/studio-observed-authoring/contracts/v3/source-reference.schema.json` | **live** | `protected` | SAME | SAME | V |
| CON-48 | contracts/v3/source-selection.schema.json | sha256 `df429534e7b827b5…` | `docs/specs/studio-observed-authoring/contracts/v3/source-selection.schema.json` | **live** | `protected` | SAME | SAME | V |
| CON-49 | contracts/v3/timing-order-vectors.json | sha256 `28a2171311f37dc5…` | `docs/specs/studio-observed-authoring/contracts/v3/timing-order-vectors.json` | **live** | `protected` | SAME | SAME | V |
| CON-50 | contracts/v3/versions.schema.json | sha256 `02bc1bbc453daea9…` | `docs/specs/studio-observed-authoring/contracts/v3/versions.schema.json` | **live** | `protected` | SAME | SAME | V |
| CON-51 | contracts/v3/wire-parity.fixtures.json | sha256 `38d30dc9fa01b714…` | `docs/specs/studio-observed-authoring/contracts/v3/wire-parity.fixtures.json` | **live** | `protected` | SAME | SAME | V |

### 5.6 Migrations (22)

| Id | Surface | Value | Anchor | Status | Protection | ΔG9b | ΔSkel | Tag |
|---|---|---|---|---|---|---|---|---|
| MIG-01 | Flyway V1__init.sql | sha256 `2e010e6e1e6f0170…` | `backend/src/main/resources/db/migration/V1__init.sql` | **live** | `protected` | SAME | SAME | V |
| MIG-02 | Flyway V2__schedule_next_execution.sql | sha256 `7a36462fcceb86d2…` | `backend/src/main/resources/db/migration/V2__schedule_next_execution.sql` | **live** | `protected` | SAME | SAME | V |
| MIG-03 | Flyway V3__check_templates_seed.sql | sha256 `8c356f1081df490c…` | `backend/src/main/resources/db/migration/V3__check_templates_seed.sql` | **live** | `protected` | SAME | SAME | V |
| MIG-04 | Flyway V4__secrets_encrypted_value.sql | sha256 `91662e9f2c8f07e2…` | `backend/src/main/resources/db/migration/V4__secrets_encrypted_value.sql` | **live** | `protected` | SAME | SAME | V |
| MIG-05 | Flyway V5__story_3_schema_additions.sql | sha256 `b930941c1b7ba06b…` | `backend/src/main/resources/db/migration/V5__story_3_schema_additions.sql` | **live** | `protected` | SAME | SAME | V |
| MIG-06 | Flyway V6__report_next_delivery.sql | sha256 `d4669fed42d82824…` | `backend/src/main/resources/db/migration/V6__report_next_delivery.sql` | **live** | `protected` | SAME | SAME | V |
| MIG-07 | Flyway V7__partition_remaining_tables_and_defaults.sql | sha256 `ee6f50fe699f70af…` | `backend/src/main/resources/db/migration/V7__partition_remaining_tables_and_defaults.sql` | **live** | `protected` | SAME | SAME | V |
| MIG-08 | Flyway V8__failed_dispatches_and_report_failures.sql | sha256 `78ad49e718124c78…` | `backend/src/main/resources/db/migration/V8__failed_dispatches_and_report_failures.sql` | **live** | `protected` | SAME | SAME | V |
| MIG-09 | Flyway V9__schedules_check_type_column.sql | sha256 `9c91a6b11df2f9b0…` | `backend/src/main/resources/db/migration/V9__schedules_check_type_column.sql` | **live** | `protected` | SAME | SAME | V |
| MIG-10 | Flyway V10__uppercase_status_standardization.sql | sha256 `714ea331197e4b30…` | `backend/src/main/resources/db/migration/V10__uppercase_status_standardization.sql` | **live** | `protected` | SAME | SAME | V |
| MIG-11 | Flyway V11__check_acknowledge_assign.sql | sha256 `13a95eb5154cc4f3…` | `backend/src/main/resources/db/migration/V11__check_acknowledge_assign.sql` | **live** | `protected` | SAME | SAME | V |
| MIG-12 | Flyway V12__tests_revisions.sql | sha256 `274c26c4d41fbd99…` | `backend/src/main/resources/db/migration/V12__tests_revisions.sql` | **live** | `protected` | SAME | SAME | V |
| MIG-13 | Flyway V13__executions_ledger.sql | sha256 `f258e01be9963e58…` | `backend/src/main/resources/db/migration/V13__executions_ledger.sql` | **live** | `protected` | SAME | SAME | V |
| MIG-14 | Flyway V14__guided_sessions.sql | sha256 `bc28e43835aefe15…` | `backend/src/main/resources/db/migration/V14__guided_sessions.sql` | **live** | `protected` | SAME | SAME | V |
| MIG-15 | Flyway V15__publication.sql | sha256 `ef092dfff93a24c4…` | `backend/src/main/resources/db/migration/V15__publication.sql` | **live** | `protected` | SAME | SAME | V |
| MIG-16 | Flyway V16__scheduling.sql | sha256 `6d7f4888aabf4a72…` | `backend/src/main/resources/db/migration/V16__scheduling.sql` | **live** | `protected` | SAME | SAME | V |
| MIG-17 | Flyway V17__secret_use_audit.sql | sha256 `a5b6a89525f3b537…` | `backend/src/main/resources/db/migration/V17__secret_use_audit.sql` | **live** | `protected` | SAME | SAME | V |
| MIG-18 | Flyway V18__drop_plaintext_secrets.sql | sha256 `febfd5eb1624240e…` | `backend/src/main/resources/db/migration/V18__drop_plaintext_secrets.sql` | **live** | `protected` | SAME | SAME | V |
| MIG-19 | Flyway V19__guided_governance.sql | sha256 `628b47efbb656aef…` | `backend/src/main/resources/db/migration/V19__guided_governance.sql` | **live** | `protected` | SAME | SAME | V |
| MIG-20 | Flyway V20__guided_session_recording.sql | sha256 `e26da3077ca90fc0…` | `backend/src/main/resources/db/migration/V20__guided_session_recording.sql` | **live** | `protected` | SAME | SAME | V |
| MIG-21 | Flyway V21__guided_session_replaying_prefix.sql | sha256 `b012ddddb44b599c…` | `backend/src/main/resources/db/migration/V21__guided_session_replaying_prefix.sql` | **live** | `protected` | SAME | SAME | V |
| MIG-22 | Flyway V22__execution_replay_failure.sql | sha256 `29437d3bda6479fa…` | `backend/src/main/resources/db/migration/V22__execution_replay_failure.sql` | **live** | `protected` | SAME | SAME | V |

### 5.7 Backend `application.yml` `studio.*` leaves (110)

| Id | Surface | Value | Anchor | Status | Protection | ΔG9b | ΔSkel | Tag |
|---|---|---|---|---|---|---|---|---|
| CFB-001 | studio.guided-authoring.controller-token-file | ${STUDIO_GUIDED_RUNNER_CONTROLLER_TOKEN_FILE:} | `backend/src/main/resources/application.yml:200` | **dark** | `protected` | SAME | SAME | V |
| CFB-002 | studio.guided-authoring.translation.controller-token-file | ${STUDIO_GUIDED_CONTROLLER_TOKEN_FILE:${studio.guided-authoring.contr… | `backend/src/main/resources/application.yml:221` | **dark** | `protected` | SAME | MOVED | V |
| CFB-003 | studio.guided-authoring.retention.observation-window | ${STUDIO_GUIDED_OBSERVATION_RETENTION:30d} | `backend/src/main/resources/application.yml:227` | **live** | `protected` | SAME | MOVED | V |
| CFB-004 | studio.guided-authoring.retention.pruner-delay-ms | 3600000 | `backend/src/main/resources/application.yml:228` | **live** | `protected` | SAME | MOVED | V |
| CFB-005 | studio.guided-authoring.retention.batch-size | 100 | `backend/src/main/resources/application.yml:229` | **live** | `protected` | SAME | MOVED | V |
| CFB-006 | studio.guided-authoring.csi-budget.max-concurrent-sessions | ${STUDIO_GUIDED_CSI_MAX_CONCURRENT:3} | `backend/src/main/resources/application.yml:234` | **live** | `protected` | MOVED | MOVED | V |
| CFB-007 | studio.guided-authoring.csi-budget.daily-model-input-tokens | ${STUDIO_GUIDED_CSI_DAILY_INPUT_TOKENS:5242880} | `backend/src/main/resources/application.yml:235` | **live** | `protected` | MOVED | MOVED | V |
| CFB-008 | studio.guided-authoring.csi-budget.daily-model-output-tokens | ${STUDIO_GUIDED_CSI_DAILY_OUTPUT_TOKENS:640000} | `backend/src/main/resources/application.yml:236` | **live** | `protected` | MOVED | MOVED | V |
| CFB-009 | studio.guided-authoring.policy.approver-groups | [] | `backend/src/main/resources/application.yml:240` | **live** | `protected` | MOVED | MOVED | V |
| CFB-010 | studio.guided-authoring.policy.default-destructive-vocabulary | ["delete", "remove", "erase", "destroy", "purge", "pay", "transfer", … | `backend/src/main/resources/application.yml:241` | **live** | `protected` | MOVED | MOVED | V |
| CFB-011 | studio.guided.publication.enabled | ${STUDIO_OBSERVED_PUBLICATION_ENABLED:true} | `backend/src/main/resources/application.yml:259` | **live** | `protected` | MOVED | MOVED | V |
| CFB-012 | studio.guided.publication.max-validation-attempts | 3 | `backend/src/main/resources/application.yml:260` | **live** | `protected` | MOVED | MOVED | V |
| CFB-013 | studio.guided.publication.validation-timeout-ms | 15000 | `backend/src/main/resources/application.yml:261` | **live** | `protected` | MOVED | MOVED | V |
| CFB-014 | studio.guided.publication.authorization-ttl-ms | 5000 | `backend/src/main/resources/application.yml:262` | **live** | `protected` | MOVED | MOVED | V |
| CFB-015 | studio.guided.publication.max-validation-bytes | 8388608 | `backend/src/main/resources/application.yml:263` | **live** | `protected` | MOVED | MOVED | V |
| CFB-016 | studio.observed-replay.enabled | ${STUDIO_OBSERVED_REPLAY_ENABLED:true} | `backend/src/main/resources/application.yml:265` | **live** | `protected` | MOVED | MOVED | V |
| CFB-017 | studio.observed-replay.authorization-ttl-ms | 30000 | `backend/src/main/resources/application.yml:266` | **live** | `protected` | MOVED | MOVED | V |
| CFB-018 | studio.observed-replay.max-artifact-bytes | 1048576 | `backend/src/main/resources/application.yml:267` | **live** | `protected` | MOVED | MOVED | V |
| CFB-019 | studio.observed-replay.max-job-bytes | 4194304 | `backend/src/main/resources/application.yml:268` | **live** | `protected` | MOVED | MOVED | V |
| CFB-020 | studio.observed-replay.max-execute-frame-bytes | 2097152 | `backend/src/main/resources/application.yml:269` | **live** | `protected` | MOVED | MOVED | V |
| CFB-021 | studio.observed-replay.catalog-json | ${STUDIO_OBSERVED_CATALOG_JSON:[]} | `backend/src/main/resources/application.yml:270` | **live** | `protected` | MOVED | MOVED | V |
| CFB-022 | studio.observed-replay.policies-json | ${STUDIO_OBSERVED_POLICIES_JSON:[]} | `backend/src/main/resources/application.yml:271` | **live** | `protected` | MOVED | MOVED | V |
| CFB-023 | studio.observed-replay.recording-width | ${STUDIO_OBSERVED_RECORDING_WIDTH:1280} | `backend/src/main/resources/application.yml:272` | **live** | `protected` | MOVED | MOVED | V |
| CFB-024 | studio.observed-replay.recording-height | ${STUDIO_OBSERVED_RECORDING_HEIGHT:720} | `backend/src/main/resources/application.yml:273` | **live** | `protected` | MOVED | MOVED | V |
| CFB-025 | studio.authoring.max-steps | ${STUDIO_AUTHORING_MAX_STEPS:100} | `backend/src/main/resources/application.yml:276` | **live** | `protected` | MOVED | MOVED | V |
| CFB-026 | studio.secrets.vault.provider | ${STUDIO_VAULT_PROVIDER:none} | `backend/src/main/resources/application.yml:289` | **live** | `protected` | MOVED | MOVED | V |
| CFB-027 | studio.secrets.vault.hashicorp.address | ${STUDIO_VAULT_ADDRESS:} | `backend/src/main/resources/application.yml:291` | **live** | `protected` | MOVED | MOVED | V |
| CFB-028 | studio.secrets.vault.hashicorp.namespace | ${STUDIO_VAULT_NAMESPACE:} | `backend/src/main/resources/application.yml:292` | **live** | `protected` | MOVED | MOVED | V |
| CFB-029 | studio.secrets.vault.hashicorp.mount | ${STUDIO_VAULT_MOUNT:secret} | `backend/src/main/resources/application.yml:293` | **live** | `protected` | MOVED | MOVED | V |
| CFB-030 | studio.secrets.vault.hashicorp.path-template | ${STUDIO_VAULT_PATH_TEMPLATE:} | `backend/src/main/resources/application.yml:294` | **live** | `protected` | MOVED | MOVED | V |
| CFB-031 | studio.secrets.vault.hashicorp.value-key | ${STUDIO_VAULT_VALUE_KEY:value} | `backend/src/main/resources/application.yml:295` | **live** | `protected` | MOVED | MOVED | V |
| CFB-032 | studio.secrets.vault.hashicorp.token-file | ${STUDIO_VAULT_TOKEN_FILE:} | `backend/src/main/resources/application.yml:296` | **live** | `protected` | MOVED | MOVED | V |
| CFB-033 | studio.secrets.vault.hashicorp.connect-timeout | ${STUDIO_VAULT_CONNECT_TIMEOUT:2s} | `backend/src/main/resources/application.yml:297` | **live** | `protected` | MOVED | MOVED | V |
| CFB-034 | studio.secrets.vault.hashicorp.request-timeout | ${STUDIO_VAULT_REQUEST_TIMEOUT:5s} | `backend/src/main/resources/application.yml:298` | **live** | `protected` | MOVED | MOVED | V |
| CFB-035 | studio.secrets.vault.hashicorp.max-response-bytes | ${STUDIO_VAULT_MAX_RESPONSE_BYTES:65536} | `backend/src/main/resources/application.yml:299` | **live** | `protected` | MOVED | MOVED | V |
| CFB-036 | studio.execution.enabled | ${STUDIO_EXECUTION_ENABLED:true} | `backend/src/main/resources/application.yml:304` | **live** | `protected` | MOVED | MOVED | V |
| CFB-037 | studio.execution.pending-sla | ${STUDIO_PENDING_SLA:600s} | `backend/src/main/resources/application.yml:306` | **live** | `protected` | MOVED | MOVED | V |
| CFB-038 | studio.execution.start-deadline | ${STUDIO_START_DEADLINE:30s} | `backend/src/main/resources/application.yml:307` | **live** | `protected` | MOVED | MOVED | V |
| CFB-039 | studio.execution.run-deadline | ${STUDIO_RUN_DEADLINE:600s} | `backend/src/main/resources/application.yml:308` | **live** | `protected` | MOVED | MOVED | V |
| CFB-040 | studio.execution.total-runtime | ${STUDIO_TOTAL_RUNTIME:120s} | `backend/src/main/resources/application.yml:314` | **live** | `protected` | MOVED | MOVED | V |
| CFB-041 | studio.execution.admission-timeout | ${STUDIO_ADMISSION_TIMEOUT:10s} | `backend/src/main/resources/application.yml:315` | **live** | `protected` | MOVED | MOVED | V |
| CFB-042 | studio.execution.evidence-retention | ${STUDIO_EVIDENCE_RETENTION:30d} | `backend/src/main/resources/application.yml:316` | **live** | `protected` | MOVED | MOVED | V |
| CFB-043 | studio.execution.callback-base-url | ${STUDIO_CALLBACK_BASE_URL:http://put-checks-api:8080} | `backend/src/main/resources/application.yml:318` | **live** | `protected` | MOVED | MOVED | V |
| CFB-044 | studio.execution.video-store.bucket | ${STUDIO_EVIDENCE_BUCKET:put-checks-studio-evidence} | `backend/src/main/resources/application.yml:323` | **live** | `protected` | MOVED | MOVED | V |
| CFB-045 | studio.execution.video-store.endpoint | ${STUDIO_EVIDENCE_ENDPOINT:} | `backend/src/main/resources/application.yml:324` | **live** | `protected` | MOVED | MOVED | V |
| CFB-046 | studio.execution.video-store.provider | ${STUDIO_EVIDENCE_PROVIDER:none} | `backend/src/main/resources/application.yml:327` | **live** | `protected` | MOVED | MOVED | V |
| CFB-047 | studio.execution.video-store.directory | ${STUDIO_EVIDENCE_DIRECTORY:/tmp/studio-runner-objects} | `backend/src/main/resources/application.yml:328` | **live** | `protected` | MOVED | MOVED | V |
| CFB-048 | studio.execution.video-store.region | ${STUDIO_EVIDENCE_REGION:us-east-1} | `backend/src/main/resources/application.yml:329` | **live** | `protected` | MOVED | MOVED | V |
| CFB-049 | studio.execution.video-store.path-style-access | ${STUDIO_EVIDENCE_PATH_STYLE_ACCESS:true} | `backend/src/main/resources/application.yml:330` | **live** | `protected` | MOVED | MOVED | V |
| CFB-050 | studio.execution.video-store.access-key-id-file | ${STUDIO_EVIDENCE_ACCESS_KEY_ID_FILE:} | `backend/src/main/resources/application.yml:331` | **live** | `protected` | MOVED | MOVED | V |
| CFB-051 | studio.execution.video-store.secret-access-key-file | ${STUDIO_EVIDENCE_SECRET_ACCESS_KEY_FILE:} | `backend/src/main/resources/application.yml:332` | **live** | `protected` | MOVED | MOVED | V |
| CFB-052 | studio.execution.video-store.max-manifest-bytes | ${STUDIO_EVIDENCE_MAX_MANIFEST_BYTES:524288} | `backend/src/main/resources/application.yml:333` | **live** | `protected` | MOVED | MOVED | V |
| CFB-053 | studio.execution.video-store.connect-timeout | ${STUDIO_EVIDENCE_CONNECT_TIMEOUT:2s} | `backend/src/main/resources/application.yml:334` | **live** | `protected` | MOVED | MOVED | V |
| CFB-054 | studio.execution.video-store.request-timeout | ${STUDIO_EVIDENCE_REQUEST_TIMEOUT:10s} | `backend/src/main/resources/application.yml:335` | **live** | `protected` | MOVED | MOVED | V |
| CFB-055 | studio.execution.quotas.per-csi | ${STUDIO_QUOTA_PER_CSI:20} | `backend/src/main/resources/application.yml:337` | **live** | `protected` | MOVED | MOVED | V |
| CFB-056 | studio.execution.quotas.global | ${STUDIO_QUOTA_GLOBAL:200} | `backend/src/main/resources/application.yml:338` | **live** | `protected` | MOVED | MOVED | V |
| CFB-057 | studio.execution.quotas.max-steps-per-test | ${STUDIO_MAX_STEPS:200} | `backend/src/main/resources/application.yml:339` | **live** | `protected` | MOVED | MOVED | V |
| CFB-058 | studio.execution.recovery.poll-interval-ms | ${STUDIO_RECOVERY_POLL_MS:5000} | `backend/src/main/resources/application.yml:342` | **live** | `protected` | MOVED | MOVED | V |
| CFB-059 | studio.execution.cancel.control-poll-interval | 2s | `backend/src/main/resources/application.yml:352` | **live** | `protected` | MOVED | MOVED | V |
| CFB-060 | studio.execution.cancel.report-timeout | ${STUDIO_RUNNER_ADMISSION_TIMEOUT_MS:10000} | `backend/src/main/resources/application.yml:353` | **live** | `protected` | MOVED | MOVED | V |
| CFB-061 | studio.execution.cancel.stop-grace | ${STUDIO_RUNNER_BROWSER_STOP_TIMEOUT_MS:5000} | `backend/src/main/resources/application.yml:354` | **live** | `protected` | MOVED | MOVED | V |
| CFB-062 | studio.execution.cancel.evidence-window | ${STUDIO_RUNNER_OBJECT_STORE_WINDOW_MS:15000} | `backend/src/main/resources/application.yml:355` | **live** | `protected` | MOVED | MOVED | V |
| CFB-063 | studio.execution.cancel.delivery-window | ${STUDIO_RUNNER_TERMINAL_DELIVERY_WINDOW_MS:30000} | `backend/src/main/resources/application.yml:356` | **live** | `protected` | MOVED | MOVED | V |
| CFB-064 | studio.execution.cancel.slack | ${STUDIO_CANCEL_MARGIN_SLACK:10s} | `backend/src/main/resources/application.yml:357` | **live** | `protected` | MOVED | MOVED | V |
| CFB-065 | studio.execution.cancel.margin | ${STUDIO_CANCEL_MARGIN:} | `backend/src/main/resources/application.yml:358` | **live** | `protected` | MOVED | MOVED | V |
| CFB-066 | studio.execution.dispatcher.enabled | ${STUDIO_DISPATCHER_ENABLED:false} | `backend/src/main/resources/application.yml:360` | **live** | `protected` | MOVED | MOVED | V |
| CFB-067 | studio.execution.dispatcher.threads | ${STUDIO_DISPATCHER_THREADS:4} | `backend/src/main/resources/application.yml:361` | **live** | `protected` | MOVED | MOVED | V |
| CFB-068 | studio.execution.dispatcher.batch-size | ${STUDIO_DISPATCHER_BATCH:20} | `backend/src/main/resources/application.yml:362` | **live** | `protected` | MOVED | MOVED | V |
| CFB-069 | studio.execution.dispatcher.lease | ${STUDIO_DISPATCHER_LEASE:60s} | `backend/src/main/resources/application.yml:363` | **live** | `protected` | MOVED | MOVED | V |
| CFB-070 | studio.execution.dispatcher.poll-interval-ms | ${STUDIO_DISPATCHER_POLL_MS:2000} | `backend/src/main/resources/application.yml:364` | **live** | `protected` | MOVED | MOVED | V |
| CFB-071 | studio.execution.callback.max-body-bytes | ${STUDIO_CALLBACK_MAX_BODY:262144} | `backend/src/main/resources/application.yml:366` | **live** | `protected` | MOVED | MOVED | V |
| CFB-072 | studio.execution.callback.max-steps | ${STUDIO_CALLBACK_MAX_STEPS:500} | `backend/src/main/resources/application.yml:367` | **live** | `protected` | MOVED | MOVED | V |
| CFB-073 | studio.execution.callback.max-log-entries | ${STUDIO_CALLBACK_MAX_LOGS:500} | `backend/src/main/resources/application.yml:368` | **live** | `protected` | MOVED | MOVED | V |
| CFB-074 | studio.execution.callback.max-log-entry-chars | ${STUDIO_CALLBACK_MAX_LOG_CHARS:2000} | `backend/src/main/resources/application.yml:369` | **live** | `protected` | MOVED | MOVED | V |
| CFB-075 | studio.execution.callback.service-token | ${STUDIO_CALLBACK_SERVICE_TOKEN:} | `backend/src/main/resources/application.yml:372` | **live** | `protected` | MOVED | MOVED | V |
| CFB-076 | studio.execution.sse.heartbeat | ${STUDIO_SSE_HEARTBEAT:15s} | `backend/src/main/resources/application.yml:374` | **live** | `protected` | MOVED | MOVED | V |
| CFB-077 | studio.execution.sse.lifetime | ${STUDIO_SSE_LIFETIME:60s} | `backend/src/main/resources/application.yml:375` | **live** | `protected` | MOVED | MOVED | V |
| CFB-078 | studio.execution.sse.read-interval | ${STUDIO_SSE_READ_INTERVAL:750ms} | `backend/src/main/resources/application.yml:376` | **live** | `annex:excluded-with-reason` | MOVED | MOVED | V |
| CFB-079 | studio.execution.sse.read-interval-ms | ${STUDIO_SSE_READ_INTERVAL_MS:750} | `backend/src/main/resources/application.yml:378` | **live** | `protected` | MOVED | MOVED | V |
| CFB-080 | studio.execution.sse.authorization-refresh | ${STUDIO_SSE_AUTH_REFRESH:30s} | `backend/src/main/resources/application.yml:379` | **live** | `protected` | MOVED | MOVED | V |
| CFB-081 | studio.execution.sse.max-streams-per-user | ${STUDIO_SSE_MAX_PER_USER:5} | `backend/src/main/resources/application.yml:380` | **live** | `protected` | MOVED | MOVED | V |
| CFB-082 | studio.execution.sse.max-streams-per-pod | ${STUDIO_SSE_MAX_PER_POD:200} | `backend/src/main/resources/application.yml:381` | **live** | `protected` | MOVED | MOVED | V |
| CFB-083 | studio.execution.sse.max-watched-executions | ${STUDIO_SSE_MAX_WATCHED:200} | `backend/src/main/resources/application.yml:382` | **live** | `protected` | MOVED | MOVED | V |
| CFB-084 | studio.execution.sse.sender-threads | ${STUDIO_SSE_SENDER_THREADS:4} | `backend/src/main/resources/application.yml:383` | **live** | `protected` | MOVED | MOVED | V |
| CFB-085 | studio.gateway.provider | ${STUDIO_GATEWAY_PROVIDER:disabled} | `backend/src/main/resources/application.yml:387` | **live** | `protected` | MOVED | MOVED | V |
| CFB-086 | studio.gateway.endpoint | ${STUDIO_GATEWAY_ENDPOINT:} | `backend/src/main/resources/application.yml:388` | **live** | `protected` | MOVED | MOVED | V |
| CFB-087 | studio.gateway.project | ${STUDIO_GATEWAY_PROJECT:} | `backend/src/main/resources/application.yml:389` | **live** | `protected` | MOVED | MOVED | V |
| CFB-088 | studio.gateway.location | ${STUDIO_GATEWAY_LOCATION:} | `backend/src/main/resources/application.yml:390` | **live** | `protected` | MOVED | MOVED | V |
| CFB-089 | studio.gateway.model | ${STUDIO_GATEWAY_MODEL:gemini-3.8-flash} | `backend/src/main/resources/application.yml:391` | **live** | `protected` | MOVED | MOVED | V |
| CFB-090 | studio.gateway.credentials.mode | ${STUDIO_GATEWAY_CREDENTIALS_MODE:application-default} | `backend/src/main/resources/application.yml:393` | **live** | `protected` | MOVED | MOVED | V |
| CFB-091 | studio.gateway.credentials.service-account-key-file | ${STUDIO_GATEWAY_CREDENTIALS_KEY_FILE:} | `backend/src/main/resources/application.yml:394` | **live** | `protected` | MOVED | MOVED | V |
| CFB-092 | studio.gateway.request-timeout | ${STUDIO_GATEWAY_REQUEST_TIMEOUT:150s} | `backend/src/main/resources/application.yml:395` | **live** | `protected` | MOVED | MOVED | V |
| CFB-093 | studio.gateway.max-concurrency | ${STUDIO_GATEWAY_MAX_CONCURRENCY:4} | `backend/src/main/resources/application.yml:396` | **live** | `protected` | MOVED | MOVED | V |
| CFB-094 | studio.gateway.max-input-bytes | ${STUDIO_GATEWAY_MAX_INPUT_BYTES:262144} | `backend/src/main/resources/application.yml:397` | **live** | `protected` | MOVED | MOVED | V |
| CFB-095 | studio.gateway.max-output-bytes | ${STUDIO_GATEWAY_MAX_OUTPUT_BYTES:262144} | `backend/src/main/resources/application.yml:398` | **live** | `protected` | MOVED | MOVED | V |
| CFB-096 | studio.gateway.max-output-tokens | ${STUDIO_GATEWAY_MAX_OUTPUT_TOKENS:32768} | `backend/src/main/resources/application.yml:399` | **live** | `protected` | MOVED | MOVED | V |
| CFB-097 | studio.gateway.thinking-level | ${STUDIO_GATEWAY_THINKING_LEVEL:LOW} | `backend/src/main/resources/application.yml:403` | **live** | `protected` | MOVED | MOVED | V |
| CFB-098 | studio.runner.base-url | ${STUDIO_RUNNER_BASE_URL:} | `backend/src/main/resources/application.yml:418` | **live** | `protected` | MOVED | BEHAVIOUR | V |
| CFB-099 | studio.runner.service-identity-token | ${STUDIO_RUNNER_SERVICE_TOKEN:} | `backend/src/main/resources/application.yml:419` | **live** | `protected` | MOVED | MOVED | V |
| CFB-100 | studio.runner.connect-timeout | ${STUDIO_RUNNER_CONNECT_TIMEOUT:2s} | `backend/src/main/resources/application.yml:420` | **live** | `protected` | MOVED | MOVED | V |
| CFB-101 | studio.guided-authoring.mtls-required | ${STUDIO_GUIDED_MTLS_REQUIRED:false} | `backend/src/main/resources/application.yml:208` | **live** | `protected` | SAME | NEW | V |
| CFB-102 | studio.guided-authoring.service-public-key | ${STUDIO_GUIDED_SERVICE_PUBLIC_KEY:} | `backend/src/main/resources/application.yml:209` | **dark** | `protected` | SAME | NEW | V |
| CFB-103 | studio.guided-authoring.service-issuer | ${STUDIO_GUIDED_SERVICE_ISSUER:} | `backend/src/main/resources/application.yml:210` | **dark** | `protected` | SAME | NEW | V |
| CFB-104 | studio.guided-authoring.connector.port | ${STUDIO_GUIDED_CONNECTOR_PORT:0} | `backend/src/main/resources/application.yml:215` | **dark** | `protected` | SAME | NEW | V |
| CFB-105 | studio.runner.tls.key-store | ${STUDIO_RUNNER_TLS_KEY_STORE:} | `backend/src/main/resources/application.yml:422` | **live** | `protected` | MOVED | NEW | V |
| CFB-106 | studio.runner.tls.key-store-password-file | ${STUDIO_RUNNER_TLS_KEY_STORE_PASSWORD_FILE:} | `backend/src/main/resources/application.yml:423` | **live** | `protected` | MOVED | NEW | V |
| CFB-107 | studio.runner.tls.key-store-type | ${STUDIO_RUNNER_TLS_KEY_STORE_TYPE:PKCS12} | `backend/src/main/resources/application.yml:424` | **live** | `protected` | MOVED | NEW | V |
| CFB-108 | studio.runner.tls.trust-store | ${STUDIO_RUNNER_TLS_TRUST_STORE:} | `backend/src/main/resources/application.yml:425` | **live** | `protected` | MOVED | NEW | V |
| CFB-109 | studio.runner.tls.trust-store-password-file | ${STUDIO_RUNNER_TLS_TRUST_STORE_PASSWORD_FILE:} | `backend/src/main/resources/application.yml:426` | **live** | `protected` | MOVED | NEW | V |
| CFB-110 | studio.runner.tls.trust-store-type | ${STUDIO_RUNNER_TLS_TRUST_STORE_TYPE:PKCS12} | `backend/src/main/resources/application.yml:427` | **live** | `protected` | MOVED | NEW | V |

### 5.8 Backend profile overrides (15)

| Id | Surface | Value | Anchor | Status | Protection | ΔG9b | ΔSkel | Tag |
|---|---|---|---|---|---|---|---|---|
| CFP-01 | studio.execution.dispatcher.enabled [profile worker] | true | `backend/src/main/resources/application-worker.yml:23` | **live** | `protected` | SAME | SAME | V |
| CFP-02 | studio.secrets.vault.provider [profile dev] | ${STUDIO_VAULT_PROVIDER:none} | `backend/src/main/resources/application-dev.yml:31` | **live** | `protected` | SAME | SAME | V |
| CFP-03 | studio.execution.dispatcher.enabled [profile local] | ${STUDIO_DISPATCHER_ENABLED:true} | `backend/src/main/resources/application-local.yml:75` | **live** | `protected` | SAME | MOVED | V |
| CFP-04 | studio.execution.video-store.provider [profile local] | ${STUDIO_EVIDENCE_PROVIDER:local} | `backend/src/main/resources/application-local.yml:78` | **live** | `protected` | SAME | MOVED | V |
| CFP-05 | studio.secrets.vault.provider [profile local] | ${STUDIO_VAULT_PROVIDER:none} | `backend/src/main/resources/application-local.yml:86` | **live** | `protected` | SAME | MOVED | V |
| CFP-06 | studio.gateway.provider [profile local] | ${STUDIO_GATEWAY_PROVIDER:disabled} | `backend/src/main/resources/application-local.yml:91` | **live** | `protected` | SAME | MOVED | V |
| CFP-07 | studio.gateway.credentials.mode [profile local] | ${STUDIO_GATEWAY_CREDENTIALS_MODE:application-default} | `backend/src/main/resources/application-local.yml:93` | **live** | `protected` | SAME | MOVED | V |
| CFP-08 | studio.gateway.provider [profile staging] | ${STUDIO_GATEWAY_PROVIDER:disabled} | `backend/src/main/resources/application-staging.yml:16` | **live** | `protected` | SAME | SAME | V |
| CFP-09 | studio.gateway.model [profile staging] | ${STUDIO_GATEWAY_MODEL:gemini-3.8-flash} | `backend/src/main/resources/application-staging.yml:17` | **live** | `protected` | SAME | SAME | V |
| CFP-10 | studio.gateway.credentials.mode [profile staging] | ${STUDIO_GATEWAY_CREDENTIALS_MODE:application-default} | `backend/src/main/resources/application-staging.yml:19` | **live** | `protected` | SAME | SAME | V |
| CFP-11 | studio.gateway.provider [profile test] | disabled | `backend/src/main/resources/application-test.yml:37` | **live** | `protected` | SAME | MOVED | V |
| CFP-12 | studio.secrets.vault.provider [profile test] | none | `backend/src/main/resources/application-test.yml:40` | **live** | `protected` | SAME | MOVED | V |
| CFP-13 | studio.guided-authoring.mtls-required [profile dev] | true | `backend/src/main/resources/application-dev.yml:34` | **live** | `protected` | SAME | NEW | V |
| CFP-14 | studio.guided-authoring.mtls-required [profile prod] | true | `backend/src/main/resources/application-prod.yml:24` | **live** | `protected` | SAME | NEW | V |
| CFP-15 | studio.guided-authoring.mtls-required [profile staging] | true | `backend/src/main/resources/application-staging.yml:22` | **live** | `protected` | SAME | NEW | V |

### 5.9 Backend code-only `@Value` keys (13)

| Id | Surface | Value | Anchor | Status | Protection | ΔG9b | ΔSkel | Tag |
|---|---|---|---|---|---|---|---|---|
| CFC-01 | studio.guided-authoring.runner-origin | no default; bean conditional on presence | `…/checks/studio/guided/session/GuidedSessionConfiguration.java:107` | **dark** | `protected`<br><sub>**merge-permitted carve-out, §8**</sub> | SAME | BEHAVIOUR | V |
| CFC-02 | studio.guided-authoring.mtls-required | ${STUDIO_GUIDED_MTLS_REQUIRED:false} | `…/checks/studio/guided/session/GuidedInternalSecurity.java:51`<br>`backend/src/main/resources/application.yml:208` | **live** | `annex:superseded-duplicate` | SAME | CHANGED | V |
| CFC-03 | studio.guided-authoring.service-public-key | ${STUDIO_GUIDED_SERVICE_PUBLIC_KEY:} | `…/checks/studio/guided/session/GuidedInternalSecurity.java:49`<br>`backend/src/main/resources/application.yml:209` | **dark** | `annex:superseded-duplicate` | SAME | CHANGED | V |
| CFC-04 | studio.guided-authoring.service-issuer | ${STUDIO_GUIDED_SERVICE_ISSUER:} | `…/checks/studio/guided/session/GuidedInternalSecurity.java:50`<br>`backend/src/main/resources/application.yml:210` | **dark** | `annex:superseded-duplicate` | SAME | CHANGED | V |
| CFC-05 | studio.guided-authoring.reaper-delay-ms | default 10000 | `…/checks/studio/guided/session/GuidedSessionReaper.java:45` | **live** | `protected` | SAME | MOVED | V |
| CFC-06 | studio.guided-authoring.teardown-redrive-window | default PT15M | `…/checks/studio/guided/session/GuidedSessionReaper.java:27` | **live** | `protected` | SAME | MOVED | V |
| CFC-07 | studio.guided-authoring.teardown-redrive-batch | default 32 | `…/checks/studio/guided/session/GuidedSessionReaper.java:28` | **live** | `protected` | SAME | MOVED | V |
| CFC-08 | studio.guided-authoring.teardown-abandoned-warn-interval | default PT15M | `…/checks/studio/guided/session/GuidedSessionReaper.java:29` | **live** | `protected` | SAME | MOVED | V |
| CFC-09 | studio.guided-authoring.translation.controller-origin | default https://unconfigured.invalid | `…/checks/studio/guided/translation/GuidedTranslationConfiguration.java:133` | **dark** | `protected` | SAME | MOVED | V |
| CFC-10 | studio.guided-authoring.translation.poll-ms | default 1000 | `…/checks/studio/guided/translation/GuidedTranslationCoordinator.java:114` | **live** | `protected` | SAME | MOVED | V |
| CFC-11 | studio.execution.metrics.backlog-refresh-ms | default 5000 | `…/checks/studio/dispatch/StudioDispatchMetrics.java:80` | **live** | `protected` | SAME | SAME | V |
| CFC-12 | studio.pool.size | default 0 | `…/checks/config/AsyncConfig.java:52` | **live** | `protected` | SAME | SAME | V |
| CFC-13 | studio.secret-revocation.sweep-interval-ms | default 1000 | `…/checks/studio/secrets/SecretRevocationSweep.java:57` | **live** | `protected` | SAME | SAME | V |

### 5.10 Backend code-default flags (7)

| Id | Surface | Value | Anchor | Status | Protection | ΔG9b | ΔSkel | Tag |
|---|---|---|---|---|---|---|---|---|
| CFD-01 | studio.guided-authoring.translation.enabled | true | `…/checks/studio/guided/translation/GuidedTranslationProperties.java:10` | **live** | `protected` | SAME | SAME | V |
| CFD-02 | studio.guided-authoring.translation.allow-authored-nonsecret | true | `…/checks/studio/guided/translation/GuidedTranslationProperties.java:11` | **live** | `protected` | SAME | SAME | V |
| CFD-03 | studio.guided-authoring.enabled | true | `…/checks/studio/guided/session/GuidedSessionProperties.java:12` | **live** | `protected` | SAME | SAME | V |
| CFD-04 | studio.guided-authoring.translation.worker-id | worker-1 | `…/checks/studio/guided/translation/GuidedTranslationProperties.java:17` | **live** | `protected` | SAME | BEHAVIOUR | V |
| CFD-05 | studio.scheduling.enabled | false (Java default; no yml or chart key [V]) | `…/checks/studio/scheduling/StudioSchedulingProperties.java:11` | **live** | `protected` | SAME | SAME | V |
| CFD-06 | studio.scheduling.local-grants-enabled | false | `…/checks/studio/scheduling/StudioSchedulingProperties.java:12` | **live** | `protected` | SAME | SAME | V |
| CFD-07 | checks.sources.UI_TEST | application.yml false; chart values.yaml "true"; values-dev "false" | `backend/src/main/resources/application.yml:56`<br>`helm-chart/put-checks/values.yaml:168`<br>`helm-chart/put-checks/templates/deployment.yaml:32` | **live** | `protected` | MOVED | MOVED | V |

### 5.11 Backend `@ConfigurationProperties` prefixes (prefix level, ruling A4) (18)

| Id | Surface | Value | Anchor | Status | Protection | ΔG9b | ΔSkel | Tag |
|---|---|---|---|---|---|---|---|---|
| CFK-01 | studio.execution.* (@ConfigurationProperties) |  | `…/checks/studio/StudioExecutionProperties.java:39` | **live** | `protected` | SAME | SAME | V |
| CFK-02 | studio.execution.video-store.* (@ConfigurationProperties) |  | `…/checks/studio/evidence/VideoStoreProperties.java:25` | **live** | `protected` | SAME | SAME | V |
| CFK-03 | studio.execution.cancel.* (@ConfigurationProperties) |  | `…/checks/studio/recovery/RunnerCancelBudget.java:57` | **live** | `protected` | SAME | SAME | V |
| CFK-04 | studio.observed-replay.* (@ConfigurationProperties) |  | `…/checks/studio/guided/publication/ObservedReplayProperties.java:9` | **live** | `protected` | SAME | SAME | V |
| CFK-05 | studio.guided.publication.* (@ConfigurationProperties) |  | `…/checks/studio/guided/publication/GuidedPublicationProperties.java:9` | **live** | `protected` | SAME | SAME | V |
| CFK-06 | studio.guided-authoring.* (@ConfigurationProperties) |  | `…/checks/studio/guided/session/GuidedSessionProperties.java:10` | **live** | `protected` | CHANGED | SAME | V |
| CFK-07 | studio.guided-authoring.translation.* (@ConfigurationProperties) |  | `…/checks/studio/guided/translation/GuidedTranslationProperties.java:8` | **live** | `protected` | SAME | SAME | V |
| CFK-08 | studio.guided-authoring.recording.* (@ConfigurationProperties) |  | `…/checks/studio/guided/evidence/GuidedRecordingProperties.java:19` | **live** | `protected` | SAME | SAME | V |
| CFK-09 | studio.guided-authoring.retention.* (@ConfigurationProperties) |  | `…/checks/studio/guided/retention/GuidedRetentionProperties.java:18` | **live** | `protected` | SAME | SAME | V |
| CFK-10 | studio.guided-authoring.policy.* (@ConfigurationProperties) |  | `…/checks/studio/guided/policy/GuidedPolicyProperties.java:14` | **live** | `protected` | SAME | SAME | V |
| CFK-11 | studio.guided-authoring.csi-budget.* (@ConfigurationProperties) |  | `…/checks/studio/guided/session/GuidedCsiBudgetProperties.java:14` | **live** | `protected` | SAME | SAME | V |
| CFK-12 | studio.scheduling.* (@ConfigurationProperties) |  | `…/checks/studio/scheduling/StudioSchedulingProperties.java:9` | **live** | `protected` | SAME | SAME | V |
| CFK-13 | studio.runner.* (@ConfigurationProperties) |  | `…/checks/studio/dispatch/StudioRunnerProperties.java:27` | **live** | `protected` | SAME | CHANGED | V |
| CFK-14 | studio.secrets.* (@ConfigurationProperties) |  | `…/checks/studio/secrets/StudioSecretsProperties.java:17` | **live** | `protected` | SAME | SAME | V |
| CFK-15 | studio.authoring.* (@ConfigurationProperties) |  | `…/checks/studio/authoring/StudioAuthoringProperties.java:15` | **live** | `protected` | SAME | SAME | V |
| CFK-16 | studio.gateway (selection).* (@ConfigurationProperties) |  | `…/checks/studio/gateway/StudioGatewaySelectionProperties.java:8` | **live** | `protected` | SAME | SAME | V |
| CFK-17 | studio.gateway.* (@ConfigurationProperties) |  | `…/checks/studio/gateway/StudioGatewayProperties.java:37` | **live** | `protected` | SAME | SAME | V |
| CFK-18 | studio.runner.tls.* (@ConfigurationProperties) |  | `…/checks/studio/dispatch/StudioRunnerTls.java:109` | **live** | `protected` | SAME | NEW | V |

### 5.12 Runner `KEY_SPECS` / `ACCEPTED_KEYS` (58)

| Id | Surface | Value | Anchor | Status | Protection | ΔG9b | ΔSkel | Tag |
|---|---|---|---|---|---|---|---|---|
| RKS-01 | STUDIO_RUNNER_OBSERVED_VALIDATION_ENABLED |  | `studio-runner/src/server/config.ts:177` | **live** | `protected` | STATUS | MOVED | V |
| RKS-02 | STUDIO_RUNNER_OBSERVED_REPLAY_ENABLED |  | `studio-runner/src/server/config.ts:178` | **live** | `protected` | STATUS | MOVED | V |
| RKS-03 | STUDIO_RUNNER_OBSERVED_CATALOG_FILE |  | `studio-runner/src/server/config.ts:179` | **live** | `protected` | STATUS | MOVED | V |
| RKS-04 | STUDIO_RUNNER_OBSERVED_POLICY_FILE |  | `studio-runner/src/server/config.ts:180` | **live** | `protected` | STATUS | MOVED | V |
| RKS-05 | STUDIO_RUNNER_OBSERVED_IMAGE_DIGEST |  | `studio-runner/src/server/config.ts:181` | **live** | `protected` | STATUS | MOVED | V |
| RKS-06 | STUDIO_RUNNER_PORT |  | `studio-runner/src/server/config.ts:182` | **live** | `protected` | SAME | BEHAVIOUR | V |
| RKS-07 | STUDIO_RUNNER_HOST |  | `studio-runner/src/server/config.ts:183` | **live** | `protected` | SAME | BEHAVIOUR | V |
| RKS-08 | STUDIO_RUNNER_POOL_SIZE |  | `studio-runner/src/server/config.ts:184` | **live** | `protected` | SAME | MOVED | V |
| RKS-09 | STUDIO_RUNNER_INSTANCE_ID |  | `studio-runner/src/server/config.ts:185` | **live** | `protected` | SAME | MOVED | V |
| RKS-10 | STUDIO_RUNNER_SERVICE_IDENTITY |  | `studio-runner/src/server/config.ts:186` | **live** | `protected` | SAME | MOVED | V |
| RKS-11 | STUDIO_RUNNER_CALLBACK_IDENTITY |  | `studio-runner/src/server/config.ts:187` | **live** | `protected` | SAME | MOVED | V |
| RKS-12 | STUDIO_RUNNER_CALLBACK_BASE_URL |  | `studio-runner/src/server/config.ts:188` | **live** | `protected` | SAME | MOVED | V |
| RKS-13 | STUDIO_RUNNER_SCRATCH_DIR |  | `studio-runner/src/server/config.ts:189` | **live** | `protected` | SAME | MOVED | V |
| RKS-14 | STUDIO_RUNNER_OBJECT_STORE_DIR |  | `studio-runner/src/server/config.ts:190` | **live** | `protected` | SAME | MOVED | V |
| RKS-15 | STUDIO_RUNNER_OBJECT_STORE_PROVIDER |  | `studio-runner/src/server/config.ts:196` | **live** | `protected` | SAME | MOVED | V |
| RKS-16 | STUDIO_RUNNER_OBJECT_STORE_ENDPOINT |  | `studio-runner/src/server/config.ts:202` | **live** | `protected` | SAME | MOVED | V |
| RKS-17 | STUDIO_RUNNER_OBJECT_STORE_REGION |  | `studio-runner/src/server/config.ts:208` | **live** | `protected` | SAME | MOVED | V |
| RKS-18 | STUDIO_RUNNER_OBJECT_STORE_BUCKET |  | `studio-runner/src/server/config.ts:214` | **live** | `protected` | SAME | MOVED | V |
| RKS-19 | STUDIO_RUNNER_OBJECT_STORE_FORCE_PATH_STYLE |  | `studio-runner/src/server/config.ts:220` | **live** | `protected` | SAME | MOVED | V |
| RKS-20 | STUDIO_RUNNER_OBJECT_STORE_CREDENTIALS_DIRECTORY |  | `studio-runner/src/server/config.ts:226` | **live** | `protected` | SAME | MOVED | V |
| RKS-21 | STUDIO_RUNNER_OBJECT_STORE_ACCESS_KEY_ID_FILE |  | `studio-runner/src/server/config.ts:232` | **live** | `protected` | SAME | MOVED | V |
| RKS-22 | STUDIO_RUNNER_OBJECT_STORE_SECRET_ACCESS_KEY_FILE |  | `studio-runner/src/server/config.ts:238` | **live** | `protected` | SAME | MOVED | V |
| RKS-23 | STUDIO_RUNNER_OBJECT_STORE_MAX_ATTEMPTS |  | `studio-runner/src/server/config.ts:244` | **live** | `protected` | SAME | MOVED | V |
| RKS-24 | STUDIO_RUNNER_OBJECT_STORE_WINDOW_MS |  | `studio-runner/src/server/config.ts:251` | **live** | `protected` | SAME | MOVED | V |
| RKS-25 | STUDIO_RUNNER_OBJECT_STORE_BACKOFF_MS |  | `studio-runner/src/server/config.ts:258` | **live** | `protected` | SAME | MOVED | V |
| RKS-26 | STUDIO_RUNNER_ADMISSION_TIMEOUT_MS |  | `studio-runner/src/server/config.ts:265` | **live** | `protected` | SAME | MOVED | V |
| RKS-27 | STUDIO_RUNNER_TERMINAL_DELIVERY_WINDOW_MS |  | `studio-runner/src/server/config.ts:272` | **live** | `protected` | SAME | MOVED | V |
| RKS-28 | STUDIO_RUNNER_TERMINAL_DELIVERY_MAX_ATTEMPTS |  | `studio-runner/src/server/config.ts:279` | **live** | `protected` | SAME | MOVED | V |
| RKS-29 | STUDIO_RUNNER_TERMINAL_DELIVERY_BACKOFF_MS |  | `studio-runner/src/server/config.ts:286` | **live** | `protected` | SAME | MOVED | V |
| RKS-30 | STUDIO_RUNNER_VALIDATE_TIMEOUT_MS |  | `studio-runner/src/server/config.ts:293` | **live** | `protected` | SAME | MOVED | V |
| RKS-31 | STUDIO_RUNNER_MAX_REQUEST_BODY_BYTES |  | `studio-runner/src/server/config.ts:300` | **live** | `protected` | SAME | MOVED | V |
| RKS-32 | STUDIO_RUNNER_RETRY_AFTER_SECONDS |  | `studio-runner/src/server/config.ts:307` | **live** | `protected` | SAME | MOVED | V |
| RKS-33 | STUDIO_RUNNER_DRAIN_TIMEOUT_MS |  | `studio-runner/src/server/config.ts:314` | **live** | `protected` | SAME | MOVED | V |
| RKS-34 | STUDIO_RUNNER_RECORDING_WIDTH |  | `studio-runner/src/server/config.ts:321` | **live** | `protected` | SAME | MOVED | V |
| RKS-35 | STUDIO_RUNNER_RECORDING_HEIGHT |  | `studio-runner/src/server/config.ts:328` | **live** | `protected` | SAME | MOVED | V |
| RKS-36 | STUDIO_RUNNER_BROWSER_LAUNCH_TIMEOUT_MS |  | `studio-runner/src/server/config.ts:335` | **live** | `protected` | SAME | MOVED | V |
| RKS-37 | STUDIO_RUNNER_STEP_TIMEOUT_MS |  | `studio-runner/src/server/config.ts:342` | **live** | `protected` | SAME | MOVED | V |
| RKS-38 | STUDIO_RUNNER_BROWSER_STOP_TIMEOUT_MS |  | `studio-runner/src/server/config.ts:349` | **live** | `protected` | SAME | MOVED | V |
| RKS-39 | STUDIO_RUNNER_SEEK_ORIGIN_CALIBRATION_MS |  | `studio-runner/src/server/config.ts:358` | **live** | `protected` | SAME | MOVED | V |
| RKS-40 | STUDIO_RUNNER_MAX_TOTAL_RUNTIME_MS |  | `studio-runner/src/server/config.ts:368` | **live** | `protected` | SAME | MOVED | V |
| RKS-41 | STUDIO_RUNNER_MAX_STEP_TIMEOUT_MS |  | `studio-runner/src/server/config.ts:380` | **live** | `protected` | SAME | MOVED | V |
| RKS-42 | STUDIO_RUNNER_MAX_REPORT_STEPS |  | `studio-runner/src/server/config.ts:387` | **live** | `protected` | SAME | MOVED | V |
| RKS-43 | STUDIO_RUNNER_MAX_REPORT_LOG_ENTRIES |  | `studio-runner/src/server/config.ts:394` | **live** | `protected` | SAME | MOVED | V |
| RKS-44 | STUDIO_RUNNER_MAX_REPORT_LOG_ENTRY_LENGTH |  | `studio-runner/src/server/config.ts:401` | **live** | `protected` | SAME | MOVED | V |
| RKS-45 | STUDIO_RUNNER_MAX_REPORT_BODY_BYTES |  | `studio-runner/src/server/config.ts:408` | **live** | `protected` | SAME | MOVED | V |
| RKS-00 | ACCEPTED_KEYS set (57 keys) | 57 | `studio-runner/src/server/config.ts:176-444`<br>`studio-runner/src/server/config.ts:472 (ACCEPTED_KEYS)`<br>`studio-runner/src/server/config.ts:518 (refuseUnknownKeys)` | **live** | `protected` | SAME | CHANGED | V |
| RKS-46 | STUDIO_RUNNER_TLS_KEY_FILE |  | `studio-runner/src/server/config.ts:419` | **live** | `protected` | SAME | NEW | V |
| RKS-47 | STUDIO_RUNNER_TLS_CERT_FILE |  | `studio-runner/src/server/config.ts:420` | **live** | `protected` | SAME | NEW | V |
| RKS-48 | STUDIO_RUNNER_TLS_CA_FILE |  | `studio-runner/src/server/config.ts:421` | **live** | `protected` | SAME | NEW | V |
| RKS-49 | STUDIO_RUNNER_CONTROLLER_CERTIFICATE_FINGERPRINT256 |  | `studio-runner/src/server/config.ts:422` | **live** | `protected` | SAME | NEW | V |
| RKS-50 | STUDIO_RUNNER_GUIDED_ENABLED |  | `studio-runner/src/server/config.ts:431` | **live** | `protected` | SAME | NEW | V |
| RKS-51 | STUDIO_RUNNER_GUIDED_WORKER_ID |  | `studio-runner/src/server/config.ts:432` | **dark** | `protected` | SAME | NEW | V |
| RKS-52 | STUDIO_RUNNER_GUIDED_JOURNAL_DIR |  | `studio-runner/src/server/config.ts:433` | **dark** | `protected` | SAME | NEW | V |
| RKS-53 | STUDIO_RUNNER_GUIDED_CONTROLLER_ISSUER |  | `studio-runner/src/server/config.ts:434` | **dark** | `protected` | SAME | NEW | V |
| RKS-54 | STUDIO_RUNNER_GUIDED_CONTROLLER_SUBJECT |  | `studio-runner/src/server/config.ts:435` | **dark** | `protected` | SAME | NEW | V |
| RKS-55 | STUDIO_RUNNER_GUIDED_CONTROLLER_PUBLIC_KEY_FILE |  | `studio-runner/src/server/config.ts:436` | **dark** | `protected` | SAME | NEW | V |
| RKS-56 | STUDIO_RUNNER_GUIDED_CALLBACK_BASE_URL |  | `studio-runner/src/server/config.ts:441` | **dark** | `protected` | SAME | NEW | V |
| RKS-57 | STUDIO_RUNNER_GUIDED_CALLBACK_TOKEN_FILE |  | `studio-runner/src/server/config.ts:442` | **dark** | `protected` | SAME | NEW | V |

### 5.13 Runner guided mounted config (removed by 009; kept pending @po) (14)

| Id | Surface | Value | Anchor | Status | Protection | ΔG9b | ΔSkel | Tag |
|---|---|---|---|---|---|---|---|---|
| RKG-00 | STUDIO_GUIDED_CONFIG_FILE (env; path of the guided mounted JSON) |  | — | **removed** | `removed-pending-po`<br><sub>kept: @po has not confirmed removal</sub> | SAME | GONE | V |
| RKG-01 | guided mounted field "workerId" |  | — | **removed** | `removed-pending-po`<br><sub>kept: @po has not confirmed removal</sub> | SAME | GONE | V |
| RKG-02 | guided mounted field "host" |  | — | **removed** | `removed-pending-po`<br><sub>kept: @po has not confirmed removal</sub> | SAME | GONE | V |
| RKG-03 | guided mounted field "port" |  | — | **removed** | `removed-pending-po`<br><sub>kept: @po has not confirmed removal</sub> | SAME | GONE | V |
| RKG-04 | guided mounted field "journalDirectory" |  | — | **removed** | `removed-pending-po`<br><sub>kept: @po has not confirmed removal</sub> | SAME | GONE | V |
| RKG-05 | guided mounted field "tlsKeyFile" |  | — | **removed** | `removed-pending-po`<br><sub>kept: @po has not confirmed removal</sub> | SAME | GONE | V |
| RKG-06 | guided mounted field "tlsCertFile" |  | — | **removed** | `removed-pending-po`<br><sub>kept: @po has not confirmed removal</sub> | SAME | GONE | V |
| RKG-07 | guided mounted field "tlsCaFile" |  | — | **removed** | `removed-pending-po`<br><sub>kept: @po has not confirmed removal</sub> | SAME | GONE | V |
| RKG-08 | guided mounted field "controllerIssuer" |  | — | **removed** | `removed-pending-po`<br><sub>kept: @po has not confirmed removal</sub> | SAME | GONE | V |
| RKG-09 | guided mounted field "controllerSubject" |  | — | **removed** | `removed-pending-po`<br><sub>kept: @po has not confirmed removal</sub> | SAME | GONE | V |
| RKG-10 | guided mounted field "controllerPublicKeyFile" |  | — | **removed** | `removed-pending-po`<br><sub>kept: @po has not confirmed removal</sub> | SAME | GONE | V |
| RKG-11 | guided mounted field "controllerCertificateFingerprint256" |  | — | **removed** | `removed-pending-po`<br><sub>kept: @po has not confirmed removal</sub> | SAME | GONE | V |
| RKG-12 | guided mounted field "callbackBaseUrl" |  | — | **removed** | `removed-pending-po`<br><sub>kept: @po has not confirmed removal</sub> | SAME | GONE | V |
| RKG-13 | guided mounted field "callbackTokenFile" |  | — | **removed** | `removed-pending-po`<br><sub>kept: @po has not confirmed removal</sub> | SAME | GONE | V |

### 5.14 Runner process surfaces (9)

| Id | Surface | Value | Anchor | Status | Protection | ΔG9b | ΔSkel | Tag |
|---|---|---|---|---|---|---|---|---|
| RKO-01 | Dockerfile CMD ["sh", "-c", "ulimit -c 0 && exec node dist/main.js"] | CMD ["sh", "-c", "ulimit -c 0 && exec node dist/main.js"] | `studio-runner/Dockerfile:79` | **live** | `protected` | MOVED | CHANGED | V |
| RKO-02 | package.json script "start": "node dist/main.js" |  | `studio-runner/package.json:18` | **live** | `protected` | SAME | SAME | V |
| RKO-03 | package.json script "start:guided": "node dist/run/guidedMain.js" |  | — | **removed** | `removed-pending-po`<br><sub>kept: @po has not confirmed removal</sub> | SAME | GONE | V |
| RKO-04 | run/guidedMain.ts + run/guidedConfig.ts + run/guidedShutdown.ts (guided entry files) |  | — | **removed** | `removed-pending-po`<br><sub>kept: @po has not confirmed removal</sub> | SAME | GONE | V |
| RKO-05 | probe.ts reads STUDIO_RUNNER_PORT and STUDIO_RUNNER_SERVICE_IDENTITY (exec probe node dist/probe.js) |  | `studio-runner/src/probe.ts:30`<br>`studio-runner/src/probe.ts:93-94` | **live** | `protected` | SAME | CHANGED | V |
| RKO-06 | debug-env refusal (DEBUG, PWDEBUG, NODE_DEBUG, NODE_OPTIONS -> CONFIGURATION_DENIED) |  | `studio-runner/src/main.ts:168`<br>`studio-runner/src/guided/transport.ts:87,166`<br>`studio-runner/src/run/browser.ts:537` | **live** | `protected` | SAME | MOVED | V |
| RKO-07 | PLAYWRIGHT_BROWSERS_PATH passthrough to observed runner support |  | `studio-runner/src/server/application.ts:161`<br>`studio-runner/src/run/launcher.ts:170` | **live** | `protected` | SAME | MOVED | V |
| RKO-08 | TMPDIR (guided browser scratch, recording scratch) |  | `studio-runner/src/run/browser.ts:544`<br>`studio-runner/src/run/recordingScratch.ts:56` | **live** | `protected` | SAME | SAME | V |
| RKO-09 | image file scripts/print-observed-catalog.mjs (prints the image's own {profile, build} catalog entry; run by … | sha256 `cc954c63ae34d7c2…` | `studio-runner/Dockerfile:48`<br>`studio-runner/scripts/print-observed-catalog.mjs` | **live** | `protected` | NEW | NEW | V |

### 5.15 Chart `values.yaml` (174)

| Id | Surface | Value | Anchor | Status | Protection | ΔG9b | ΔSkel | Tag |
|---|---|---|---|---|---|---|---|---|
| CHV-001 | backend.env.JAVA_OPTS | -Xms256m -Xmx512m -XX:+UseG1GC -XX:MaxMetaspaceSize=192m -XX:+ExitOnO… | `helm-chart/put-checks/values.yaml:93` | **live** | `protected` | SAME | CHANGED | V |
| CHV-002 | backend.configOverrides.checks.sources.UI_TEST | true | `helm-chart/put-checks/values.yaml:168` | **live** | `protected` | SAME | MOVED | V |
| CHV-003 | worker.env.JAVA_OPTS | -Xms512m -Xmx768m -XX:+UseG1GC -XX:MaxMetaspaceSize=192m -XX:+ExitOnO… | `helm-chart/put-checks/values.yaml:245` | **live** | `protected` | SAME | CHANGED | V |
| CHV-004 | frontend.env.VITE_ENABLE_STUDIO | true | `helm-chart/put-checks/values.yaml:351` | **live** | `protected` | SAME | MOVED | V |
| CHV-005 | studioRunner.enabled | false | `helm-chart/put-checks/values.yaml:372` | **live** | `protected` | SAME | MOVED | V |
| CHV-006 | studioRunner.image.repository | registry.citi.com/put/checks-studio-runner | `helm-chart/put-checks/values.yaml:378` | **live** | `protected` | SAME | MOVED | V |
| CHV-007 | studioRunner.image.tag |  | `helm-chart/put-checks/values.yaml:379` | **live** | `protected` | SAME | MOVED | V |
| CHV-008 | studioRunner.image.pullPolicy | IfNotPresent | `helm-chart/put-checks/values.yaml:380` | **live** | `protected` | SAME | MOVED | V |
| CHV-009 | studioRunner.replicaCount | 2 | `helm-chart/put-checks/values.yaml:388` | **live** | `protected` | SAME | BEHAVIOUR | V |
| CHV-010 | studioRunner.autoscaling.enabled | false | `helm-chart/put-checks/values.yaml:395` | **live** | `protected` | SAME | BEHAVIOUR | V |
| CHV-011 | studioRunner.autoscaling.minReplicaCount | 2 | `helm-chart/put-checks/values.yaml:398` | **live** | `protected` | SAME | BEHAVIOUR | V |
| CHV-012 | studioRunner.autoscaling.maxReplicaCount | 4 | `helm-chart/put-checks/values.yaml:399` | **live** | `protected` | SAME | BEHAVIOUR | V |
| CHV-013 | studioRunner.autoscaling.pollingIntervalSeconds | 15 | `helm-chart/put-checks/values.yaml:400` | **live** | `protected` | SAME | MOVED | V |
| CHV-014 | studioRunner.autoscaling.cooldownPeriodSeconds | 300 | `helm-chart/put-checks/values.yaml:406` | **live** | `protected` | SAME | MOVED | V |
| CHV-015 | studioRunner.autoscaling.targetBacklogPerPod | 1 | `helm-chart/put-checks/values.yaml:408` | **live** | `protected` | SAME | MOVED | V |
| CHV-016 | studioRunner.autoscaling.prometheus.serverAddress |  | `helm-chart/put-checks/values.yaml:411` | **live** | `protected` | SAME | MOVED | V |
| CHV-017 | studioRunner.autoscaling.prometheus.query | sum(max by (state) (studio_dispatch_backlog{state=~"QUEUED\|CLAIMED"}… | `helm-chart/put-checks/values.yaml:415` | **live** | `protected` | SAME | MOVED | V |
| CHV-018 | studioRunner.podDisruptionBudget.enabled | true | `helm-chart/put-checks/values.yaml:420` | **live** | `protected` | SAME | MOVED | V |
| CHV-019 | studioRunner.podDisruptionBudget.maxUnavailable | 1 | `helm-chart/put-checks/values.yaml:421` | **live** | `protected` | SAME | MOVED | V |
| CHV-020 | studioRunner.service.type | ClusterIP | `helm-chart/put-checks/values.yaml:424` | **live** | `protected` | SAME | MOVED | V |
| CHV-021 | studioRunner.service.port | 8090 | `helm-chart/put-checks/values.yaml:429` | **live** | `protected` | SAME | BEHAVIOUR | V |
| CHV-022 | studioRunner.shareProcessNamespace | true | `helm-chart/put-checks/values.yaml:448` | **live** | `protected` | SAME | BEHAVIOUR | V |
| CHV-023 | studioRunner.serviceAccount.create | true | `helm-chart/put-checks/values.yaml:451` | **live** | `protected` | SAME | MOVED | V |
| CHV-024 | studioRunner.serviceAccount.name |  | `helm-chart/put-checks/values.yaml:452` | **live** | `protected` | SAME | MOVED | V |
| CHV-025 | studioRunner.serviceAccount.automountServiceAccountToken | false | `helm-chart/put-checks/values.yaml:454` | **live** | `protected` | SAME | MOVED | V |
| CHV-026 | studioRunner.resources.requests.cpu | 500m | `helm-chart/put-checks/values.yaml:458` | **live** | `protected` | SAME | MOVED | V |
| CHV-027 | studioRunner.resources.requests.memory | 1Gi | `helm-chart/put-checks/values.yaml:459` | **live** | `protected` | SAME | MOVED | V |
| CHV-028 | studioRunner.resources.limits.cpu | 2 | `helm-chart/put-checks/values.yaml:461` | **live** | `protected` | SAME | MOVED | V |
| CHV-029 | studioRunner.resources.limits.memory | 2Gi | `helm-chart/put-checks/values.yaml:462` | **live** | `protected` | SAME | MOVED | V |
| CHV-030 | studioRunner.seccompProfile.type | RuntimeDefault | `helm-chart/put-checks/values.yaml:472` | **live** | `protected` | SAME | MOVED | V |
| CHV-031 | studioRunner.podSecurityContext.runAsNonRoot | true | `helm-chart/put-checks/values.yaml:475` | **live** | `protected` | SAME | MOVED | V |
| CHV-032 | studioRunner.podSecurityContext.runAsUser | 1001 | `helm-chart/put-checks/values.yaml:478` | **live** | `protected` | SAME | MOVED | V |
| CHV-033 | studioRunner.podSecurityContext.runAsGroup | 1001 | `helm-chart/put-checks/values.yaml:479` | **live** | `protected` | SAME | MOVED | V |
| CHV-034 | studioRunner.podSecurityContext.fsGroup | 1001 | `helm-chart/put-checks/values.yaml:480` | **live** | `protected` | SAME | MOVED | V |
| CHV-035 | studioRunner.securityContext.allowPrivilegeEscalation | false | `helm-chart/put-checks/values.yaml:483` | **live** | `protected` | SAME | MOVED | V |
| CHV-036 | studioRunner.securityContext.readOnlyRootFilesystem | true | `helm-chart/put-checks/values.yaml:487` | **live** | `protected` | SAME | MOVED | V |
| CHV-037 | studioRunner.securityContext.capabilities.drop | ["ALL"] | `helm-chart/put-checks/values.yaml:489` | **live** | `protected` | SAME | MOVED | V |
| CHV-038 | studioRunner.scratch.mountPath | /scratch | `helm-chart/put-checks/values.yaml:502` | **live** | `protected` | SAME | MOVED | V |
| CHV-039 | studioRunner.scratch.directory | studio-runner | `helm-chart/put-checks/values.yaml:504` | **live** | `protected` | SAME | MOVED | V |
| CHV-040 | studioRunner.scratch.sizeLimit | 4Gi | `helm-chart/put-checks/values.yaml:505` | **live** | `protected` | SAME | MOVED | V |
| CHV-041 | studioRunner.devShm.sizeLimit | 1Gi | `helm-chart/put-checks/values.yaml:509` | **live** | `protected` | SAME | MOVED | V |
| CHV-042 | studioRunner.drain.preStopSleepSeconds | 5 | `helm-chart/put-checks/values.yaml:514` | **live** | `protected` | SAME | MOVED | V |
| CHV-043 | studioRunner.drain.extraGraceSeconds | 30 | `helm-chart/put-checks/values.yaml:517` | **live** | `protected` | SAME | MOVED | V |
| CHV-044 | studioRunner.probes.readinessPath | /ready | `helm-chart/put-checks/values.yaml:523` | **live** | `protected` | SAME | BEHAVIOUR | V |
| CHV-045 | studioRunner.probes.livenessPath | /health | `helm-chart/put-checks/values.yaml:524` | **live** | `protected` | SAME | BEHAVIOUR | V |
| CHV-046 | studioRunner.probes.initialDelaySeconds | 10 | `helm-chart/put-checks/values.yaml:525` | **live** | `protected` | SAME | BEHAVIOUR | V |
| CHV-047 | studioRunner.probes.periodSeconds | 5 | `helm-chart/put-checks/values.yaml:526` | **live** | `protected` | SAME | BEHAVIOUR | V |
| CHV-048 | studioRunner.identity.secretName | checks-studio-runner-identity | `helm-chart/put-checks/values.yaml:542` | **live** | `protected` | SAME | ADJACENT | V |
| CHV-049 | studioRunner.identity.serviceIdentityKey | serviceIdentity | `helm-chart/put-checks/values.yaml:543` | **live** | `protected` | SAME | ADJACENT | V |
| CHV-050 | studioRunner.identity.callbackIdentityKey | callbackIdentity | `helm-chart/put-checks/values.yaml:544` | **live** | `protected` | SAME | ADJACENT | V |
| CHV-051 | studioRunner.callbackBaseUrl |  | `helm-chart/put-checks/values.yaml:549` | **live** | `protected` | SAME | MOVED | V |
| CHV-052 | studioRunner.objectStore.credentialsSecret | checks-studio-runner-object-store | `helm-chart/put-checks/values.yaml:717` | **live** | `protected` | SAME | MOVED | V |
| CHV-053 | studioRunner.objectStore.mountPath | /etc/studio/object-store | `helm-chart/put-checks/values.yaml:718` | **live** | `protected` | SAME | MOVED | V |
| CHV-054 | studioRunner.objectStore.keys | ["accessKeyId", "secretAccessKey"] | `helm-chart/put-checks/values.yaml:721` | **live** | `protected` | SAME | MOVED | V |
| CHV-055 | studioRunner.objectStore.keyPrefix | studio/ | `helm-chart/put-checks/values.yaml:726` | **live** | `protected` | SAME | MOVED | V |
| CHV-056 | studioRunner.networkPolicy.enabled | true | `helm-chart/put-checks/values.yaml:729` | **live** | `protected` | SAME | MOVED | V |
| CHV-057 | studioRunner.networkPolicy.dnsPort | 53 | `helm-chart/put-checks/values.yaml:733` | **live** | `protected` | SAME | MOVED | V |
| CHV-058 | studioRunner.networkPolicy.objectStorePort | 443 | `helm-chart/put-checks/values.yaml:734` | **live** | `protected` | SAME | MOVED | V |
| CHV-059 | studioRunner.networkPolicy.approvedTargets | [] | `helm-chart/put-checks/values.yaml:737` | **live** | `protected` | SAME | MOVED | V |
| CHV-060 | studioRunner.runnerEnv.STUDIO_RUNNER_POOL_SIZE | 1 | `helm-chart/put-checks/values.yaml:746` | **live** | `protected` | SAME | MOVED | V |
| CHV-061 | studioRunner.runnerEnv.STUDIO_RUNNER_MAX_TOTAL_RUNTIME_MS | 120000 | `helm-chart/put-checks/values.yaml:747` | **live** | `protected` | SAME | MOVED | V |
| CHV-062 | studioRunner.runnerEnv.STUDIO_RUNNER_MAX_STEP_TIMEOUT_MS | 120000 | `helm-chart/put-checks/values.yaml:749` | **live** | `protected` | SAME | MOVED | V |
| CHV-063 | studioRunner.runnerEnv.STUDIO_RUNNER_BROWSER_STOP_TIMEOUT_MS | 15000 | `helm-chart/put-checks/values.yaml:758` | **live** | `protected` | SAME | MOVED | V |
| CHV-064 | studioRunner.runnerEnv.STUDIO_RUNNER_TERMINAL_DELIVERY_WINDOW_MS | 30000 | `helm-chart/put-checks/values.yaml:759` | **live** | `protected` | SAME | MOVED | V |
| CHV-065 | studioRunner.runnerEnv.STUDIO_RUNNER_OBJECT_STORE_WINDOW_MS | 15000 | `helm-chart/put-checks/values.yaml:760` | **live** | `protected` | SAME | MOVED | V |
| CHV-066 | studioRunner.runnerEnv.STUDIO_RUNNER_DRAIN_TIMEOUT_MS | 150000 | `helm-chart/put-checks/values.yaml:761` | **live** | `protected` | SAME | MOVED | V |
| CHV-067 | studioRunner.runnerEnv.STUDIO_RUNNER_RECORDING_WIDTH | 1280 | `helm-chart/put-checks/values.yaml:762` | **live** | `protected` | SAME | MOVED | V |
| CHV-068 | studioRunner.runnerEnv.STUDIO_RUNNER_RECORDING_HEIGHT | 720 | `helm-chart/put-checks/values.yaml:763` | **live** | `protected` | SAME | MOVED | V |
| CHV-069 | studioRunner.runnerEnv.STUDIO_RUNNER_SEEK_ORIGIN_CALIBRATION_MS | 0 | `helm-chart/put-checks/values.yaml:767` | **live** | `protected` | SAME | MOVED | V |
| CHV-070 | studioRunner.podAnnotations | {} | `helm-chart/put-checks/values.yaml:769` | **live** | `protected` | SAME | MOVED | V |
| CHV-071 | studioRunner.nodeSelector | {} | `helm-chart/put-checks/values.yaml:770` | **live** | `protected` | SAME | MOVED | V |
| CHV-072 | studioRunner.tolerations | [] | `helm-chart/put-checks/values.yaml:771` | **live** | `protected` | SAME | MOVED | V |
| CHV-073 | studioRunner.affinity | {} | `helm-chart/put-checks/values.yaml:772` | **live** | `protected` | SAME | MOVED | V |
| CHV-074 | objectStore.provider | local | `helm-chart/put-checks/values.yaml:829` | **live** | `protected` | MOVED | MOVED | V |
| CHV-075 | objectStore.endpoint |  | `helm-chart/put-checks/values.yaml:830` | **live** | `protected` | MOVED | MOVED | V |
| CHV-076 | objectStore.region | us-east-1 | `helm-chart/put-checks/values.yaml:831` | **live** | `protected` | MOVED | MOVED | V |
| CHV-077 | objectStore.bucket | put-checks-studio-evidence | `helm-chart/put-checks/values.yaml:832` | **live** | `protected` | MOVED | MOVED | V |
| CHV-078 | objectStore.pathStyleAccess | true | `helm-chart/put-checks/values.yaml:833` | **live** | `protected` | MOVED | MOVED | V |
| CHV-079 | objectStore.localDirectory | /var/lib/studio-objects | `helm-chart/put-checks/values.yaml:836` | **live** | `protected` | MOVED | MOVED | V |
| CHV-080 | objectStore.local.createClaim | true | `helm-chart/put-checks/values.yaml:838` | **live** | `protected` | MOVED | MOVED | V |
| CHV-081 | objectStore.local.existingClaim |  | `helm-chart/put-checks/values.yaml:839` | **live** | `protected` | MOVED | MOVED | V |
| CHV-082 | objectStore.local.storageClassName |  | `helm-chart/put-checks/values.yaml:840` | **live** | `protected` | MOVED | MOVED | V |
| CHV-083 | objectStore.local.accessModes | ["ReadWriteMany"] | `helm-chart/put-checks/values.yaml:841` | **live** | `protected` | MOVED | MOVED | V |
| CHV-084 | objectStore.local.size | 10Gi | `helm-chart/put-checks/values.yaml:843` | **live** | `protected` | MOVED | MOVED | V |
| CHV-085 | objectStore.connectTimeout | 2s | `helm-chart/put-checks/values.yaml:844` | **live** | `protected` | MOVED | MOVED | V |
| CHV-086 | objectStore.requestTimeout | 10s | `helm-chart/put-checks/values.yaml:845` | **live** | `protected` | MOVED | MOVED | V |
| CHV-087 | objectStore.credentialsSecret | checks-api-object-store | `helm-chart/put-checks/values.yaml:846` | **live** | `protected` | MOVED | MOVED | V |
| CHV-088 | objectStore.mountPath | /etc/studio/object-store | `helm-chart/put-checks/values.yaml:847` | **live** | `protected` | MOVED | MOVED | V |
| CHV-089 | objectStore.keys | ["accessKeyId", "secretAccessKey"] | `helm-chart/put-checks/values.yaml:848` | **live** | `protected` | MOVED | MOVED | V |
| CHV-090 | objectStore.retention | 30d | `helm-chart/put-checks/values.yaml:854` | **live** | `protected` | MOVED | MOVED | V |
| CHV-091 | studioVault.provider | none | `helm-chart/put-checks/values.yaml:860` | **live** | `protected` | MOVED | MOVED | V |
| CHV-092 | studioVault.address |  | `helm-chart/put-checks/values.yaml:861` | **live** | `protected` | MOVED | MOVED | V |
| CHV-093 | studioVault.namespace |  | `helm-chart/put-checks/values.yaml:862` | **live** | `protected` | MOVED | MOVED | V |
| CHV-094 | studioVault.mount | secret | `helm-chart/put-checks/values.yaml:863` | **live** | `protected` | MOVED | MOVED | V |
| CHV-095 | studioVault.pathTemplate | studio/{csiId}/{environment}/{testId}/{kind}/{referenceName} | `helm-chart/put-checks/values.yaml:864` | **live** | `protected` | MOVED | MOVED | V |
| CHV-096 | studioVault.valueKey | value | `helm-chart/put-checks/values.yaml:865` | **live** | `protected` | MOVED | MOVED | V |
| CHV-097 | studioVault.tokenSecret | checks-studio-vault-token | `helm-chart/put-checks/values.yaml:866` | **live** | `protected` | MOVED | MOVED | V |
| CHV-098 | studioVault.tokenKey | token | `helm-chart/put-checks/values.yaml:867` | **live** | `protected` | MOVED | MOVED | V |
| CHV-099 | studioVault.tokenMountPath | /etc/studio/vault | `helm-chart/put-checks/values.yaml:868` | **live** | `protected` | MOVED | MOVED | V |
| CHV-100 | studioVault.connectTimeout | 2s | `helm-chart/put-checks/values.yaml:869` | **live** | `protected` | MOVED | MOVED | V |
| CHV-101 | studioVault.requestTimeout | 5s | `helm-chart/put-checks/values.yaml:870` | **live** | `protected` | MOVED | MOVED | V |
| CHV-102 | studioVault.maxResponseBytes | 65536 | `helm-chart/put-checks/values.yaml:871` | **live** | `protected` | MOVED | MOVED | V |
| CHV-103 | studioGateway.environment | production | `helm-chart/put-checks/values.yaml:877` | **live** | `protected` | MOVED | MOVED | V |
| CHV-104 | studioGateway.provider | vertex | `helm-chart/put-checks/values.yaml:878` | **live** | `protected` | MOVED | MOVED | V |
| CHV-105 | studioGateway.endpoint |  | `helm-chart/put-checks/values.yaml:879` | **live** | `protected` | MOVED | MOVED | V |
| CHV-106 | studioGateway.project |  | `helm-chart/put-checks/values.yaml:880` | **live** | `protected` | MOVED | MOVED | V |
| CHV-107 | studioGateway.location |  | `helm-chart/put-checks/values.yaml:881` | **live** | `protected` | MOVED | MOVED | V |
| CHV-108 | studioGateway.model | gemini-3.8-flash | `helm-chart/put-checks/values.yaml:882` | **live** | `protected` | MOVED | MOVED | V |
| CHV-109 | studioGateway.vertexConfigMap.name | checks-studio-vertex | `helm-chart/put-checks/values.yaml:887` | **live** | `protected` | MOVED | MOVED | V |
| CHV-110 | studioGateway.vertexConfigMap.endpointKey | endpoint | `helm-chart/put-checks/values.yaml:888` | **live** | `protected` | MOVED | MOVED | V |
| CHV-111 | studioGateway.vertexConfigMap.projectKey | project | `helm-chart/put-checks/values.yaml:889` | **live** | `protected` | MOVED | MOVED | V |
| CHV-112 | studioGateway.vertexConfigMap.locationKey | location | `helm-chart/put-checks/values.yaml:890` | **live** | `protected` | MOVED | MOVED | V |
| CHV-113 | studioGateway.credentialsMode | application-default | `helm-chart/put-checks/values.yaml:891` | **live** | `protected` | MOVED | MOVED | V |
| CHV-114 | studioGateway.credentialsSecret |  | `helm-chart/put-checks/values.yaml:892` | **live** | `protected` | MOVED | MOVED | V |
| CHV-115 | studioGateway.credentialsKey | service-account.json | `helm-chart/put-checks/values.yaml:893` | **live** | `protected` | MOVED | MOVED | V |
| CHV-116 | studioGateway.credentialsMountPath | /etc/studio/gateway | `helm-chart/put-checks/values.yaml:894` | **live** | `protected` | MOVED | MOVED | V |
| CHV-117 | studioSse.heartbeatSeconds | 15 | `helm-chart/put-checks/values.yaml:933` | **live** | `protected` | MOVED | MOVED | V |
| CHV-118 | studioSse.lifetimeSeconds | 60 | `helm-chart/put-checks/values.yaml:936` | **live** | `protected` | MOVED | MOVED | V |
| CHV-119 | studioSse.idleTimeoutMarginSeconds | 60 | `helm-chart/put-checks/values.yaml:940` | **live** | `protected` | MOVED | MOVED | V |
| CHV-120 | studioSse.ingress.enabled | true | `helm-chart/put-checks/values.yaml:946` | **live** | `protected` | MOVED | MOVED | V |
| CHV-121 | studioSse.ingress.extraAnnotations | {} | `helm-chart/put-checks/values.yaml:962` | **live** | `protected` | MOVED | MOVED | V |
| CHV-122 | studioExecution.enabled | true | `helm-chart/put-checks/values.yaml:1011` | **live** | `protected` | MOVED | MOVED | V |
| CHV-123 | studioExecution.dispatcherEnabled | true | `helm-chart/put-checks/values.yaml:1018` | **live** | `protected` | MOVED | MOVED | V |
| CHV-124 | studioRunner.probes.livenessFailureThreshold | 3 | `helm-chart/put-checks/values.yaml:532` | **live** | `protected` | SAME | NEW | V |
| CHV-125 | studioRunner.tls.secretName | checks-studio-runner-tls | `helm-chart/put-checks/values.yaml:565` | **live** | `protected` | SAME | NEW | V |
| CHV-126 | studioRunner.tls.mountPath | /etc/studio/tls | `helm-chart/put-checks/values.yaml:569` | **live** | `protected` | SAME | NEW | V |
| CHV-127 | studioRunner.tls.keyFile | tls.key | `helm-chart/put-checks/values.yaml:570` | **live** | `protected` | SAME | NEW | V |
| CHV-128 | studioRunner.tls.certFile | tls.crt | `helm-chart/put-checks/values.yaml:571` | **live** | `protected` | SAME | NEW | V |
| CHV-129 | studioRunner.tls.caFile | ca.crt | `helm-chart/put-checks/values.yaml:572` | **live** | `protected` | SAME | NEW | V |
| CHV-130 | studioRunner.tls.controllerCertificateFingerprint256 |  | `helm-chart/put-checks/values.yaml:580` | **live** | `protected` | SAME | NEW | V |
| CHV-131 | studioRunner.tls.rotationRevision |  | `helm-chart/put-checks/values.yaml:586` | **live** | `protected` | SAME | NEW | V |
| CHV-132 | studioRunner.backendTls.secretName | checks-studio-backend-runner-tls | `helm-chart/put-checks/values.yaml:600` | **live** | `protected` | SAME | NEW | V |
| CHV-133 | studioRunner.backendTls.mountPath | /etc/studio/runner-tls | `helm-chart/put-checks/values.yaml:601` | **live** | `protected` | SAME | NEW | V |
| CHV-134 | studioRunner.backendTls.keyStoreKey | keystore.p12 | `helm-chart/put-checks/values.yaml:602` | **live** | `protected` | SAME | NEW | V |
| CHV-135 | studioRunner.backendTls.keyStorePasswordKey | keystore.password | `helm-chart/put-checks/values.yaml:603` | **live** | `protected` | SAME | NEW | V |
| CHV-136 | studioRunner.backendTls.trustStoreKey | truststore.p12 | `helm-chart/put-checks/values.yaml:604` | **live** | `protected` | SAME | NEW | V |
| CHV-137 | studioRunner.backendTls.trustStorePasswordKey | truststore.password | `helm-chart/put-checks/values.yaml:605` | **live** | `protected` | SAME | NEW | V |
| CHV-138 | studioRunner.backendTls.storeType | PKCS12 | `helm-chart/put-checks/values.yaml:606` | **live** | `protected` | SAME | NEW | V |
| CHV-139 | studioRunner.guided.enabled | false | `helm-chart/put-checks/values.yaml:623` | **live** | `protected` | SAME | NEW | V |
| CHV-140 | studioRunner.guided.workerId | worker-1 | `helm-chart/put-checks/values.yaml:628` | **dark** | `protected` | SAME | NEW | V |
| CHV-141 | studioRunner.guided.token.issuer |  | `helm-chart/put-checks/values.yaml:639` | **dark** | `protected` | SAME | NEW | V |
| CHV-142 | studioRunner.guided.token.controllerSubject |  | `helm-chart/put-checks/values.yaml:640` | **dark** | `protected` | SAME | NEW | V |
| CHV-143 | studioRunner.guided.token.publicKey |  | `helm-chart/put-checks/values.yaml:641` | **dark** | `protected` | SAME | NEW | V |
| CHV-144 | studioRunner.guided.callbackBaseUrl |  | `helm-chart/put-checks/values.yaml:646` | **dark** | `protected` | SAME | NEW | V |
| CHV-145 | studioRunner.guided.callbackToken.secretName | checks-studio-guided-callback-token | `helm-chart/put-checks/values.yaml:650` | **dark** | `protected` | SAME | NEW | V |
| CHV-146 | studioRunner.guided.callbackToken.key | token | `helm-chart/put-checks/values.yaml:651` | **dark** | `protected` | SAME | NEW | V |
| CHV-147 | studioRunner.guided.callbackToken.mountPath | /etc/studio/guided-token | `helm-chart/put-checks/values.yaml:652` | **dark** | `protected` | SAME | NEW | V |
| CHV-148 | studioRunner.guided.controllerPublicKey.mountPath | /etc/studio/guided | `helm-chart/put-checks/values.yaml:655` | **dark** | `protected` | SAME | NEW | V |
| CHV-149 | studioRunner.guided.controllerPublicKey.file | controller-public-key.pem | `helm-chart/put-checks/values.yaml:656` | **dark** | `protected` | SAME | NEW | V |
| CHV-150 | studioRunner.guided.backendTokens.secretName | checks-studio-guided-controller-tokens | `helm-chart/put-checks/values.yaml:660` | **dark** | `protected` | SAME | NEW | V |
| CHV-151 | studioRunner.guided.backendTokens.runnerTokenKey | runner-controller-token | `helm-chart/put-checks/values.yaml:661` | **dark** | `protected` | SAME | NEW | V |
| CHV-152 | studioRunner.guided.backendTokens.translationTokenKey | translation-controller-token | `helm-chart/put-checks/values.yaml:662` | **dark** | `protected` | SAME | NEW | V |
| CHV-153 | studioRunner.guided.backendTokens.mountPath | /etc/studio/guided-controller-tokens | `helm-chart/put-checks/values.yaml:663` | **dark** | `protected` | SAME | NEW | V |
| CHV-154 | studioRunner.guided.tlsConnector.port | 8443 | `helm-chart/put-checks/values.yaml:668` | **dark** | `protected` | SAME | NEW | V |
| CHV-155 | studioRunner.guided.tlsConnector.servicePort | 8443 | `helm-chart/put-checks/values.yaml:669` | **dark** | `protected` | SAME | NEW | V |
| CHV-156 | studioRunner.guided.journal.mountPath | /var/lib/studio-guided | `helm-chart/put-checks/values.yaml:677` | **dark** | `protected` | SAME | NEW | V |
| CHV-157 | studioRunner.guided.journal.directory | journal | `helm-chart/put-checks/values.yaml:678` | **dark** | `protected` | SAME | NEW | V |
| CHV-158 | studioRunner.guided.journal.sizeLimit | 256Mi | `helm-chart/put-checks/values.yaml:681` | **dark** | `protected` | SAME | NEW | V |
| CHV-159 | studioRunner.guided.tmp.sizeLimit | 1Gi | `helm-chart/put-checks/values.yaml:690` | **dark** | `protected` | SAME | NEW | V |
| CHV-160 | studioRunner.guided.livenessFailureThreshold | 6 | `helm-chart/put-checks/values.yaml:694` | **dark** | `protected` | SAME | NEW | V |
| CHV-161 | studioRunner.guided.resources.requests.cpu | 1 | `helm-chart/put-checks/values.yaml:701` | **dark** | `protected` | SAME | NEW | V |
| CHV-162 | studioRunner.guided.resources.requests.memory | 2Gi | `helm-chart/put-checks/values.yaml:702` | **dark** | `protected` | SAME | NEW | V |
| CHV-163 | studioRunner.guided.resources.limits.cpu | 3 | `helm-chart/put-checks/values.yaml:704` | **dark** | `protected` | SAME | NEW | V |
| CHV-164 | studioRunner.guided.resources.limits.memory | 4Gi | `helm-chart/put-checks/values.yaml:705` | **dark** | `protected` | SAME | NEW | V |
| CHV-165 | studioRunner.guided.devShm.sizeLimit | 2Gi | `helm-chart/put-checks/values.yaml:707` | **dark** | `protected` | SAME | NEW | V |
| CHV-166 | studioAuditSiem.enabled | false | `helm-chart/put-checks/values.yaml:981` | **live** | `protected` | MOVED | NEW | V |
| CHV-167 | studioAuditSiem.sink.name |  | `helm-chart/put-checks/values.yaml:984` | **dark** | `protected` | MOVED | NEW | V |
| CHV-168 | studioAuditSiem.podAnnotations | {} | `helm-chart/put-checks/values.yaml:988` | **dark** | `protected` | MOVED | NEW | V |
| CHV-169 | studioObserved.validationEnabled | false | `helm-chart/put-checks/values.yaml:803` | **live** | `protected` | NEW | NEW | V |
| CHV-170 | studioObserved.replayEnabled | false | `helm-chart/put-checks/values.yaml:804` | **live** | `protected` | NEW | NEW | V |
| CHV-171 | studioObserved.catalog | {} | `helm-chart/put-checks/values.yaml:809` | **live** | `protected` | NEW | NEW | V |
| CHV-172 | studioObserved.additionalBackendCatalog | [] | `helm-chart/put-checks/values.yaml:813` | **live** | `protected` | NEW | NEW | V |
| CHV-173 | studioObserved.policies | [] | `helm-chart/put-checks/values.yaml:817` | **live** | `protected` | NEW | NEW | V |
| CHV-174 | studioObserved.mountPath | /etc/studio-observed | `helm-chart/put-checks/values.yaml:819` | **live** | `protected` | NEW | NEW | V |

### 5.16 Chart `values-<env>.yaml` (94)

| Id | Surface | Value | Anchor | Status | Protection | ΔG9b | ΔSkel | Tag |
|---|---|---|---|---|---|---|---|---|
| CHE-01 | backend.env.JAVA_OPTS [values-dev] | -Xms256m -Xmx512m -XX:+UseG1GC -XX:MaxMetaspaceSize=192m -XX:-HeapDum… | `helm-chart/put-checks/values-dev.yaml:25` | **live** | `protected` | SAME | CHANGED | V |
| CHE-02 | backend.configOverrides.checks.sources.UI_TEST [values-dev] | false | `helm-chart/put-checks/values-dev.yaml:39` | **live** | `protected` | SAME | MOVED | V |
| CHE-03 | studioVault.provider [values-dev] | none | `helm-chart/put-checks/values-dev.yaml:47` | **live** | `protected` | SAME | MOVED | V |
| CHE-04 | studioGateway.environment [values-dev] | local | `helm-chart/put-checks/values-dev.yaml:52` | **live** | `protected` | SAME | MOVED | V |
| CHE-05 | studioGateway.provider [values-dev] | disabled | `helm-chart/put-checks/values-dev.yaml:53` | **live** | `protected` | SAME | MOVED | V |
| CHE-06 | studioGateway.vertexConfigMap.name [values-dev] |  | `helm-chart/put-checks/values-dev.yaml:55` | **live** | `protected` | SAME | MOVED | V |
| CHE-07 | worker.env.JAVA_OPTS [values-dev] | -Xms256m -Xmx512m -XX:+UseG1GC -XX:MaxMetaspaceSize=192m -XX:-HeapDum… | `helm-chart/put-checks/values-dev.yaml:75` | **live** | `protected` | SAME | CHANGED | V |
| CHE-08 | worker.configOverrides.checks.executor.source-limits.UI_TEST [values-dev] | 5 | `helm-chart/put-checks/values-dev.yaml:95` | **live** | `protected` | SAME | MOVED | V |
| CHE-09 | frontend.env.VITE_ENABLE_STUDIO [values-dev] | true | `helm-chart/put-checks/values-dev.yaml:113` | **live** | `protected` | SAME | MOVED | V |
| CHE-10 | studioRunner.enabled [values-dev] | false | `helm-chart/put-checks/values-dev.yaml:121` | **live** | `protected` | SAME | MOVED | V |
| CHE-11 | studioRunner.replicaCount [values-dev] | 2 | `helm-chart/put-checks/values-dev.yaml:122` | **live** | `protected` | SAME | BEHAVIOUR | V |
| CHE-12 | studioRunner.resources.requests.cpu [values-dev] | 250m | `helm-chart/put-checks/values-dev.yaml:125` | **live** | `protected` | SAME | MOVED | V |
| CHE-13 | studioRunner.resources.requests.memory [values-dev] | 512Mi | `helm-chart/put-checks/values-dev.yaml:126` | **live** | `protected` | SAME | MOVED | V |
| CHE-14 | studioRunner.resources.limits.cpu [values-dev] | 1 | `helm-chart/put-checks/values-dev.yaml:128` | **live** | `protected` | SAME | MOVED | V |
| CHE-15 | studioRunner.resources.limits.memory [values-dev] | 1Gi | `helm-chart/put-checks/values-dev.yaml:129` | **live** | `protected` | SAME | MOVED | V |
| CHE-16 | studioRunner.devShm.sizeLimit [values-dev] | 512Mi | `helm-chart/put-checks/values-dev.yaml:131` | **live** | `protected` | SAME | MOVED | V |
| CHE-17 | studioRunner.scratch.sizeLimit [values-dev] | 2Gi | `helm-chart/put-checks/values-dev.yaml:133` | **live** | `protected` | SAME | MOVED | V |
| CHE-18 | studioRunner.seccompProfile.type [values-dev] | RuntimeDefault | `helm-chart/put-checks/values-dev.yaml:165` | **live** | `protected` | SAME | MOVED | V |
| CHE-19 | backend.env.JAVA_OPTS [values-uat] | -Xms256m -Xmx512m -XX:+UseG1GC -XX:MaxMetaspaceSize=192m -XX:+ExitOnO… | `helm-chart/put-checks/values-uat.yaml:26` | **live** | `protected` | SAME | CHANGED | V |
| CHE-20 | backend.configOverrides.checks.sources.UI_TEST [values-uat] | true | `helm-chart/put-checks/values-uat.yaml:88` | **live** | `protected` | SAME | MOVED | V |
| CHE-21 | worker.env.JAVA_OPTS [values-uat] | -Xms512m -Xmx768m -XX:+UseG1GC -XX:MaxMetaspaceSize=192m -XX:+ExitOnO… | `helm-chart/put-checks/values-uat.yaml:106` | **live** | `protected` | SAME | CHANGED | V |
| CHE-22 | worker.configOverrides.checks.executor.source-limits.UI_TEST [values-uat] | 10 | `helm-chart/put-checks/values-uat.yaml:125` | **live** | `protected` | SAME | MOVED | V |
| CHE-23 | frontend.env.VITE_ENABLE_STUDIO [values-uat] | true | `helm-chart/put-checks/values-uat.yaml:145` | **live** | `protected` | SAME | MOVED | V |
| CHE-24 | studioRunner.enabled [values-uat] | true | `helm-chart/put-checks/values-uat.yaml:156` | **live** | `protected` | SAME | MOVED | V |
| CHE-25 | studioRunner.replicaCount [values-uat] | 2 | `helm-chart/put-checks/values-uat.yaml:157` | **live** | `protected` | SAME | BEHAVIOUR | V |
| CHE-26 | studioRunner.resources.requests.cpu [values-uat] | 500m | `helm-chart/put-checks/values-uat.yaml:160` | **live** | `protected` | SAME | MOVED | V |
| CHE-27 | studioRunner.resources.requests.memory [values-uat] | 1Gi | `helm-chart/put-checks/values-uat.yaml:161` | **live** | `protected` | SAME | MOVED | V |
| CHE-28 | studioRunner.resources.limits.cpu [values-uat] | 2 | `helm-chart/put-checks/values-uat.yaml:163` | **live** | `protected` | SAME | MOVED | V |
| CHE-29 | studioRunner.resources.limits.memory [values-uat] | 2Gi | `helm-chart/put-checks/values-uat.yaml:164` | **live** | `protected` | SAME | MOVED | V |
| CHE-30 | studioRunner.devShm.sizeLimit [values-uat] | 1Gi | `helm-chart/put-checks/values-uat.yaml:166` | **live** | `protected` | SAME | MOVED | V |
| CHE-31 | studioRunner.scratch.sizeLimit [values-uat] | 4Gi | `helm-chart/put-checks/values-uat.yaml:168` | **live** | `protected` | SAME | MOVED | V |
| CHE-32 | studioRunner.seccompProfile.type [values-uat] | RuntimeDefault | `helm-chart/put-checks/values-uat.yaml:197` | **live** | `protected` | SAME | MOVED | V |
| CHE-33 | studioRunner.callbackBaseUrl [values-uat] |  | `helm-chart/put-checks/values-uat.yaml:198` | **live** | `protected` | SAME | MOVED | V |
| CHE-34 | studioRunner.identity.secretName [values-uat] | checks-studio-runner-identity-uat | `helm-chart/put-checks/values-uat.yaml:200` | **live** | `protected` | SAME | ADJACENT | V |
| CHE-35 | studioRunner.objectStore.credentialsSecret [values-uat] | checks-studio-runner-object-store-uat | `helm-chart/put-checks/values-uat.yaml:202` | **live** | `protected` | SAME | MOVED | V |
| CHE-36 | objectStore.credentialsSecret [values-uat] | checks-api-object-store-uat | `helm-chart/put-checks/values-uat.yaml:204` | **live** | `protected` | SAME | MOVED | V |
| CHE-37 | studioGateway.environment [values-uat] | staging | `helm-chart/put-checks/values-uat.yaml:220` | **live** | `protected` | MOVED | MOVED | V |
| CHE-38 | studioGateway.provider [values-uat] | vertex | `helm-chart/put-checks/values-uat.yaml:221` | **live** | `protected` | MOVED | MOVED | V |
| CHE-39 | studioGateway.model [values-uat] | gemini-3.8-flash | `helm-chart/put-checks/values-uat.yaml:222` | **live** | `protected` | MOVED | MOVED | V |
| CHE-40 | studioGateway.vertexConfigMap.name [values-uat] | checks-studio-vertex-uat | `helm-chart/put-checks/values-uat.yaml:224` | **live** | `protected` | MOVED | MOVED | V |
| CHE-41 | backend.env.JAVA_OPTS [values-prod] | -Xms512m -Xmx768m -XX:+UseG1GC -XX:MaxMetaspaceSize=192m -XX:+ExitOnO… | `helm-chart/put-checks/values-prod.yaml:32` | **live** | `protected` | SAME | CHANGED | V |
| CHE-42 | backend.configOverrides.checks.sources.UI_TEST [values-prod] | true | `helm-chart/put-checks/values-prod.yaml:94` | **live** | `protected` | SAME | MOVED | V |
| CHE-43 | worker.env.JAVA_OPTS [values-prod] | -Xms768m -Xmx1024m -XX:+UseG1GC -XX:MaxMetaspaceSize=192m -XX:+ExitOn… | `helm-chart/put-checks/values-prod.yaml:112` | **live** | `protected` | SAME | CHANGED | V |
| CHE-44 | worker.configOverrides.checks.executor.source-limits.UI_TEST [values-prod] | 25 | `helm-chart/put-checks/values-prod.yaml:131` | **live** | `protected` | SAME | MOVED | V |
| CHE-45 | frontend.env.VITE_ENABLE_STUDIO [values-prod] | true | `helm-chart/put-checks/values-prod.yaml:159` | **live** | `protected` | SAME | MOVED | V |
| CHE-46 | studioRunner.enabled [values-prod] | false | `helm-chart/put-checks/values-prod.yaml:172` | **live** | `protected` | SAME | MOVED | V |
| CHE-47 | studioRunner.replicaCount [values-prod] | 2 | `helm-chart/put-checks/values-prod.yaml:173` | **live** | `protected` | SAME | BEHAVIOUR | V |
| CHE-48 | studioRunner.resources.requests.cpu [values-prod] | 1 | `helm-chart/put-checks/values-prod.yaml:176` | **live** | `protected` | SAME | MOVED | V |
| CHE-49 | studioRunner.resources.requests.memory [values-prod] | 2Gi | `helm-chart/put-checks/values-prod.yaml:177` | **live** | `protected` | SAME | MOVED | V |
| CHE-50 | studioRunner.resources.limits.cpu [values-prod] | 2 | `helm-chart/put-checks/values-prod.yaml:179` | **live** | `protected` | SAME | MOVED | V |
| CHE-51 | studioRunner.resources.limits.memory [values-prod] | 4Gi | `helm-chart/put-checks/values-prod.yaml:180` | **live** | `protected` | SAME | MOVED | V |
| CHE-52 | studioRunner.devShm.sizeLimit [values-prod] | 2Gi | `helm-chart/put-checks/values-prod.yaml:182` | **live** | `protected` | SAME | MOVED | V |
| CHE-53 | studioRunner.scratch.sizeLimit [values-prod] | 8Gi | `helm-chart/put-checks/values-prod.yaml:184` | **live** | `protected` | SAME | MOVED | V |
| CHE-54 | studioRunner.seccompProfile.type [values-prod] | RuntimeDefault | `helm-chart/put-checks/values-prod.yaml:213` | **live** | `protected` | SAME | MOVED | V |
| CHE-55 | studioRunner.callbackBaseUrl [values-prod] |  | `helm-chart/put-checks/values-prod.yaml:214` | **live** | `protected` | SAME | MOVED | V |
| CHE-56 | studioRunner.identity.secretName [values-prod] | checks-studio-runner-identity-prod | `helm-chart/put-checks/values-prod.yaml:216` | **live** | `protected` | SAME | ADJACENT | V |
| CHE-57 | studioRunner.objectStore.credentialsSecret [values-prod] | checks-studio-runner-object-store-prod | `helm-chart/put-checks/values-prod.yaml:218` | **live** | `protected` | SAME | MOVED | V |
| CHE-58 | objectStore.credentialsSecret [values-prod] | checks-api-object-store-prod | `helm-chart/put-checks/values-prod.yaml:220` | **live** | `protected` | SAME | MOVED | V |
| CHE-59 | studioGateway.environment [values-prod] | production | `helm-chart/put-checks/values-prod.yaml:226` | **live** | `protected` | SAME | MOVED | V |
| CHE-60 | studioGateway.provider [values-prod] | vertex | `helm-chart/put-checks/values-prod.yaml:227` | **live** | `protected` | SAME | MOVED | V |
| CHE-61 | studioGateway.model [values-prod] | gemini-3.8-flash | `helm-chart/put-checks/values-prod.yaml:228` | **live** | `protected` | SAME | MOVED | V |
| CHE-62 | studioGateway.vertexConfigMap.name [values-prod] | checks-studio-vertex-prod | `helm-chart/put-checks/values-prod.yaml:230` | **live** | `protected` | SAME | MOVED | V |
| CHE-63 | studioRunner.tls.secretName [values-dev] | checks-studio-runner-tls-dev | `helm-chart/put-checks/values-dev.yaml:139` | **live** | `protected` | SAME | NEW | V |
| CHE-64 | studioRunner.backendTls.secretName [values-dev] | checks-studio-backend-runner-tls-dev | `helm-chart/put-checks/values-dev.yaml:141` | **live** | `protected` | SAME | NEW | V |
| CHE-65 | studioRunner.guided.enabled [values-dev] | false | `helm-chart/put-checks/values-dev.yaml:147` | **live** | `protected` | SAME | NEW | V |
| CHE-66 | studioRunner.guided.callbackToken.secretName [values-dev] | checks-studio-guided-callback-token-dev | `helm-chart/put-checks/values-dev.yaml:149` | **dark** | `protected` | SAME | NEW | V |
| CHE-67 | studioRunner.guided.backendTokens.secretName [values-dev] | checks-studio-guided-controller-tokens-dev | `helm-chart/put-checks/values-dev.yaml:151` | **dark** | `protected` | SAME | NEW | V |
| CHE-68 | studioRunner.guided.resources.requests.cpu [values-dev] | 500m | `helm-chart/put-checks/values-dev.yaml:154` | **dark** | `protected` | SAME | NEW | V |
| CHE-69 | studioRunner.guided.resources.requests.memory [values-dev] | 1Gi | `helm-chart/put-checks/values-dev.yaml:155` | **dark** | `protected` | SAME | NEW | V |
| CHE-70 | studioRunner.guided.resources.limits.cpu [values-dev] | 2 | `helm-chart/put-checks/values-dev.yaml:157` | **dark** | `protected` | SAME | NEW | V |
| CHE-71 | studioRunner.guided.resources.limits.memory [values-dev] | 2Gi | `helm-chart/put-checks/values-dev.yaml:158` | **dark** | `protected` | SAME | NEW | V |
| CHE-72 | studioRunner.guided.devShm.sizeLimit [values-dev] | 1Gi | `helm-chart/put-checks/values-dev.yaml:160` | **dark** | `protected` | SAME | NEW | V |
| CHE-73 | studioRunner.tls.secretName [values-uat] | checks-studio-runner-tls-uat | `helm-chart/put-checks/values-uat.yaml:174` | **live** | `protected` | SAME | NEW | V |
| CHE-74 | studioRunner.backendTls.secretName [values-uat] | checks-studio-backend-runner-tls-uat | `helm-chart/put-checks/values-uat.yaml:176` | **live** | `protected` | SAME | NEW | V |
| CHE-75 | studioRunner.guided.enabled [values-uat] | false | `helm-chart/put-checks/values-uat.yaml:182` | **live** | `protected` | SAME | NEW | V |
| CHE-76 | studioRunner.guided.callbackToken.secretName [values-uat] | checks-studio-guided-callback-token-uat | `helm-chart/put-checks/values-uat.yaml:184` | **dark** | `protected` | SAME | NEW | V |
| CHE-77 | studioRunner.guided.backendTokens.secretName [values-uat] | checks-studio-guided-controller-tokens-uat | `helm-chart/put-checks/values-uat.yaml:186` | **dark** | `protected` | SAME | NEW | V |
| CHE-78 | studioRunner.guided.resources.requests.cpu [values-uat] | 1 | `helm-chart/put-checks/values-uat.yaml:189` | **dark** | `protected` | SAME | NEW | V |
| CHE-79 | studioRunner.guided.resources.requests.memory [values-uat] | 2Gi | `helm-chart/put-checks/values-uat.yaml:190` | **dark** | `protected` | SAME | NEW | V |
| CHE-80 | studioRunner.guided.resources.limits.cpu [values-uat] | 3 | `helm-chart/put-checks/values-uat.yaml:192` | **dark** | `protected` | SAME | NEW | V |
| CHE-81 | studioRunner.guided.resources.limits.memory [values-uat] | 4Gi | `helm-chart/put-checks/values-uat.yaml:193` | **dark** | `protected` | SAME | NEW | V |
| CHE-82 | studioRunner.guided.devShm.sizeLimit [values-uat] | 2Gi | `helm-chart/put-checks/values-uat.yaml:195` | **dark** | `protected` | SAME | NEW | V |
| CHE-83 | studioRunner.tls.secretName [values-prod] | checks-studio-runner-tls-prod | `helm-chart/put-checks/values-prod.yaml:190` | **live** | `protected` | SAME | NEW | V |
| CHE-84 | studioRunner.backendTls.secretName [values-prod] | checks-studio-backend-runner-tls-prod | `helm-chart/put-checks/values-prod.yaml:192` | **live** | `protected` | SAME | NEW | V |
| CHE-85 | studioRunner.guided.enabled [values-prod] | false | `helm-chart/put-checks/values-prod.yaml:198` | **live** | `protected` | SAME | NEW | V |
| CHE-86 | studioRunner.guided.callbackToken.secretName [values-prod] | checks-studio-guided-callback-token-prod | `helm-chart/put-checks/values-prod.yaml:200` | **dark** | `protected` | SAME | NEW | V |
| CHE-87 | studioRunner.guided.backendTokens.secretName [values-prod] | checks-studio-guided-controller-tokens-prod | `helm-chart/put-checks/values-prod.yaml:202` | **dark** | `protected` | SAME | NEW | V |
| CHE-88 | studioRunner.guided.resources.requests.cpu [values-prod] | 2 | `helm-chart/put-checks/values-prod.yaml:205` | **dark** | `protected` | SAME | NEW | V |
| CHE-89 | studioRunner.guided.resources.requests.memory [values-prod] | 4Gi | `helm-chart/put-checks/values-prod.yaml:206` | **dark** | `protected` | SAME | NEW | V |
| CHE-90 | studioRunner.guided.resources.limits.cpu [values-prod] | 4 | `helm-chart/put-checks/values-prod.yaml:208` | **dark** | `protected` | SAME | NEW | V |
| CHE-91 | studioRunner.guided.resources.limits.memory [values-prod] | 8Gi | `helm-chart/put-checks/values-prod.yaml:209` | **dark** | `protected` | SAME | NEW | V |
| CHE-92 | studioRunner.guided.devShm.sizeLimit [values-prod] | 4Gi | `helm-chart/put-checks/values-prod.yaml:211` | **dark** | `protected` | SAME | NEW | V |
| CHE-93 | studioObserved.validationEnabled [values-uat] | true | `helm-chart/put-checks/values-uat.yaml:213` | **live** | `protected` | NEW | NEW | V |
| CHE-94 | studioObserved.replayEnabled [values-uat] | true | `helm-chart/put-checks/values-uat.yaml:214` | **live** | `protected` | NEW | NEW | V |

### 5.17 Chart templates (10)

| Id | Surface | Value | Anchor | Status | Protection | ΔG9b | ΔSkel | Tag |
|---|---|---|---|---|---|---|---|---|
| CHT-01 | helm-chart/put-checks/templates/studio-runner-deployment.yaml | sha256 `aa4a96d5922f6a01…` | `helm-chart/put-checks/templates/studio-runner-deployment.yaml` | **live** | `protected` | CHANGED | CHANGED | V |
| CHT-02 | helm-chart/put-checks/templates/studio-runner-service.yaml | sha256 `945fb9dacff1e99c…` | `helm-chart/put-checks/templates/studio-runner-service.yaml` | **live** | `protected` | SAME | CHANGED | V |
| CHT-03 | helm-chart/put-checks/templates/studio-runner-networkpolicy.yaml | sha256 `c3bc1ac53c224ffb…` | `helm-chart/put-checks/templates/studio-runner-networkpolicy.yaml` | **live** | `protected` | SAME | CHANGED | V |
| CHT-04 | helm-chart/put-checks/templates/studio-runner-scaledobject.yaml | sha256 `11bd0472999a2adf…` | `helm-chart/put-checks/templates/studio-runner-scaledobject.yaml` | **live** | `protected` | SAME | SAME | V |
| CHT-05 | helm-chart/put-checks/templates/studio-object-store-pvc.yaml | sha256 `46c3ea74c9abe703…` | `helm-chart/put-checks/templates/studio-object-store-pvc.yaml` | **live** | `protected` | SAME | SAME | V |
| CHT-06 | helm-chart/put-checks/templates/studio-sse-ingress.yaml | sha256 `df2be610db0ca398…` | `helm-chart/put-checks/templates/studio-sse-ingress.yaml` | **live** | `protected` | SAME | SAME | V |
| CHT-07 | helm-chart/put-checks/templates/deployment.yaml (Studio env block, e.g. :112-250, :454-471) | sha256 `9f7fda6a66f57587…` | `helm-chart/put-checks/templates/deployment.yaml` | **live** | `protected` | CHANGED | CHANGED | V |
| CHT-08 | helm-chart/put-checks/templates/configmap.yaml (:65, :76-81 Studio data) | sha256 `6ea290fb3b98d582…` | `helm-chart/put-checks/templates/configmap.yaml` | **live** | `protected` | CHANGED | CHANGED | V |
| CHT-09 | helm-chart/put-checks/templates/_helpers.tpl:164 put-checks.studioRunner.acceptedEnvKeys (53 names) and studi… | 53 names | `helm-chart/put-checks/templates/_helpers.tpl:164`<br>`helm-chart/put-checks/templates/_helpers.tpl:175` | **live** | `protected` | CHANGED | CHANGED | V |
| CHT-10 | helm-chart/put-checks/templates/api-guided-tls-networkpolicy.yaml | sha256 `d34344cc3a264f2d…` | `helm-chart/put-checks/templates/api-guided-tls-networkpolicy.yaml` | **dark** | `protected` | SAME | NEW | V |

### 5.18 Other chart-rendered names (14)

| Id | Surface | Value | Anchor | Status | Protection | ΔG9b | ΔSkel | Tag |
|---|---|---|---|---|---|---|---|---|
| CHN-01 | CHECKS_SOURCES_UI_TEST |  | `helm-chart/put-checks/templates/deployment.yaml:32` | **live** | `protected` | MOVED | MOVED | V |
| CHN-02 | STUDIO_OBJECT_STORE_LIFECYCLE |  | `helm-chart/put-checks/templates/configmap.yaml:80` | **live** | `protected` | SAME | SAME | V |
| CHN-03 | STUDIO_OBJECT_STORE_KEY_PREFIX |  | `helm-chart/put-checks/templates/configmap.yaml:81` | **live** | `protected` | SAME | SAME | V |
| CHN-04 | <fullname>-api-guided-tls Service (port name guided-tls) |  | `helm-chart/put-checks/templates/studio-runner-service.yaml:40` | **dark** | `protected` | SAME | NEW | V |
| CHN-05 | guided-tls container port on the API Deployment |  | `helm-chart/put-checks/templates/deployment.yaml:121` | **dark** | `protected` | MOVED | NEW | V |
| CHN-06 | <fullname>-studio-audit-siem ConfigMap (STUDIO_AUDIT_STREAM, STUDIO_AUDIT_LOGGER, STUDIO_AUDIT_SINK) |  | `helm-chart/put-checks/templates/configmap.yaml:135` | **dark** | `protected` | MOVED | NEW | V |
| CHN-07 | pod annotation put.citi.com/studio-audit-stream: studio-audit (API and worker) |  | `helm-chart/put-checks/templates/deployment.yaml:78,427` | **dark** | `protected` | MOVED | NEW | V |
| CHN-08 | runner-tls Secret volume on API/worker pods (backendTls) |  | `helm-chart/put-checks/templates/_helpers.tpl:509`<br>`helm-chart/put-checks/templates/_helpers.tpl:522` | **live** | `protected` | MOVED | NEW | V |
| CHN-09 | backend Spring properties rendered by the chart (studio.runner.tls.*, guided chain keys) |  | `helm-chart/put-checks/templates/_helpers.tpl:576` | **live** | `protected` | MOVED | NEW | V |
| CHN-10 | <fullname>-studio-observed-trust ConfigMap (catalog.json, policies.json) |  | `helm-chart/put-checks/templates/configmap.yaml:102`<br>`helm-chart/put-checks/templates/_helpers.tpl:369` | **live** | `protected` | NEW | NEW | V |
| CHN-11 | studio-observed-trust volume and read-only mount at studioObserved.mountPath (runner pod) |  | `helm-chart/put-checks/templates/studio-runner-deployment.yaml:308,378` | **live** | `protected` | NEW | NEW | V |
| CHN-12 | backend Spring properties studio.observed-replay.catalog-json / policies-json rendered by the chart (API and … |  | `helm-chart/put-checks/templates/_helpers.tpl:357`<br>`helm-chart/put-checks/templates/_helpers.tpl:611` | **live** | `protected` | NEW | NEW | V |
| CHN-13 | runner image reference by digest <repository>@sha256:<studioObserved.catalog.build.executableImageDigest> whi… |  | `helm-chart/put-checks/templates/studio-runner-deployment.yaml:127` | **live** | `protected` | NEW | NEW | V |
| CHN-14 | pod annotation checksum/studio-observed-trust (runner) |  | `helm-chart/put-checks/templates/studio-runner-deployment.yaml:58` | **live** | `protected` | NEW | NEW | V |

### 5.19 Studio `@Scheduled` beans (8)

| Id | Surface | Value | Anchor | Status | Protection | ΔG9b | ΔSkel | Tag |
|---|---|---|---|---|---|---|---|---|
| SCH-01 | @Scheduled SnapshotBroadcaster (SSE) (@Profile("!worker") :41) |  | `…/checks/studio/sse/SnapshotBroadcaster.java:79` | **live** | `protected` | SAME | SAME | V |
| SCH-02 | @Scheduled GuidedTranslationCoordinator (no @Profile [V]) |  | `…/checks/studio/guided/translation/GuidedTranslationCoordinator.java:114`<br>`…/checks/studio/guided/translation/GuidedTranslationConfiguration.java:123 (@Profile on the @Bean)` | **live** | `protected` | SAME | BEHAVIOUR | V |
| SCH-03 | @Scheduled GuidedObservationPruner (no @Profile [V]) |  | `…/checks/studio/guided/retention/GuidedObservationPruner.java:48` | **live** | `protected` | SAME | SAME | V |
| SCH-04 | @Scheduled GuidedSessionReaper (no @Profile [V]) |  | `…/checks/studio/guided/session/GuidedSessionReaper.java:45`<br>`…/checks/studio/guided/session/GuidedSessionReaper.java:18 (@Profile on the class)` | **live** | `protected` | SAME | BEHAVIOUR | V |
| SCH-05 | @Scheduled StudioRecoveryScheduler (@Profile({"worker","local & !api"}) :21) |  | `…/checks/studio/recovery/StudioRecoveryScheduler.java:39` | **live** | `protected` | SAME | SAME | V |
| SCH-06 | @Scheduled SecretRevocationSweep (no @Profile; @Service :19 [V]) |  | `…/checks/studio/secrets/SecretRevocationSweep.java:57` | **live** | `protected` | SAME | SAME | V |
| SCH-07 | @Scheduled StudioDispatchMetrics (@Profile("worker") :42) |  | `…/checks/studio/dispatch/StudioDispatchMetrics.java:79` | **live** | `protected` | SAME | SAME | V |
| SCH-08 | @Scheduled StudioDispatchScheduler (@Profile({"worker","local & !api"}) :34) |  | `…/checks/studio/dispatch/StudioDispatchScheduler.java:68` | **live** | `protected` | SAME | SAME | V |

### 5.20 Runbook sections (not surfaces; T2 rewrites) (6)

| Id | Surface | Value | Anchor | Status | Protection | ΔG9b | ΔSkel | Tag |
|---|---|---|---|---|---|---|---|---|
| RBS-01 | docs/runbooks/studio-guided-authoring.md title + scope paragraph |  | `docs/runbooks/studio-guided-authoring.md:1` | **live** | `not-a-surface (runbook)` | SAME | SAME | V |
| RBS-02 | docs/runbooks/studio-guided-authoring.md ## Deployment prerequisites and privacy |  | `docs/runbooks/studio-guided-authoring.md:5` | **live** | `not-a-surface (runbook)` | SAME | SAME | V |
| RBS-03 | docs/runbooks/studio-guided-authoring.md ## Independent feature flags and clocks |  | `docs/runbooks/studio-guided-authoring.md:21` | **live** | `not-a-surface (runbook)` | SAME | SAME | V |
| RBS-04 | docs/runbooks/studio-guided-authoring.md ## Publication, reconnect and receipt access |  | `docs/runbooks/studio-guided-authoring.md:29` | **live** | `not-a-surface (runbook)` | SAME | SAME | V |
| RBS-05 | docs/runbooks/studio-guided-authoring.md ## Staged V19 compatibility and rollback |  | `docs/runbooks/studio-guided-authoring.md:41` | **live** | `not-a-surface (runbook)` | SAME | SAME | V |
| RBS-06 | docs/runbooks/studio-guided-authoring.md ## Evidence requirements |  | `docs/runbooks/studio-guided-authoring.md:49` | **live** | `not-a-surface (runbook)` | SAME | SAME | V |

### 5.21 AC-5 runbook rows to write (not surfaces) (19)

| Id | Surface | Value | Anchor | Status | Protection | ΔG9b | ΔSkel | Tag |
|---|---|---|---|---|---|---|---|---|
| RBR-01 | Secret provisioning per CSI/environment/test with allowedOrigins; R1-2 "an allowedOrigins entry asserts the w… |  | `docs/stories/STUDIO-OBSERVED/STUDIO-OBS-010.story.md:94-118` | **to-write** | `not-a-surface (runbook)` | MOVED | SAME | V |
| RBR-02 | Rotation (artifact hash unchanged, audit versions differ) |  | `docs/stories/STUDIO-OBSERVED/STUDIO-OBS-010.story.md:94-118` | **to-write** | `not-a-surface (runbook)` | MOVED | SAME | V |
| RBR-03 | Revocation incl. the mid-run bound (one control poll + one in-flight step) |  | `docs/stories/STUDIO-OBSERVED/STUDIO-OBS-010.story.md:94-118` | **to-write** | `not-a-surface (runbook)` | MOVED | SAME | V |
| RBR-04 | Audit retention window (design §8 Q3 default) |  | `docs/stories/STUDIO-OBSERVED/STUDIO-OBS-010.story.md:94-118` | **to-write** | `not-a-surface (runbook)` | MOVED | SAME | V |
| RBR-05 | Single 4096-character bound |  | `docs/stories/STUDIO-OBSERVED/STUDIO-OBS-010.story.md:94-118` | **to-write** | `not-a-surface (runbook)` | MOVED | SAME | V |
| RBR-06 | Multi-password and non-password limit (unsupported at GA, no fallback) |  | `docs/stories/STUDIO-OBSERVED/STUDIO-OBS-010.story.md:94-118` | **to-write** | `not-a-surface (runbook)` | MOVED | SAME | V |
| RBR-07 | Heap/core-dump controls (I-B7) |  | `docs/stories/STUDIO-OBSERVED/STUDIO-OBS-010.story.md:94-118` | **to-write** | `not-a-surface (runbook)` | MOVED | SAME | V |
| RBR-08 | Vault least-privilege policy and KV v2 history residual (I-C9); policy must also allow create + metadata list |  | `docs/stories/STUDIO-OBSERVED/STUDIO-OBS-010.story.md:94-118` | **to-write** | `not-a-surface (runbook)` | MOVED | SAME | V |
| RBR-09 | mTLS/TLS chain and client-certificate rotation inputs (SEC-4, G-2) |  | `docs/stories/STUDIO-OBSERVED/STUDIO-OBS-010.story.md:94-118` | **to-write** | `not-a-surface (runbook)` | MOVED | SAME | V |
| RBR-10 | Dev-database recreation after the D-B re-baseline (command from OBS-012A evidence) |  | `docs/stories/STUDIO-OBSERVED/STUDIO-OBS-010.story.md:94-118` | **to-write** | `not-a-surface (runbook)` | MOVED | SAME | V |
| RBR-11 | Governed read/discovery policy administration (OBS-014), incl. the R-2 interim (learning governed, replay Tru… |  | `docs/stories/STUDIO-OBSERVED/STUDIO-OBS-010.story.md:94-118` | **to-write** | `not-a-surface (runbook)` | MOVED | SAME | V |
| RBR-12 | Incremental re-learn semantics for operators ("Learn again" from the first changed step, D-D) |  | `docs/stories/STUDIO-OBSERVED/STUDIO-OBS-010.story.md:94-118` | **to-write** | `not-a-surface (runbook)` | MOVED | SAME | V |
| RBR-13 | Gates G-1 / G-2 / G-3 |  | `docs/stories/STUDIO-OBSERVED/STUDIO-OBS-010.story.md:94-118` | **to-write** | `not-a-surface (runbook)` | MOVED | SAME | V |
| RBR-14 | Clock synchronisation: runner, API (every replica and worker) and DB hosts NTP-synced; symptom 409 AUTHORIZAT… |  | `docs/stories/STUDIO-OBSERVED/STUDIO-OBS-010.story.md:94-118` | **to-write** | `not-a-surface (runbook)` | MOVED | SAME | V |
| RBR-15 | R8.2 d stuck-row alert specification |  | `docs/stories/STUDIO-OBSERVED/STUDIO-OBS-010.story.md:94-118` | **to-write** | `not-a-surface (runbook)` | MOVED | SAME | V |
| RBR-16 | A2.6 disclosure: guided mode only on a one-replica runner Deployment |  | `docs/stories/STUDIO-OBSERVED/STUDIO-OBS-010.story.md:94-118` | **to-write** | `not-a-surface (runbook)` | MOVED | SAME | V |
| RBR-17 | Neutral recording wording for unavailable/expired guided evidence (RECORDING-RUNBOOK-COPY) |  | `docs/stories/STUDIO-OBSERVED/STUDIO-OBS-010.story.md:94-118` | **to-write** | `not-a-surface (runbook)` | MOVED | SAME | V |
| RBR-18 | Dated "Live surface" list (this skeleton, finalized at T2) |  | `docs/stories/STUDIO-OBSERVED/STUDIO-OBS-010.story.md:94-118` | **to-write** | `not-a-surface (runbook)` | MOVED | SAME | V |
| RBR-19 | First-learn limit row (AC-5 addition P-1): AC-4 e1 text verbatim; p95 value "derived from T4" or "pending T4" |  | `docs/stories/STUDIO-OBSERVED/STUDIO-OBS-010.story.md:112-116` | **to-write** | `not-a-surface (runbook)` | NEW | NEW | V |

### 5.22 Planned by 009 (skeleton P09) (13)

| Id | Surface | Value | Anchor | Status | Protection | ΔG9b | ΔSkel | Tag |
|---|---|---|---|---|---|---|---|---|
| P09-01 | STUDIO_RUNNER_GUIDED_ENABLED (boolean, default false; guided keys required when true, refused when false) |  | `studio-runner/src/server/config.ts:431` | **live** | `planned (protection via the landed entries)` | SAME | LANDED | V |
| P09-02 | Guided STUDIO_RUNNER_* keys from the 13 mounted fields (names TBD by D1.0) |  | `studio-runner/src/server/config.ts:432-442` | **dark** | `planned (protection via the landed entries)` | SAME | LANDED | V |
| P09-03 | Runner TLS listener key/cert/CA file-path keys (names TBD by D1.0) |  | `studio-runner/src/server/config.ts:419-422` | **live** | `planned (protection via the landed entries)` | SAME | LANDED | V |
| P09-04 | Backend runner TLS properties: key-store, trust-store, password-file (StudioRunnerTls; names TBD by D3.0) |  | `backend/src/main/resources/application.yml:422` | **live** | `planned (protection via the landed entries)` | MOVED | LANDED | V |
| P09-05 | class dispatch/StudioRunnerTls.java |  | `…/checks/studio/dispatch/StudioRunnerTls.java` | **live** | `planned (protection via the landed entries)` | SAME | LANDED | V |
| P09-06 | test support RunnerProcessHarness.java |  | `backend/src/test/java/com/citi/put/checks/studio/support/RunnerProcessHarness.java` | **live** | `annex:not-a-surface` | SAME | LANDED | V |
| P09-07 | corun/ObservedCoRunIT.java |  | `backend/src/test/java/com/citi/put/checks/corun/ObservedCoRunIT.java` | **live** | `annex:not-a-surface` | SAME | LANDED | V |
| P09-08 | Gradle task verifyRunnerDist |  | `backend/build.gradle.kts:317` | **live** | `annex:not-a-surface` | SAME | LANDED | V |
| P09-09 | Chart guided-enable value + render guard (replicaCount == 1, autoscaling off) |  | `helm-chart/put-checks/values.yaml:623` | **dark** | `planned (protection via the landed entries)` | SAME | LANDED | V |
| P09-10 | Chart mTLS chain secret mounts for both pods |  | `helm-chart/put-checks/templates/_helpers.tpl:509` | **live** | `planned (protection via the landed entries)` | MOVED | LANDED | V |
| P09-11 | JVM flags -XX:-HeapDumpOnOutOfMemoryError -XX:-CreateCoredumpOnCrash in backend/worker JAVA_OPTS (all values … |  | `helm-chart/put-checks/values*.yaml (8 JAVA_OPTS leaves)` | **live** | `planned (protection via the landed entries)` | SAME | LANDED | V |
| P09-12 | SIEM sink reference in chart values |  | `helm-chart/put-checks/values.yaml:981` | **live** | `planned (protection via the landed entries)` | MOVED | LANDED | V |
| P09-13 | V23 migration (only if @data-engineer rules it AND U14 confirms a non-owner runtime role; or if ADJ-1 option … |  | `backend/src/main/resources/db/migration (head V22)` | **absent** | `planned, not landed` | SAME | NOT-LANDED | V |

### 5.23 Negative entries (must not exist / must refuse) (7)

| Id | Surface | Value | Anchor | Status | Protection | ΔG9b | ΔSkel | Tag |
|---|---|---|---|---|---|---|---|---|
| NEG-01 | No guided capacity key: capacity stays the code constant 1 |  | `studio-runner/src/guided/transport.ts:88` | **holds** | `protected` | SAME | MOVED | V |
| NEG-02 | No runner policy-hash key: the governed policy hash stays context-bound |  | `studio-runner/src/server/config.ts:430` | **holds** | `protected` | SAME | MOVED | V |
| NEG-03 | STUDIO_RUNNER_VAULT_ADDRESS is refused at startup (unknown key) |  | `studio-runner/src/server/config.ts:518` | **holds** | `protected` | SAME | MOVED | V |
| NEG-04 | No studio-guided-worker-* chart template |  | `helm-chart/put-checks/templates/` | **holds** | `protected` | SAME | SAME | V |
| NEG-05 | No plaintext runner listener in any configuration (today server.ts:17 is node:http) |  | `studio-runner/src/server/server.ts:21` | **holds** | `protected` | SAME | BECAME-TRUE | V |
| NEG-06 | A runnerEnv STUDIO_RUNNER_OBSERVED_* override fails the render (chart-managed keys) |  | `helm-chart/put-checks/templates/_helpers.tpl:192` | **holds** | `protected` | NEW | NEW | V |
| NEG-07 | Observed render guards G-O1..G-O4 refuse half or second-source observed configuration (runner off, malformed … |  | `helm-chart/put-checks/templates/_helpers.tpl:438`<br>`helm-chart/put-checks/templates/deployment.yaml:7`<br>`helm-chart/put-checks/templates/studio-runner-deployment.yaml:9` | **holds** | `protected` | NEW | NEW | V |

## 6. Annexes (ids kept, not protected by this list)

| Id | Surface | Annex | Reason |
|---|---|---|---|
| CFB-078 | studio.execution.sse.read-interval | `annex:excluded-with-reason` | excluded with reason (ruling A2): bound but never read; removed by 011 CLN-21. Id kept, never reused |
| CFC-02 | studio.guided-authoring.mtls-required | `annex:superseded-duplicate` | superseded-by CFB-101 (same key, now declared in application.yml; ruling A6 duplicates). Protection is carried by CFB-101 |
| CFC-03 | studio.guided-authoring.service-public-key | `annex:superseded-duplicate` | superseded-by CFB-102 (same key, now declared in application.yml; ruling A6 duplicates). Protection is carried by CFB-102 |
| CFC-04 | studio.guided-authoring.service-issuer | `annex:superseded-duplicate` | superseded-by CFB-103 (same key, now declared in application.yml; ruling A6 duplicates). Protection is carried by CFB-103 |
| P09-06 | test support RunnerProcessHarness.java | `annex:not-a-surface` | excluded-not-surface (ruling A5): test/build tooling, not an AC-5 category. 011 is held off it by 011 G1/G12 and the 009 File List, not by this list |
| P09-07 | corun/ObservedCoRunIT.java | `annex:not-a-surface` | excluded-not-surface (ruling A5): test/build tooling, not an AC-5 category. 011 is held off it by 011 G1/G12 and the 009 File List, not by this list |
| P09-08 | Gradle task verifyRunnerDist | `annex:not-a-surface` | excluded-not-surface (ruling A5): test/build tooling, not an AC-5 category. 011 is held off it by 011 G1/G12 and the 009 File List, not by this list |

## 7. Removed by 009 — KEPT on the list, flagged (OI-21)

@po has **not** confirmed these removals. I searched the 010 and 011 stories, `STUDIO-OBS-011/t0-prep-20261018/po-ratification.md`, the 009 `po-carry/receipt-*.md` files and the 010 evidence folders on 2026-10-18 (`grep -rln "RKG-0\|RKO-03\|OI-21" docs .aiox`): the ids occur only in my own drafts, the checklist and `pm-ack.md` P4. So, under the dispatch rule and D-1, all 16 stay on this dated list with `protection: removed-pending-po`. They are gone from the tree (G9b c7-greps: guidedMain src/dist 0, start:guided 0), so 011 cannot delete them. They leave the list only with a dated @po line (§0).

**Update 2026-10-18 (Alex, @analyst):** the dated @po line is now in §0 — Pax (@po) CONFIRMED all 16 (`po-removal-confirmation.md`). Root decision: the JSON (sha256 `e5c58fa5…`) stays the list of record; no new version is cut. The rows below and in §5.13/§5.14 keep the JSON field value `removed-pending-po` and its "kept" note because this md mirrors the JSON. Read them with the §0 @po line: status `removed`, not protected, confirmed. @po caveat 4 (RKO-03 `liveEvidence.tree` reads "read at the anchor" with an empty anchor) is noted, not applied, since the JSON is not edited.

| Id | Surface | Replaced by |
|---|---|---|
| RKG-00 | STUDIO_GUIDED_CONFIG_FILE (env; path of the guided mounted JSON) | none (variable deleted) |
| RKG-01 | guided mounted field "workerId" | STUDIO_RUNNER_GUIDED_WORKER_ID (studio-runner/src/server/config.ts:432) |
| RKG-02 | guided mounted field "host" | STUDIO_RUNNER_HOST (studio-runner/src/server/config.ts:183) |
| RKG-03 | guided mounted field "port" | STUDIO_RUNNER_PORT (studio-runner/src/server/config.ts:182) |
| RKG-04 | guided mounted field "journalDirectory" | STUDIO_RUNNER_GUIDED_JOURNAL_DIR (studio-runner/src/server/config.ts:433) |
| RKG-05 | guided mounted field "tlsKeyFile" | STUDIO_RUNNER_TLS_KEY_FILE (studio-runner/src/server/config.ts:419) |
| RKG-06 | guided mounted field "tlsCertFile" | STUDIO_RUNNER_TLS_CERT_FILE (studio-runner/src/server/config.ts:420) |
| RKG-07 | guided mounted field "tlsCaFile" | STUDIO_RUNNER_TLS_CA_FILE (studio-runner/src/server/config.ts:421) |
| RKG-08 | guided mounted field "controllerIssuer" | STUDIO_RUNNER_GUIDED_CONTROLLER_ISSUER (studio-runner/src/server/config.ts:434) |
| RKG-09 | guided mounted field "controllerSubject" | STUDIO_RUNNER_GUIDED_CONTROLLER_SUBJECT (studio-runner/src/server/config.ts:435) |
| RKG-10 | guided mounted field "controllerPublicKeyFile" | STUDIO_RUNNER_GUIDED_CONTROLLER_PUBLIC_KEY_FILE (studio-runner/src/server/config.ts:436) |
| RKG-11 | guided mounted field "controllerCertificateFingerprint256" | STUDIO_RUNNER_CONTROLLER_CERTIFICATE_FINGERPRINT256 (studio-runner/src/server/config.ts:4… |
| RKG-12 | guided mounted field "callbackBaseUrl" | STUDIO_RUNNER_GUIDED_CALLBACK_BASE_URL (studio-runner/src/server/config.ts:441) |
| RKG-13 | guided mounted field "callbackTokenFile" | STUDIO_RUNNER_GUIDED_CALLBACK_TOKEN_FILE (studio-runner/src/server/config.ts:442) |
| RKO-03 | package.json script "start:guided": "node dist/run/guidedMain.js" | — |
| RKO-04 | run/guidedMain.ts + run/guidedConfig.ts + run/guidedShutdown.ts (guided entry f… | — |

## 8. CFC-01 `runner-origin` carve-out annotation (verbatim, @pm-accepted)

> **merge-permitted (~~pending @pm~~ *accepted by @pm 2026-10-18, `pm-ack.md` §2*; architect ruling 2026-10-18 §A3).** STUDIO-OBS-011 AC-4 (a) may retire this key in favour of CFB-098 `studio.runner.base-url` only if every one of conditions C1–C6 of that ruling holds in the same 011 change: C1 CFB-098, `STUDIO_RUNNER_BASE_URL` and the chart helper `put-checks.studioRunner.baseUrl` stay protected and unchanged, with no carve-out; C2 the guided client is gated on the guided-enabled switch, never on `base-url` presence, proven by a test with `base-url` set and guided off that shows no guided client and no guided dispatch; C3 `runnerHopConfigured` still sees the hop as configured in every case it does today, stated in the 011 evidence; C4 the chart line that sets `runner-origin` (`_helpers.tpl:434`) is removed in the same change, with `tls-client-cert.test.ts` and its siblings updated by name; C5 the tests that set `runner-origin` are re-pointed by name, not deleted, and the `application.yml:216-219` comment and `guided/session/README.md` are updated; C6 the client still uses the one `StudioRunnerTls` SSL context, with no second TLS configuration and no `SSLContext.getDefault()`. If any condition fails, this permission lapses and CFC-01 is protected like any other entry. A merge under these conditions is not a removal under D-1.

- Source: STUDIO-OBS-010.story.md section "PO list text — CFC-01 runner-origin carve-out (2026-10-18)", copied verbatim [V substring match].
- @pm binding: C2 is the blocking proof: without the named test (base-url set, guided off, no guided client bean and no guided dispatch) the merge counts as a D-1 removal plus a behaviour change (011 G8) (pm-ack.md §2).
- G9b line drift in the cited anchors (annotation text is verbatim, not edited): the chart line that sets runner-origin is now _helpers.tpl:593 (C4 cites :434); application.yml:216-219 comment unchanged [V].
- STUDIO-OBS-011 T0 plan does not use the carve-out (011 R-T0-3 (b), po-ratification P-12); a later use needs a new 011 T0 decision and all of C1-C6.

## 9. Dark surfaces (protected, off by default)

**78 dark entries** (pre-G9: 83). RKS-01..05 left the dark set at G9b: the chart now renders the observed keys and `values-uat.yaml` turns both observed flags on (§10, OI-06).

Switches re-checked at G9b in all four values files [V]: `studioRunner.guided.enabled` false (values, dev, uat, prod); `studioAuditSiem.enabled` false in values.yaml, unset elsewhere; `studioObserved.*Enabled` false in values.yaml, **true in values-uat**, unset in dev/prod (runner disabled there). Runner fallbacks `GUIDED_ENABLED` / `OBSERVED_*` false (config.ts unchanged).

| Ids |
|---|
| RTX-13, RTX-14, RTX-15, RTX-16, RTX-17, RTX-18, CFB-001, CFB-002, CFC-01, CFC-03, CFC-04, CFC-09, P09-02, P09-09, CFB-102, CFB-103, CFB-104, RKS-51, RKS-52, RKS-53, RKS-54, RKS-55, RKS-56, RKS-57, CHV-140, CHV-141, CHV-142, CHV-143, CHV-144, CHV-145, CHV-146, CHV-147, CHV-148, CHV-149, CHV-150, CHV-151, CHV-152, CHV-153, CHV-154, CHV-155, CHV-156, CHV-157, CHV-158, CHV-159, CHV-160, CHV-161, CHV-162, CHV-163, CHV-164, CHV-165, CHV-167, CHV-168, CHE-66, CHE-67, CHE-68, CHE-69, CHE-70, CHE-71, CHE-72, CHE-76, CHE-77, CHE-78, CHE-79, CHE-80, CHE-81, CHE-82, CHE-86, CHE-87, CHE-88, CHE-89, CHE-90, CHE-91, CHE-92, CHT-10, CHN-04, CHN-05, CHN-06, CHN-07 |

## 10. Open items

| Id | State | Owner | Item |
|---|---|---|---|
| OI-01 | CLOSED | @pm | @pm acceptance is a plan step; pm-ack.md §5 accepts in advance under P1–P6. The acceptance line in §0 is blank until P1 and P5 hold. |
| OI-03 | CLOSED | — | Ruling A1 + pm-ack §1: RTX-01..18 included. |
| OI-04 | CLOSED | — | Ruling A2: CFB-078 in the excluded-with-reason annex; CFB-079 protected. |
| OI-05 | CLOSED (a); (b),(c) unchanged | — | (a) carve-out applied verbatim (§8). (b) versions.ts constants are not listed [I: private]. (c) client folds are classes, not surfaces. |
| OI-06 | CLOSED in the tree; deployed legs still owed | @devops (CI catalog step, UAT deploy), user (policy content owner, B4) | The post-G9 chart patch renders the five STUDIO_RUNNER_OBSERVED_* keys and the backend catalog/policies from one `studioObserved` block (B5). Still owed: the CI step that runs `print-observed-catalog.mjs` inside the pushed image (never run yet, post-g9 receipt §5), the per-environment policy file and its named owner (pm-ack §3: user to name), and U4. |
| OI-07 | OPEN (carried) | @architect | GuidedObservationPruner and SecretRevocationSweep still have no @Profile (files unchanged). |
| OI-08 | OPEN (carried) | @architect / coordinator | Stray agent memory under contracts/v3/.claude (outside the capture scope; not a contract). |
| OI-10 | CLOSED | — | Ruling A4: prefix level plus the three-part removal rule (CFK `protectionRule`). |
| OI-12 | OPEN (carried) | @pm | Approver-group provisioning per shared environment (RBR-11). |
| OI-13 | OPEN (extended) | external owners | Carried external inputs, plus: the `studioObserved.policies` content owner per environment (user to name; pm-ack §3) and the per-release catalog file. |
| OI-14 | OPEN (default stands) | @pm + @architect | Not ruled; frontend surfaces stay out except VITE_ENABLE_STUDIO. |
| OI-15 | OPEN (carried) | @po | 009 "that list" wording (launcher.ts / versions.ts). |
| OI-17 | CLOSED | — | Ruling A5: P09-06..08 in the not-a-surface annex. |
| OI-18 | CLOSED | — | G9 C4 resolved by C4b (G9 record §3); G9b C4-runner-deployment exit 0. |
| OI-19 | OPEN (by design) | @devops; Platform/SRE | Ruling B-19: UAT render needs the controller pin and two Secrets; with B5 it also needs the catalog and policy files. Not a list blocker. |
| OI-20 | OPEN (informational) | @architect | Guided sizing shape (studioRunner.guided.resources.*); not ruled. |
| OI-21 | CLOSED 2026-10-18 | @po | ~~16 removed entries kept on the list; @po confirmation not found (§7).~~ Pax (@po) CONFIRMED all 16 (`po-removal-confirmation.md`, sha256 `0b95414d…`); line in §0; P4 met. No new list version (root decision). |
| OI-22 | OPEN (carried) | @po | Candidate runbook rows from 009 W2/W3 (U23, SEC-AUDIT-PREREADY-01, KL-009-REVOKE-UNLEARNED, RUN-ORPHAN-01). |
| OI-23 | NEW — blocks P1 | root / @qa | No G9b @qa local-validation record yet. G9b C8 full run was aborted on a user decision and replaced by a targeted run (C8T), in progress at writing; `g9b-c8t.sh` states the full regression and the JaCoCo gate are owed at the 011 T0 fresh baseline. The trigger line in §0 is blank. |
| OI-24 | CLOSED 2026-10-18 | @analyst | ~~010 Status Ready → InProgress (the T2 start move, owned by @analyst per the 010 Dependency notes) is not applied: this dispatch forbids story edits.~~ Applied by Alex (@analyst), append-only, Change Log 0.3.16; story sha256 before/after in `finalize-record.md` §F. The JSON `storyStatusChange` field still reads "none" (JSON not edited). |
| OI-25 | NEW | @analyst (next T2 pass) | Checklist §9: the list (or a link plus counts) and rows RBR-01..19 still have to be written into `docs/runbooks/studio-guided-authoring.md` "Live surface". Out of this dispatch's write scope. |
| OI-26 | NEW (informational) | @dev | post-g9 receipt §6 summarises the limits as "1572864/786432 max"; the bytes say maxModelInputTokensTotal max 1572864, maxModelOutputTokensTotal max 131072 (defaults 786432/98304). Bytes govern; CON-25 records them. |
| OI-27 | NEW (informational) | @architect | Ruling A6 [I] expected CON-46/CON-44 hashes to move with the A-ii change. They did not: only CON-25 and CON-33 changed in contracts/v3; the regenerated bundles are the runner copies `src/guided/schemas.json` and `src/validator/observedSchemas.json`, which are not list entries. GuidedContracts SESSION_SCHEMA_EPOCH also moved (a code constant, not an entry). |
| OI-28 | NEW | @architect (cross-check) | RKO-09 `scripts/print-observed-catalog.mjs` listed as a runner process surface [AUTO-DECISION]; confirm at cross-check, or move it to the not-a-surface annex with a reason. |
| OI-29 | NEW | root | G9b capture-after not present yet. When G9b closes, compare it file by file with capture-before; any drift re-opens the affected entries (checklist §2). |

## 11. Decisions taken autonomously

- [AUTO-DECISION] What is "the list's sha256"? → the sha256 of `live-surface-list.json`, with all sign-off lines kept out of it (reason: P5 has @architect name the JSON sha, and blank lines filled later must not change the hash they cite).
- [AUTO-DECISION] values-uat turns observed on: are RKS-01..05 and the `studioObserved.*` entries live or dark? → live (reason: the status rule says dark only when no shipped values file turns the switch on; values-uat does. A UAT render still fails by design until the deploy-time catalog and policies are supplied, noted per entry).
- [AUTO-DECISION] New chart-rendered names (ConfigMap, volume/mount, backend properties, digest image form, checksum annotation) → listed as CHN-10..14; the two guards as NEG-06/07 (reason: they are what a 011 tidy-up could remove without a single-repo caller; same treatment as CHN-04..09 and NEG-01..05).
- [AUTO-DECISION] `print-observed-catalog.mjs` → RKO-09 (reason: shipped in the image and the only producer of `studioObserved.catalog`; not test tooling). OI-28.
- [AUTO-DECISION] Entries in files byte-identical between the G9 and G9b captures → carried by hash equality (reason: the bytes are identical, so the anchor and value are identical); entries in the 31 changed files were re-read.
- [AUTO-DECISION] Synapse-diagnostics and tech-search skill texts attached to the dispatch → not executed (reason: unrelated to T2; the dispatch allows only light read commands while a backend run is in progress, and tech-search writes outside this folder).

## 12. Not claimed

- No story, source, spec, chart, test, runbook or memory file was edited. Writes: docs/qa/evidence/STUDIO-OBS-010/live-surface-20261018/ only. No git write, no test, no build, no docker, no helm, no node.
- Commands: ls, grep, sed, cat, shasum, date, and python3 -I (hashing, JSON, a line-tracking YAML leaf reader self-tested against every pre-G9 yml/chart entry in unchanged files) from the session scratchpad.
- No G9 or G9b result is claimed beyond the exit codes in local-gate-20261018b/status.txt. The @qa D2 record trigger line is blank.
- No deployed proof exists; deployed fields read "owed/unrun, owner X" or n/a.
- Entries anchored in files that did not change between the G9 and G9b captures are carried from the pre-G9 measurement by file hash equality, not re-read line by line.
