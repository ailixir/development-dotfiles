# T0-DEV resumed review

Dex / aiox-dev, 2026-10-19T00:47:34.707821+00:00. **SIGN-WITH-NOTES** (development feasibility; not a QA verdict).

**[V] The interrupted read-only task is complete.** No source, tests, quoted docs, plan, Helm or runner dist was changed. Only this T0-DEV folder was written. B1 was still live at the saved process observation; tree-open and baseline acceptance remain root’s.

## Checks

- [V] `lanes.v3.json` parses: fourteen unique lane ids, nonempty normalized write sets, resolved lane references, no dependency cycle and no concurrent write overlap after GS-M a/b and IT-R prep/apply are separated.
- [V] Shared files have ordered owners. Root must record the baton SHA at each handover; timing estimates alone do not grant ownership. Exact expansions are `item1-writesets.json`, `fold-prep-main-17.txt` and `fold-tests-21.txt`.
- [V] `sandbox-runner-copy-list.txt` and `sandbox-frontend-copy-list.txt` give exact COPY/MKDIR paths. All nineteen runner COPY roots and sixteen frontend COPY roots exist and are real paths. The seven-package root tool closure is present. All fifteen frontend copy-source paths are covered.
- [V] The list has 729 entries, 671 protected. Nine lane/write records co-locate with 127 protected ids. **Zero planned protected removals**; see `live-surface-judgments.json`. This is a plan review, not post-change proof.
- [V] A4 permits the two CLN-21 components: dispatcher.poll-interval is unlisted; sse.read-interval is excluded CFB-078; neither is chart-rendered; their own accessors have no callers. Protected CFB-079 read-interval-ms stays. Other pollInterval readers belong to scheduling target types, not StudioExecutionProperties.Dispatcher.
- [V] Fold census: eleven non-declaring main callers and twenty-one test files naming the three folded classes are covered. The five raw constructor-census findings need no source edits because public three/four-argument HttpRunnerDispatchClient constructors are explicitly preserved. `item5-fold-check.json` remains raw evidence; the disposition is in `check.json`.
- [V] Reverify commands and brace measurements were rerun (`item3-resumed-output.txt`, `item3-bracecount-resumed-output.txt`). The measured claim/checkCommand sizes remain 98/22 lines, so the ruled no-split decision remains supported.

## Explicit development fold confirmation

**I confirm the RC-1 through RC-10 requirements are folded into the v3 T0 package, subject to these dispatch notes and the still-pending RC-10 runtime result.** RC-1…9 are statically resolved by the ruled wiring, write sets and proof commands. RC-10’s measurement cannot be signed as passed before B1 JaCoCo exists. No lane gets runtime credit from this review.

The confirmation is of feasibility and plan coverage: worker publication collaborator/absence refusal; three authorization methods; preserved transport settings and constructors; production-access GS-T migration; guard-before-SPI assertion/mutant; Awaitility branch A; exact sandboxes; start-digest sequencing; harness deletion guard; runner class-name exceptions; and conditional headroom run. `check.json` gives each RC separately.

## Actionable findings for root

- **T0-DEV-01** — `docs/qa/evidence/STUDIO-OBS-011/t0/lanes.v3.json` (schedule.lanes / concurrencyGroups / waves): Apply K-17: IT-R prep starts early; RT takes a freed slot. Reconcile numeric schedule and frontend MERGE W3/W4 label before automated dispatch. Observe this session cap of four total agents, below the plan maximum five.
- **T0-DEV-02** — `docs/qa/evidence/STUDIO-OBS-011/t0/early/T0-DEV/sandbox-runner-copy-list.txt`: Use this exact list at sandbox seeding: include docs/runbooks/studio-runner.md, benchmark/results.jsonl, benchmark/summary.json and root tool dependency closure. Evidence destinations are empty mkdir paths, not a copy of 1.2 GB historical evidence. Backend application.yml is deployment-tier-only; not needed for 11-RT unit/fixtures scope.
- **T0-DEV-03** — `docs/qa/evidence/STUDIO-OBS-011/t0/early/T0-DEV/sandbox-frontend-copy-list.txt`: Use the repo-shaped list, including dev.sh. COPY_SOURCE_FILES contains fifteen entries, of which five are OBS-008 evidence files; correct the six-file prose.
- **T0-DEV-04** — `docs/qa/evidence/STUDIO-OBS-011/t0/lanes.v3.json` (11-FOLD-final.writes / verify): Supply fold-prep-main-17.txt and fold-tests-21.txt alongside v3; FOLD_PREP_MAIN and FOLD_TESTS remain external aliases, and foldf-02/03 command lists reference v1. These aliases are resolved in item1-writesets.json. Do not dispatch from v3 alone without the referenced v1.
- **T0-DEV-05** — `docs/qa/evidence/STUDIO-OBS-011/t0/w-brief.v3.md` (Hard rules / Batons): Use v3 startsWhen/batonOut and the exact source lists. Hard-rules prose still points to lanes.v2.json; IT-S six-file baton wording includes two files not in the 21 FOLD_TESTS. Both have no later owner.
- **T0-DEV-06** — `docs/qa/evidence/STUDIO-OBS-011/t0/t0-record.md` (sections 10 and 14.2): TransportFaultIT has 30 @Test methods plus one @ParameterizedTest method, not 31 plus one (substring grep counts @TestExecutionListeners). Use per-invocation XML at B1/11-G. GS-T positive-admission precedent is GuidedBridgePlannedIT production access, plan and reserve helpers, not the remaining fake-access BridgeIntegrationTest cases.
- **T0-DEV-07** — `docs/qa/evidence/STUDIO-OBS-011/t0/t0-record.md` (RC-10 / T0-JC): Wait for authoritative B1 result and JaCoCo. Confirm dispatch LINE headroom and whether foldf-cov01 is required. This review does not settle coverage or B1 reds.

## GS-T launch preparation

`gs-t-prep.md` gives the first implementation and test actions after tree open. `gs-t-source-method-inventory.json` records all eighty source methods: SessionIT 44 @Test; TransportFaultIT 30 @Test plus one parameterized method; LifecycleReasonIT 5 @Test. Source-method arithmetic is separate from JUnit expanded invocation counts. All three source SHAs match S_011.

## Limits

[I] The static copy lists are expected to satisfy the scoped sandbox reads; no sandbox tier was executed. [I] Planned behavior preservation still needs the specified red/green/mutant gates and final checks. B1 failures, skips, coverage, B7 and tree-open remain pending root/QA work. See `check.json` for input hashes, commands, source identity and verified-versus-inferred claims.
