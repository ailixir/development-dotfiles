# STUDIO-OBS-010 T2 — finalize the Live surface list after the 009 local gate (G9)

> **PRE-G9 DRAFT checklist.** Turns `live-surface-list.pre-g9.{md,json}` into the dated list that STUDIO-OBS-011 T0 reads. Nothing here has been executed yet except where marked "done pre-G9". Authority: 010 Dependency notes D-1 (trigger = 009 locally achievable ACs validated; re-date after 009 Done before T3/T4; nothing removed without @po), 010 AC-5 + addition D-3 (measured from the tree), lanes.json `w0Refold20261017.triggers` (`010T2`, `011Start`), `prep-20261016/qa/t0-qa-20261017.md` §2 (the D2 record).

**Roles**

| Role | Who | Does |
|---|---|---|
| Executor | @analyst (Alex) | steps 1–9; moves 010 Status Ready → InProgress when T2 starts (010 Dependency notes) |
| Cross-check | @architect (Aria) | step 10: every entry against the tree, plus the inclusion rulings |
| Acceptance | @pm (Morgan) | step 11: accepts the dated list (lanes.json `011Start`; see OI-01) |
| Removals | @po (Pax) | step 7: confirms the 16 removed entries leave the list; any later removal |
| Trigger owner | @qa (Quinn) | issues the G9 local-validation record (input to step 1) |
| Start check | root (coordinator) | confirms the 011 start condition before 011 T0 |

## 0. Done pre-G9 (2026-10-18, this folder)

- [x] Full re-measure of all 604 skeleton entries + 108 new, at a tree byte-identical to G9 `capture-before` (1805/1805 source files, 22/22 helm files) [V].
- [x] OpenAPI digest `bbf37fd1f96c0da33bbca6db4c04c94222a44429a4b6f0e33c92dfc59fca02c4` = dispatch digest; 44 operations [V].
- [x] Delta vs skeleton and open items written.

## 1. Gate: is the trigger met?

Read, in `docs/qa/evidence/STUDIO-OBS-009/local-gate-20261018/` (or the dated folder G9 actually used):

- [ ] `qa-local-validation-record.json` and `.md` exist. Record: `trigger` (must be `MET`), `isVerdict` (must be `false`), `storyStatusChange` (`none`), the **source digest**, the **helm digest**, the **dist digest**, and which rows are VALIDATED / `CLOSED_NOT_REPRODUCED` / failing.
- [ ] If `trigger` is `NOT_MET`: stop. The list stays PRE-G9 DRAFT. Note the failing rows in a dated section appended to `delta-from-skeleton.md` and wait for the next record.
- [ ] `status.txt` final lines for C0–C10, especially **C4-runner-deployment** (exit 1 at 14:53 EDT on 2026-10-18, cause not read pre-G9; OI-18) and C8 backend lanes. [I] A possible cause is the deployment tier's image-reading tests failing when the default image tag is not built locally (D2 receipt §1 baseline: 3 such failures); only the C4 log decides.

## 2. Freeze held? (decides whether this draft is still the measurement)

- [ ] `capture-after.json` exists. Compare **file by file** with `capture-before.json` (not only the digest):
  ```bash
  node -e 'const a=require(process.argv[1]),b=require(process.argv[2]);const m=new Map(a.files.map(f=>[f.path,f.sha256]));let d=0;for(const f of b.files){if(m.get(f.path)!==f.sha256){d++;console.log("DIFF",f.path)}m.delete(f.path)}for(const p of m.keys()){d++;console.log("GONE",p)}console.log("diff",d,"before",a.digest,"after",b.digest)' <G9>/capture-before.json <G9>/capture-after.json
  ```
- [ ] Helm: compare `helm-after.txt` (or the record's helm digest) with `helm-before.txt` `8dbe073c706c80b8e560ecc60593ceb550cc93fd6c4ca6486016829899dd04a6`.
- [ ] The record's source digest equals `6fcc12eef193338ca3bc79adaa50660d93c245a4462a5f850a7256588d9fc91b` **and** dist digest equals `4add1307afe80af5270a63dc809d43bb2d4d4dd51ab32a83330d3cbaf35fc3c3`.
- [ ] **If all equal:** the pre-G9 measurement *is* the G9 measurement. Go to step 4 (no re-measure of unchanged categories).
- [ ] **If anything differs** (e.g. a C4 fix in `helm-chart/**` or `studio-runner/**`): re-run the generator over the record's tree (step 3) and diff the JSON by id; every changed entry goes through step 5.

## 3. Re-measure (only if step 2 found drift, or the tree moved before finalize)

Read-only, repo root. Same commands as the skeleton §4 R1–R11, with these updates:

- R1 OpenAPI: expect `bbf37fd1…` unless C9-AE or a G9 fix moved it; 44 operations; pins `StudioContractTest.java:94` and `confinement.test.ts:298`.
- R2 runner routes: `grep -n "GUIDED_ROUTE_PREFIX\|RUN_PATH\|path === '/health'\|path === '/ready'\|v2/validate-observed" studio-runner/src/server/routes.ts`; bridge regex `studio-runner/src/guided/transport.ts:101`.
- R5 backend config: `application.yml` 110 `studio.*` leaves; profile dev 2, local 5, prod 1, staging 4, test 2, worker 1.
- R7 runner: KEY_SPECS 57; `grep -rn "guidedMain\|start:guided\|STUDIO_GUIDED_CONFIG_FILE" studio-runner/src studio-runner/package.json` = 0; `ls studio-runner/dist/run/guidedMain.js` absent; Dockerfile `CMD` line 76.
- R8 chart: closed list 48 names (`_helpers.tpl:162`); values.yaml 168 Studio leaves; dev 28, uat 32, prod 32; `grep -rn OBSERVED helm-chart` (OI-06; 0 on 2026-10-18).
- R9 schedules: `@Profile("!api | worker")` at `GuidedSessionReaper.java:18` and `GuidedTranslationConfiguration.java:123`.
- The generator used for this draft lives in the session scratchpad (not in the repo). [I] Re-creating it is optional: the skeleton R-commands plus a by-id diff of the JSON are enough.

## 4. Re-date

- [ ] Change the header of the md and JSON: title "dated Live surface list — **G9 2026-10-1x**", `status` → `DATED_G9`, `draft` → false, `preG9` → false, add `g9Record` {path, sha256, trigger, sourceDigest, helmDigest, distDigest, issuedAt}.
- [ ] Keep `measuredAt` of the pre-G9 run **and** add `confirmedAt` (the step 2 comparison time). Do not rewrite history.
- [ ] Write it to a new folder `docs/qa/evidence/STUDIO-OBS-010/live-surface-g9-<date>/` (do not overwrite this pre-G9 folder). [I] lanes.json T2 named `live-surface-draft/**`; the dispatch for T2 proper decides.

## 5. Re-verify (per entry class)

- [ ] **local evidence:** replace every `liveEvidence.local` "G9 … pending" with the record row id that covers it (AC-1 one-process/one-listener, AC-2 chain, AC-3 TLS, AC-4 dumps, AC-5 profiles/SIEM, AC-11, AC-12 f–j; C5 pins/contracts; C4 deployment tier for chart entries). An entry with no covering row keeps "no local proof in G9" — never inferred.
- [ ] **deployed evidence:** unchanged — G9 is local only. Every row that needs a 009 external proof keeps "owed/unrun, owner X" (U4, U5, U6, U11, U14, U20, U23, NTP, R8.2 firing, RUN-ORPHAN-01 in-pod check).
- [ ] **dark entries (83):** re-confirm the switches are still off in all four values files (`studioRunner.guided.enabled`, `studioAuditSiem.enabled`) and the runner fallbacks (`GUIDED_ENABLED`, `OBSERVED_*` false). If any shipped file turns one on, those entries become live.
- [ ] **CHANGED/BEHAVIOUR (58):** each cites its lane receipt (`change009.evidence`); spot-check five against the record's source-review rows.
- [ ] **AC-5 named items (§3 of the list):** the D-3 surfaces are present — `replayFailure` / `ReplayFailure` / capability op, `/guided-policies/**`, ceilings 120000 at `values.yaml:747/749`, `timing-order-vectors.json`, flags and the `studio.execution.enabled` kill switch, V1–V22.
- [ ] **Story drift:** re-hash 009/010/011 stories (pre-G9: `ebc4e9d5…`, `f2b1dd0c…`, `18014f33…`). If 010 AC-5 text changed, re-read it before dating.

## 6. Inclusion rulings needed before dating (@architect, with @pm where marked)

- [ ] OI-03 — 18 internal routes not in OpenAPI: include or exclude, with a reason (@architect + @pm).
- [ ] OI-04 — `studio.execution.sse.read-interval` (CFB-078): exclude so 011 CLN-21 can remove it, or keep and re-scope CLN-21.
- [ ] OI-05 a — `studio.guided-authoring.runner-origin` (CFC-01): carve-out so 011 FOLD may merge it with `studio.runner.base-url` (@architect + @pm; @po for the list text).
- [ ] OI-10 — prefix level for `@ConfigurationProperties` leaves, or enumerate.
- [ ] OI-17 — exclude test/build infra (P09-06/07/08).
- [ ] Duplicates — keep CFB-101..103, mark CFC-02..04 superseded (same keys).
- [ ] OI-14 — frontend surfaces stay out (except `VITE_ENABLE_STUDIO`) unless @pm says otherwise.

## 7. Removals (@po)

- [ ] @po confirms the 16 `removed` entries (RKG-00..13, RKO-03, RKO-04) leave the first dated list (OI-21). Record the confirmation (dated line) next to the list. After dating, D-1 applies in full: nothing leaves the dated list without @po.

## 8. Raise before or with dating (not blockers for the dated list itself)

- [ ] **OI-06** to @architect + @devops: runner observed flags cannot be enabled through the chart. Blocks G-1 and the pilot, not G9 or the list. Decide: add `OBSERVED_*` (+ catalog/policy file mounts) to the chart, or rule how a deployment enables them.
- [ ] **OI-19** to @devops / @po: UAT render needs the controller pin and two Secrets (009 PO note d) — 010 AC-4 row.
- [ ] **OI-22** to @po: whether U23, SEC-AUDIT-PREREADY-01, KL-009-REVOKE-UNLEARNED and RUN-ORPHAN-01 become runbook rows.

## 9. Write into the runbook (T2 proper)

- [ ] The dated list (or a link to its evidence folder plus the summary counts) goes into the "Live surface" section of `docs/runbooks/studio-guided-authoring.md` (010 AC-5), together with the AC-5 rows (RBR-01..18). The runbook is free since 008 Done (OI-11 closed). This is a T2 write, not part of this pre-G9 draft.

## 10. @architect cross-check (Aria)

- [ ] Every entry against the tree at the G9 digest (implementation-plan.md §3: "I cross-check every entry against the tree"). Minimum: all CHANGED/BEHAVIOUR/NEW/removed entries, all dark classifications, and a sample of 20 SAME/MOVED.
- [ ] The step 6 rulings, dated and filed in the new folder.
- [ ] Output: a dated cross-check note with sha256 of the list JSON it checked.

## 11. @pm acceptance (Morgan)

- [ ] Accepts the dated list (lanes.json `011Start`). OI-01 records that 011's own start condition only needs the list to exist; the acceptance is the plan's extra step.
- [ ] Output: a dated acceptance line naming the list's sha256.

## 12. After acceptance

- [ ] root confirms the 011 start condition (G9 record `MET` + dated list exists [+ @pm acceptance per lanes.json]).
- [ ] Second re-dating after STUDIO-OBS-009 **Done** and before 010 T3/T4 (010 Dependency notes D-1): repeat steps 2–5 and 10–11 against the 009 Done tree.
