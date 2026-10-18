# Resume handoff — STUDIO-OBSERVED 015 → 008

**PAUSED at 2026-10-16T01:56:49.032887+00:00, by explicit user request: “Stop the work on this session and persist the info so, we can resume from another session.”** Do not resume until the user requests it. This checkpoint is not completion.

## Goal, roles and workspace

Finish all of STUDIO-OBS-015, including every planned QA obligation and independent closure, then implement and validate all of STUDIO-OBS-008. Main session is Orion / `@aiox-master`; delegate implementation and independent QA to appropriate expert subagents. Use parallel agents for disjoint work. Preserve original scope; passing components cannot substitute for required application/native/private-authority evidence.

Workspace: `/Users/brunobuger/orca/workspaces/put-checks/ui-studio`. Branch `brunobuger/ui-studio`; HEAD `734ad704f6ae508dbb10d9b5127a315bb0df5f81`. The working tree has extensive inherited uncommitted work. Preserve it; no commit, push or deployment was performed in this session.

012B, 013 and 014: independently strict PASS, Done, administratively closed and root CLI-verified. 015: **InProgress**. 008: **Ready, preparation only**; implementation follows independent 015 Done plus PO/admin/root closure. No lifecycle was changed by this pause.

Read repository AGENTS.md, `.codex/skills/aiox-master/SKILL.md` and canonical role if needed. Every agent task has exact saved intent/context in `.aiox/sdc/STUDIO-OBSERVED-ORCH/execute-015-008/`; run the existing `sdc preflight ... --task develop --budget-usd 500 --intent-file ... --context-file ...` before dispatch. Existing declared wave ceiling is USD500; measured billing is unavailable, so never claim measured compliance. Earlier agent IDs may be absent in another session; create fresh bounded experts from files instead of assuming old threads exist.

## Safe state at pause

- All actual backend/native test commands are stopped. Actual06's missing tool handle79726 and JVM/wrapper were independently investigated; it is interrupted/incomplete, not a passing run.
- Recovery verified all 11 registered roots and 132 recorded descendants absent. Only three proved owned orphan Node PIDs57923,57944,55855 received SIGTERM after immediate kernel start/command/wrapper/nonce checks. No broad/inherited/service signals.
- All 1,101 prior backend outputs plus six Planning metrics restored byte-exact after fresh evidence capture. Recovery preserved133 safe originals, nine WebMs,11 closed-log projections and five fresh fixed outputs; partial966346-byte exec plus budget/response evidence retained.
- Docker CLI exists, but its configured local daemon/Unix socket is connection-unavailable. The previous successful harness used that same socket; wrong-context mismatch is not established. Container state/closure is **unconfirmed**. No daemon restart/reconnect, container cleanup, database recreation or service change was performed.
- All product/test source and runner dist remain HOLD. Recovery's complete1635-source manifest equals original `ea553ee0efc0354026d0d6a2e69c29030c5593383e1d72463e45d2acafc248b7`; compiled dist remains `db6c8022b20113c73862b63a9f019b5026d37e0a4e3db1b15ac182f5c99e4775`.
- Gage and Aria's active supervisor implementation/review turns were interrupted on user stop. No supervisor/smoke process matched the final read-only OS probe. The one harmless Python smoke has a terminal record with actual exit7, not application-test evidence.

Previously inherited PIDs22246,67717,13577,13581,44737 must never be signalled as task cleanup. Revalidate actual PID/start/command/nonce ownership rather than relying on PID numbers. Never retry original04 UNKNOWN admissions or invent authenticated no-effect authority.

## Current source hashes

| File | SHA256 |
|---|---|
| backend/src/main/java/com/citi/put/checks/studio/guided/translation/GuidedTranslationService.java | d8c494b290fdecff883d3e6b38de2b7cb6470cddfd42db84db84d7cf85c45fc3 |
| backend/src/test/java/com/citi/put/checks/studio/guided/publication/GuidedPublicationReplayIT.java | f279684cdc8fa168adcfcb8e45dead590a0257711892a094dbc5412191abea24 |
| backend/src/test/java/com/citi/put/checks/studio/guided/publication/GuidedPublicationAuthorityIT.java | e6228117d0e9844075603c3b011166ddffb74ddb4533d4524111bd5a665bb9fd |
| backend/src/test/java/com/citi/put/checks/studio/guided/translation/GuidedPlanningIntegrationTest.java | 1b58702407586e41f5196d2ec734905b59ff72b4b69aebdb2a28ad97b0e1fa46 |
| backend/build.gradle.kts | 1cc4cee0f683661eb5373738d00e30cbc53c3f4716ba3b008a33ec270bdbdef8 |

Planning's actual Java package is `guided.session`. No source changes followed the pause request; hashes above were rechecked while persisting this handoff.

## Implementation and actual evidence

All paths in this section are relative to `docs/qa/evidence/STUDIO-OBS-015/execution-20261015/`.

1. Production fix: only new prefix coordinates await existing `pushContext`, apply exact definite-context-refusal handling, then revalidate current authority/identity/evidence/coordinate after I/O before preparing the unchanged issued request. Existing done/refresh/ADMITTED/DISPATCHING recovery and all runner producer/value/edge/ACK/native checks remain intact. Source checkpoint `backend/checkpoint-prefix-producer-sync-source01.json` SHA9e3ab4a2; independent production review manifest `backend/prefix-producer-sync-source01/qa-production-review/manifest.json` SHAd8af4fca.
2. Added five real-browser prefix-sync singleton tests and narrow Gradle union. Original80 identities (43default+37low) and35 parameter labels remain; additions make **85 total=43default+42low**. Original declaration bodies/labels and pending-accounting helper preserved. First source checkpointb720e4a0, independent source reviewd93ddd12.
3. Added two actual PostgreSQL returned-row/writer test methods with13 parameter labels, preserving original11 invocations: AuthorityIT24 total. This is controlled single-version read-boundary proof; original multi-version/Core/HTTP/Vault/native clauses and all15-route completeness remain OPEN. Source checkpoint472a7322; source QAff0aec91.
4. Actual05: `backend/prefix-sync-authority-core-feedback-attempt05-receipt.json` SHA `03fae10501336f2845a265eb6ba36a35f61b3e37fd11f0bb0927e64b7b7fdb2b`; root rehashed25 bound artifacts,0 mismatch. **32 total /26PASS /6FAIL /0skip**; Authority24/24 PASS, two browser methods PASS, six browser/class-lifecycle failures. Both original Core mixed sessions executed12 successful actions and actual publication, then wrong sourceSteps object projection blocked later snapshot/video/ordinary assertions. New ACK-positive prefix+real renewal passed, but fixture provider failed before suffix response.149 calls:148served/APPLIED, one REJECTED/unserved/unencoded. Missing response measurements are absent, not0. Specific null NPE is source-derived, not an exported runtime class.
5. Four test-only repairs are implemented in current JOINf279: sourceSteps are textual ordered UUIDs (assert type+asText); actual pushContext failure statement398 (397 is try brace), retaining gate405 checks; capture planRevision in a short authenticated/session-row transaction before contender HTTP; set existing edit4 fixture discriminator before mixed start and reset cleanup. Normal close attempts teardown before reset; partial construction retains existing AfterEach drain ownership, not a claimed earlier drain. Source checkpoint `backend/checkpoint-feedback05-fixture-fixes-source01.json` SHA57eae3b6; independent QA `backend/feedback05-fixture-fixes-source01/qa-review/manifest.json` SHAe514fa8f, root23bindings0mismatch. Diagnosis `backend/feedback05-diagnosis01/manifest.json` SHA6da8e807, root154bindings plus localJDK entry verified.
6. Actual06 tested those repairs but was interrupted. **One console PASS only;0fresh XML; no final suite count/Gradle exit/cohort/guard/audit/privacy success.** Do not count it as completed or successful. Final recovery receipt `backend/prefix-sync-core-feedback-attempt06-interruption-receipt.json` SHA `17d724f449c3d5dca9b1f3bb42949704c8a65d2433e62415c2850da073c0c3a0`. Owner verified1294 bindings; root verified receipt hash. Recovery artifacts are under `execution/backend-prefix-sync-core-feedback-attempt06-artifacts/` and `backend/runtime06-recovery01/`. Existing normal06 results/normal receipt are absent by design; never invent their exit/counts.

Earlier preserved components: backend focused300/300 (actual04); runner full2206PASS/0FAIL/29 unchanged historical skips with normal global+six scoped coverage (unit15 receipt0ada0804); selected native48/48 (native03 receiptb452f42c). These are captured components, not final story closure or complete native/image/deployment proof. Original04 UNKNOWN_OUTCOME/ACK_LOST records remain untouched and must not be retried or retrospectively reclassified.

## New durable supervisor — UNFINISHED / UNREVIEWED

Current draft: `.aiox/sdc/STUDIO-OBSERVED-ORCH/execute-015-008/durable-backend-job.py`,19740bytes, SHA `70dbb1e89c8148a3a7e593772d084066d0e4f833596bf08cba41b513804078d3` at pause. It is framework-only and has **no final author manifest or independent review verdict**. Read existing `runtime-supervision01/design.md`, `collector-before.json`, `pure-checks.json` and private smoke job artifacts. The harmless smoke `smoke-nonzero-20261016T015226-82313611` has phase `terminal_recorded`, actual child_returncode7, wait_completed_at2026-10-16T01:52:38.593650Z. Do not infer the entire required smoke/review matrix passed.

Aria's provisional findings: filesystem executable deletion or same-start executable/argv drift must be unknown identity/liveness, not confirmed disappearance; dedicated supervisor Popen failure must be durably recorded without inventing a child exit. Gage reported the first/structural status fix implemented and second being added; completion was interrupted. Re-read current code and independently validate both; do not treat messages as final approval.

Requirements: structured argv/cwd/no shell or env dump; exclusive unique label; detached dedicated supervisor; nonce/spec hash/PID+start+executable+argv identities;0600/0700 private files; atomic fsync/rename; actual terminal child wait; status checks live identities and reports orphan-live/incomplete rather than trusting state. No automatic kill/retry/cancellation and no underlying collector or JDK/test argument changes. Existing collectors remain: tasked b81dbb25086aaebe4a001512cabdb4c8a071f3c3c2c43908adf298a140ab3b3b; base ace5061c9ab4dadede31fbfe693440c12b68ecb1f72b0dbf2760979bb6e50985; capture cc943d9dfcf1ff07e463cfcc266e906704a5f04ae621b0355c6a5022f75f5e63.

## Resume sequence and full remaining scope

1. Revalidate pause handoff, source hashes, owned-process absence, recovery receipt and Docker local prerequisite. Container cleanup remains unconfirmed. No destructive daemon reset/container deletion/database recreation. All earlier evidence remains immutable.
2. Finish/freeze the thin supervisor and independent architecture review; the interrupted author/reviewer threads cannot be assumed live. Use saved gage015-durable-runtime01/aria015-durable-runtime-review01 intents as scope. No new product changes needed for this.
3. Separately authorize a **fresh unique cohort label**, preserving original06 interruption evidence. Underlying low-only command/selectors are saved exactly in `backend015-prefix-sync-core-feedback06-intent.txt`; use a new label, not reusing06. Run seven singleton selectors (original2Core+5new), fresh task-qualified XML/HTML/nonemptyexec/exports, zero skips, global source/dist freeze, owned cleanup and exact old-output restoration. No old default24 credit as new execution, no unknown action retry, no source fixes while runtime is live.
4. Complete the required full42low task / whole35-label method, including the still-UNRUN genuine append-input pending-accounting transfer. A method filter runs all35 labels; no fake single-label selection. Original43default+42low85 identities must all be preserved and finally executed.
5. Continue remaining B1 callback/recovery/guard/natural-expiry/result matrix; B2 actual Vault/secret faults/version1→version2/preparation/append/canary proof; B3 private/authenticated original15 routes/base/CAS/concurrency/partial-drift/two-fresh-ordinary/actual media seek; B4/R2 final mapping/regates. Never repeat already repaired B4/R2 source work from stale planning flags.
6. Preserve **all86 original acceptance subjects +24IPC facets +55SQL cases**, original35 labels,85 current JOIN inventory and all full configured backend/runner/native/image/deployment/crossReplica/coverage/static/contract gates. Final source-frozen full checks are mandatory; scoped receipts cannot substitute. Relevant full commands/mapping live in `backend/current-gap-plan01/next-batches.json` (manifested7e2bc4) and `validation-ledger.json`. Ledger array index is not an invented audit ID; use exact plannedName/tier/assertion mapping.
7. Only independent Quinn may own final015 PASS/Done after every required subject is green; then Pax administrative closure and Orion root CLI/wave closure. Only then release full008, all9ACs and inherited17 obligations, stable v2 IDs/legacy retirement/capability route/central client+MSW/safe references+consent/reconnect/video/WCAG/actual Playwright and full FE gates.008 prep reviews already exist; implementation is unstarted.

Prepared next B1a design: `backend/b1a-callback-seam01/manifest.json` SHAe72f94a493a1efccdec99daf9fed3f2a0882765ea04610075e5f63673580da13, root24bindings. Proposed ReplayIT+build one new singleton `incrementalPrefixCallbacksKeepStateAndFenceBothReservations`. After-real-commit callback cuts, genuine completeStep service/StepVerifier, SOURCE_PLAN dependency-admissions fence, proposal/direct reservation valid controls; proposal refusal can terminate a parent, requiring fresh sibling/last ordering. Its independent design review was interrupted and **no final QA-design manifest exists**; re-review before implementation. Do not treat /plans as a denied SOURCE_PLAN route or invent a step-complete HTTP route.

Explicit OPENs: combined secret-grant/fresh-producer ACK cut; separate worker-current-access secret parent; exact ADMITTED/done/refresh/recovery matrix. Core public403 is a different check, not worker checkCurrent proof. Original recording item85 (tieTolerancePreservesActualRecordedEvidence) stays OPEN, unamended, pending user choice; no answer/no alternative authority approval. Preserve no-native/no first stamp invariants; never fabricate full-key timing ties, duplicate effects, coarsen clocks or substitute lower authority silently. Other work remains available; this is not a whole-goal blocking declaration.

## Detailed state sources

- `docs/stories/STUDIO-OBSERVED/README.md`
- `docs/qa/evidence/STUDIO-OBSERVED-NEXT/execute-015-008/execution-state.json`
- `.aiox/sdc/STUDIO-OBSERVED-ORCH/execute-015-008/ACTIVE-HANDOFF.md` (append-only history; this document is the concise latest pause checkpoint)
- `docs/qa/evidence/STUDIO-OBS-015/execution-20261015/validation-ledger.json`
- `backend/current-gap-plan01/{review.md,next-batches.json,requirement-map.json}` under the015 evidence base

No work should continue merely because an old file says ACTIVE/LIVE. This explicit user pause is authoritative until a later user resume request.
