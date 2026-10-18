---
name: tooling-story-reconciliation-attribution
description: How to attribute dirty files to a story and reconcile test names when the tree already carried another story's uncommitted work (T0 source-hash method; JUnit XML name pitfalls)
metadata:
  type: reference
---

Recipe used for STUDIO-OBS-012A final reconciliation (2026-10-13). It applies whenever a story starts on a tree that already has uncommitted work from an earlier story.

- **Attribution.** Use the T0 `source-hashes.json` files in the story's `baseline-backend/` and `baseline-runner/` evidence (path to sha256 at baseline capture).
  - Current hash differs from T0, or the file was deleted or created since T0: the story touched it.
  - Current hash equals T0 while still dirty against HEAD: pre-existing work. Exclude it.
  - Paths outside the hashed trees (docs, runner tests, tools): count them only if their mtime is after T0 AND a story ledger names them.
  - A file the story edited and later restored byte-exact correctly shows as pre-existing.
- **Name-level test diff.** JUnit XML hides method names for `@ParameterizedTest`/`@DisplayName` cases (it only shows "[1] ..." or the display text). So a diff of baseline XML names against current method names gives false removals and additions.
  - Better: recover the T0 source from the HEAD blob when its sha256 equals the T0 hash, and diff method names source to source.
  - Fall back to an XML diff only for files that were already dirty at T0, and treat parameterized classes as noise.
- **Parser pitfall.** Annotations written fully qualified (`@org.junit.jupiter.params.ParameterizedTest`) are missed by a naive `@ParameterizedTest` regex.
- **Count pitfall.** Some test classes in the baseline XML are secondary top-level classes declared inside another file (for example `GuidedProductionWiringTest` inside `GuidedTranslationTest.java`). A class name with no file of its own is not a deletion.

Related: [[tooling-deletions-and-baselines]], [[tooling-runner-tiers-coverage]]
