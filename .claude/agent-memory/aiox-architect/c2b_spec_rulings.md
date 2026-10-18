---
name: c2b-spec-rulings
description: 2026-10-13 C2b (OBS-014 policy cutover) spec — amends AR-2 h (N=5 ops, 38→43, guided-policy.schema.json, {id}), readGrants required, D-lane V19 key-set changes + PG hash CHECKs, video-null openapi sites
metadata:
  type: project
---

The spec is in docs/qa/evidence/STUDIO-OBSERVED-NEXT/c2b-spec.json. It was written after C2a landed: 38 ops, internal 8, BASE_SHA 61181c84….

**Amendments to AR-2 h**
- A 5th op, `lookupGuidedPolicy` (GET /guided-policies?csiId&applicationId&environmentId). It returns 404 only after authorization, so the total becomes 43.
- The file is `guided-policy.schema.json`, not policy.schema.json.
- The path param is `{id}`.

**Runner context**
- ObservationApplicationPolicy has readGrants REQUIRED (an empty array, never absent). This drops R14's d70cfec5 vector, and R14's STRUCTURAL_POLICY needs `readGrants: []`.
- ReadGrant is a copy with if/else, because the runner validator has no `anyOf`.

**D-lane key set confirmed with changes**
- schemaVersion is required (const 3).
- allowedOrigins is 1..10 with the session-scope pattern, and unique.
- vocab is unique.
- applicationPolicy is closed.
- New CHECKs: `document_hash = studio_publication_hash(document)` and `observation_policy_hash = studio_publication_hash(document->'applicationPolicy')`. These make PG a write-time S-5 witness.

**AR-1 correction.** The S3 video-null tightening DOES touch openapi.yaml: readGuidedResult has two `video: null` examples. fixtures.json and publication-fixtures.json have two sites each.

**Why:** session/context approvedOrigins cap at 10. A single canonical form gives a single hash. The FE cannot find a policyId without a lookup.

**How to apply:** at the S3 gate, check that Java/Node/PG reproduce c0-controls (461d598c…) and the 4 policy vectors. Check the op count is 43, the FE allowlist has 5 class-C entries, and V19 was edited in place. Related: [[canonical-v1-lowercase-ruling]], [[ar2-ar3-obs014-rulings]], [[contract-change-checklist]].
