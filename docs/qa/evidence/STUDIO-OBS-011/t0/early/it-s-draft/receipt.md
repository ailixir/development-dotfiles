# IT-S complete off-tree preparation receipt

[V] All six repo-shaped candidates and per-file incremental/from-S011 patches are complete. Actual sources and prior GS-T draft remain unchanged. This is preparation only: no compiler, formatter, tests, Gradle, Node, Docker, source application, W1, lane exit or QA/lifecycle approval.

| File | Before sleeps | POLL converted | DELIBERATE retained | Test methods | Expected invocations |
|---|---:|---:|---:|---:|---:|
| GuidedServiceTransportFaultIT | 14 | 6 | 8 | 31 | 39 |
| GuidedPlanningIntegrationTest | 1 | 1 | 0 | 35 | 57 |
| SecretUseAuditIT | 1 | 1 | 0 | 36 | 36 |
| GuidedPublicationRaceTest | 2 | 1 | 1 | 6 | 13 |
| GuidedFocusMutationJoinedIT | 2 | 1 | 1 | 2 | 2 |
| GuidedEvidencePendingAppendJoinedIT | 2 | 2 | 0 | 2 | 2 |

[V] Census22 →10:12 POLL converted,10 DELIBERATE retained byte-exact. Seven Transport300ms negative/idempotency windows, Transport20ms partial-response streaming cadence, Race1100ms grant-expiry stimulus and Focus slowNavigationMillis remain. Earlier progress estimate13/9 was incorrect and corrected after semantic census. All112 test method names/annotations and all15 parameterized variant lists yield149 source-expected invocations; all1171 assertion expressions remain in order (only Secret/Race waited/waiting bindings move into same-thread local state). No dropped/added/renamed test. All484 preimage method signatures remain, with12 explicit new local step methods solely at converted sites. `case-preservation.json` names every original method/body hash and every changed method; `source-expected-invocations.json` names all149 variants, not an executed result.

[V] Transport preimage is exact reviewed GS-T SHA `10d3706043430730edc921804dd1b8eb06a5326eb690f8c33f2571d7300fe1b5`. Lightweight Python reconstructs actualS011 → GS-T → IT-S and actualS011 → composed IT-S to identical full candidate; GS-T planner-issued positive authority edits remain. Individual Transport incremental patch is in `patches/GuidedServiceTransportFaultIT.incremental.patch`; full Transport from-S011 patch is separate. Five other files use actualS011 preimages. Preimages/full candidates/manifests permit exact future rebase; only root runtime-accepted GS-T and GS-M(b) baton may authorize actual application. Do not apply this draft over a changed baton.

[V] Every site uses direct Awaitility4.2.2, explicit zero initial framework delay, exact original poll interval and remaining absolute deadline, same-thread reads, and no uncaught-thread interception. A local initial step plus cached initial Awaitility result avoids an extra immediate read. Timeout runs the original final guard/observation before original assertion/error/fallthrough. Local failure slots rethrow the same Exception/Error so fail-fast native assertions are never retried. Stage marker initial read and post-interval reads remain ordered; child liveness stays a stop condition. SQL lock acquisition/release, existing transaction resources, process ownership and cleanup chains remain unchanged. Full22-row timing/thread/transaction table is `sleep-table.tsv`; original loop/replacement text is `loop-edits.json`.

[I] Interruption mapping preserves original InterruptedException handlers and flag clearing/reinterrupt boundaries; Awaitility scheduling may delay response until the next existing polling interval. Actual interrupt latency, transaction visibility, timeout boundaries and cleanup behavior require independent review and execution. No timer extension or smaller assertion obligation is claimed.

[V] Exactly four FOLD_TESTS batons: Transport, Planning, Focus, Evidence. Secret/Race are direct-release files and have no FOLD port. `resolvedAliases.FOLD_TESTS` controls over the old coarse all-six baton prose.

[V] Historical B1 six-class XML hashes were rechecked: 149 tests, summed suite time 567.388s. This is inherited before data; the whole B1 check failed elsewhere. `historical-baseline-timings.json` contains exact six class paths/counts/hashes/times. No after wall time exists. Future full prescribed commands are in `future-commands.sh` (actual declared Planning package is guided.session). They remain unexecuted; no subset historical skip policy. Lane commands remain non-evidentiary under R-T0-4; full11-G and exact before/after timing/case/privacy reconciliation remain required.

[V] Static verification ran via lightweight Python only: exact preimage hashes; per-file patch reconstruction; composition equality; all original method signatures; exact test/parameter annotation lines; complete ordered assertion-expression preservation with the two explicit binding mappings; retained deliberate sleep expressions; no actual source modification. Static parser checks are not Java compiler proof. All compile/native/privacy/timing runtime gates remain open.

- Combined incremental patch SHA256: `1e5522c93984fcf9b418150b3753eacf3a73b06aaf56e8f5b94d618dab862550`
- Combined from-S011 patch SHA256: `e8768cd81ce996cd53cee4488778380b101c877a15d43028c44baee0f572be43`
- Artifact manifest SHA256: `02d8a077d0fb506a9d3155993aee4ceaacec51528271ddb721a0316ea252f813`

Prepared by Dex under the root-authorized off-tree11-IT-S task. Shared declared dispatch ceiling USD500; actual aggregate spend unavailable.

[V] Parameter inventory explicitly includes fully qualified JUnit annotations: Planning has24 plain tests plus11 parameterized methods expanding to33 cases, therefore57 invocations; total112 methods/149 cases. Every source-expected class count matches historical B1 XML counts. This corrects an intermediate short-annotation-only source census before package delivery.
