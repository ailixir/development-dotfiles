---
name: fixture-masks-live-compile
description: Studio recorded-fixture gateway returns artifact-shaped JSON while live GenAi returns a proposal envelope; pipeline tests stub artifacts, so live-path seams go untested
metadata:
  type: project
---

The recorded-fixture gateway (local default) and every CompilePipeline test stub return artifact-shaped JSON (`stepIndex/originalText/code`), while the live `GenAiLlmGatewayClient` returns the INC-001 proposal envelope (`version/kind/steps[stepId,status,code]`). The Epic 10 fold (ec94e9585, 2026-09-19) kept the envelope client but dropped the pipeline's assembly step, which surfaced only in live Vertex validation as VAL-006 (2026-10-04).

**Why:** local/CI runs never exercise the live response shape, so contract mismatches between gateway and pipeline stay invisible.

**How to apply:** for any studio compile change, require at least one pipeline-level test whose stub returns the *live* shape, and do not accept recorded-fixture runs as proof of live-path correctness. Design: docs/stories/UI-STUDIO-VALIDATION-20261004/VAL-006-design.md.
