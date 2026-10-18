# STUDIO-OBS-007 — V34 database proof

> Historical checkpoint: T2 now refines V34 for guarded observed retries and adds SECRET_TOO_LONG persistence. The original ten-test/source-hash proof below remains historical until the combined migration and recorder suites rerun; see [retry design](t2-observed-retry-design.md).

Owner: Dara (@data-engineer). Date: 2026-10-10. T0 SQL release: root's recorded coordinator release after independent security check, architect RULING-5/6 and `.ai/STUDIO-OBS-007-po-audit-delta.json` GO. This report is database implementation evidence, not the independent story gate or a Done transition.

## Files and behavior

Product files owned here:

- `backend/src/main/resources/db/migration/V34__studio_guided_secret_login.sql` — 405 lines; safe audit metadata only, no value/payload/diagnostic column; partitioned by immutable release lifecycle timestamp; exact resolution outcomes and separate terminal usage codes; explicit no-resolution NOT_USED variant; distinct linked LIVE_RECHECK decision; full scoped insert checks/lock and uniqueness; ordinary UPDATE/DELETE/TRUNCATE refusal; controlled partition expiry; session/ledger write-once revoked_at; loud pre-migration guards; complete active account-free v3 profile/scope/execution/receipt/validator/observation predicates. Existing v2 immutable evidence survives NOT VALID replacement checks; new writes use v3. Schedule refusal vocabulary remains unchanged.
- `backend/src/test/java/com/citi/put/checks/studio/guided/publication/GuidedSecretLoginMigrationTest.java` — ten PostgreSQL migration-only tests. Backend owns the existing application/publication integration tests.

Evidence files owned here: `t0-data-design.md`, this report, `data-migration-gradle.log`, and `data-migration-{red,red-2,green}/` log/XML/hash artifacts. The green directory also contains machine-readable `result.json`.

## Executed verification

Command in root's exclusive Gradle/PostgreSQL slot:

`./gradlew spotlessJavaApply test --tests '*GuidedSecretLoginMigrationTest'`

Final session 16270: exit 0, BUILD SUCCESSFUL in 29 seconds. JUnit: **10 tests, 0 failures, 0 errors, 0 skips**. Actual Testcontainers PostgreSQL 15 image; no provider/browser/Core HTTP test was substituted or claimed. Java-only formatter also formatted shared Java source already owned by root/Lane C, as authorized; no SQL formatter ran.

Executed coverage:

- Fresh installation and staged V19 before V33/V34 and after V34 reach migration 34; manual cutover is never recorded as automatic Flyway V19; ordinary candidate capability and GUIDED_RUN exception survive; schedule refusal remains.
- Existing AWAITING_AUTH or observed-binding execution rows refuse V34 loudly; new AWAITING_AUTH sessions are rejected.
- Every required v3 profile property is tested missing/changed; extra account ABI and accountRef refuse; active observation 2 refuses, integer count bounds and fractional count refuse. Guard definitions pin v3 receipts and retain actual ledger/grant identities without account fields.
- Two releases with two attempts/sequences; safe RELEASE→USAGE tuple checks for scope/secret/version/attempt/coordinate; missing locator and duplicate usage refusal; closed replay usage vocabulary and actual execution metadata join.
- Sole unreached guided NOT_USED stores no resolution/release/admission/version; other unlinked USED/REFUSED and nullable actual decisions are refused.
- Distinct LIVE_RECHECK revocation preserves the earlier terminal USAGE; repeated decisions refuse; session and execution revoked_at cannot be cleared or changed.
- Concurrent linked usage, unreached usage and live-recheck writers each have exactly one winner under the actual PostgreSQL/JDBC default transaction isolation.
- Writer role can insert scoped usage but cannot UPDATE/DELETE even with accidental grants; it cannot detach/drop owner-controlled partitions.
- Actual month-boundary USAGE/LIVE_RECHECK stays in the original release month. An expired thirteen-month-old partition is detached and dropped, removing all linked events together while current unlinked NOT_USED remains; a recreated empty partition cannot resurrect a pruned RELEASE locator.

Two red runs are preserved. First: 10 tests / 8 failures, finding trigger SQL alias `old` collided with PostgreSQL trigger OLD, plus fixture execution status QUEUED instead of PENDING. Both corrected. Second: 10 / 1 failure, negative null-resolution fixture lacked an admission row and hit the correct earlier identity refusal; fixture corrected so the intended null-outcome rule is exercised. No production SQL changed after the first red correction.

## Source identities

Final V34 SHA-256: `21e96a22168d33211b9172c6bd65662cab79ff1d72f86e0545935b13e652ba7f`.

Final assigned test SHA-256: `75975c2b1d47699e744ed1a3dad9b804e941f360f0a9aed4b70fa73008c7b029`.

Green `source-hashes.json` proves V30/V31/V32/V33/staged V19 unchanged from T0. V1–V33 and cutover V19 were never edited. Existing unrelated dispatch-governance.js work remains preserved. No story/lifecycle changes, push, deployment or external contact were performed by this lane.

## Remaining integration and limits

Backend owns enrollment of `studio_secret_use_audit` → `release_occurred_at` in `PartitionManager`, `PartitionBootstrap`, `PartitionHealthIndicator`, `RetentionPruner`; those production Java changes are not claimed by this database-only suite. Migration creates current UTC month and two future monthly partitions with no DEFAULT; the existing twelve-month retention configuration is unchanged. Deployment must retain the tested writer/owner privilege separation.

The suite verifies DDL operations and safe identity rows, not actual Vault release/dispatch transactions, zero-read/zero-send application behavior, revocation polling bound, actual planted credential canaries, or full published revision/binding/receipt positive flows. Application/runner joined tests and current `InferenceMigrationLatestIT` remain root/backend phase-verification work. Existing full publication integration tests must exercise the persisted tuple positively; source-definition assertions here supplement that evidence and cannot replace it. The ordinary table canary/schema scan is not claimed as C-11's full Vault/runner sink proof. No unavailable service or live provider is marked passed.
