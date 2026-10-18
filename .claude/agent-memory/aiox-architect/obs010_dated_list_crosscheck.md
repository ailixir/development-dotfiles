---
name: obs010-dated-list-crosscheck
description: 2026-10-18 cross-check of OBS-010 dated Live surface list e5c58fa5; RKO-09 is a surface; observed live under values-uat; A6 CON-44/46 inference was wrong
metadata:
  type: project
---
Cross-checked Alex's dated list `docs/qa/evidence/STUDIO-OBS-010/live-surface-20261018/live-surface-list.json`, sha256 `e5c58fa5…`. Verdict CROSS-CHECKED-WITH-NOTES; no content change was required.

- **RKO-09 is a protected surface.** `print-observed-catalog.mjs` ships in the runner image and CI calls it across the image boundary. Protection unit: path, digest argument, one-line `{profile, build}` stdout, exit 1 on refusal.
- **Observed entries are live because values-uat turns them on.** A UAT render that fails until deploy-time inputs arrive does not make them dark; the controller pin (B-19) already puts every runner entry in that position. Deployability is tracked on the `deployed` evidence leg.
- **My A6 inference was wrong.** contracts/v3 schemas reference each other by `$id` URI, so a limits change moves only limits.schema.json and the fixtures, not session or runner-context.
- **The list encodes the A5 annex in `protection`, not `status`.** So cite the protected count (671), not the live count, as the 011 boundary.

**Why:** the 009-Done re-date and 011 T0 read this list. Bookkeeping AX-5..8 is owed at that re-date.
**How to apply:** at the re-date, check AX-5..8. Treat future "the schema `$ref`s it, so its hash moves" claims as false for contracts/v3.

Related: [[obs011-t0-prep]], [[model-sizing-ruling-draft]]
