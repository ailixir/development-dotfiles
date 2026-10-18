---
name: canonical-v1-lowercase-ruling
description: 2026-10-13 S-5 ruling — canonical-v1 escapes C0 with lowercase hex (Node/PG/RFC 8785); Java GuidedContracts (Jackson uppercase) is the outlier; context refusal → terminal RUNTIME_INCOMPATIBLE, no retry
metadata:
  type: project
---

Canonical-v1 normative escape = JSON.stringify / RFC 8785 (lowercase \u00xx). Jackson (GuidedContracts.quote, and test oracle GuidedPlanBuilderTest.canonical) emits uppercase for exactly 9 code points: U+000B, U+000E, U+000F, U+001A–U+001F. PostgreSQL studio_publication_canonical (jsonb text) is lowercase. Fix = B14 in Java, vector 'c0-controls' (sha 461d598c…c119) by C-int at C2b; no schema pattern. Latent in landed 012A (DOM names, authored text), fail-closed only. U+0000 cannot be stored in jsonb (residual).

Second ruling: runner 409 refusal on 'context' with code IDENTITY_MISMATCH/SCHEMA (new bridge#/definitions/refusal) is definite → session FAILED RUNTIME_INCOMPATIBLE on first receipt, no retry; other codes/timeouts keep UNKNOWN_OUTCOME bounded retry.

**Why:** R14 measured Java≠Node policyHash; GuidedRunnerClient ignored refusal bodies and retried byte-identical contexts 3×.
**How to apply:** any new shared hash/vector work must include C0 controls; S3 exit needs Java/Node/PG parity. Ruling file docs/qa/evidence/STUDIO-OBSERVED-NEXT/ar-2-r14-stops.json. See [[ar2-ar3-obs014-rulings]].
