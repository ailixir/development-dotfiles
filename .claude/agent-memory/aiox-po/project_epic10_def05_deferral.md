---
name: epic10-def05-deferral
description: DEF-05 (dispatch presents no service identity) is deferred to the studio-inference program; 10.35 is its acceptance spec and the criterion that matters is AC-3, not AC-1
metadata:
  type: project
---

`DEF-05`: `HttpRunnerDispatchClient` sets **no** authentication header on any path, while
`openapi.yaml` declares `security: [serviceIdentity]` on both runner routes. The runner refuses every
dispatch with `IDENTITY_MISSING`. Found by the co-run harness (`tools/corun.sh` + `StudioCoRunIT`) on
its first run — nine waves and 709 green studio tests never ran the API and the runner together.

**Why it matters more than the identity gap:** the identity refusal happens **before the body is
parsed**, so `DEF-01`'s entire defect class is *unobservable*, not merely untested — mutation `M1a`
dropped a required body key and produced a response byte-identical to the baseline. **How to apply:**
when gating the fix, the criterion that matters is **AC-3** (the masked class becomes distinguishable
again), not AC-1 (dispatch succeeds). A gate that ticks AC-1 and skips AC-3 has proved the symptom gone
and left the class exactly as masked.

**Deferral shape (used three times now: `F-3`, `10.33`, `DEF-05`).** The fix is the other program's,
uncommitted; we write the acceptance spec and gate what lands, and author no second fix in a file they
have open. Manifest: `integration_defects.DEF-05` `status: open` is **literal** — the fix is not in this
repository's history at all — and `stories[10.35]` carries `wave: null`, `depends_on: []`,
`blocks: ["10.34"]`.

**Standing rule this reinforces:** a working tree is not a gateable object. `wt/epic` moved
263 → 241 → 263 → 241 in one day. Every criterion gates a **commit with a SHA**; a file mtime in that
tree is evidence of nothing. Likewise a fold-blocker list (17 paths at 2026-09-17 23:30 EDT) is a
snapshot — recompute it immediately before acting, never carry it.

**Routed, not fixed:** OBS-1 (`StudioDispatcher` discards `DispatchOutcome.detail()` on a terminal
refusal) and OBS-2 (`CompilePipeline` collapses credential- and body-refusal into
`VALIDATOR_UNAVAILABLE`) — one backlog item, owner @pm, deliberately **without** manifest defect ids
(that block records defects found by this epic's gates; these are pre-existing gaps in unowned code).

Related: [[epic10-closeout-rulings]], [[epic10-runner-isolation]]
