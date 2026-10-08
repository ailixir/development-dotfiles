---
name: epic10-manifest-convention
description: Epic 10 manifest (EPIC-10-EXECUTION.yaml) — @po adds a story entry at validation; `blocks` is criterion-backed unless annotated as sequencing
metadata:
  type: project
---

@po adds a `stories:` entry to `docs/epics/EPIC-10-EXECUTION.yaml` when it validates a story whose Epic row flags the entry as missing (10.35 on 2026-09-17, 10.45 on 2026-09-23, 10.47, 10.48, 10.49, 10.50, 10.51 on 2026-10-07; `blocks: []` when nothing criterion-backed or user-directed). Only that entry; gaps for other stories (10.36–10.44, 10.46) are observed, not fixed — the manifest is @pm's.

**Why:** the user/@pm gave @po narrow permission per entry; @sm deliberately leaves it to @po.

**How to apply:** `wave: null` for post-closure stories; `depends_on` only names stories present in the manifest; `blocks` means a criterion of the blocked story is unreachable (10.35 ruling). A user-directed ordering without a criterion link goes in `blocks` with a comment saying "sequencing, not criterion" (10.47 → 10.19). Verify the YAML parses with `ruby -ryaml` (python yaml is not installed).

Merge-order-only links (10.49 after 10.48, openapi digest) go in `depends_on` with a "merge order only" comment. Externally blocked stories (10.34, 10.50) get an `external_blocker:` field on the story entry and go Draft → Ready with "complete, not startable" in Status; ED-* `gates:` lists are @pm's and are flagged, not edited.

Manifest `stories:` entries carry NO status field (only `closure.succession.carriers[].status_at_closure`, a 2026-09-18 snapshot). close-story markers go in as YAML comments `[closure-key: <id>:commit:<sha>]` on the entry; ids without an entry get their epic-side key in the EPIC-10-RUN-LOG.md session table. Defects close as `status: fixed` + `fixed_by` (DEF-01 shape; DEF-05 closed 2026-10-07). The register guard (`node docs/qa/scripts/verify-staging-registration.mjs`) reads only `external_dependencies`, so defect edits don't trip it.
