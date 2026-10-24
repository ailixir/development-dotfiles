---
name: catalog435-g2b-r060
description: Round 060 QA gate G2b (code434-owned catalog + case435 retarget + QA pair tools) ACCEPT 2026-10-23; how the catalog class of miss was verified
metadata:
  type: project
---

ACCEPT at `.aiox/sdc/STUDIO-OBSERVED-ORCH/recovery-20261020/real-stack71/parallel-execution-20261022/round-060/qa-g2b/`. QA tools in round-060/qa-pair: selector 54f76324, invoker ae39f9f0, context-from-interface 8e7fe761 (generated, unedited).

**Why:** case434 was consumed because the parent-409 catalog pinned pre-rebuild runner bundle hashes. Checked by running the real loader non-consumingly (catalog-loader-proof435.py, accept new / refuse old / mutated controls) and recomputing hashes with own canonicalizer.

**How to apply:** for any runner rebuild, (1) compare dist/validator/observedSchemas.json against docs/specs AND backend classpath resources (32 schemas JSON-equal) for epoch consistency; (2) rg old hashes repo-wide; (3) steps 9/10 (close, seal) never ran on real data since code434 rebind - residual risk; (4) copy preflight script to scratch to run it without writing into DevOps dir; (5) retarget-manifest does not exist before R2, so make-qa-pair-tools needs --manifest from build() records (+ports key for verify-inverse).
