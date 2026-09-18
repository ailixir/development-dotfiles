---
name: provisional-seam-fixtures
description: When a story ships a provisional implementation behind an interface, its test fixtures encode only that weaker contract — the real implementation lands and dozens of tests go red
metadata:
  type: project
---

A story that declares an interface and ships a **provisional implementation** of it also ships
fixtures tuned to that implementation, and those fixtures quietly become wrong the moment the real
one lands.

Concretely in `put-checks`: story 10.7a declared `ExecutionReadiness` with a provisional gate that
compared revision counters only. Its `StudioExecutionFixtures.confirmRevision` therefore wrote
`source_hash = 'source-hash'`, `artifact_hash = 'artifact-hash-xxxx'` and `provenance = {}`. When
10.8's real `ExecutionReadinessService` — which re-hashes the source and artifact and compares
recorded versions against the configured pin — replaced it, **78 tests across eight classes went red
with one identical message**.

**Why:** this is the gate working. A placeholder hash *should* be refused; the fixture had stopped
describing anything a user could produce. The tempting fix — relax the term — buys green tests that
prove only that the gate accepts hand-written rows.

**How to apply:** when adopting an interface whose provisional implementation you are deleting, grep
that story's fixtures for literals in columns your predicate reads, before running anything. Fix the
fixture by deriving values with the same helper the production code derives them with
(`ArtifactCanonicalizer` here), never by weakening the predicate. A large uniform failure count with
one shared message is the signature of this, not of a broken change. Related:
[[fixture-schema-widening]], [[test-container-and-context-isolation]].
