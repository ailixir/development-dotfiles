---
name: case439-g1b-r070
description: Round 070 QA gate G1' case439 ACCEPT 2026-10-23; 501+1 external-pin decomposition, independent-shift method for verifying generated-tool diffs, tool shas
metadata:
  type: project
---

ACCEPT, no required fixes. Output `.../parallel-execution-20261022/round-070/qa-g1b/{QA.md,verdict.json}`. Pair tools round-070: selector 2023d7bf, invoker 181c4578, draft 8c92c3fd (all asserted, compare-pair identical).

**+1 pin:** externalCodePins = 446 selected + 1 TLS + |publicPins U sealer B names (1) U sealer O names (21)| (54 for 437, 55 for 438/439). 502 = 501 + the QA frontend verdict `round-067/qa-frontend-ux/verdict.json` (b6444863). Re-derived with my own ast script; 439 binder/sealer equal 438 modulo case tokens.

**Reusable method:** to verify a "semantic-edits" diff of generated tools, write your own naive token shifter (case tokens + protected words + ports, hex runs masked), apply to the previous tools, diff vs the new ones: residual was byte-identical to DevOps's 340-line report. Same trick for pair tools (residual = constants + `EXPECT={}` + new check).

**Gotchas:** chain restart after R6.binder exit 10 is NOT possible by moving progress aside (execution-plan.json and steps/refused file trip the start rule; fail closed; runbook sentence wrong). `external_pins439.py` CLI breaks if invoked via a `..` path. I do not run run-chain even as a stub copy when told not to.

**Private-read judgement:** hash+parse of code438 pin files by a path-adapted scratch copy of a reviewed preflight = process deviation, not blocking; Root's R3 is the admitted executor.
