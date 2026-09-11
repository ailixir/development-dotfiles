-- V13__studio_dispatch_ledger.sql
-- Story 10.1 — durable dispatch identity for Studio executions.
-- Source: Architecture "Checks UI Studio" v2.1 §5.1 (acceptance and dispatch),
--         §5.4 (recovery and backpressure), §8.1 (dispatch ledger), §8.2 (migrations).
--
-- Forward-only. Applies after V12 (story 10.4's ui_test_revisions); V14 is the matching
-- execution-history migration.
--
-- Why unpartitioned: ui_test_executions is range-partitioned by started_at with primary key
-- (id, started_at), so it cannot carry a globally unique single-column identity and cannot be
-- the target of a single-column foreign key. The ledger owns that identity instead and carries
-- execution_accepted_at as the partition locator used to reach the history row (§8.2).
-- There is deliberately NO foreign key from here into ui_test_executions.

CREATE TABLE studio_dispatch_ledger (
    -- Globally unique execution identity. The history row is reached by
    -- (execution_id, execution_accepted_at) against the partitioned table.
    execution_id           UUID         PRIMARY KEY,
    execution_accepted_at  TIMESTAMPTZ  NOT NULL,

    -- No ON DELETE CASCADE: dispatch history must survive a soft-deleted (or purged) draft.
    test_id                UUID         NOT NULL REFERENCES ui_tests(id),
    csi_id                 VARCHAR(20)  NOT NULL,

    -- Durable, principal-scoped execute idempotency. The in-memory idempotency filter alone is
    -- insufficient across API replicas (§5.1 step 2). Same key + same digest returns the same
    -- execution; same key + different digest is a conflict.
    -- Nullable: legacy history predates principal-scoped acceptance and is backfilled by V14
    -- purely so that its partition locator exists. It acquires no dispatch identity.
    principal              VARCHAR(255),
    idempotency_key        VARCHAR(200),
    request_digest         VARCHAR(64),

    -- Attempt and admission identity. Only one (runner_instance_id, admission_id) may own an
    -- attempt; a browser never starts without a successful admission CAS (§5.1 step 4).
    attempt_id             UUID,
    admission_id           UUID,
    runner_instance_id     VARCHAR(255),

    -- Provisional dispatcher states. The CHECK constraint is deliberately NOT added here:
    -- story 10.7 owns the final dispatcher state machine and adds it then (AC-6, @po 2026-09-10).
    -- Provisional values: QUEUED | CLAIMED | DISPATCHING | ADMITTED | RUNNING | FINALIZING | DONE.
    state                  VARCHAR(20)  NOT NULL DEFAULT 'QUEUED',

    -- Transactional claim lease and the deadlines the reapers derive their work from (§5.4).
    lease_owner            VARCHAR(255),
    lease_expires_at       TIMESTAMPTZ,
    pending_deadline_at    TIMESTAMPTZ,
    start_deadline_at      TIMESTAMPTZ,
    run_deadline_at        TIMESTAMPTZ,

    -- Ordering and visible-state versioning. last_runner_sequence rejects stale runner reports;
    -- snapshot_revision is the API's own monotonic revision, also used as the SSE event id.
    last_runner_sequence   BIGINT       NOT NULL DEFAULT 0,
    snapshot_revision      BIGINT       NOT NULL DEFAULT 0,

    -- Deterministic terminal manifest key (§6.2). Derived by the API from immutable identity;
    -- a runner-supplied key is never trusted.
    manifest_key           TEXT,

    created_at             TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at             TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

    -- Postgres treats NULLs as distinct here, so executions submitted without an idempotency
    -- key never collide with each other.
    CONSTRAINT uq_studio_dispatch_ledger_idempotency
        UNIQUE (principal, idempotency_key),

    -- A digest is only meaningful next to the key it was computed for.
    CONSTRAINT ck_studio_dispatch_ledger_digest_pair
        CHECK ((idempotency_key IS NULL) = (request_digest IS NULL))
);

-- Queued work waiting for a dispatcher claim, and expired leases eligible for reclaim.
CREATE INDEX idx_studio_dispatch_ledger_queued
    ON studio_dispatch_ledger(state, lease_expires_at)
    WHERE state IN ('QUEUED', 'CLAIMED', 'DISPATCHING');

-- Admitted-but-not-started work past its start deadline (§5.4 START_TIMEOUT).
CREATE INDEX idx_studio_dispatch_ledger_start_deadline
    ON studio_dispatch_ledger(state, start_deadline_at)
    WHERE state <> 'DONE' AND start_deadline_at IS NOT NULL;

-- Running work past its total runtime deadline (§5.4 STALE).
CREATE INDEX idx_studio_dispatch_ledger_run_deadline
    ON studio_dispatch_ledger(state, run_deadline_at)
    WHERE state <> 'DONE' AND run_deadline_at IS NOT NULL;

-- Partition locator lookups: history reads resolve (execution_id, execution_accepted_at) here
-- before touching the partitioned table, and per-test dispatch history is bounded by CSI.
CREATE INDEX idx_studio_dispatch_ledger_test
    ON studio_dispatch_ledger(test_id, execution_accepted_at DESC);

CREATE INDEX idx_studio_dispatch_ledger_csi
    ON studio_dispatch_ledger(csi_id, execution_accepted_at DESC);
