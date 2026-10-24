---
name: pack433-human-pack-qa-r063
description: r063 (2026-10-23) PASS on case433 partial human-pack assembler; how the private pack shape was verified without opening it; surviving test gaps
metadata:
  type: project
---

PASS, no required fixes: `G/round-063/qa-pack433/{QA.md,verdict.json}` for human-pack433 (adapter adadc2c4, pins dfaace99, assemble b240bb68, template 4cd5aff6). 45/45 adapter selftests, 18/18 helper tests, 30/30 pins.

**Why:** the once-only guard burns if the real private `native-review-pack.private.json` mismatches `project_partial`. Shape was proven without opening it: private-driver.ts `nativePack()` rewrites after media() and after continuation(), so a run that failed in incremental leaves 1 artifact + 1 proof. Independent writer transcription renders 3108 bytes = real file size (1/0 shape would be ~2589).

**How to apply:** for a future partial/other-case pack, repeat the size-fingerprint trick (json.dumps indent=2 + newline length vs `ls -l`) plus mode/link-count listing. Helper selftests (`selftest-helper/`) leave synthetic dirs behind when run; delete them. Mutation harness idea: copy adapter dir to scratch, run run_selftests, subtract the baseline `test_case_block` error. Surviving mutants (benign): len(artifacts)==len(proofs) loosened, actualAssertionsPassed, urlPath, manifest collectionOutcome constant.
