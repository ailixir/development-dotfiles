# Historical V18 publication boundary — source hold, unexecuted

The deliberate `InferenceMigrationIT` database remains a populated V11 → V18 database. No V19/V21 policy, normalized materialization, relearn function or table is installed. The three previously failing methods and their original SQL oracles remain:

- `revisionMustMatchCaptureAndProtectsEveryNewColumn`: capture authoring and reject updates to every V18 revision field.
- `reusedStepCannotBelongToAnotherTestAndNeedsTheSameSnapshot`: identical per-step snapshot reuse is valid only inside the same test/CSI; changed snapshot and cross-test reuse reject at the installed deferred metadata guard. Its prepared sessions still use actual original-start base capture.
- `baselineIndexRequiresTruthfulFullMarkerAndSurvivesExecutionRetention`: the truthful FULL execution index and retained immutable revision survive execution retention; historical execution cannot be relabelled FULL.

These are database migration proofs. They do not claim the current application runtime supports V18. The original production publisher helper was shared with current-head tests and formerly carried incomplete toy basis facts; restoring that archived basis would defeat current strict recomputation and is expressly excluded.

## Source written, not compiled or executed

Explicit test-only `prepareHistoricalV18Observed`/`publishHistoricalV18Observed` enter a schema-aware evidence fixture. It requires exactly successful Flyway head18 and no later policy/version stores. The existing production classifier, base capture, copied preparation/evidence/admission, complete `GuidedPlanBuilder.basis`, `ObservedArtifactLowerer`, and real production reservation/claim/finish sequence are retained. Its ordinary one-step literal-URL scope is enforced. Current-head callers keep their original methods and current storage path.

The adapter records an actual V18 assignment, authored-input envelope/hash, preparation, one successful navigation action, accepted plan and obligation/admission links. V18 lacks the SQL `attempt_ordinal` column, so its test-only action INSERT uses actual historical columns after full current pure action/ledger validation; current-head fixture still uses the current action DAO. The materialization evidence projection is reconstructed from that actual immutable V18 envelope: exact entry hashes/metadata, context1, actual worker/fence/source/config and captured materialization revision; this is an evidence projection for a synthetic ordinary fixture, not invented historical metadata ACK or normalized V21 storage. Frozen normalized authoring and declaration preimages come from the actual source classification. No raw private values enter public basis.

The structural runner policy in this old-schema fixture is explicitly synthetic test input. There was no V19 approval table: no approval history is asserted, backfilled or invented. No browser, model, Vault, live worker, transport or current Java-on-V18 authority is claimed.

## Confirmed incompatible current Java commit dependency

`GuidedPublicationRepository.commit` constructs a public receipt and unconditionally executes `new GuidedIncrementalStore(jdbc, contracts).relearnedFrom(sessionId)`. That method executes `SELECT studio_015_relearned_from(?)::text`. The function exists only in V21. A complete valid pure basis does not resolve a missing database function.

The source-written historical wrapper still reaches the actual current `commit` call and therefore remains knowingly pending. No compatibility function, source fallback, JDBC interception, stubbing, SQL guard bypass or target increase was added. No runtime result is claimed.

## Proposed bounded test-only commit adapter for Aria/Quinn ruling — NOT IMPLEMENTED

Keep the actual production `reserve`, `claim` and `finish(VALIDATED)` calls and their original exact identity/snapshot/verdict hashes. Before the commit transaction, independently re-lower the complete reconstructed basis and compare the entire candidate/profile/build/hash/verdict preimages; no fixed placeholder digests or zero-action artifact. Inside one real V18 transaction, lock session, actual draft and captured base, verify current source/config/publication epoch/confirmed pointer/authorization/fence/deadline and validated attempt identity. Execute the actual V18 revision INSERT and paired V15 publication receipt INSERT under every original row/deferred FK/metadata guard. Carry full real normalized authoring, captured authoring inputs, complete reference declarations, artifact/learned plan/policy/provenance/maps and exact revision digest from the already validated candidate. Construct the historical ordinary public receipt shape according to the installed V15 guard (explicit applicability, no claim of V21 entered-boundary authority), CAS the confirmed draft pointer and publication epoch, mark session success and force deferred constraints before commit. Preserve replay requirements, user/CSI scope and all retention/reuse/immutability oracles.

This adapter would be a test-only historical SQL transaction against installed historical constraints; it would not be reported as current production Java commit coverage. Current-head methods continue to cover actual production commit. Aria/Quinn must approve the exact subject/shape/assertion mapping and whether a frozen historical writer source is required before implementation. Root must release its precise code ownership afterward.

## Scheduling and required future evidence

Dara is on source HOLD at `source-hold-checkpoint-06.json`. All three methods remain required and unpassed on the new source. All changed head/secret fixtures also remain uncompiled/unexecuted. After the historical ruling and implementation, root must provide a serialized captured compile/test window; keep all old failed runs and actual SQL55PASS immutable. No QA or story completion decision is made here.
