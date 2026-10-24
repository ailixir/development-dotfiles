---
name: pack439-human-pack-qa-r070
description: r070 (2026-10-23) NEEDS_WORK on case439 human-pack assembler (15 released + 03/09 withheld); code PASS, sheet honesty fix R1; pack size 6418; mutation recipe
metadata:
  type: project
---

NEEDS_WORK, template-only fix: `G/round-070/qa-pack439/{QA.md,verdict.json}` (adapter 4563f5f6, pins d884dfcb, assemble 2751ebde, template 8f43a256). Code, 30/30 pins, 48/48 + 18/18 tests, shape all PASS. private-go c502bcc9... = rootRunGoSHA256 of fresh439-root-run-go.json; real pack 6418 bytes (3/3 band 6410-6426); disk has 3 webm + 15 png, no 03/09 png.

**Why:** the new "UI changes" section said "no model has viewed any screenshot" while ux-png-review/review.json shows Uma viewed all 15 released PNGs; it also asked the human to check D1b (UUID ids), D3 via 08/12 plan current line and D6 on 16, which the UX review marks NOT_VISIBLE or out of frame.

**How to apply:** when a sheet claims what is visible, diff each sentence against the UX review's per-fix status and limit lines, not only the spec. Next review of this pack is a template diff plus new test needles. Mutation recipe: copy adapter dir + template to scratch, baseline shows 1 OWN-path error, run_selftests per mutant. Production survivors were redundant pairs (eligible RELEASED vs seen==released). Extends [[pack437-human-pack-qa-r066]] and [[ux-fix-qa-r067]].
