---
name: studio-migration-head-testing
description: Studio DB guarantees must be tested at the Flyway head; later CREATE OR REPLACE of shared guard functions can silently drop earlier protections (V19 now replaces two V14/V15 guards)
metadata:
  type: project
---

Studio migration guarantees must be verified at the current Flyway head, not only at the version that introduced them. History: before the 012A re-baseline, later CREATE OR REPLACE of ui_test_revisions_write_once() re-opened columns that an earlier migration had protected, and only a head-schema IT caught it.

After the 012A re-baseline (2026-10), V12–V18 are frozen. V19 (OBS-014) CREATE OR REPLACEs studio_guided_translation_attempt_guard (V14) and studio_publication_immutable (V15) to narrow relaxations for pruned sessions. GuidedGovernanceMigrationIT tampers with every column read from information_schema.

**Why:** shared trigger functions get redefined by later stories owned by other agents.

**How to apply:** any migration that redefines a guard must keep the old body verbatim for the non-relaxed path. Add a per-column negative IT at head. Prefer generic guards (to_jsonb diff / exclusion list) over enumerated columns. See [[postgres-regex-bound]].
