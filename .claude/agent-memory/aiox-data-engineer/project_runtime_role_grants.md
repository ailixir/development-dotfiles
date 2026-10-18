---
name: runtime-role-grants
description: Studio runtime-role grants stay out of Flyway; a non-owner role needs much more than SELECT on the materialization view (2026-10-18, OBS-009 TF-5 b)
metadata:
  type: project
---

Decision (2026-10-18, OBS-009 lane DE): no V23 for runtime-role grants. The grant for a non-owner runtime role is a prepared DBA statement in `docs/qa/evidence/STUDIO-OBS-009/execution-20261018/de/runtime-role-grants-v19-v22.sql`. It is applied only if U14 (Platform DBA / @devops) confirms a non-owner role.

**Why:** the repo runs Flyway with the app datasource, so the runtime user owns everything. A `GRANT ... TO <role>` in Flyway fails wherever that environment-specific role is missing.

Non-obvious facts proven by GuidedRuntimeRolePrivilegeIT:
- Triggers and functions run with the invoker's rights. A V18-granted role therefore breaks at the head on trigger-side writes, e.g. the V21 capture trigger inserting into materialization_versions.
- The view needs only SELECT on itself; its base tables don't need grants. Readers are the audit guard and the deferred `studio_015_version_commit`.
- The V19 pruner needs DELETE on three publication tables and UPDATE on model_attempts.
- Identity sequences need no USAGE.

**How to apply:** any new V must update the IT's pinned maps and that SQL file together. See [[studio-schema-consolidation]].
