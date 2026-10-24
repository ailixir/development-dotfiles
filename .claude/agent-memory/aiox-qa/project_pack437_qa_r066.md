---
name: pack437-human-pack-qa-r066
description: r066 (2026-10-23) PASS on case437 COMPLETE human-pack assembler; size fingerprint for 3/3 pack, mutation harness result
metadata:
  type: project
---

PASS, no required fixes: `G/round-066/qa-pack437/{QA.md,verdict.json}` (adapter 5b953f75, pins d82794c1, assemble 5502e0e6, template 7102102f). 46/46 adapter selftests, 18/18 helper, 30/30 pins. private-go 1225b2ec... = rootRunGoSHA256 of fresh437-root-run-go.json.

**Why:** once-only guard burns if the real private pack mismatches. Shape proof without opening: writer transcription renders 3/3 pack at 6410-6426 bytes (2/2 ~4786, 1/1 ~3109); real file 6412. Extends [[pack433-human-pack-qa-r063]].

**How to apply:** run run_selftests in place (results JSON comes out byte-identical; cmp it), remove selftest-helper synthetic dirs after. Scratch-copy runs always show 1 baseline error (OWN-path test). Do NOT `grep -rl` a digest over the recovery tree: it lists private file names (I did once, disclosed). 69-mutant harness: 53 killed; survivors are test gaps only (manifest fullAcceptance, nlink, refusedLabels, publications).
