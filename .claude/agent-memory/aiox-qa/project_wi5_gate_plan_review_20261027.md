---
name: wi5-gate-plan-review-20261027
description: ADR-SC-007 WI-5 real-site gate plan review (2026-10-27) - CHANGES_REQUIRED; non-obvious product/tool facts that make gate checks vacuous or falsely red
metadata:
  type: project
---

WI-5 plan (hash 8168cdd2...) reviewed 2026-10-27, verdict CHANGES_REQUIRED (design critic, aiox-qa-wi5).

Non-obvious facts found (verify again before reuse, code may move):
- Session `counters.actions` increments at ADMISSION (GuidedSessionService.java ~1284 `reserve(session,"actions")`, before `ledger.admit` and before runner prepare). ADR G1 (OPTION_NOT_PRESENT) is runner-at-prepare, so a correct N1 control shows actions=2, not <=1. Dispatch truth is the `studio_guided_actions` ledger row (state/outcome_code).
- The practice-site login page prints `Password123` three times as plain list text (scratchpad e5/pw/practice.ai.yaml:38,53,63). An L1 canary equal to that value will be in every observation/model request body legitimately; product masks by element type (password fields), not by value, and Vault resolves at dispatch. A scan of that canary cannot discriminate a leak.
- `corpus/verify.mjs`: `--only` is a PREFIX filter (line 190) and the process always exits 0 on failed tasks (only prints); a wanted id missing from perTask is silent.
- Playwright config `trace: 'retain-on-failure'` + call logs print `fill("value")`: a gate that types a secret through Playwright writes it to trace.zip/reporter output unless trace is off for that test.
- Binding checks for `playwright test --list` are exit-code only: they pass when the gate spec is absent (real-backend) or present (msw). Need an assertion-bearing wrapper (json reporter parsed by node:test).
- Binding protectedPaths includes frontend/node_modules, but the plan's default evidence dir is frontend/node_modules/.cache/realsite-gate (wiped by any pnpm install; next-day pass is 24 h later).

**Why:** these are the places a gate looks green or red for the wrong reason. **How to apply:** when reviewing the re-plan or the gate run results, check each of these was resolved.

**Outcome:** r0 8168cdd2 CHANGES_REQUIRED; r1 be84f34f CHANGES_REQUIRED (one item: L1 provenance 24-char prefix crossed snapshot markup `[ref=eNN]`, so 2 of 3 page-printed Password123 hits would be false LEAK); r2 87f08aca APPROVED (segments cut at newline/quote/[]/{} after JSON decode, 12-char context minimum, closed page-text-sources.json, dry-run scan gate, real-markup fixture). Earlier claim that a correct N1 shows actions=2 was NOT established: prepare is a runner command before admission (GuidedDispatchService.java:164); ledger approach is right regardless.
