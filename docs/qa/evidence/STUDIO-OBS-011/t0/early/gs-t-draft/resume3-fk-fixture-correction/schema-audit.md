# Source-backed fixture audit

The new SQL is confined to the newly introduced sourceFixture helpers in Session and Lifecycle. Both setup methods create a distinct real database for each case, migrate it with Flyway, then call sourceFixture once before constructing the service. Flyway does not create the fixture user/CSI. Source searches across the 22 versioned migrations found no users/csi_systems fixture INSERT. No seed, migration, trigger or constraint is changed.

| Schema/source requirement | Proposed fixture |
| --- | --- |
| V1 users.id UUID primary key, default gen_random_uuid | Omitted; retain the real DB default. The opaque auth user ID is not inserted into this UUID field. |
| users.sso_id/name/email NOT NULL; SSO and email unique; active email index | Insert principal.userId() (`user-1`), non-null `GS-T fixture` name and principal.email() (`fixture@example.test`) once in the fresh per-case DB. No ON CONFLICT hides a collision. is_active retains true default. |
| csi_systems.id/name/business_unit NOT NULL | Insert CSI-123, GS-T fixture and Test. CSI-123 fits varchar(20) and matches the unchanged authenticated CSI ownership entry. |
| csi_systems.owner_email FK users(email) | Insert the user first, then bind the same principal.email() as CSI owner. |
| csi_systems.criticality/environment closed checks | Use LOW and Development, both literal allowed members in V1. This registry environment is separate from the unchanged UI test environment `fixture`. |
| CSI status/metadata/timestamps/deleted_at | Retain OPERATIONAL, empty object and timestamp defaults; no deleted_at value. No authority or policy row is manufactured. |
| ui_tests.id/name/environment/steps/created_by NOT NULL | Retain fixed source UUID, GS-T source, fixture and ordinary authored steps; replace the opaque creator ID only with the bound registered principal email. |
| ui_tests.csi_id FK csi_systems(id); V12 registered-CSI check | Insert CSI parent before UI test. Keep CSI-123 non-null and quarantine/deleted fields null. |
| ui_tests.created_by FK users(email) | Bind the same email used by the real user and CSI owner. `user-1` remains the auth principal ID and users.sso_id; it is no longer incorrectly used as the email FK. |
| Browser | V1's legacy browser check is replaced by V12 with only chromium. Both setups migrate through V12 before sourceFixture, so retain chromium. No constraint relaxation or browser change. |
| JSON/revisions | Preserve serialized AuthoringV2Request, two original authored steps, authoring revision inputs, empty variables and source/configuration revision defaults 1. V12 permits this ordinary authored shape; no published revision, translated plan or admission row is inserted. |
| Other UI defaults | Preserve viewport 1920x1080, timeout_seconds 30, wait_strategy networkidle, timestamps, V10 PAUSED status, V15 publication_epoch 0, nullable confirmed_revision_id and last-run state. |
| Uniqueness and FK closure | Fresh per-case DB isolates fixed SOURCE_TEST and CSI-123; users/CSI insert once before the UI row. The only inserted parent FK is CSI owner -> user email; UI row refers to both actual parents. Confirmed revision remains null. No duplicate suppression or disabled enforcement. |

Transport already registers its real user email and CSI-123 in its static setup before any source fixture. Its complete successor is byte-identical to resume2, including the proven duplicate-install removal. It retains original real SQL, owner tracking, latches, sender refusal and confirmation behavior.

The unchanged BFF fixture user helper supplies UserIdentity(userId, email, ..., CSI-123 owner). UserIdentity is a record exposing userId() and email(); both classes already import BffAuthenticationToken. The correction reads that existing identity rather than creating a different auth principal. All 80 test bodies remain exact to the predecessor and formatted candidate; no assertion, deadline, timer, native/UNKNOWN_OUTCOME or cleanup change is present.

This is a source schema audit, not execution of SQL, Flyway, Java compilation or a native test. Runtime success remains unproven.
