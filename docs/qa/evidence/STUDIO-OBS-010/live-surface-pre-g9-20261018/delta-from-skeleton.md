# STUDIO-OBS-010 T2 Live surface — delta from the 2026-10-17 skeleton (PRE-G9 DRAFT)

> **PRE-G9 DRAFT — NOT FINAL.** Compares `live-surface-draft-20261017/live-surface-skeleton.json` (lane T2-SK, 604 entries, tree of 2026-10-17 22:00 EDT, before any 009 source lane) with `live-surface-list.pre-g9.json` (712 entries, tree of 2026-10-18 ~14:55 EDT, byte-identical to the G9 `capture-before`). Ids are carried; new ids continue each prefix and no id is reused.

- **Author:** Alex (@analyst), 2026-10-18. Read-only. [V] = read or re-measured today; [I] = inference with its basis.
- **Why it changed, in one line:** between the two measurements STUDIO-OBS-009 ran W1–W3 (lanes C9, D1, D2, D3, S, B, BL, DE, I, F-merge, S-W3, B-W3, F, EP). The skeleton predicted the 009 fold from Aria's T0 rulings. This file records what actually landed and where the prediction was wrong.

## 1. Summary

| | Skeleton (2026-10-17) | Pre-G9 (2026-10-18) | Why |
|---|---|---|---|
| Entries | 604 | **712** (604 carried + 108 new) | 009 D1/D2/D3 added keys, values and templates |
| OpenAPI | `b5ecdcad…ae29244`, 44 ops | `bbf37fd1…fca02c4`, **44 ops** (36 public + 8 internal) [V] | C9: A7 `RuntimeVersions` text and examples, `startGuidedSession` 422 |
| `contracts/v3` | 51 files | 51 files, **all 51 hashes equal** [V] | none; OI-09 (008 in flight) closes |
| Migrations | V1–V22 | V1–V22, **all 22 hashes equal**, no V23 [V] | DE shipped no V23 (prepared grant only) |
| `application.yml` `studio.*` leaves | 100 | **110** [V] | D3: `studio.runner.tls.*` (6), guided mTLS chain keys (4) |
| Profile overrides | 12 | **15** [V] | D3: `mtls-required: true` in dev, prod, staging |
| Runner `KEY_SPECS` | 45 | **57** [V] | D1: 4 listener keys, `GUIDED_ENABLED`, 7 `GUIDED_*` keys |
| Guided mounted JSON fields + `STUDIO_GUIDED_CONFIG_FILE` | 14 | **0** (removed) [V] | D1 fold: `guidedMain.ts`/`guidedConfig.ts` deleted |
| Chart closed runner env list | 36 | **48** [V] | D2: the 12 new keys |
| `values.yaml` Studio leaves | 123 | **168** [V] | D2: `studioRunner.tls.*`, `.backendTls.*`, `.guided.*`, `studioAuditSiem.*`, one probe threshold |
| `values-<env>.yaml` leaves | 62 | **92** [V] | D2: per-env TLS/guided Secret names, guided sizing |
| Chart templates | 9 | **10** [V] | D2: `api-guided-tls-networkpolicy.yaml` (guided only) |
| Status split | n/a (skeleton used CANDIDATE/CHANGES-IN-009/…) | live 589, **dark 83**, removed 16, absent 1, holds 5, to-write 18 | new vocabulary asked by the dispatch |

By delta: SAME 167, MOVED 344, CHANGED 36, BEHAVIOUR 22, ADJACENT 5, GONE 16, NEW 108, LANDED 12, NOT-LANDED 1, BECAME-TRUE 1. MOVED is mostly line drift in `application.yml` (+19 lines before many leaves) and `values.yaml`; the name and value are unchanged.

## 2. What the skeleton predicted and what happened (all 109 flagged entries)

| Skeleton group (ruling) | Count | Outcome [V] | Evidence |
|---|---|---|---|
| A2.1 one entrypoint (RKG-00, RKO-03, RKO-04) | 3 | **As predicted: removed.** `guidedMain.ts`, `guidedConfig.ts`, `guidedShutdown.ts`, `start:guided`, `STUDIO_GUIDED_CONFIG_FILE` gone; `dist/run/guidedMain.js` absent | `c7-greps.txt` "guidedMain src/dist: 0", "start:guided: 0"; `d1/receipt.md` |
| A2.2 guided mode is configuration (RKS-00, RKS-06/07, RKG-01..13, P09-01..03, CFD-04) | 20 | **As predicted, names now fixed.** 13 mounted fields → `STUDIO_RUNNER_GUIDED_{WORKER_ID, JOURNAL_DIR, CONTROLLER_ISSUER, CONTROLLER_SUBJECT, CONTROLLER_PUBLIC_KEY_FILE, CALLBACK_BASE_URL, CALLBACK_TOKEN_FILE}`, host/port merged into `HOST`/`PORT`, TLS fields → `TLS_KEY_FILE`/`TLS_CERT_FILE`/`TLS_CA_FILE`, fingerprint → `CONTROLLER_CERTIFICATE_FINGERPRINT256`. Key set 45 → 57 | `config.ts:176-444`; `d1/launch-contract.md` §2 |
| A2.3/A2.4 no capacity key, no policy-hash key (NEG-01, NEG-02) | 2 | **Hold.** `transport.ts:88` refuses capacity ≠ 1; no POLICY key in `KEY_SPECS` | `config.ts:427-430` comment |
| A2.6 one-pod guard (CHV-009..012, -026..029, CHE-…, P09-09) | 24 | **Guard landed, values unchanged.** `guidedGuard` fails the render when guided is on with `replicaCount ≠ 1`, autoscaling on or `shareProcessNamespace` false. **Prediction wrong for sizing:** `studioRunner.resources.*` did not change; D2 added a separate `studioRunner.guided.resources.*` that the Deployment uses only when guided is on (OI-20) | `_helpers.tpl:298`; `studio-runner-deployment.yaml` ternary `$g.resources` |
| PID-1 b (CHV-022) | 1 | **Behaviour.** Value `true` unchanged; guard enforces it when guided is on | `_helpers.tpl:298+` |
| A3 one TLS listener (RTI-01/02/04/07/08, RTX-13..18, RKO-05, CHV-021, CHV-044..047, NEG-05) | 18 | **As predicted.** Paths unchanged; `server.ts:21` is `node:https` only (NEG-05 became true); peer pin before the bearer (`routes.ts`); `/health` `/ready` accept controller-or-self; probe dials TLS (`probe.ts:30`). The 6 runner bridge routes now sit behind `routes.ts:130` `GUIDED_ROUTE_PREFIX` and are **dark** (404 when guided is off) | `d1/receipt.md` |
| A3/A4 backend TLS, https-only base URL (CFB-098, CFK-13, CFC-01, P09-04, P09-05) | 5 | **As predicted.** `StudioRunnerTls` + `studio.runner.tls.*` (6 yml keys, new CFK-18); `validate()` refuses `http://` outside local/test; `GuidedRunnerClient` built with `tls.sslContext()`; `SSLContext.getDefault` = 0. `studio.runner.base-url` value unchanged (BEHAVIOUR, not VALUE) | `d3/receipt.md`; `GuidedSessionConfiguration.java:102-124` |
| AC-2 mTLS chain values (CFC-02..04, CHV-048..050, CHE-34/56, P09-10) | 9 | **Landed differently than modelled.** The three code-only keys are now also declared in `application.yml` (new CFB-101..103, duplicates of CFC-02..04 — keep one row at finalize), `mtls-required` true in dev/prod/staging, `connector.port` added (CFB-104). Values come from chart `studioRunner.guided.token.*` and only when guided is on, so `service-public-key`, `service-issuer`, `connector.port` are **dark**. Identity values unchanged (ADJACENT) | `_helpers.tpl:417-447` |
| A5 profile gates (SCH-02, SCH-04) | 2 | **As predicted.** `@Profile("!api \| worker")` on the coordinator `@Bean` and the reaper class | `GuidedTranslationConfiguration.java:123`; `GuidedSessionReaper.java:18` |
| A6 dumps (RKO-01, CHV-001/003, CHE-01/07/19/21/41/43, P09-11) | 10 | **As predicted.** Dockerfile `CMD ["sh","-c","ulimit -c 0 && exec node dist/main.js"]` (`:76`); all 8 JAVA_OPTS leaves carry `-XX:-HeapDumpOnOutOfMemoryError -XX:-CreateCoredumpOnCrash` | `d2/receipt.md` |
| A7 P2 + C9 (OAS-00..02) | 3 | **As predicted, plus one.** Digest → `bbf37fd1…` (= dispatch digest); descriptions and examples; **also** `startGuidedSession` declares 422 (C-OBS008-4 option 1), so RTP-16 is CHANGED (response set) | `c9/receipt.md` |
| A11 R1, LR (RTX-07, RTX-08) | 2 | **Behaviour.** Paths unchanged; LR maps `EXPIRED`; R1 accepts {n, n-1} while a delivery is pending (B-W3 R1 d credited on D_F) | `b/w3/receipt.md` |
| D2 chart templates (CHT-01..04, -07..09) | 7 | **6 changed, 1 not.** `studio-runner-scaledobject.yaml` (CHT-04) is byte-identical [V]. `_helpers.tpl` closed list 36 → 48 names | hashes in JSON |
| Other 009 additions (P09-06..08, P09-12, P09-13) | 5 | `RunnerProcessHarness`, `ObservedCoRunIT`, `verifyRunnerDist` landed (test/build infra, propose exclude, OI-17); SIEM reference landed as `studioAuditSiem.*` (sink name dark); **V23 not landed** (DE: prepared grant only) | `de/receipt.md`; `f/receipt.md` |

## 3. Changes the skeleton did not predict

1. **`startGuidedSession` 422** (RTP-16, CHANGED). Source: C9, root-authorized C-OBS008-4 option (1). Path and operationId unchanged.
2. **`studioRunner.tls.controllerCertificateFingerprint256` has no default and no env file sets it** (new CHV entry). `tlsGuard` makes the render fail on empty. values-uat enables the runner, so a UAT render fails until the pin is supplied [V read; consequence I] (OI-19; same as 009 PO note d).
3. **Guided TLS connector on the API** (CFB-104 `studio.guided-authoring.connector.port`, CHN-04 `<fullname>-api-guided-tls` Service, CHN-05 `guided-tls` port, CHT-10 NetworkPolicy). All dark.
4. **SIEM routing contract** (`studioAuditSiem.*`, CHN-06 ConfigMap, CHN-07 pod annotation). Switch live (false), the rest dark; sink owed Platform/SRE (U6).
5. **Separate guided sizing** `studioRunner.guided.resources.*` per values file, `guided.devShm`, `guided.tmp`, `guided.journal.*`, `guided.livenessFailureThreshold`, and `studioRunner.probes.livenessFailureThreshold` (live).
6. **`STUDIO_RUNNER_GUIDED_ENABLED` is rendered in both directions** (`"false"` in every shipped file), so the switch is live and the other seven guided keys are dark.

## 4. Things that did NOT change but matter

- **OI-06 is still open and now the most consequential item.** `STUDIO_RUNNER_OBSERVED_VALIDATION_ENABLED` and `_REPLAY_ENABLED` default false (`config.ts:177-178`) and are not in the chart closed list (48 names, no `OBSERVED_*`); `grep -rn OBSERVED helm-chart` = 0 [V]. [I] A chart-deployed runner answers 503 `OBSERVED_*_DISABLED` on `/v2/validate-observed` and `/v2/runs` (`routes.ts:213`, `:218`). D1/D2 receipts do not mention it [V grep]. Not a G9 local blocker; it blocks G-1 and any deployed observed run. RKS-01..05 are dark for this reason.
- **OI-07:** `GuidedObservationPruner` and `SecretRevocationSweep` still have no `@Profile`.
- **OI-04:** `studio.execution.sse.read-interval` still present (exclude-candidate vs 011 CLN-21).
- **OI-08:** stray `.claude/agent-memory` still in `contracts/v3/` (excluded by the G9 capture scope).
- **Runbook** `docs/runbooks/studio-guided-authoring.md` byte-identical (`9727657a…`); still STALE/PARTLY-LIVE in the same 6 sections. 008 is Done, so the T2 rewrite is unblocked (OI-11 closed).
- **All 36 public backend mappings** are on the same lines as 2026-10-17 [V].

## 5. Open items: what moved

| Id | Skeleton | Now |
|---|---|---|
| OI-01 @pm acceptance mismatch | open | open (finalize follows the dispatch: @architect cross-check, @pm accept) |
| OI-02 folder name | open | moot for this folder (dispatch named it); not carried |
| OI-03 internal routes scope | open | open; bridge routes now dark |
| OI-04 read-interval vs CLN-21 | open | open |
| OI-05 011 overlaps | open | open; (a) refined: chart derives `runner-origin` and `base-url` from one helper |
| OI-06 observed flags not chart-renderable | open | **open, not addressed by 009 — raise** |
| OI-07 pruner/sweep profile | open | open |
| OI-08 stray memory in contracts | open | open |
| OI-09 re-hash after 008 | open | **closed** (008 Done; 51/51 equal) |
| OI-10 code-default leaves | open | open |
| OI-11 runbook is 008 L0 | open | **closed** (008 Done) |
| OI-12 approver-group owner | open | open |
| OI-13 external inputs | open | open, extended with U23, UAT Secrets + pin, RUN-ORPHAN-01 in-pod check |
| OI-14 frontend surfaces | open | open |
| OI-15 009 wording | open | open, not re-checked |
| OI-16 stale "thirty-six" comment | open | **closed** (comment says 57 = 45 + 12) |
| OI-17 test/build infra inclusion | — | **new** |
| OI-18 G9 C4 exit 1 | — | **new, finalize blocker until read** |
| OI-19 UAT pin | — | **new** |
| OI-20 sizing shape | — | **new (informational)** |
| OI-21 removed entries need @po | — | **new** |
| OI-22 candidate runbook rows from 009 W2/W3 | — | **new** |

## 6. 009 W3 receipts read and what they changed here

| Receipt | Surface effect on this list |
|---|---|
| `w3/pre-g9-rulings.md` (Aria) | None on surfaces. RUN-ORPHAN-01 and SEC-AUDIT-PREREADY-01 are carried, no code change before G9. Feeds RBR-03/RBR-04 notes and OI-22 |
| `c9/receipt.md` | OAS-00..02 CHANGED; RTP-16 CHANGED (422); pins re-anchored |
| `s-w3/receipt.md` | None (tests only; no product source edited) |
| `b/w3/receipt.md` | None on surfaces (two new joined ITs; no production change); RTX-08 R1 behaviour credited on D_F |
| `f/receipt.md` | None on surfaces (`ObservedCoRunIT`, `tools/corun*.sh/.mjs` are test tooling); F-A informs RBR-03 |
| `ep/receipt.md` | None on the AC-5 categories (`studio-runner/evaluation/**` is benchmark tooling, not a deployment surface) [I: not listed] |

## 7. Decisions taken autonomously

- [AUTO-DECISION] Measure the full list now rather than a delta only → full re-measure, bound to the G9 capture-before (reason: the tree already equals G9's input, so finalize needs only a capture-after comparison).
- [AUTO-DECISION] Dark entries stay on the list → yes (reason: protection is about existence; 011 must not delete a surface because a values file leaves it off).
- [AUTO-DECISION] Benchmark tooling under `studio-runner/evaluation/**` → not listed (reason: not an AC-5 category; OI-14-style scope question if @architect disagrees).
