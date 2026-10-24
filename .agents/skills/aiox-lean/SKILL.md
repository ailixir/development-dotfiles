---
name: aiox-lean
description: Run or resume the shared AIOX Lean Delivery workflow in this project when the user requests Lean Delivery, the new delivery workflow, or the aiox-lean command. Preserve explicit legacy workflows and existing active runs.
---

# AIOX Lean Delivery — project entry

Read [this project's registration and usage](../../../docs/workflows/lean-delivery.md)
and [package registration](../../../docs/workflows/lean-delivery.json). Keep the
session rooted in this project. Resolve the shared package from that registration
(or an explicit `AIOX_LEAN_PACKAGE_ROOT` override); never assume the project's
vendored or globally installed AIOX contains this workflow.

Before loading the shared driver for this activation, run
`node tools/aiox-lean.cjs doctor` and require success. On failure, resolve the
registration/version problem; do not bypass it through another AIOX installation.
One successful check covers this activation, not a change of package/version.

Load `{packageRoot}/.aiox-core/development/tasks/run-lean-delivery.md` and execute
the user's requested action. `status` is observational; `start` and `continue`
perform the authorized workflow, not just a summary. Reuse known inputs; do not
initialize state merely because this skill became available.

`node tools/aiox-lean.cjs doctor` verifies local wiring without starting work.
The same launcher forwards companion commands and their structured JSON inputs.
Preserve project authority, required checks, protected inputs and active-run rules.
Use the selected native/Orca controller; return-only reviewers need no state writes.
