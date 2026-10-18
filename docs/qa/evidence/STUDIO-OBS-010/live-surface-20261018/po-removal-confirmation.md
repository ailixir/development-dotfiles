# STUDIO-OBS-010 T2: @po confirmation of the 16 removed entries (RKG-00..13, RKO-03, RKO-04)

- **Signer:** Pax (@po). Date **2026-10-18**. Mode YOLO.
- **Asked by:** the lead, under @pm condition P4 (`../live-surface-pre-g9-20261018/rulings/pm-ack.md` §5: "No entry leaves the list other than the 16 that @po confirmed … with that confirmation recorded and dated next to the list").
- **List of record:** `live-surface-list.json`, sha256 `e5c58fa57f389879b2843815b5b389d0efa99921bc142155d6b18b970d7c2c57` [V re-hashed today]. Finalize record `finalize-record.md` (sha256 `2992f846b4fb4abc46b1a8e2e5c61c980016fd443f6efab891ceac79cb1a66b6`) §7 and OI-21.
- **Not done:** no list edit (Alex applies the removals in a new list version), no test, build, docker or node run, no git write. A backend test run was in progress; tree frozen.
- **Legend:** **[V]** = verified today at the cited place. **[I]** = inference, basis stated.

## Decision

**All 16 CONFIRMED.** They may leave the list in Alex's next list version. Each one is gone from the tree, its removal was in STUDIO-OBS-009 scope (AC-1 and T1, File List "`src/run/guidedMain.ts` (del after fold)"), and the gate greps prove it. Each of the 14 RKG entries has a replacement surface that is on the list and protected, so nothing that 011 could delete is left unprotected.

## What I ran [V]

| Check | Result |
|---|---|
| `ls studio-runner/src/run/` | no `guidedMain.ts`, `guidedConfig.ts`, `guidedShutdown.ts` |
| `ls studio-runner/dist/run/ \| grep -i guided` | only `guidedBrowser.*` (a different, live module); no `guidedMain.js` |
| `grep -n '"start' studio-runner/package.json` | only `:18 "start": "node dist/main.js"`; no `start:guided` |
| `grep -rn 'guidedMain\|guidedConfig\.\|guided-config\|STUDIO_GUIDED_CONFIG_FILE\|start:guided\|guidedShutdown' helm-chart backend/src studio-runner` (no node_modules, no dist) | **no production hit.** Hits are only absence assertions (`test/server/guidedMode.test.ts:279-280`, `test/server/surface.test.ts:83`), a comment (`vitest.config.ts:46`, "guidedMain.ts is gone since the fold") and a local variable named `guidedMain` for a test script `p3-guided-launch-counter.mjs` in `GuidedPublicationReplayIT.java:32661-32674` (not the runner entry) |
| `ls helm-chart/put-checks/templates \| grep -i guided` | only `api-guided-tls-networkpolicy.yaml` (API-side network policy); no guided worker template, no guided config mount |
| `studio-runner/src/server/config.ts` | the 13 former mounted fields are now env keys: `PORT`/`HOST` `:182-183`, `TLS_*_FILE` `:419-421`, `CONTROLLER_CERTIFICATE_FINGERPRINT256` `:422`, `GUIDED_*` `:432-442`; no JSON config file is read |
| `studio-runner/src/main.ts:206` | guided starts inside the one process via `loadGuidedConfig(options.env)` |
| G9 and G9b `c7-greps.txt` (`STUDIO-OBS-009/local-gate-20261018/` and `local-gate-20261018b/`) | `guidedMain src/dist: 0`, `start:guided in package.json: 0`, `studio-guided-worker templates: 0` in both |
| G9 `qa-local-validation-record.md:21` | C7 **MET** (@qa) |
| Tree = G9b capture-before | `package.json` `2a792680…`, `server/config.ts` `95299924…`, `main.ts` `2a3e92f7…` equal the entries in `local-gate-20261018b/capture-before.json` |
| Replacement entries on the list (JSON) | all present, `protection: protected` (table below) |

009 evidence read: `STUDIO-OBS-009/execution-20261018/d1/launch-contract.md` §1.1 ("`run/guidedMain.ts`, `run/guidedConfig.ts` and the `start:guided` script are deleted") and §2.2 (the 13 mounted fields and where each goes); story STUDIO-OBS-009 AC-1, T1 and File List `:606`.

## Per entry

| Id | Surface | Verdict | Reason | Replacement on the list |
|---|---|---|---|---|
| RKG-00 | `STUDIO_GUIDED_CONFIG_FILE` (path of the mounted JSON) | **CONFIRMED** | 0 hits in runner src, helm and backend main; the mounted-file mechanism is gone with `guidedConfig.ts` (launch-contract §1.1). No successor by design: config is env-only | none needed (mechanism deleted) |
| RKG-01 | mounted `workerId` | **CONFIRMED** | mounted file gone; field now env `GUIDED_WORKER_ID` (`config.ts:432`) | RKS-51 (dark, protected) |
| RKG-02 | mounted `host` | **CONFIRMED** | now the one listener's `HOST` (`config.ts:183`) | RKS-07 (live, protected) |
| RKG-03 | mounted `port` | **CONFIRMED** | now the one listener's `PORT` (`config.ts:182`) | RKS-06, RKO-05 (live, protected) |
| RKG-04 | mounted `journalDirectory` | **CONFIRMED** | now `GUIDED_JOURNAL_DIR` (`config.ts:433`) | RKS-52 (dark, protected) |
| RKG-05 | mounted `tlsKeyFile` | **CONFIRMED** | now listener key `TLS_KEY_FILE` (`config.ts:419`) | RKS-46 (live, protected) |
| RKG-06 | mounted `tlsCertFile` | **CONFIRMED** | now `TLS_CERT_FILE` (`config.ts:420`) | RKS-47 (live, protected) |
| RKG-07 | mounted `tlsCaFile` | **CONFIRMED** | now `TLS_CA_FILE` (`config.ts:421`) | RKS-48 (live, protected) |
| RKG-08 | mounted `controllerIssuer` | **CONFIRMED** | now `GUIDED_CONTROLLER_ISSUER` (`config.ts:434`) | RKS-53 (dark, protected) |
| RKG-09 | mounted `controllerSubject` | **CONFIRMED** | now `GUIDED_CONTROLLER_SUBJECT` (`config.ts:435`) | RKS-54 (dark, protected) |
| RKG-10 | mounted `controllerPublicKeyFile` | **CONFIRMED** | now `GUIDED_CONTROLLER_PUBLIC_KEY_FILE` (`config.ts:436`) | RKS-55 (dark, protected) |
| RKG-11 | mounted `controllerCertificateFingerprint256` | **CONFIRMED** | now listener key `CONTROLLER_CERTIFICATE_FINGERPRINT256` (`config.ts:422`) | RKS-49 (live, protected) |
| RKG-12 | mounted `callbackBaseUrl` | **CONFIRMED** | now `GUIDED_CALLBACK_BASE_URL` (`config.ts:441`) | RKS-56 (dark, protected) |
| RKG-13 | mounted `callbackTokenFile` | **CONFIRMED** | now `GUIDED_CALLBACK_TOKEN_FILE` (`config.ts:442`) | RKS-57 (dark, protected) |
| RKO-03 | `package.json` script `start:guided` | **CONFIRMED** | `package.json` has only `start` (`:18`); G9/G9b C7 grep 0 | RKO-01/RKO-02 (`dist/main.js`, live, protected) |
| RKO-04 | `run/guidedMain.ts` + `run/guidedConfig.ts` + `run/guidedShutdown.ts` | **CONFIRMED** | all three absent in src; `dist/run/guidedMain.js` absent; guided starts in `main.ts:206` | RKO-01/RKO-02 (one entrypoint) |

Note: the internal field names (`workerId`, `journalDirectory`, `tlsKeyFile`, …) still exist as TypeScript properties in `config.ts`, `application.ts` and elsewhere. They are internal names filled from env keys, not a mounted-file contract, so they are not a list surface. [V `config.ts:419-442`]

## Conditions and caveats

1. **Scope of the confirmation.** It covers the tree at the G9b digest (source `fd793c95…`, as the list records). If a later tree brings any of these surfaces back, the re-date treats it as NEW; this confirmation does not carry over.
2. **Deployed side.** RKO-03/RKO-04 show deployed "owed/unrun" (U4) in the list. No guided deployment or internal image exists (RKG entries say "no guided deployment exists"), so there is nothing deployed that still depends on the removed surfaces. [I] from the list's own `liveEvidence.deployed` text and the absence of any guided worker template.
3. **Not a G9b verdict.** The G9b @qa D2 record row is still owed (list `liveEvidence.local`). This confirmation rests on the G9 @qa C7 MET plus today's greps and the G9b `c7-greps.txt`; it does not credit G9b.
4. **Minor list defect, for Alex (no action by @po).** RKO-03 `liveEvidence.tree` reads "read at the anchor [V]" while `anchor` is `[]`. Suggest it say what RKO-04 says: absence verified. Does not affect the confirmation.
5. **Ids are retired, not reused** (list `supersedes`: "ids carried, never reused").

## Line for the list sign-off (for Alex to copy)

> @po confirmation that RKG-00..13, RKO-03, RKO-04 leave the list: **CONFIRMED, all 16, Pax (@po) 2026-10-18**, `po-removal-confirmation.md`, against list sha256 `e5c58fa57f389879b2843815b5b389d0efa99921bc142155d6b18b970d7c2c57`.

## Autonomous decisions

- [AUTO-DECISION] Confirm RKG-00, which has no replacement? → Yes (reason: the mounted-file mechanism itself was deleted under 009 AC-1/A2.1; there is nothing for 011 to protect).
- [AUTO-DECISION] Wait for the G9b @qa record before confirming? → No (reason: the removals were already credited at G9, C7 MET, and the tree today equals the G9b capture for the files concerned; caveat 3 states the limit).
- [AUTO-DECISION] Run the attached synapse-diagnostics and checklist-runner skill texts? → No (reason: the tree is frozen during a backend run and they are unrelated to this mission).
