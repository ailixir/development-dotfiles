---
name: tooling-wi1-measurement-harness
description: Env-gated Java harness that measures SOURCE_PLAN with the production assembler, gateway client and admission path against Vertex (ADC); run it in a second Gradle build dir so it can overlap a long ReplayIT run
metadata:
  type: project
---

ADR-SC-007 WI-1 (2026-10-27). `GuidedSourcePlanMeasurementTest` (backend test, skipped without `WI1_MEASURE_OUT` + `WI1_MEASURE_SETS`) builds the request through `GuidedSourceClassifier` -> `GuidedPromptAssembler.assemble` -> `GenAiGuidedLlmGatewayClient` (ADC, project epicagentai, global, gemini-3.8-flash, endpoint https://aiplatform.googleapis.com) and scores with `GroundingBenchScorer`. It worked on the first probe; 133 calls with concurrency 4 take about 8 min.

- **Second build dir:** an init script with another `layout.buildDirectory` plus another `--project-cache-dir` lets this run beside a 20-40 min `GuidedPublicationReplayIT` lane on the shared one. Both compile from the same sources, so do not leave a half-edited test file in the tree while a lane is about to start its compile.
- **Frozen code:** `WI1_WRITE_FROZEN` writes sha256 of harness, scorer, sets and expected-linkage; `WI1_FROZEN` refuses to run on a mismatch. BEFORE and AFTER must use the same file.
- **Transient failures:** HTTP 429 persisted through three backoffs (5, 10, 20 s) for 2 of 133 calls at concurrency 4; they are listed INFRA_EXCLUDED and re-run alone. A 150 s TIMEOUT is a non-transient NO_PLAN and stays in the denominator.
- **Recorded input tokens vs harness:** the harness ran about 2% above the alpha-recorded `inT` on all four checklists (6931 vs 6786 wikipedia, 6684 vs 6548 hackernews, 6312 vs 6177 pydocs-reuse, 6915 vs 6755 github), consistent with the same prompt assembly.
- **ReplayIT lanes (isolated recipe):** default lane (`cleanTest test --tests ...GuidedPublicationReplayIT`) took 21 min, 40 tests, all passed; `retainOriginalGuidedCohort` then fails ("Missing/ambiguous real test JOIN lifecycle export") because the run is focused, which is harmless. XML in `build/test-results/test/`.

Related: [[tooling-gradle-focused-runs]], [[tooling-guided-incremental-single-test]].

**Results and traps from the same work (2026-10-27):**
- BEFORE the contract change 23 of 40 alpha SOURCE_PLAN plans were MISSING_SOURCE, all at `admitPlan:97`: the model wrote the needs[] entry and labelled the consumer but left the read's own `needId` null. Server-derived needs alone would not fix that; the contract rule "put the shared needId on the read" did (AFTER 0 of 40, untuned).
- `INVALID_RESPONSE` with about 4081 output tokens is a runaway generation hitting the 4096 SOURCE_PLAN cap; 150 s TIMEOUTs and exhausted HTTP 429 are the other no-plan outcomes. Count them in the denominator and say so (they made an 18-call 3-of-3 gate miss by one).
- `studio-runner` `test/run/sandbox.test.ts` "finds no --no-sandbox" exceeds vitest's 5 s default under host load (fails 2 of 3 runs at load 6 to 21, before any edit); append `--testTimeout=30000` to the default-tier command.
- ReplayIT after a change that only touches scripted replies: name-diff the XML of both lanes against a baseline copied (and gzipped) before the first product edit; both lanes end rc 1 because of the retain*GuidedCohort finalizer, which is harmless.
