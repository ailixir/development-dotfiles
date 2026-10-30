---
name: studio-unify-001-5-visual-fixes
description: STUDIO-UNIFY-001.5 (visual-pass fixes, drafted 2026-10-24): which report findings turned out different in code, and the defaults flagged for @po
metadata:
  type: project
---

STUDIO-UNIFY-001.5 drafted 2026-10-24 from the aiox-ux visual-pass REPORT.md (user: "Fix all Majors and Minors" = M1, M2, m1-m11; polish p1-p8 and B1 out). Size M, 14 ACs (AC-01..AC-14, one per finding, m8 split), 17 tasks (5.1-5.17), 8 parallel file lanes; last task is the coordinator's real-stack re-check.

**Why:** re-verifying findings against code showed the report is not always right, so ACs were written to the code, not the report.

**How to apply (facts found, re-check before reusing):**
- m10 is not a missing menu: ChecksLayout already has the mobile Navigation button; LayoutProvider's port heuristic (localhost and port != 5173 means federated) hid it on Vite :5181. Fix chosen: standalone entry main.tsx sets a flag.
- m4: Last Execution is already hidden below md in both row kinds.
- m8: apiClient retries a cancelled GET (no response), so one cancel logs 3 times; RunControl prop-type warning cause not found by reading, task reproduces it.
- M1: capabilities are read only after the Run press (useRunGate), so Run cannot be pre-disabled; caption chosen. W5 UX-01 rule: RUNTIME_INCOMPATIBLE copy names no cause or remedy.
- m11: DashboardPage is unrouted dead code; default is fix CLAUDE.md/AGENTS.md, flag deletion for @po.
- m7 explicitly supersedes the earlier "repoint without renaming" AC-09/DC-09 of stories .1-.3.
- Decisions pending are D1-D9 in the story's flags table.
