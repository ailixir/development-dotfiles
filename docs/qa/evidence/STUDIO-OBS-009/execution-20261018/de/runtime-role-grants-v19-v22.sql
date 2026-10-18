-- STUDIO-OBS-009 AC-4 TF-5 b: prepared grant for a NON-OWNER runtime role, V19 through V22 (head).
-- Prepared by @data-engineer (Dara), 2026-10-18. NOT a Flyway migration and NOT applied anywhere.
--
-- When to apply: only if U14 (owner Platform DBA / @devops) confirms that, in a shared environment,
-- the API/worker pods connect as a role that does not own the Studio objects. If the runtime role
-- owns them (what the repo config implies: Flyway runs with the application datasource), TF-5 d
-- applies: "not applicable", nothing to grant.
--
-- Assumption: that role already holds the V18-era table-by-table grants (the DBA baseline). This
-- file is only the delta that V19..V22 introduced. Apply after V22, as the object owner:
--   psql -v runtime_role=<runtime_role> -f runtime-role-grants-v19-v22.sql
-- Block 1 is always needed for a non-owner role. Block 2 is only for a baseline that grants
-- studio_guided_sessions / studio_guided_actions / studio_guided_obligation_admissions /
-- ui_test_executions column by column (a table-level grant already covers new columns).
--
-- Source of truth: the text blocks PREPARED_GRANT and PREPARED_COLUMN_GRANT in
-- backend/src/test/java/com/citi/put/checks/studio/guided/secret/GuidedRuntimeRolePrivilegeIT.java.
-- The two blocks below are byte-identical to them. That IT proves on real PostgreSQL 15 that block 1
-- equals the derived delta exactly (nothing missing, nothing extra) and that a V18-granted login
-- role writes the guided secret-audit rows at the head with it (run obs009-de-03, 42/42 green).
-- Not needed: EXECUTE on functions (PUBLIC keeps it; no migration revokes it), USAGE on the V19
-- identity sequence studio_guided_policy_audit_audit_id_seq (identity insert needs none).
-- Not granted on purpose: DELETE/TRUNCATE on any V19..V22 relation (immutability triggers refuse
-- them anyway). Partition maintenance (PartitionManager DETACH/CREATE PARTITION OF) needs the
-- owner, as before V19; route it to the owner role in a split role model.

-- ===== Block 1: delta grant (non-owner runtime role) =====
-- New relations, V19 (governance).
GRANT SELECT, INSERT, UPDATE ON studio_guided_policies TO :"runtime_role";
GRANT SELECT, INSERT ON studio_guided_policy_versions TO :"runtime_role";
GRANT SELECT, INSERT ON studio_guided_policy_approvals TO :"runtime_role";
GRANT INSERT ON studio_guided_policy_audit TO :"runtime_role";
GRANT SELECT, INSERT ON studio_guided_session_policies TO :"runtime_role";
GRANT SELECT, INSERT, UPDATE ON studio_guided_csi_guards TO :"runtime_role";
GRANT SELECT, INSERT, UPDATE ON studio_guided_csi_token_days TO :"runtime_role";
-- New relations, V20 (recording).
GRANT SELECT, INSERT ON studio_guided_session_recordings TO :"runtime_role";
-- New relations, V21 (replaying prefix). The view runs with its owner's rights, so SELECT on
-- the view alone serves the secret-audit guard; the base-table grants serve the V21 capture
-- trigger and the evidence readers.
GRANT SELECT, INSERT ON studio_guided_relearn_plans TO :"runtime_role";
GRANT SELECT, INSERT ON studio_guided_relearn_switches TO :"runtime_role";
GRANT SELECT, INSERT ON studio_guided_materialization_versions TO :"runtime_role";
GRANT SELECT, INSERT ON studio_guided_materialization_inputs TO :"runtime_role";
GRANT SELECT ON studio_guided_materialization_snapshots TO :"runtime_role";
GRANT SELECT, INSERT, UPDATE ON studio_guided_materialization_deliveries TO :"runtime_role";
GRANT SELECT, INSERT, UPDATE ON studio_guided_prefix_requests TO :"runtime_role";
GRANT SELECT, INSERT ON studio_guided_no_invocation_receipts TO :"runtime_role";
GRANT SELECT, INSERT ON studio_guided_suffix_acceptances TO :"runtime_role";
-- Pre-V19 relations: what V19..V22 function and trigger bodies newly need on them. A no-op
-- where the V18 baseline already grants it.
-- V21 version-history trigger locks the materialization row (FOR UPDATE).
GRANT UPDATE ON studio_guided_materializations TO :"runtime_role";
-- V19 studio_guided_prune_session (GuidedObservationPruner, runtime).
GRANT UPDATE ON studio_guided_model_attempts TO :"runtime_role";
GRANT DELETE ON studio_guided_publication_admissions, studio_guided_publication_preparations,
 studio_guided_publication_observations TO :"runtime_role";
-- V21 guards read the translation plan and state.
GRANT SELECT ON studio_guided_translation_plans, studio_guided_translation_state
 TO :"runtime_role";

-- ===== Block 2: only for column-by-column baselines on the altered pre-V19 tables =====
GRANT SELECT (pruned_at), UPDATE (pruned_at) ON studio_guided_sessions TO :"runtime_role";
GRANT SELECT (attempt_ordinal), INSERT (attempt_ordinal)
 ON studio_guided_actions TO :"runtime_role";
GRANT SELECT (attempt_ordinal), INSERT (attempt_ordinal)
 ON studio_guided_obligation_admissions TO :"runtime_role";
GRANT SELECT (replay_failure_code, replay_failure_step_id, replay_failure_step_index,
 replay_failure_login_steps_present), UPDATE (replay_failure_code, replay_failure_step_id,
 replay_failure_step_index, replay_failure_login_steps_present)
 ON ui_test_executions TO :"runtime_role";
