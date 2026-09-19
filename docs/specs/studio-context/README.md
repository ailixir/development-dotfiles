# Context-aware English to Playwright

The current mechanism does **not yet meet** the requested behavior. This conclusion comes from source inspection of the current working tree, not a live model benchmark.

Three gaps are central:

1. The LLM receives persisted step strings and generic instructions, with no global context, per-step context or page evidence.
2. AI code is displayed as a preview, while local execution uses a separate English interpreter with a hardcoded search selector. Editing the visible steps also does not guarantee that compilation reads those edits.
3. Current correspondence checks preserve source text and ordering, but do not prove that the generated action uses the correct target or exact input value.

The proposed design adds test-level and step-level context, stable step identities, explicit precedence, page/state evidence with provenance, independent literal checks, and immutable revision binding. A search step must preserve its exact value, choose the evidenced field, and submit only when that behavior is part of the resolved intent. One source step may require several approved Playwright statements.

Ordinary compilation remains browser-free, and execution uses the confirmed artifact without an LLM call. The user-confirmed scope includes an explicit page-learning workflow as a proposed extension to the V1 architecture, with observed state captured for each relevant step. Supplied page hints must never be labeled as observed facts.

The spec pipeline completed requirements, complexity assessment (**COMPLEX, 20/25**), research, specification, two QA reviews with revision, and implementation planning. Final specification QA: **APPROVED, 4.8/5**, with no unresolved findings. Product behavior has not been implemented or benchmarked by this documentation task.

## Pipeline artifacts

- [Source review and architecture findings](current-state.md)
- [Requirements and acceptance criteria](requirements.json)
- [Complexity assessment](complexity.json)
- [Verified research and dependency constraints](research.json)
- [Specification](spec.md)
- [Final QA critique](critique.json)
- [Implementation plan](plan.json)
- [Login → protected page validation](login-protected-navigation.md)
- [Pipeline state and verification](pipeline.json)

The output directory follows this repository's `docs/specs/` convention because the review spans multiple implementation stories. No implementation story status is changed by this pipeline. Existing product changes were preserved; this delivery adds specification documents only.
